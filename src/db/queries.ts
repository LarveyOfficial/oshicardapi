import type { ParsedCard, CardRow, ArtRow, OshiSkillRow, KeywordRow, PriceDailyRow, PriceMonthlyRow } from "../types";
import type { TCGPrice } from "../scraper/pricing";

// --- Upsert operations (used by scraper) ---

export async function upsertCard(db: D1Database, card: ParsedCard): Promise<void> {
  await db
    .prepare(
      `INSERT INTO cards (id, card_number, name, card_type, color, rarity, set_name, release_date, illustrator, image_url, card_url, hp, bloom_level, baton_pass, life, is_buzz, support_type, is_limited, special_text, extra_text, scraped_at, tcg_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), (SELECT tcg_id FROM cards WHERE id = ?))
       ON CONFLICT(id) DO UPDATE SET
         card_number  = excluded.card_number,
         name         = excluded.name,
         card_type    = excluded.card_type,
         color        = excluded.color,
         rarity       = excluded.rarity,
         set_name     = excluded.set_name,
         release_date = excluded.release_date,
         illustrator  = excluded.illustrator,
         image_url    = excluded.image_url,
         card_url     = excluded.card_url,
         hp           = excluded.hp,
         bloom_level  = excluded.bloom_level,
         baton_pass   = excluded.baton_pass,
         life         = excluded.life,
         is_buzz      = excluded.is_buzz,
         support_type = excluded.support_type,
         is_limited   = excluded.is_limited,
         special_text = excluded.special_text,
         extra_text   = excluded.extra_text,
         scraped_at   = excluded.scraped_at`
    )
    .bind(
      card.id,
      card.cardNumber,
      card.name,
      card.cardType,
      card.colors.join(", ") || "NEUTRAL",
      card.rarity,
      card.setNames.length > 0 ? card.setNames[0] : null,
      card.releaseDate,
      card.illustrator,
      card.imageUrl,
      card.cardUrl,
      card.hp,
      card.bloomLevel,
      card.batonPass ? JSON.stringify(card.batonPass) : null,
      card.life,
      card.isBuzz ? 1 : 0,
      card.supportType,
      card.isLimited ? 1 : 0,
      card.specialText,
      card.extraText,
      card.id
    )
    .run();

  // Replace arts
  await db.prepare("DELETE FROM card_arts WHERE card_id = ?").bind(card.id).run();
  for (let i = 0; i < card.arts.length; i++) {
    const art = card.arts[i];
    await db
      .prepare(
        "INSERT INTO card_arts (card_id, name, damage, cost, effect_text, damage_bonuses, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(card.id, art.name, art.damage, art.cost ? JSON.stringify(art.cost) : null, art.effectText, art.damageBonuses.length > 0 ? JSON.stringify(art.damageBonuses) : null, i)
      .run();
  }

  // Replace oshi skills
  await db.prepare("DELETE FROM card_oshi_skills WHERE card_id = ?").bind(card.id).run();
  for (const skill of card.oshiSkills) {
    await db
      .prepare(
        "INSERT INTO card_oshi_skills (card_id, skill_type, name, cost, usage_limit, effect_text) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(card.id, skill.skillType, skill.name, skill.cost, skill.usageLimit, skill.effectText)
      .run();
  }

  // Replace tags
  await db.prepare("DELETE FROM card_tags WHERE card_id = ?").bind(card.id).run();
  for (const tag of card.tags) {
    await db
      .prepare("INSERT INTO card_tags (card_id, tag) VALUES (?, ?)")
      .bind(card.id, tag)
      .run();
  }

  // Replace Q&A
  await db.prepare("DELETE FROM card_qna WHERE card_id = ?").bind(card.id).run();
  for (let i = 0; i < card.qna.length; i++) {
    const qa = card.qna[i];
    await db
      .prepare("INSERT INTO card_qna (card_id, question, answer, sort_order) VALUES (?, ?, ?, ?)")
      .bind(card.id, qa.question, qa.answer, i)
      .run();
  }

  // Replace sets
  await db.prepare("DELETE FROM card_sets WHERE card_id = ?").bind(card.id).run();
  for (const setName of card.setNames) {
    await db
      .prepare("INSERT INTO card_sets (card_id, set_name) VALUES (?, ?)")
      .bind(card.id, setName)
      .run();
  }

  // Replace colors
  await db.prepare("DELETE FROM card_colors WHERE card_id = ?").bind(card.id).run();
  for (let i = 0; i < card.colors.length; i++) {
    await db
      .prepare("INSERT INTO card_colors (card_id, color, sort_order) VALUES (?, ?, ?)")
      .bind(card.id, card.colors[i], i)
      .run();
  }

  // Replace keywords
  await db.prepare("DELETE FROM card_keywords WHERE card_id = ?").bind(card.id).run();
  for (let i = 0; i < card.keywords.length; i++) {
    const kw = card.keywords[i];
    await db
      .prepare(
        "INSERT INTO card_keywords (card_id, type, title, description, sort_order) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(card.id, kw.type, kw.title, kw.description, i)
      .run();
  }
}

// --- Query operations (used by GraphQL resolvers) ---

export interface CardFilter {
  cardType?: string;
  color?: string;
  rarity?: string;
  setName?: string;
  bloomLevel?: string;
  tag?: string;
  name?: string;
  search?: string;
  supportType?: string;
  isLimited?: boolean;
  includeBuzz?: boolean;
}

export async function getCardById(db: D1Database, id: number): Promise<CardRow | null> {
  return db.prepare("SELECT * FROM cards WHERE id = ?").bind(id).first<CardRow>();
}

export async function getCardByNumber(db: D1Database, cardNumber: string): Promise<CardRow | null> {
  return db.prepare("SELECT * FROM cards WHERE card_number = ?").bind(cardNumber).first<CardRow>();
}

export interface CardSort {
  field: string;  // DB column name (e.g. "c.name", "c.card_number")
  order: "ASC" | "DESC";
}

export async function searchCards(
  db: D1Database,
  filter: CardFilter,
  page: number,
  pageSize: number,
  sort?: CardSort,
  fetchAll?: boolean
): Promise<{ cards: CardRow[]; totalCount: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.cardType) {
    conditions.push("c.card_type = ?");
    params.push(filter.cardType.toLowerCase());
  }
  if (filter.color) {
    conditions.push("EXISTS (SELECT 1 FROM card_colors cc WHERE cc.card_id = c.id AND cc.color = ?)");
    params.push(filter.color);
  }
  if (filter.rarity) {
    conditions.push("c.rarity = ?");
    params.push(filter.rarity);
  }
  if (filter.setName) {
    conditions.push("EXISTS (SELECT 1 FROM card_sets cs WHERE cs.card_id = c.id AND cs.set_name = ?)");
    params.push(filter.setName);
  }
  if (filter.bloomLevel) {
    conditions.push("c.bloom_level = ?");
    params.push(filter.bloomLevel);
  }
  if (filter.name) {
    conditions.push("c.name = ?");
    params.push(filter.name);
  }
  if (filter.search) {
    conditions.push("c.name LIKE ?");
    params.push(`%${filter.search}%`);
  }
  if (filter.supportType) {
    conditions.push("c.support_type = ?");
    params.push(filter.supportType);
  }
  if (filter.isLimited === true) {
    conditions.push("c.is_limited = 1");
  } else if (filter.isLimited === false) {
    conditions.push("c.is_limited = 0");
  }
  if (filter.includeBuzz === false) {
    conditions.push("c.is_buzz = 0");
  }

  let joinTag = "";
  if (filter.tag) {
    joinTag = "JOIN card_tags ct ON c.id = ct.card_id";
    conditions.push("ct.tag = ?");
    params.push(filter.tag);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = sort ? `${sort.field} ${sort.order}` : "c.card_number ASC";

  const countResult = await db
    .prepare(`SELECT COUNT(DISTINCT c.id) as count FROM cards c ${joinTag} ${where}`)
    .bind(...params)
    .first<{ count: number }>();

  let cards;
  if (fetchAll) {
    cards = await db
      .prepare(
        `SELECT DISTINCT c.* FROM cards c ${joinTag} ${where} ORDER BY ${orderBy}`
      )
      .bind(...params)
      .all<CardRow>();
  } else {
    const offset = (page - 1) * pageSize;
    cards = await db
      .prepare(
        `SELECT DISTINCT c.* FROM cards c ${joinTag} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .bind(...params, pageSize, offset)
      .all<CardRow>();
  }

  return {
    cards: cards.results,
    totalCount: countResult?.count ?? 0,
  };
}

export async function getArtsForCard(db: D1Database, cardId: number): Promise<ArtRow[]> {
  const result = await db
    .prepare("SELECT * FROM card_arts WHERE card_id = ? ORDER BY sort_order")
    .bind(cardId)
    .all<ArtRow>();
  return result.results;
}

export async function getSkillsForCard(db: D1Database, cardId: number): Promise<OshiSkillRow[]> {
  const result = await db
    .prepare("SELECT * FROM card_oshi_skills WHERE card_id = ?")
    .bind(cardId)
    .all<OshiSkillRow>();
  return result.results;
}

export async function getColorsForCard(db: D1Database, cardId: number): Promise<string[]> {
  const result = await db
    .prepare("SELECT color FROM card_colors WHERE card_id = ? ORDER BY sort_order")
    .bind(cardId)
    .all<{ color: string }>();
  return result.results.map((r) => r.color);
}

export async function getTagsForCard(db: D1Database, cardId: number): Promise<string[]> {
  const result = await db
    .prepare("SELECT tag FROM card_tags WHERE card_id = ?")
    .bind(cardId)
    .all<{ tag: string }>();
  return result.results.map((r) => r.tag);
}

export async function getQnaForCard(db: D1Database, cardId: number): Promise<{ question: string; answer: string }[]> {
  const result = await db
    .prepare("SELECT question, answer FROM card_qna WHERE card_id = ? ORDER BY sort_order")
    .bind(cardId)
    .all<{ question: string; answer: string }>();
  return result.results;
}

export async function getSetsForCard(db: D1Database, cardId: number): Promise<string[]> {
  const result = await db
    .prepare("SELECT set_name FROM card_sets WHERE card_id = ? ORDER BY set_name")
    .bind(cardId)
    .all<{ set_name: string }>();
  return result.results.map((r) => r.set_name);
}

export async function getKeywordsForCard(db: D1Database, cardId: number): Promise<KeywordRow[]> {
  const result = await db
    .prepare("SELECT * FROM card_keywords WHERE card_id = ? ORDER BY sort_order")
    .bind(cardId)
    .all<KeywordRow>();
  return result.results;
}

// --- Batch loading (avoids N+1 queries) ---

const BATCH_SIZE = 80; // D1 limit is 100 bind params, leave room for other params

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function batchQuery<T>(
  db: D1Database,
  cardIds: number[],
  buildQuery: (placeholders: string) => string,
): Promise<T[]> {
  if (cardIds.length === 0) return [];
  const results: T[] = [];
  for (const batch of chunk(cardIds, BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(",");
    const result = await db
      .prepare(buildQuery(placeholders))
      .bind(...batch)
      .all<T>();
    results.push(...result.results);
  }
  return results;
}

export async function batchGetArts(db: D1Database, cardIds: number[]): Promise<Map<number, ArtRow[]>> {
  const rows = await batchQuery<ArtRow>(db, cardIds, (p) =>
    `SELECT * FROM card_arts WHERE card_id IN (${p}) ORDER BY card_id, sort_order`
  );
  const map = new Map<number, ArtRow[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push(row);
    map.set(row.card_id, existing);
  }
  return map;
}

export async function batchGetSkills(db: D1Database, cardIds: number[]): Promise<Map<number, OshiSkillRow[]>> {
  const rows = await batchQuery<OshiSkillRow>(db, cardIds, (p) =>
    `SELECT * FROM card_oshi_skills WHERE card_id IN (${p})`
  );
  const map = new Map<number, OshiSkillRow[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push(row);
    map.set(row.card_id, existing);
  }
  return map;
}

export async function batchGetColors(db: D1Database, cardIds: number[]): Promise<Map<number, string[]>> {
  const rows = await batchQuery<{ card_id: number; color: string }>(db, cardIds, (p) =>
    `SELECT card_id, color FROM card_colors WHERE card_id IN (${p}) ORDER BY card_id, sort_order`
  );
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push(row.color);
    map.set(row.card_id, existing);
  }
  return map;
}

export async function batchGetTags(db: D1Database, cardIds: number[]): Promise<Map<number, string[]>> {
  const rows = await batchQuery<{ card_id: number; tag: string }>(db, cardIds, (p) =>
    `SELECT card_id, tag FROM card_tags WHERE card_id IN (${p})`
  );
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push(row.tag);
    map.set(row.card_id, existing);
  }
  return map;
}

export async function batchGetQna(db: D1Database, cardIds: number[]): Promise<Map<number, { question: string; answer: string }[]>> {
  const rows = await batchQuery<{ card_id: number; question: string; answer: string }>(db, cardIds, (p) =>
    `SELECT card_id, question, answer FROM card_qna WHERE card_id IN (${p}) ORDER BY card_id, sort_order`
  );
  const map = new Map<number, { question: string; answer: string }[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push({ question: row.question, answer: row.answer });
    map.set(row.card_id, existing);
  }
  return map;
}

export async function batchGetKeywords(db: D1Database, cardIds: number[]): Promise<Map<number, KeywordRow[]>> {
  const rows = await batchQuery<KeywordRow>(db, cardIds, (p) =>
    `SELECT * FROM card_keywords WHERE card_id IN (${p}) ORDER BY card_id, sort_order`
  );
  const map = new Map<number, KeywordRow[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push(row);
    map.set(row.card_id, existing);
  }
  return map;
}

export async function batchGetSets(db: D1Database, cardIds: number[]): Promise<Map<number, string[]>> {
  const rows = await batchQuery<{ card_id: number; set_name: string }>(db, cardIds, (p) =>
    `SELECT card_id, set_name FROM card_sets WHERE card_id IN (${p}) ORDER BY card_id, set_name`
  );
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push(row.set_name);
    map.set(row.card_id, existing);
  }
  return map;
}

export async function getAllSets(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT DISTINCT set_name FROM card_sets ORDER BY set_name")
    .all<{ set_name: string }>();
  return result.results.map((r) => r.set_name);
}

export async function getAllMembers(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT DISTINCT name FROM cards WHERE card_type IN ('holomem', 'oshi') ORDER BY name")
    .all<{ name: string }>();
  return result.results.map((r) => r.name);
}

export async function getAllColors(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT DISTINCT color FROM card_colors ORDER BY color")
    .all<{ color: string }>();
  return result.results.map((r) => r.color);
}

export async function getAllRarities(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT DISTINCT rarity FROM cards ORDER BY rarity")
    .all<{ rarity: string }>();
  return result.results.map((r) => r.rarity);
}

export async function getAllTags(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT DISTINCT tag FROM card_tags ORDER BY tag")
    .all<{ tag: string }>();
  return result.results.map((r) => r.tag);
}

// --- Pricing ---

export async function updateTcgId(db: D1Database, cardId: number, tcgId: number): Promise<void> {
  await db.prepare("UPDATE cards SET tcg_id = ? WHERE id = ?").bind(tcgId, cardId).run();
}

export async function hasDailyPriceForDate(
  db: D1Database,
  cardId: number,
  date: string
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 FROM card_price_daily WHERE card_id = ? AND date = ?")
    .bind(cardId, date)
    .first<{ 1: number }>();
  return row !== null;
}

export async function saveDailyPrice(
  db: D1Database,
  cardId: number,
  date: string,
  price: TCGPrice
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO card_price_daily (card_id, date, low_price, mid_price, high_price, market_price, direct_low_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(cardId, date, price.lowPrice, price.midPrice, price.highPrice, price.marketPrice, price.directLowPrice)
    .run();
}

export async function saveMonthlyPrice(
  db: D1Database,
  cardId: number,
  date: string,
  price: TCGPrice
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO card_price_monthly (card_id, date, low_price, mid_price, high_price, market_price, direct_low_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(cardId, date, price.lowPrice, price.midPrice, price.highPrice, price.marketPrice, price.directLowPrice)
    .run();
}

export async function pruneOldPrices(db: D1Database, cardId: number): Promise<void> {
  await db
    .prepare("DELETE FROM card_price_daily WHERE card_id = ? AND date < date('now', '-30 days')")
    .bind(cardId)
    .run();
  await db
    .prepare("DELETE FROM card_price_monthly WHERE card_id = ? AND date < date('now', '-12 months')")
    .bind(cardId)
    .run();
}

export async function getDailyPricesForCard(
  db: D1Database,
  cardId: number
): Promise<PriceDailyRow[]> {
  const result = await db
    .prepare("SELECT * FROM card_price_daily WHERE card_id = ? ORDER BY date DESC LIMIT 30")
    .bind(cardId)
    .all<PriceDailyRow>();
  return result.results;
}

export async function getMonthlyPricesForCard(
  db: D1Database,
  cardId: number
): Promise<PriceMonthlyRow[]> {
  const result = await db
    .prepare("SELECT * FROM card_price_monthly WHERE card_id = ? ORDER BY date DESC LIMIT 12")
    .bind(cardId)
    .all<PriceMonthlyRow>();
  return result.results;
}

export async function batchGetDailyPrices(
  db: D1Database,
  cardIds: number[]
): Promise<Map<number, PriceDailyRow[]>> {
  const rows = await batchQuery<PriceDailyRow>(db, cardIds, (p) =>
    `SELECT * FROM card_price_daily WHERE card_id IN (${p}) ORDER BY card_id, date DESC`
  );
  const map = new Map<number, PriceDailyRow[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push(row);
    map.set(row.card_id, existing);
  }
  return map;
}

export async function batchGetMonthlyPrices(
  db: D1Database,
  cardIds: number[]
): Promise<Map<number, PriceMonthlyRow[]>> {
  const rows = await batchQuery<PriceMonthlyRow>(db, cardIds, (p) =>
    `SELECT * FROM card_price_monthly WHERE card_id IN (${p}) ORDER BY card_id, date DESC`
  );
  const map = new Map<number, PriceMonthlyRow[]>();
  for (const row of rows) {
    const existing = map.get(row.card_id) || [];
    existing.push(row);
    map.set(row.card_id, existing);
  }
  return map;
}
