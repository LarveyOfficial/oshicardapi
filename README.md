# Oshi Card API

A free, public GraphQL API for the **hololive Official Card Game (hOCG)**. Query every card in the game — holomem, oshi, support, and cheer cards — with full filtering, pagination, and search.

Data is automatically scraped from the [official English card list](https://en.hololive-official-cardgame.com/cardlist/cardsearch/) and updated daily via GitHub Actions.

## Live API

> **GraphQL Endpoint**: `https://oshicardapi.luisrvervaet.workers.dev/graphql`
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
  - [Enums](#enums)
- [Example Queries](#example-queries)
- [Architecture](#architecture)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [Database Schema](#database-schema)
  - [Scraper](#scraper)
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
curl -X POST https://oshicardapi.luisrvervaet.workers.dev/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ cards { totalCount nodes { name cardType color rarity } } }"}'

# Get a specific card by number
curl -X POST https://oshicardapi.luisrvervaet.workers.dev/graphql \
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
    setName
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
| Automation | GitHub Actions | Daily cron to scrape all cards (free for public repos) |
| Deploy | Wrangler CLI | Official Cloudflare tooling |

### Project Structure

```
oshicardapi/
  wrangler.toml              # Cloudflare Workers config + D1 binding
  schema.sql                 # Database schema (5 tables)
  scrape-all.sh              # Local scrape script
  .github/workflows/
    scrape.yml               # Daily GitHub Actions cron (3 AM UTC)
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
      client.ts              # HTTP fetch with 500ms delay + retry
```

### Database Schema

**`cards`** — One row per card (unique on `card_number` + `rarity`).

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

**`card_arts`** — Holomem moves. `cost` is a JSON array of colors (e.g., `["RED","COLORLESS","COLORLESS"]`).

**`card_oshi_skills`** — Oshi skills (regular + SP).

**`card_sets`** — Sets a card appears in. A card can belong to multiple sets.

**`card_tags`** — Card hashtags (e.g., `#EN`, `#Gen 1`).

### Scraper

The scraper uses two lightweight endpoints:

1. **`/scrape-page-ids?page=N`** — Fetches a search result page and returns an array of card IDs
2. **`/scrape-one?id=N`** — Fetches a single card detail page, parses it with cheerio, and upserts into D1

A GitHub Actions cron job runs daily at 3 AM UTC, calling these endpoints sequentially:
- Fetches page IDs starting from page 0
- For each ID, calls `/scrape-one` with a 500ms delay between cards
- 5 second pause between pages to avoid rate limiting
- Stops when a page returns an empty array

The same flow can be run locally via `./scrape-all.sh`.

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
# Run the scrape script locally
./scrape-all.sh

# Or trigger the GitHub Action manually from the Actions tab
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

---

## License

ISC
