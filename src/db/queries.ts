import type { ParsedCard, CardRow, ArtRow, OshiSkillRow } from "../types";

// --- Upsert operations (used by scraper) ---

export async function upsertCard(db: D1Database, card: ParsedCard): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO cards (id, card_number, name, card_type, color, rarity, set_name, release_date, illustrator, image_url, card_url, hp, bloom_level, baton_pass, life, is_buzz, support_type, is_limited, special_text, scraped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      card.id,
      card.cardNumber,
      card.name,
      card.cardType,
      card.color,
      card.rarity,
      card.setName,
      card.releaseDate,
      card.illustrator,
      card.imageUrl,
      card.cardUrl,
      card.hp,
      card.bloomLevel,
      card.batonPass,
      card.life,
      card.isBuzz ? 1 : 0,
      card.supportType,
      card.isLimited ? 1 : 0,
      card.specialText
    )
    .run();

  // Replace arts
  await db.prepare("DELETE FROM card_arts WHERE card_id = ?").bind(card.id).run();
  for (let i = 0; i < card.arts.length; i++) {
    const art = card.arts[i];
    await db
      .prepare(
        "INSERT INTO card_arts (card_id, name, damage, cost, effect_text, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(card.id, art.name, art.damage, art.cost, art.effectText, i)
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

export async function searchCards(
  db: D1Database,
  filter: CardFilter,
  page: number,
  pageSize: number
): Promise<{ cards: CardRow[]; totalCount: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.cardType) {
    conditions.push("c.card_type = ?");
    params.push(filter.cardType.toLowerCase());
  }
  if (filter.color) {
    conditions.push("c.color = ?");
    params.push(filter.color);
  }
  if (filter.rarity) {
    conditions.push("c.rarity = ?");
    params.push(filter.rarity);
  }
  if (filter.setName) {
    conditions.push("c.set_name = ?");
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
  const offset = (page - 1) * pageSize;

  const countResult = await db
    .prepare(`SELECT COUNT(DISTINCT c.id) as count FROM cards c ${joinTag} ${where}`)
    .bind(...params)
    .first<{ count: number }>();

  const cards = await db
    .prepare(
      `SELECT DISTINCT c.* FROM cards c ${joinTag} ${where} ORDER BY c.card_number ASC LIMIT ? OFFSET ?`
    )
    .bind(...params, pageSize, offset)
    .all<CardRow>();

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

export async function getTagsForCard(db: D1Database, cardId: number): Promise<string[]> {
  const result = await db
    .prepare("SELECT tag FROM card_tags WHERE card_id = ?")
    .bind(cardId)
    .all<{ tag: string }>();
  return result.results.map((r) => r.tag);
}

export async function getAllSets(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT DISTINCT set_name FROM cards WHERE set_name IS NOT NULL ORDER BY set_name")
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
    .prepare("SELECT DISTINCT color FROM cards ORDER BY color")
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
