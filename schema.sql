CREATE TABLE IF NOT EXISTS cards (
  id            INTEGER PRIMARY KEY,
  card_number   TEXT NOT NULL,
  name          TEXT NOT NULL,
  card_type     TEXT NOT NULL,
  color         TEXT NOT NULL,
  rarity        TEXT NOT NULL,
  set_name      TEXT,
  release_date  TEXT,
  illustrator   TEXT,
  image_url     TEXT,
  card_url      TEXT,
  hp            INTEGER,
  bloom_level   TEXT,
  baton_pass    TEXT,
  life          INTEGER,
  is_buzz       INTEGER NOT NULL DEFAULT 0,
  support_type  TEXT,
  is_limited    INTEGER NOT NULL DEFAULT 0,
  special_text  TEXT,
  extra_text    TEXT,
  scraped_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS card_arts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id         INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  damage          TEXT,
  cost            TEXT,
  effect_text     TEXT,
  damage_bonuses  TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(card_id, sort_order)
);

CREATE TABLE IF NOT EXISTS card_oshi_skills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  skill_type  TEXT NOT NULL,
  name        TEXT NOT NULL,
  cost        TEXT,
  usage_limit TEXT,
  effect_text TEXT NOT NULL,
  UNIQUE(card_id, skill_type)
);

CREATE TABLE IF NOT EXISTS card_tags (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL,
  UNIQUE(card_id, tag)
);

CREATE TABLE IF NOT EXISTS card_qna (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_sets (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id  INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  set_name TEXT NOT NULL,
  UNIQUE(card_id, set_name)
);

CREATE TABLE IF NOT EXISTS card_colors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  color       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(card_id, color)
);

CREATE TABLE IF NOT EXISTS scrape_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_card_type ON cards(card_type);
CREATE INDEX IF NOT EXISTS idx_cards_color ON cards(color);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);
CREATE INDEX IF NOT EXISTS idx_cards_set_name ON cards(set_name);
CREATE INDEX IF NOT EXISTS idx_cards_bloom_level ON cards(bloom_level);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag);
CREATE INDEX IF NOT EXISTS idx_card_arts_card_id ON card_arts(card_id);
CREATE INDEX IF NOT EXISTS idx_card_oshi_skills_card_id ON card_oshi_skills(card_id);
CREATE INDEX IF NOT EXISTS idx_card_qna_card_id ON card_qna(card_id);
CREATE INDEX IF NOT EXISTS idx_card_sets_card_id ON card_sets(card_id);
CREATE INDEX IF NOT EXISTS idx_card_sets_set_name ON card_sets(set_name);
CREATE INDEX IF NOT EXISTS idx_card_colors_card_id ON card_colors(card_id);
CREATE INDEX IF NOT EXISTS idx_card_colors_color ON card_colors(color);
