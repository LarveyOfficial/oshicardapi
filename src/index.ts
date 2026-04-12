import { createYoga, createSchema } from "graphql-yoga";
import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./schema/resolvers";
import { runScraperBatch } from "./scraper/index";
import { fetchWithDelay } from "./scraper/client";
import { parseCardDetail } from "./scraper/parseDetail";
import { upsertCard } from "./db/queries";
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Manual scrape trigger (for testing)
    if (url.pathname === "/scrape") {
      ctx.waitUntil(runScraperBatch(env));
      return new Response(JSON.stringify({ status: "scrape started" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Scrape a single card by ID (for testing the parser)
    if (url.pathname === "/scrape-one") {
      const cardId = parseInt(url.searchParams.get("id") || "1", 10);
      try {
        const html = await fetchWithDelay(
          `https://en.hololive-official-cardgame.com/cardlist/?id=${cardId}`
        );
        const parsed = parseCardDetail(html, { id: cardId, name: "", imageUrl: "" });
        await upsertCard(env.DB, parsed);
        return new Response(JSON.stringify(parsed, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // GraphQL endpoint
    if (url.pathname === "/graphql") {
      const response = await yoga.fetch(request, { env });
      return response;
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScraperBatch(env));
  },
};
