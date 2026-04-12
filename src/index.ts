import { createYoga, createSchema } from "graphql-yoga";
import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./schema/resolvers";
import { fetchWithDelay } from "./scraper/client";
import { parseCardDetail } from "./scraper/parseDetail";
import { upsertCard } from "./db/queries";
import type { Env } from "./types";

export { ScrapeWorkflow } from "./scraper/workflow";

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
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Trigger a full scrape workflow
    if (url.pathname === "/scrape") {
      try {
        const instance = await env.SCRAPE_WORKFLOW.create();
        return new Response(
          JSON.stringify({ status: "scrape workflow started", instanceId: instance.id }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: String(err) }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Check workflow instance status
    if (url.pathname === "/scrape-status") {
      const instanceId = url.searchParams.get("id");
      const count = await env.DB.prepare("SELECT COUNT(*) as count FROM cards")
        .first<{ count: number }>();

      if (instanceId) {
        try {
          const instance = await env.SCRAPE_WORKFLOW.get(instanceId);
          const status = await instance.status();
          return new Response(
            JSON.stringify({ cardCount: count?.count ?? 0, workflow: status }),
            { headers: { "Content-Type": "application/json" } }
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ cardCount: count?.count ?? 0, error: String(err) }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ cardCount: count?.count ?? 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Scrape a single card by ID (parser debugging)
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

    // Scrape all cards from a search result page
    if (url.pathname === "/scrape-page") {
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      try {
        const { scrapePage } = await import("./scraper");
        const results = await scrapePage(env, page);
        return new Response(JSON.stringify(results, null, 2), {
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

  // Daily cron — kicks off the scrape workflow
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await env.SCRAPE_WORKFLOW.create();
    console.log("Cron: started scrape workflow");
  },
};
