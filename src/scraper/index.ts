import type { Env, CardListItem } from "../types";
import { fetchWithDelay } from "./client";
import { parseCardList } from "./parseList";
import { parseCardDetail } from "./parseDetail";
import { upsertCard } from "../db/queries";

const BASE = "https://en.hololive-official-cardgame.com";
const CARDS_PER_BATCH = 100;
const PAGES_PER_BATCH = 100;

/**
 * Runs one batch of the scrape process. Designed to be called repeatedly
 * (via cron or /scrape endpoint) until all cards are scraped.
 *
 * Phase 1 (collecting): Fetches PAGES_PER_BATCH search pages per invocation,
 *   stores card IDs in scrape_queue table.
 * Phase 2 (scraping): Processes CARDS_PER_BATCH cards per invocation,
 *   fetching detail pages and upserting into cards table.
 *
 * Returns a status summary.
 */
export async function runScrapeBatch(env: Env): Promise<{
  phase: string;
  processed: number;
  remaining: number;
  done: boolean;
}> {
  const db = env.DB;

  // Ensure scrape_queue table exists
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS scrape_queue (
        id INTEGER PRIMARY KEY,
        name TEXT,
        image_url TEXT,
        scraped INTEGER NOT NULL DEFAULT 0
      )`
    )
    .run();

  const phase = await getState(db, "phase");

  // If no active scrape, check if it's time to start one
  if (!phase) {
    await setState(db, "phase", "collecting");
    await setState(db, "collect_page", "0");
    await db.prepare("DELETE FROM scrape_queue").run();
    console.log("Starting new scrape cycle");
  }

  const currentPhase = (await getState(db, "phase")) || "collecting";

  if (currentPhase === "collecting") {
    return await collectBatch(db);
  } else if (currentPhase === "scraping") {
    return await scrapeBatch(db);
  } else {
    // Done or unknown state — reset
    await clearState(db);
    return { phase: "idle", processed: 0, remaining: 0, done: true };
  }
}

/** Phase 1: Collect card IDs from search result pages */
async function collectBatch(
  db: D1Database
): Promise<{ phase: string; processed: number; remaining: number; done: boolean }> {
  const startPage = parseInt((await getState(db, "collect_page")) || "0", 10);
  let collected = 0;
  let endOfPages = false;

  // Page 0 is the initial search page (different URL)
  for (let i = 0; i < PAGES_PER_BATCH; i++) {
    const page = startPage + i;
    let html: string;

    if (page === 0) {
      html = await fetchWithDelay(`${BASE}/cardlist/cardsearch/`);
    } else {
      html = await fetchWithDelay(
        `${BASE}/cardlist/cardsearch_ex?view=image&page=${page}`
      );
    }

    if (!html) {
      console.log(`Page ${page}: no content (404), done collecting`);
      endOfPages = true;
      break;
    }

    const cards = parseCardList(html);
    if (cards.length === 0) {
      console.log(`Page ${page}: empty, done collecting`);
      endOfPages = true;
      break;
    }

    // Insert into queue (ignore duplicates)
    for (const card of cards) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO scrape_queue (id, name, image_url) VALUES (?, ?, ?)`
        )
        .bind(card.id, card.name, card.imageUrl)
        .run();
    }
    collected += cards.length;
    console.log(`Page ${page}: collected ${cards.length} cards`);
  }

  if (endOfPages) {
    // Move to scraping phase
    await setState(db, "phase", "scraping");
    const total = await db
      .prepare("SELECT COUNT(*) as count FROM scrape_queue")
      .first<{ count: number }>();
    console.log(
      `Collection complete. ${total?.count ?? 0} cards queued for scraping.`
    );
    return {
      phase: "collecting → scraping",
      processed: collected,
      remaining: total?.count ?? 0,
      done: false,
    };
  }

  // More pages to collect
  await setState(db, "collect_page", String(startPage + PAGES_PER_BATCH));
  const total = await db
    .prepare("SELECT COUNT(*) as count FROM scrape_queue")
    .first<{ count: number }>();
  return {
    phase: "collecting",
    processed: collected,
    remaining: -1, // unknown total
    done: false,
  };
}

/** Phase 2: Scrape card details in batches */
async function scrapeBatch(
  db: D1Database
): Promise<{ phase: string; processed: number; remaining: number; done: boolean }> {
  const pending = await db
    .prepare(
      `SELECT id, name, image_url FROM scrape_queue WHERE scraped = 0 LIMIT ?`
    )
    .bind(CARDS_PER_BATCH)
    .all<{ id: number; name: string; image_url: string }>();

  if (!pending.results || pending.results.length === 0) {
    // All done!
    await clearState(db);
    const total = await db
      .prepare("SELECT COUNT(*) as count FROM cards")
      .first<{ count: number }>();
    console.log(`Scrape complete! ${total?.count ?? 0} total cards in DB.`);
    return { phase: "complete", processed: 0, remaining: 0, done: true };
  }

  let scraped = 0;
  let failed = 0;

  for (const row of pending.results) {
    try {
      const html = await fetchWithDelay(`${BASE}/cardlist/?id=${row.id}`);
      if (!html) {
        console.error(`Card ${row.id}: empty response, skipping`);
        failed++;
      } else {
        const parsed = parseCardDetail(html, {
          id: row.id,
          name: row.name,
          imageUrl: row.image_url,
        });
        await upsertCard(db, parsed);
        scraped++;
      }
    } catch (err) {
      failed++;
      console.error(`Failed: card ${row.id} (${row.name}):`, err);
    }

    // Mark as processed regardless of success/failure
    await db
      .prepare("UPDATE scrape_queue SET scraped = 1 WHERE id = ?")
      .bind(row.id)
      .run();
  }

  const remaining = await db
    .prepare("SELECT COUNT(*) as count FROM scrape_queue WHERE scraped = 0")
    .first<{ count: number }>();

  console.log(
    `Batch done: ${scraped} scraped, ${failed} failed, ${remaining?.count ?? 0} remaining`
  );

  return {
    phase: "scraping",
    processed: scraped,
    remaining: remaining?.count ?? 0,
    done: false,
  };
}

// --- State helpers ---

async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM scrape_state WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function setState(
  db: D1Database,
  key: string,
  value: string
): Promise<void> {
  await db
    .prepare(
      "INSERT OR REPLACE INTO scrape_state (key, value) VALUES (?, ?)"
    )
    .bind(key, value)
    .run();
}

async function clearState(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM scrape_state").run();
  await db.prepare("DELETE FROM scrape_queue").run();
}

/**
 * Legacy full scrape — kept for local testing only.
 * Not suitable for production Workers due to time limits.
 */
export async function runFullScrape(env: Env): Promise<void> {
  let result = { done: false, phase: "", processed: 0, remaining: 0 };
  while (!result.done) {
    result = await runScrapeBatch(env);
    console.log(`Batch: ${result.phase} — ${result.processed} processed, ${result.remaining} remaining`);
  }
}
