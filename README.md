# Oshi Card API

A free, public GraphQL API for the **hololive Official Card Game (hOCG)**. Query every card in the game — holomem, oshi, support, and cheer cards — with full filtering, pagination, and search.

Data is automatically scraped from the [official English card list](https://en.hololive-official-cardgame.com/cardlist/cardsearch/) and updated weekly.

## Live API

> **GraphQL Endpoint**: `https://oshicardapi.<your-subdomain>.workers.dev/graphql`
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
curl -X POST https://your-api.workers.dev/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ cards { totalCount nodes { name cardType color rarity } } }"}'

# Get a specific card by number
curl -X POST https://your-api.workers.dev/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ card(cardNumber: \"hBP01-020\") { name hp arts { name damage } tags } }"}'
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
| `setName` | `String` | Exact match on set name (e.g., `"Booster Pack – Blooming Radiance"`). Use the `sets` query to see all available set names. |
| `bloomLevel` | `String` | Filter holomem cards by bloom level: `Debut`, `1st`, `2nd`, `Spot`. |
| `tag` | `String` | Exact match on a tag (e.g., `"#EN"`, `"#Gen 1"`, `"#Bird"`). Use the `tags` query to see all available tags. |
| `supportType` | `SupportType` | Filter support cards by subtype: `ITEM`, `STAFF`, `MASCOT`, `FAN`, `EVENT`, `TOOL`. |
| `isLimited` | `Boolean` | Filter by LIMITED status. `true` = only LIMITED cards, `false` = only non-LIMITED cards. |
| `includeBuzz` | `Boolean` | Whether to include Buzz holomem cards. Defaults to `true`. Set to `false` to exclude them. |

All filters are optional and can be combined. For example, you can filter for all white holomem cards from a specific set that have a specific tag.

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

To fetch all cards at once, use `pageSize: 500` (or higher pages if needed).

### Card Types

Every card has these common fields:

```graphql
type Card {
  id: Int!                # Internal ID
  cardNumber: String!     # Official card number (e.g., "hBP01-020")
  name: String!           # Card name (holomem/oshi = member name)
  cardType: CardType!     # HOLOMEM, OSHI, SUPPORT, or CHEER
  color: String!          # White, Green, Red, Blue, Purple, Yellow, or Neutral
  rarity: String!         # C, U, R, RR, SR, SSR, OSR, SEC, etc.
  setName: String         # Booster pack or starter deck name
  releaseDate: String     # Release date string
  illustrator: String     # Card illustrator name
  imageUrl: String        # URL to the card image on the official site
  cardUrl: String         # URL to the card's page on the official site
  tags: [String!]!        # Tags like #EN, #Gen 1, #Bird, #Singing

  # Holomem-specific
  hp: Int                 # Hit points (holomem only)
  bloomLevel: String      # Debut, 1st, 2nd, or Spot (holomem only)
  batonPass: String       # Baton pass cost icons (holomem only)
  isBuzz: Boolean!        # Whether this is a Buzz holomem card
  arts: [Art!]!           # Moves/attacks (holomem only)

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
  cost: String            # Cost icons as text (e.g., "白, ◇, ◇")
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

Returns all holomem, buzz holomem, and oshi cards for that member across all sets and bloom levels.

```graphql
{
  cards(filter: { name: "Nanashi Mumei" }) {
    totalCount
    nodes {
      name
      cardNumber
      cardType
      bloomLevel
      setName
      isBuzz
      hp
      life
      arts {
        name
        damage
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

### List all hololive members

```graphql
{
  members
}
```

Returns: `["Aki Rosenthal", "Amane Kanata", "Gawr Gura", "Nanashi Mumei", "Tokino Sora", ...]`

### Get all cards from a specific set

```graphql
{
  cards(filter: { setName: "Booster Pack – Blooming Radiance" }, pageSize: 500) {
    totalCount
    nodes {
      name
      cardNumber
      cardType
      rarity
      color
    }
  }
}
```

### List all available sets

```graphql
{
  sets
}
```

### Filter by tag

```graphql
{
  cards(filter: { tag: "#EN" }) {
    totalCount
    nodes {
      name
      cardNumber
      tags
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

### Get all holomem cards excluding Buzz

```graphql
{
  cards(filter: { cardType: HOLOMEM, includeBuzz: false }) {
    totalCount
    nodes {
      name
      bloomLevel
      hp
      isBuzz
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

### Combine multiple filters

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
      }
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
| Deploy | Wrangler CLI | Official Cloudflare tooling |

### Project Structure

```
oshicardapi/
  wrangler.toml              # Cloudflare Workers config
  │                          #   - D1 database binding
  │                          #   - Cron trigger (weekly Monday 3 AM UTC)
  │
  schema.sql                 # Database schema (5 tables, 8 indexes)
  package.json               # Dependencies and scripts
  tsconfig.json              # TypeScript config
  │
  src/
    index.ts                 # Worker entry point
    │                        #   - GET /          → health check
    │                        #   - GET /graphql   → GraphiQL playground
    │                        #   - POST /graphql  → GraphQL queries
    │                        #   - GET /scrape    → trigger scrape batch
    │                        #   - GET /scrape-one?id=N → scrape single card
    │                        #   - scheduled()    → cron handler
    │
    types.ts                 # TypeScript interfaces
    │                        #   - Env (D1 binding)
    │                        #   - CardRow, ArtRow, OshiSkillRow (DB rows)
    │                        #   - ParsedCard, ParsedArt, ParsedOshiSkill (scraper output)
    │
    schema/
      typeDefs.ts            # GraphQL schema definition
      resolvers.ts           # Query resolvers (D1 → GraphQL)
    │
    db/
      queries.ts             # Parameterized SQL queries
    │                        #   - upsertCard (scraper → DB)
    │                        #   - searchCards (filtered + paginated)
    │                        #   - getCardById, getCardByNumber
    │                        #   - getArtsForCard, getSkillsForCard, getTagsForCard
    │                        #   - getAllSets, getAllTags, getAllMembers, etc.
    │
    scraper/
      index.ts               # Scrape orchestrator (batch processing)
      parseList.ts           # Card ID extractor from search pages
      parseDetail.ts         # Card detail HTML → ParsedCard
      client.ts              # HTTP fetch with 1s delay + exponential backoff retry
```

### Database Schema

The database uses 5 tables:

**`cards`** — One row per card. Contains all common fields plus type-specific nullable fields.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Internal ID from the official site |
| `card_number` | TEXT UNIQUE | Official card number (e.g., `hBP01-020`) |
| `name` | TEXT | Card name |
| `card_type` | TEXT | `holomem`, `oshi`, `support`, or `cheer` |
| `color` | TEXT | White, Green, Red, Blue, Purple, Yellow, or Neutral |
| `rarity` | TEXT | C, U, R, RR, SR, SSR, OSR, SEC, etc. |
| `set_name` | TEXT | Booster pack or starter deck name |
| `release_date` | TEXT | Release date |
| `illustrator` | TEXT | Illustrator name |
| `image_url` | TEXT | Full URL to card image |
| `card_url` | TEXT | Full URL to card detail page |
| `hp` | INTEGER | Holomem HP |
| `bloom_level` | TEXT | Debut, 1st, 2nd, Spot |
| `baton_pass` | TEXT | Baton pass cost icons |
| `life` | INTEGER | Oshi life points |
| `is_buzz` | INTEGER | 1 if Buzz holomem, 0 otherwise |
| `support_type` | TEXT | Item, Staff, Mascot, Fan, Event, Tool |
| `is_limited` | INTEGER | 1 if LIMITED, 0 otherwise |
| `special_text` | TEXT | Ability text, special rules |
| `scraped_at` | TEXT | Timestamp of last scrape |

**`card_arts`** — Holomem moves/attacks. One row per art per card.

| Column | Type | Description |
|--------|------|-------------|
| `card_id` | INTEGER FK | References `cards.id` |
| `name` | TEXT | Art/move name |
| `damage` | INTEGER | Base damage value |
| `cost` | TEXT | Cost icons as text |
| `effect_text` | TEXT | Effect description |
| `sort_order` | INTEGER | Order of the art on the card |

**`card_oshi_skills`** — Oshi skills. Up to 2 per oshi card (regular + SP).

| Column | Type | Description |
|--------|------|-------------|
| `card_id` | INTEGER FK | References `cards.id` |
| `skill_type` | TEXT | `oshi` or `sp_oshi` |
| `name` | TEXT | Skill name |
| `cost` | TEXT | holo Power cost (e.g., `-2`) |
| `usage_limit` | TEXT | `1/Turn` or `1/Game` |
| `effect_text` | TEXT | Skill effect description |

**`card_tags`** — Card tags. Multiple tags per card (e.g., `#EN`, `#Gen 1`, `#Bird`).

**`scrape_state`** — Key-value store for scraper progress tracking between batched cron runs.

### Scraper

The scraper runs in two phases:

1. **Collect card IDs**: Paginates through the official search results (`/cardsearch_ex?view=image&page=N`), parsing `<a>` links to extract card IDs. Stores the full ID list in `scrape_state`.

2. **Scrape card details**: For each card ID, fetches the detail page (`/cardlist/?id=N`) and parses the HTML using cheerio. The parser extracts:
   - Card name from `h1.name`
   - Card info from `dl > dt/dd` pairs inside `.info`
   - Color from `img[src*='type_']` icons
   - Tags from `a[href*='cardsearch?keyword=%23']` links
   - Arts from `div[class*='arts']` elements
   - Oshi skills from `div.oshi.skill` and `div.sp.skill`
   - Illustrator from `p.ill-name span`
   - Card number from `p.number span`

**Batching**: Cloudflare Workers have a 30-second CPU time limit. The scraper processes 50 cards per invocation, saving its progress in `scrape_state`. The cron trigger runs weekly; hitting `/scrape` manually triggers additional batches.

**Rate limiting**: The scraper waits 1 second between requests and uses exponential backoff on 429/5xx errors to be respectful to the source site.

---

## Self-Hosting

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)

### Local Development

```bash
# Install dependencies
npm install

# Create and initialize the local D1 database
npm run db:init

# Start the dev server
npm run dev
```

The dev server runs at `http://localhost:8787`. Visit `/graphql` for the GraphiQL playground.

To test the scraper locally:

```bash
# Scrape a single card (for testing the parser)
curl "http://localhost:8787/scrape-one?id=1"

# Trigger a full scrape batch (50 cards)
curl "http://localhost:8787/scrape"

# Trigger via cron simulation
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

### Deploying to Cloudflare

```bash
# 1. Login to Cloudflare
npx wrangler login

# 2. Create the D1 database
npx wrangler d1 create oshicard-db
# Copy the database_id from the output

# 3. Update wrangler.toml with your database_id
# Replace "placeholder" with the actual ID

# 4. Apply the database schema to the remote D1
npm run db:init:remote

# 5. Deploy the Worker
npm run deploy
```

### Populating the Database

After deploying, the database is empty. You need to trigger the scraper:

```bash
# Trigger a scrape batch (processes ~50 cards per call)
curl "https://your-api.workers.dev/scrape"

# Check progress
curl "https://your-api.workers.dev/"
# Returns: {"status":"ok","cardCount":50,"graphql":"/graphql"}

# Keep triggering until all cards are scraped (~1400+ cards)
# Each call processes the next batch of 50
curl "https://your-api.workers.dev/scrape"
curl "https://your-api.workers.dev/scrape"
# ...repeat until cardCount stops growing
```

The weekly cron trigger (`Monday 3 AM UTC`) will automatically re-scrape to pick up new card releases.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check — returns `{"status":"ok","cardCount":N,"graphql":"/graphql"}` |
| `/health` | GET | Same as `/` |
| `/graphql` | GET | GraphiQL interactive playground |
| `/graphql` | POST | GraphQL query endpoint |
| `/scrape` | GET | Trigger a scrape batch (50 cards) |
| `/scrape-one?id=N` | GET | Scrape a single card by ID (returns parsed JSON) |

---

## License

ISC
