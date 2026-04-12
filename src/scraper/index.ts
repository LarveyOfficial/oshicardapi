import type { Env, CardListItem, ParsedCard } from "../types";
import { fetchWithDelay } from "./client";
import { parseCardList } from "./parseList";
import { parseCardDetail } from "./parseDetail";
import { upsertCard } from "../db/queries";

const BASE = "https://en.hololive-official-cardgame.com";
const BATCH_SIZE = 50;

async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM scrape_state WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function setState(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO scrape_state (key, value) VALUES (?, ?)")
    .bind(key, value)
    .run();
}

async function collectAllCardIds(db: D1Database): Promise<void> {
  const existing = await getState(db, "card_ids");
  if (existing) return; // Already collected

  console.log("Collecting all card IDs...");
  const allCards: CardListItem[] = [];

  // Fetch initial search page
  const page1Html = await fetchWithDelay(`${BASE}/cardlist/cardsearch/`);
  allCards.push(...parseCardList(page1Html));
  console.log(`Page 1: found ${allCards.length} cards`);

  // Fetch remaining pages
  for (let page = 1; page <= 200; page++) {
    const html = await fetchWithDelay(`${BASE}/cardlist/cardsearch_ex?view=image&page=${page}`);
    const cards = parseCardList(html);
    if (cards.length === 0) {
      console.log(`Page ${page + 1}: empty, stopping`);
      break;
    }
    allCards.push(...cards);
    console.log(`Page ${page + 1}: total ${allCards.length} cards`);
  }

  // Deduplicate by ID
  const unique = new Map<number, CardListItem>();
  for (const card of allCards) {
    unique.set(card.id, card);
  }

  const cardIds = Array.from(unique.values());
  await setState(db, "card_ids", JSON.stringify(cardIds));
  await setState(db, "scrape_index", "0");
  console.log(`Collected ${cardIds.length} unique card IDs`);
}

async function scrapeCardBatch(db: D1Database): Promise<{ done: boolean; processed: number }> {
  const idsJson = await getState(db, "card_ids");
  if (!idsJson) {
    return { done: true, processed: 0 };
  }

  const allCards: CardListItem[] = JSON.parse(idsJson);
  const indexStr = await getState(db, "scrape_index");
  const startIndex = indexStr ? parseInt(indexStr, 10) : 0;

  if (startIndex >= allCards.length) {
    // All done — clean up state for next cycle
    await db.prepare("DELETE FROM scrape_state WHERE key IN ('card_ids', 'scrape_index')").run();
    console.log("Scrape complete! All cards processed.");
    return { done: true, processed: 0 };
  }

  const endIndex = Math.min(startIndex + BATCH_SIZE, allCards.length);
  const batch = allCards.slice(startIndex, endIndex);
  console.log(`Processing cards ${startIndex + 1}-${endIndex} of ${allCards.length}`);

  let processed = 0;
  for (const item of batch) {
    try {
      const html = await fetchWithDelay(`${BASE}/cardlist/?id=${item.id}`);
      const parsed = parseCardDetail(html, item);
      await upsertCard(db, parsed);
      processed++;
      console.log(`  Scraped: ${parsed.name} (${parsed.cardNumber})`);
    } catch (err) {
      console.error(`  Failed to scrape card ${item.id} (${item.name}):`, err);
    }
  }

  await setState(db, "scrape_index", String(endIndex));
  return { done: endIndex >= allCards.length, processed };
}

export async function runScraperBatch(env: Env): Promise<void> {
  try {
    // Phase 1: Collect card IDs if not yet done
    await collectAllCardIds(env.DB);

    // Phase 2: Scrape a batch of cards
    const result = await scrapeCardBatch(env.DB);
    console.log(`Batch complete: ${result.processed} cards processed, done: ${result.done}`);
  } catch (err) {
    console.error("Scraper error:", err);
  }
}
