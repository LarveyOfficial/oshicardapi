# Oshi Card API

A free, public GraphQL API for the **hololive Official Card Game (hOCG)**. Query every card in the game — holomem, oshi, support, and cheer cards — with full filtering, pagination, search, and historical TCGPlayer pricing data.

Card data is automatically scraped from the [official English card list](https://en.hololive-official-cardgame.com/cardlist/cardsearch/) and updated daily via GitHub Actions. Pricing data is pulled from [TCGPlayer](https://www.tcgplayer.com/) via tcgcsv.com, updated daily and checked hourly for changes.

## Live API

> **GraphQL Endpoint**: `https://api.oshi.cards/graphql`
>
> **GraphiQL Playground**: Visit the endpoint in your browser to explore the API interactively.

---

## Table of Contents

- [Quick Start](#quick-start)
- [GraphQL API Reference](#graphql-api-reference)
  - [Queries](#queries)
  - [Filtering](#filtering)
  - [Pagination](#pagination)
  - [Card Types](#card-types)
  - [Pricing Data](#pricing-data)
  - [Enums](#enums)
- [Example Queries](#example-queries)
- [Architecture](#architecture)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [Database Schema](#database-schema)
  - [Scraper](#scraper)
  - [Price Scraper](#price-scraper)
- [Self-Hosting](#self-hosting)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Deploying to Cloudflare](#deploying-to-cloudflare)
  - [Populating the Database](#populating-the-database)
- [API Endpoints](#api-endpoints)

---

## Quick Start

Query the API with any GraphQL client, `curl`, or the built-in GraphiQL playground.

```bash
# Get all cards
curl -X POST https://api.oshi.cards/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ cards { totalCount nodes { name cardType color rarity } } }"}'

# Get a specific card by number
curl -X POST https://api.oshi.cards/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ card(cardNumber: \"hBP01-020\") { name hp arts { name damage cost } tags } }"}'
```

---

## GraphQL API Reference

### Queries

| Query | Description |
|-------|-------------|
| `card(id: Int, cardNumber: String)` | Get a single card by its internal ID or card number (e.g., `"hBP01-020"`) |
| `cards(filter: CardFilter, page: Int, pageSize: Int)` | Search and filter cards with pagination |
| `members` | List all unique hololive member names (from holomem + oshi cards) |
| `sets` | List all booster pack and starter deck names |
| `tags` | List all unique tags (e.g., `#EN`, `#Gen 1`, `#Bird`) |
| `colors` | List all card colors |
| `rarities` | List all rarity levels |

### Filtering

The `cards` query accepts a `filter` input with these fields:

| Filter | Type | Description |
|--------|------|-------------|
| `name` | `String` | **Exact match** on card name. Use this to get all cards for a specific hololive member (returns their holomem, buzz, and oshi cards). |
| `search` | `String` | **Partial match** on card name. Finds any card whose name contains the search string. |
| `cardType` | `CardType` | Filter by card type: `HOLOMEM`, `OSHI`, `SUPPORT`, `CHEER`. |
| `color` | `Color` | Filter by color: `WHITE`, `GREEN`, `RED`, `BLUE`, `PURPLE`, `YELLOW`, `NEUTRAL`. |
| `rarity` | `String` | Filter by rarity code: `C`, `U`, `R`, `RR`, `SR`, `SSR`, `OSR`, `SEC`, `OC`, `UR`, etc. |
| `setName` | `String` | Match cards that appear in a specific set (e.g., `"Booster Pack – Blooming Radiance"`). Use the `sets` query to see all available set names. |
| `bloomLevel` | `String` | Filter holomem cards by bloom level: `Debut`, `1st`, `2nd`, `Spot`. |
| `tag` | `String` | Exact match on a tag (e.g., `"#EN"`, `"#Gen 1"`, `"#Bird"`). Use the `tags` query to see all available tags. |
| `supportType` | `SupportType` | Filter support cards by subtype: `ITEM`, `STAFF`, `MASCOT`, `FAN`, `EVENT`, `TOOL`. |
| `isLimited` | `Boolean` | Filter by LIMITED status. `true` = only LIMITED cards, `false` = only non-LIMITED cards. |
| `includeBuzz` | `Boolean` | Whether to include Buzz holomem cards. Defaults to `true`. Set to `false` to exclude them. |

All filters are optional and can be combined.

### Pagination

The `cards` query returns a `CardConnection` with:

```graphql
type CardConnection {
  nodes: [Card!]!        # The cards for this page
  totalCount: Int!       # Total number of matching cards
  pageInfo: PageInfo!    # Pagination metadata
}

type PageInfo {
  currentPage: Int!
  totalPages: Int!
  hasNextPage: Boolean!
}
```

- `page` defaults to `1`
- `pageSize` defaults to `20`, maximum `500`

### Card Types

Every card has these common fields:

```graphql
type Card {
  id: Int!                # Internal ID
  cardNumber: String!     # Official card number (e.g., "hBP01-020")
  name: String!           # Card name (holomem/oshi = member name)
  cardType: CardType!     # HOLOMEM, OSHI, SUPPORT, or CHEER
  color: String!          # RED, GREEN, BLUE, WHITE, PURPLE, YELLOW, or NEUTRAL
  rarity: String!         # C, U, R, RR, SR, SSR, OSR, SEC, etc.
  setNames: [String!]!    # All sets this card appears in
  releaseDate: String     # Release date string
  illustrator: String     # Card illustrator name
  imageUrl: String        # URL to the card image on the official site
  cardUrl: String         # URL to the card's page on the official site
  tags: [String!]!        # Tags like #EN, #Gen 1, #Bird, #Singing
  tcgId: Int              # TCGPlayer product ID (null if not yet fetched)
  pricingData: PricingData  # Historical pricing from TCGPlayer

  # Holomem-specific
  hp: Int                 # Hit points (holomem only)
  bloomLevel: String      # Debut, 1st, 2nd, or Spot (holomem only)
  batonPass: [String!]    # Baton pass cost as color array (e.g., ["COLORLESS", "COLORLESS"])
  isBuzz: Boolean!        # Whether this is a Buzz holomem card
  arts: [Art!]!           # Moves/attacks (holomem only)
  extraText: String       # Extra text (e.g., "If this holomem is downed, you get life-2")

  # Oshi-specific
  life: Int               # Life points (oshi only)
  oshiSkills: [OshiSkill!]!  # Oshi and SP Oshi skills (oshi only)

  # Support-specific
  supportType: String     # Item, Staff, Mascot, Fan, Event, or Tool (support only)
  isLimited: Boolean!     # Whether this is a LIMITED card
  specialText: String     # Ability text (support cards), special rules
}
```

**Arts** (holomem moves):

```graphql
type Art {
  name: String!           # Move name (e.g., "Everyone Together")
  damage: Int             # Base damage value (e.g., 70)
  cost: [String!]         # Cost as color array (e.g., ["RED", "COLORLESS", "COLORLESS"])
  effectText: String      # Move effect description
}
```

**Oshi Skills**:

```graphql
type OshiSkill {
  name: String!           # Skill name (e.g., "Replacement")
  cost: String            # holo Power cost (e.g., "-1")
  usageLimit: String      # Usage limit (e.g., "1/Turn", "1/Game")
  effectText: String!     # Skill effect description
  skillType: OshiSkillType!  # OSHI or SP_OSHI
}
```

### Pricing Data

Each card exposes historical pricing sourced from TCGPlayer via tcgcsv.com. Prices are recorded once per TCGPlayer data update (typically daily) and retained for up to 30 days of daily history and 12 months of monthly snapshots.

```graphql
type PricingData {
  dailyPrices: [DailyPrice!]!     # Up to 30 days of price history
  monthlyPrices: [MonthlyPrice!]! # Up to 12 months of price history (end-of-month snapshots)
}

type DailyPrice {
  date: String!           # Timestamp from TCGPlayer's last-updated feed
  lowPrice: Float         # Lowest listed price
  midPrice: Float         # Mid-market price
  highPrice: Float        # Highest listed price
  marketPrice: Float      # Actual average sale price
  directLowPrice: Float   # Lowest TCGPlayer Direct price
}

type MonthlyPrice {
  date: String!           # First day of the month (YYYY-MM-01)
  lowPrice: Float
  midPrice: Float
  highPrice: Float
  marketPrice: Float
  directLowPrice: Float
}
```

All price fields are `null` if TCGPlayer has no price data for that card (e.g., newly released or unlisted cards). `tcgId` will be `null` if the card's pricing has never been fetched.

### Enums

```graphql
enum CardType {
  HOLOMEM     # Regular and Buzz holomem cards
  OSHI        # Oshi cards
  SUPPORT     # Support cards (Item, Staff, Mascot, Fan, Event, Tool)
  CHEER       # Cheer cards
}

enum SupportType {
  ITEM
  STAFF
  MASCOT
  FAN
  EVENT
  TOOL
}

enum Color {
  WHITE
  GREEN
  RED
  BLUE
  PURPLE
  YELLOW
  NEUTRAL
}

enum OshiSkillType {
  OSHI        # Regular Oshi Skill
  SP_OSHI     # SP Oshi Skill (usually 1/Game)
}
```

---

## Example Queries

### Get all cards for a specific hololive member

```graphql
{
  cards(filter: { name: "Nanashi Mumei" }) {
    totalCount
    nodes {
      name
      cardNumber
      cardType
      bloomLevel
      setNames
      isBuzz
      hp
      life
      arts {
        name
        damage
        cost
        effectText
      }
      oshiSkills {
        name
        cost
        effectText
        skillType
      }
    }
  }
}
```

### Get a single card with full details

```graphql
{
  card(cardNumber: "hSD01-001") {
    name
    cardType
    color
    rarity
    life
    illustrator
    imageUrl
    cardUrl
    setNames
    releaseDate
    batonPass
    extraText
    arts {
      name
      damage
      cost
    }
    oshiSkills {
      name
      cost
      usageLimit
      effectText
      skillType
    }
  }
}
```

### Get pricing history for a card

```graphql
{
  card(cardNumber: "hBP01-020") {
    name
    tcgId
    pricingData {
      dailyPrices {
        date
        marketPrice
        lowPrice
        highPrice
      }
      monthlyPrices {
        date
        marketPrice
      }
    }
  }
}
```

### Filter by multiple criteria

```graphql
{
  cards(
    filter: {
      cardType: HOLOMEM
      color: WHITE
      bloomLevel: "2nd"
      tag: "#EN"
    }
    page: 1
    pageSize: 50
  ) {
    totalCount
    pageInfo {
      currentPage
      totalPages
      hasNextPage
    }
    nodes {
      name
      cardNumber
      hp
      arts {
        name
        damage
        cost
      }
    }
  }
}
```

### Get all support items that are LIMITED

```graphql
{
  cards(filter: { supportType: ITEM, isLimited: true }) {
    nodes {
      name
      cardNumber
      supportType
      isLimited
      specialText
    }
  }
}
```

### Search by partial name

```graphql
{
  cards(filter: { search: "Sora" }) {
    nodes {
      name
      cardNumber
      cardType
    }
  }
}
```

### Get all tags, colors, and rarities

Useful for building filter UIs.

```graphql
{
  tags
  colors
  rarities
  sets
  members
}
```

---

## Architecture

### Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Cloudflare Workers | Free tier (100K req/day), no cold starts, global edge |
| Database | Cloudflare D1 (SQLite) | Free tier (5M reads/day, 5GB), co-located with Worker |
| GraphQL | graphql-yoga | Lightweight, Workers-compatible, built-in GraphiQL |
| Scraper | cheerio | Fast HTML parsing without a browser, works in Workers |
| Automation | GitHub Actions | Daily card scrape + hourly price scrape (free for public repos) |
| Deploy | Wrangler CLI | Official Cloudflare tooling |

### Project Structure

```
oshicardapi/
  wrangler.toml              # Cloudflare Workers config + D1 binding
  schema.sql                 # Database schema
  scrape-all.sh              # Local scrape script
  .github/workflows/
    scrape-prod.yml          # Daily card scrape cron (3 AM UTC)
    scrape-dev.yml           # Manual card scrape for preview deployments
    scrape-prices-prod.yml   # Hourly price scrape cron
    scrape-prices-dev.yml    # Manual price scrape for preview deployments
  src/
    index.ts                 # Worker entry point (routes + endpoints)
    types.ts                 # TypeScript interfaces
    schema/
      typeDefs.ts            # GraphQL schema definition
      resolvers.ts           # Query resolvers (D1 -> GraphQL)
    db/
      queries.ts             # SQL query builders
    scraper/
      index.ts               # getPageIds, scrapePage helpers
      parseList.ts           # Card ID extractor from search pages
      parseDetail.ts         # Card detail HTML -> ParsedCard
      client.ts              # HTTP fetch with delay + retry
      pricing.ts             # TCGPlayer price fetching (with in-memory cache)
```

### Database Schema

**`cards`** — One row per card.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Internal ID from the official site |
| `card_number` | TEXT | Official card number (e.g., `hBP01-020`) |
| `name` | TEXT | Card name |
| `card_type` | TEXT | `holomem`, `oshi`, `support`, or `cheer` |
| `color` | TEXT | `RED`, `GREEN`, `BLUE`, `WHITE`, `PURPLE`, `YELLOW`, or `NEUTRAL` |
| `rarity` | TEXT | C, U, R, RR, SR, SSR, OSR, SEC, etc. |
| `hp` | INTEGER | Holomem HP |
| `bloom_level` | TEXT | Debut, 1st, 2nd, Spot |
| `baton_pass` | TEXT | JSON array of colors (e.g., `["COLORLESS","COLORLESS"]`) |
| `life` | INTEGER | Oshi life points |
| `is_buzz` | INTEGER | 1 if Buzz holomem |
| `support_type` | TEXT | Item, Staff, Mascot, Fan, Event, Tool |
| `is_limited` | INTEGER | 1 if LIMITED |
| `extra_text` | TEXT | Extra card text |
| `special_text` | TEXT | Ability/rules text |
| `tcg_id` | INTEGER | TCGPlayer product ID |

**`card_arts`** — Holomem moves. `cost` is a JSON array of colors.

**`card_oshi_skills`** — Oshi skills (regular + SP).

**`card_sets`** — Sets a card appears in. A card can belong to multiple sets.

**`card_tags`** — Card hashtags (e.g., `#EN`, `#Gen 1`).

**`card_price_daily`** — Daily price snapshots, retained for 30 days. `date` is the timestamp from TCGPlayer's `last-updated.txt`.

**`card_price_monthly`** — End-of-month price snapshots, retained for 12 months. `date` is the last day of that month (e.g., `2026-04-30`).

**`scrape_state`** — Key/value store for scrape state. Currently stores `tcg_last_updated` to track the last TCGPlayer data version processed.

### Scraper

The card scraper uses two endpoints:

1. **`/scrape-page-ids?page=N`** — Fetches a search result page and returns an array of card IDs
2. **`/scrape-one?id=N`** — Fetches a single card detail page, parses it with cheerio, and upserts into D1

A GitHub Actions cron job runs daily at 3 AM UTC, paging through all IDs and calling `/scrape-one` for each with a delay between requests.

### Price Scraper

Pricing data is sourced from [tcgcsv.com](https://tcgcsv.com), which mirrors TCGPlayer data. The price scraper runs hourly via GitHub Actions but only fetches prices when TCGPlayer has published new data (detected via `last-updated.txt`).

**Flow:**
1. GitHub Action fetches `https://tcgcsv.com/last-updated.txt` and compares it to the stored value in `/price-state`
2. If unchanged, the run exits immediately
3. If changed, the action calls `/scrape-price?id=N` starting from ID 1, incrementing until a card is not found in the database
4. Each `/scrape-price` call fetches the current price from TCGPlayer and stores a daily record. If it's the last day of the month, a monthly snapshot is also saved. Entries older than 30 days (daily) or 12 months (monthly) are pruned automatically
5. After all cards are processed, `/update-price-state` is called to record the new `last-updated.txt` value

**Caching:** TCGPlayer group, product, and price data are cached in-memory for 1 hour per Worker instance. `last-updated.txt` is cached for 30 minutes. This reduces a 1,400-card run from ~5,600 requests to roughly `(num_sets × 2) + 2` requests.

---

## Self-Hosting

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)

### Local Development

```bash
npm install
npm run db:init
npm run dev
```

The dev server runs at `http://localhost:8787`. Visit `/graphql` for the GraphiQL playground.

### Deploying to Cloudflare

```bash
npx wrangler login
npx wrangler d1 create oshicard-db
# Update database_id in wrangler.toml
npm run db:init:remote
npm run deploy
```

### Populating the Database

```bash
# Scrape all cards
./scrape-all.sh

# Initialize price state and trigger a price scrape
curl https://your-worker.workers.dev/update-price-state
# Then trigger the scrape-prices-dev GitHub Action with your preview URL
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check — returns card count |
| `/graphql` | GET | GraphiQL interactive playground |
| `/graphql` | POST | GraphQL query endpoint |
| `/scrape-page-ids?page=N` | GET | Get card IDs from search page N |
| `/scrape-one?id=N` | GET | Scrape and save a single card |
| `/scrape-status` | GET | Returns current card count |
| `/scrape-price?id=N` | GET | Fetch and store current TCGPlayer price for a card. Returns 409 if already recorded for the current TCGPlayer update, 404 if card not in DB or not on TCGPlayer |
| `/price-state` | GET | Returns the last recorded TCGPlayer `last-updated.txt` value |
| `/update-price-state` | GET | Fetches `last-updated.txt` from TCGPlayer and persists it to the database |

---

## License

ISC
