import type { Env, CardListItem } from "../types";
import { fetchWithDelay } from "./client";
import { parseCardList } from "./parseList";
import { parseCardDetail } from "./parseDetail";
import { upsertCard } from "../db/queries";

const BASE = "https://en.hololive-official-cardgame.com";

// Queue message types
export type ScrapeMessage =
  | { type: "pages"; startPage: number; endPage: number }
  | { type: "card"; id: number; name: string; imageUrl: string };

/**
 * Enqueue page numbers for collection.
 * Each page message will be processed by the queue consumer,
 * which fetches the page, extracts card IDs, and enqueues card messages.
 */
export async function enqueuePages(env: Env): Promise<number> {
  // Send 10 page-range messages, each covering 10 pages
  // Total: only 10 queue operations instead of 100
  const batch: { body: ScrapeMessage }[] = [];
  for (let i = 0; i < 100; i += 10) {
    batch.push({ body: { type: "pages", startPage: i, endPage: i + 9 } });
  }
  await env.SCRAPE_QUEUE.sendBatch(batch);
  console.log(`Enqueued 10 page-range messages (pages 0-99)`);
  return 10;
}

/**
 * Process a batch of queue messages.
 * Handles two message types:
 *   - "page": fetches a search result page, extracts card IDs, enqueues card messages
 *   - "card": fetches card detail, parses, upserts into DB
 */
export async function processQueue(
  batch: MessageBatch<ScrapeMessage>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    const data = msg.body;

    if (data.type === "pages") {
      try {
        const allCards: CardListItem[] = [];

        for (let page = data.startPage; page <= data.endPage; page++) {
          const url =
            page === 0
              ? `${BASE}/cardlist/cardsearch/`
              : `${BASE}/cardlist/cardsearch_ex?view=image&page=${page}`;

          const html = await fetchPage(url);
          if (!html) break; // Past the last page
          const cards = parseCardList(html);
          if (cards.length === 0) break;
          allCards.push(...cards);
        }

        if (allCards.length > 0) {
          // Enqueue cards in batches of 25
          const cardMessages = allCards.map((card) => ({
            body: {
              type: "card" as const,
              id: card.id,
              name: card.name,
              imageUrl: card.imageUrl,
            },
          }));

          for (let i = 0; i < cardMessages.length; i += 25) {
            await env.SCRAPE_QUEUE.sendBatch(cardMessages.slice(i, i + 25));
          }
          console.log(
            `Pages ${data.startPage}-${data.endPage}: enqueued ${allCards.length} cards`
          );
        }

        msg.ack();
      } catch (err) {
        console.error(`Pages ${data.startPage}-${data.endPage} failed:`, err);
        msg.retry();
      }
    } else if (data.type === "card") {
      try {
        const html = await fetchWithDelay(`${BASE}/cardlist/?id=${data.id}`);
        if (!html) {
          console.error(`Card ${data.id}: empty response`);
          msg.ack();
          continue;
        }
        const parsed = parseCardDetail(html, {
          id: data.id,
          name: data.name,
          imageUrl: data.imageUrl,
        });
        await upsertCard(env.DB, parsed);
        msg.ack();
      } catch (err) {
        console.error(`Card ${data.id} (${data.name}) failed:`, err);
        msg.retry();
      }
    }
  }
}

/** Lightweight fetch for list pages — no delay */
async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "OshiCardAPI/1.0 (card-database-bot)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (res.status === 404) return "";
  if (!res.ok) return "";
  return res.text();
}
