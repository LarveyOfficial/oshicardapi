import { createYoga, createSchema } from "graphql-yoga";
import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./schema/resolvers";
import { fetchWithDelay } from "./scraper/client";
import { parseCardDetail } from "./scraper/parseDetail";
import { getCardPrice } from "./scraper/pricing";
import { upsertCard, getCardById, getSetsForCard, hasDailyPriceForDate, saveDailyPrice, saveMonthlyPrice, pruneOldPrices, updateTcgId } from "./db/queries";
import type { Env } from "./types";

const yoga = createYoga<{ env: Env }>({
  schema: createSchema({ typeDefs, resolvers }),
  graphiql: true,
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
  },
  landingPage: false,
});

function log(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

function isLastDayOfMonth(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  const next = new Date(d);
  next.setUTCDate(d.getUTCDate() + 1);
  return next.getUTCMonth() !== d.getUTCMonth();
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // Health check
  if (url.pathname === "/" || url.pathname === "/health") {
    const count = await env.DB.prepare("SELECT COUNT(*) as count FROM cards")
      .first<{ count: number }>();
    return new Response(
      JSON.stringify({
        status: "ok",
        cardCount: count?.count ?? 0,
        graphql: "/graphql",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Get card IDs from a search result page
  if (url.pathname === "/scrape-page-ids") {
    const page = parseInt(url.searchParams.get("page") || "0", 10);
    try {
      const { getPageIds } = await import("./scraper");
      const ids = await getPageIds(page);
      log("info", "Scraped page IDs", { page, count: ids.length });
      return new Response(JSON.stringify(ids), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      log("error", "Failed to scrape page IDs", { page, error: String(err) });
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Scrape a single card by ID
  if (url.pathname === "/scrape-one") {
    const cardId = parseInt(url.searchParams.get("id") || "1", 10);
    try {
      const html = await fetchWithDelay(
        `https://en.hololive-official-cardgame.com/cardlist/?id=${cardId}`
      );
      const parsed = parseCardDetail(html, { id: cardId, name: "", imageUrl: "" });
      await upsertCard(env.DB, parsed);
      log("info", "Scraped card", { cardId, name: parsed.name, cardNumber: parsed.cardNumber });
      return new Response(JSON.stringify(parsed, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      log("error", "Failed to scrape card", { cardId, error: String(err) });
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Scrape status
  if (url.pathname === "/scrape-status") {
    const count = await env.DB.prepare("SELECT COUNT(*) as count FROM cards")
      .first<{ count: number }>();
    return new Response(
      JSON.stringify({ cardCount: count?.count ?? 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Scrape and store pricing data for a single card
  if (url.pathname === "/scrape-price") {
    const cardId = parseInt(url.searchParams.get("id") || "", 10);
    if (isNaN(cardId)) {
      return new Response(JSON.stringify({ error: "Missing or invalid id param" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const card = await getCardById(env.DB, cardId);
    if (!card) {
      return new Response(JSON.stringify({ error: "Card not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const alreadyRecorded = await hasDailyPriceForDate(env.DB, cardId, today);
    if (alreadyRecorded) {
      return new Response(JSON.stringify({ error: "Price already recorded for today" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    const setNames = await getSetsForCard(env.DB, cardId);

    let price;
    try {
      price = await getCardPrice(card.card_number, card.rarity, setNames);
    } catch (err) {
      log("error", "Failed to fetch TCG price", { cardId, error: String(err) });
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!price) {
      return new Response(JSON.stringify({ error: "Card not found on TCGPlayer" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await updateTcgId(env.DB, cardId, price.productId);
    await saveDailyPrice(env.DB, cardId, today, price);

    if (isLastDayOfMonth(today)) {
      const monthDate = today.slice(0, 7) + "-01";
      await saveMonthlyPrice(env.DB, cardId, monthDate, price);
    }

    await pruneOldPrices(env.DB, cardId);

    log("info", "Scraped price", { cardId, tcgId: price.productId, date: today });
    return new Response(
      JSON.stringify({
        tcgId: price.productId,
        date: today,
        lowPrice: price.lowPrice,
        midPrice: price.midPrice,
        highPrice: price.highPrice,
        marketPrice: price.marketPrice,
        directLowPrice: price.directLowPrice,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // GraphQL endpoint
  if (url.pathname === "/graphql") {
    return yoga.fetch(request, { env });
  }

  return new Response("Not Found", { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const start = Date.now();
    const url = new URL(request.url);

    let response: Response;
    try {
      response = await handleRequest(request, env);
    } catch (err) {
      log("error", "Unhandled error", {
        path: url.pathname,
        method: request.method,
        error: String(err),
      });
      response = new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const duration = Date.now() - start;
    log("info", "Request", {
      method: request.method,
      path: url.pathname,
      status: response.status,
      duration_ms: duration,
      cf: {
        country: (request.cf as Record<string, unknown>)?.country,
        colo: (request.cf as Record<string, unknown>)?.colo,
      },
    });

    return response;
  },
};
