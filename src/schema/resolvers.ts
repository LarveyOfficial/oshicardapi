import type { Env, CardRow, ArtRow, OshiSkillRow } from "../types";
import {
  getCardById,
  getCardByNumber,
  searchCards,
  getArtsForCard,
  getSkillsForCard,
  getTagsForCard,
  getSetsForCard,
  getAllSets,
  getAllTags,
  getAllMembers,
  getAllColors,
  getAllRarities,
  type CardFilter,
} from "../db/queries";

interface Context {
  env: Env;
}

function mapCardType(dbType: string): string {
  switch (dbType.toLowerCase()) {
    case "holomem": return "HOLOMEM";
    case "oshi": return "OSHI";
    case "support": return "SUPPORT";
    case "cheer": return "CHEER";
    default: return "HOLOMEM";
  }
}

function mapCardTypeToDb(gqlType: string): string {
  switch (gqlType) {
    case "HOLOMEM": return "holomem";
    case "OSHI": return "oshi";
    case "SUPPORT": return "support";
    case "CHEER": return "cheer";
    default: return gqlType.toLowerCase();
  }
}

function mapSupportTypeToDb(gqlType: string): string {
  // DB stores capitalized (Item, Staff, etc.), GraphQL enum is uppercase
  const map: Record<string, string> = {
    ITEM: "Item",
    STAFF: "Staff",
    MASCOT: "Mascot",
    FAN: "Fan",
    EVENT: "Event",
    TOOL: "Tool",
  };
  return map[gqlType] || gqlType;
}

function mapColor(gqlColor: string): string {
  // DB now stores uppercase color values matching GraphQL enums
  return gqlColor;
}

async function resolveCardFields(card: CardRow, db: D1Database) {
  const [arts, oshiSkills, tags, setNames] = await Promise.all([
    getArtsForCard(db, card.id),
    getSkillsForCard(db, card.id),
    getTagsForCard(db, card.id),
    getSetsForCard(db, card.id),
  ]);

  return {
    id: card.id,
    cardNumber: card.card_number,
    name: card.name,
    cardType: mapCardType(card.card_type),
    color: card.color,
    rarity: card.rarity,
    setNames,
    releaseDate: card.release_date,
    illustrator: card.illustrator,
    imageUrl: card.image_url,
    cardUrl: card.card_url,
    hp: card.hp,
    isBuzz: card.is_buzz === 1,
    supportType: card.support_type,
    isLimited: card.is_limited === 1,
    bloomLevel: card.bloom_level,
    batonPass: card.baton_pass ? JSON.parse(card.baton_pass) : null,
    life: card.life,
    specialText: card.special_text,
    extraText: card.extra_text ?? null,
    tags,
    arts: arts.map((a: ArtRow) => ({
      name: a.name,
      damage: a.damage,
      cost: a.cost ? JSON.parse(a.cost) : null,
      effectText: a.effect_text,
    })),
    oshiSkills: oshiSkills.map((s: OshiSkillRow) => ({
      name: s.name,
      cost: s.cost,
      usageLimit: s.usage_limit,
      effectText: s.effect_text,
      skillType: s.skill_type === "sp_oshi" ? "SP_OSHI" : "OSHI",
    })),
  };
}

export const resolvers = {
  Query: {
    async card(_: unknown, args: { id?: number; cardNumber?: string }, context: Context) {
      const db = context.env.DB;

      let card: CardRow | null = null;
      if (args.id) {
        card = await getCardById(db, args.id);
      } else if (args.cardNumber) {
        card = await getCardByNumber(db, args.cardNumber);
      }

      if (!card) return null;
      return resolveCardFields(card, db);
    },

    async cards(
      _: unknown,
      args: { filter?: CardFilter & { cardType?: string; color?: string }; page?: number; pageSize?: number },
      context: Context
    ) {
      const db = context.env.DB;
      const page = args.page ?? 1;
      const pageSize = Math.min(args.pageSize ?? 20, 500);

      const filter: CardFilter = {};
      if (args.filter) {
        if (args.filter.cardType) filter.cardType = mapCardTypeToDb(args.filter.cardType);
        if (args.filter.color) filter.color = mapColor(args.filter.color);
        if (args.filter.rarity) filter.rarity = args.filter.rarity;
        if (args.filter.setName) filter.setName = args.filter.setName;
        if (args.filter.bloomLevel) filter.bloomLevel = args.filter.bloomLevel;
        if (args.filter.tag) filter.tag = args.filter.tag;
        if (args.filter.name) filter.name = args.filter.name;
        if (args.filter.search) filter.search = args.filter.search;
        if (args.filter.supportType) filter.supportType = mapSupportTypeToDb(args.filter.supportType);
        if (args.filter.isLimited !== undefined) filter.isLimited = args.filter.isLimited;
        if (args.filter.includeBuzz !== undefined) filter.includeBuzz = args.filter.includeBuzz;
      }

      const { cards, totalCount } = await searchCards(db, filter, page, pageSize);
      const totalPages = Math.ceil(totalCount / pageSize);

      const nodes = await Promise.all(
        cards.map((card) => resolveCardFields(card, db))
      );

      return {
        nodes,
        totalCount,
        pageInfo: {
          currentPage: page,
          totalPages,
          hasNextPage: page < totalPages,
        },
      };
    },

    async sets(_: unknown, __: unknown, context: Context) {
      return getAllSets(context.env.DB);
    },

    async tags(_: unknown, __: unknown, context: Context) {
      return getAllTags(context.env.DB);
    },

    async members(_: unknown, __: unknown, context: Context) {
      return getAllMembers(context.env.DB);
    },

    async colors(_: unknown, __: unknown, context: Context) {
      return getAllColors(context.env.DB);
    },

    async rarities(_: unknown, __: unknown, context: Context) {
      return getAllRarities(context.env.DB);
    },
  },
};
