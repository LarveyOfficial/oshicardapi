import type { Env, ParsedCard } from "../types";
import { fetchWithDelay } from "./client";
import { parseCardList } from "./parseList";
import { parseCardDetail } from "./parseDetail";
import { upsertCard } from "../db/queries";

const BASE = "https://en.hololive-official-cardgame.com";

/**
 * Scrape all cards from a single search result page.
 * Fetches the page, extracts card IDs, scrapes each card detail,
 * saves to DB, and returns all parsed cards.
 */
export async function scrapePage(env: Env, page: number): Promise<{ page: number; cards: ParsedCard[]; saved: number }> {
  const url =
    page === 0
      ? `${BASE}/cardlist/cardsearch/`
      : `${BASE}/cardlist/cardsearch_ex?view=image&page=${page}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "OshiCardAPI/1.0 (card-database-bot)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return { page, cards: [], saved: 0 };
  const html = await res.text();
  if (!html) return { page, cards: [], saved: 0 };

  const items = parseCardList(html);
  if (items.length === 0) return { page, cards: [], saved: 0 };

  const cards: ParsedCard[] = [];
  let saved = 0;

  for (const item of items) {
    try {
      const detailHtml = await fetchWithDelay(`${BASE}/cardlist/?id=${item.id}`);
      if (!detailHtml) continue;
      const parsed = parseCardDetail(detailHtml, item);
      await upsertCard(env.DB, parsed);
      cards.push(parsed);
      saved++;
    } catch (err) {
      console.error(`Failed card ${item.id} (${item.name}):`, err);
    }
  }

  return { page, cards, saved };
}
