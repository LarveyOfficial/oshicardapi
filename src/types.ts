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
}

export interface ArtRow {
  id: number;
  card_id: number;
  name: string;
  damage: number | null;
  cost: string | null;
  effect_text: string | null;
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
}

export interface ParsedArt {
  name: string;
  damage: number | null;
  cost: string[] | null;
  effectText: string | null;
}

export interface ParsedQA {
  question: string;
  answer: string;
}

export interface ParsedOshiSkill {
  skillType: string;
  name: string;
  cost: string | null;
  usageLimit: string | null;
  effectText: string;
}
