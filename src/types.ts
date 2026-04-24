export interface Env {
  DB: D1Database;
}

export interface CardRow {
  id: number;
  card_number: string;
  name: string;
  card_type: string;
  rarity: string;
  set_name: string | null;
  release_date: string | null;
  illustrator: string | null;
  image_url: string | null;
  card_url: string | null;
  hp: number | null;
  bloom_level: string | null;
  baton_pass: string | null;
  life: number | null;
  is_buzz: number;
  support_type: string | null;
  is_limited: number;
  special_text: string | null;
  extra_text: string | null;
  scraped_at: string;
  tcg_id: number | null;
}

export interface ArtRow {
  id: number;
  card_id: number;
  name: string;
  damage: string | null;
  cost: string | null;
  effect_text: string | null;
  damage_bonuses: string | null;
  sort_order: number;
}

export interface OshiSkillRow {
  id: number;
  card_id: number;
  skill_type: string;
  name: string;
  cost: string | null;
  usage_limit: string | null;
  effect_text: string;
}

export interface CardListItem {
  id: number;
  name: string;
  imageUrl: string;
}

export interface ParsedCard {
  id: number;
  cardNumber: string;
  name: string;
  cardType: string;
  colors: string[];
  rarity: string;
  setNames: string[];
  releaseDate: string | null;
  illustrator: string | null;
  imageUrl: string | null;
  cardUrl: string | null;
  hp: number | null;
  bloomLevel: string | null;
  batonPass: string[] | null;
  life: number | null;
  isBuzz: boolean;
  supportType: string | null;
  isLimited: boolean;
  specialText: string | null;
  extraText: string | null;
  arts: ParsedArt[];
  oshiSkills: ParsedOshiSkill[];
  tags: string[];
  qna: ParsedQA[];
  keywords: ParsedKeyword[];
}

export interface ParsedKeyword {
  type: string;
  title: string;
  description: string;
}

export interface KeywordRow {
  id: number;
  card_id: number;
  type: string;
  title: string;
  description: string;
  sort_order: number;
}

export interface DamageBonus {
  amount: string;
  colors: string[];
}

export interface ParsedArt {
  name: string;
  damage: string | null;
  cost: string[] | null;
  effectText: string | null;
  damageBonuses: DamageBonus[];
}

export interface ParsedQA {
  question: string;
  answer: string;
}

export interface PriceDailyRow {
  id: number;
  card_id: number;
  date: string;
  low_price: number | null;
  mid_price: number | null;
  high_price: number | null;
  market_price: number | null;
  direct_low_price: number | null;
}

export interface PriceMonthlyRow {
  id: number;
  card_id: number;
  date: string;
  low_price: number | null;
  mid_price: number | null;
  high_price: number | null;
  market_price: number | null;
  direct_low_price: number | null;
}

export interface ParsedOshiSkill {
  skillType: string;
  name: string;
  cost: string | null;
  usageLimit: string | null;
  effectText: string;
}
