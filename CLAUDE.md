# Oshi Card API

## Overview

GraphQL API for the hololive Official Card Game (hOCG). Scrapes card data from the official English website and serves it via a public GraphQL endpoint. Hosted on Cloudflare Workers with D1 (SQLite).

## Environments

| Environment | URL | D1 Database | Deploy Method |
|-------------|-----|-------------|---------------|
| **Production** | `https://api.oshi.cards` | `oshicard-db-prod` | Auto-deploy on merge to `main` via GitHub Actions |
| **Dev** | `https://oshicardapi.luisrvervaet.workers.dev` | `oshicard-db` | `npx wrangler deploy` (local) |

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **GraphQL**: graphql-yoga
- **HTML Parsing**: cheerio
- **Build/Deploy**: Wrangler CLI + GitHub Actions
- **Automated Scraping**: GitHub Actions (daily cron for prod, manual for dev)

## Project Structure

```
wrangler.toml              # Workers config, D1 bindings (dev + prod environments)
schema.sql                 # D1 database schema (run with wrangler d1 execute)
scrape-all.sh              # Local scrape script (--prod flag for production)
.github/workflows/
  deploy.yml               # Auto-deploy to prod on push to main
  scrape-prod.yml          # Daily cron (3 AM UTC) — scrapes prod DB
  scrape-dev.yml           # Manual trigger only — scrapes dev DB
src/
  index.ts                 # Worker entry: GraphQL + scrape endpoints
  types.ts                 # Shared TypeScript types (DB rows, parsed cards, env)
  schema/
    typeDefs.ts            # GraphQL type definitions (Card, filters, enums)
    resolvers.ts           # GraphQL resolvers (queries D1)
  db/
    queries.ts             # SQL query builders (upsert, search, filters)
  scraper/
    index.ts               # Scrape helpers (getPageIds, scrapePage)
    parseList.ts           # Extracts card IDs from search result HTML
    parseDetail.ts         # Parses card detail pages into structured data
    client.ts              # HTTP fetch with 200ms delay + retry
```

## Key Commands

```bash
npm run dev              # Start local dev server (wrangler dev)
npm run deploy           # Deploy to dev (oshicardapi.luisrvervaet.workers.dev)
npm run db:init          # Apply schema.sql to local D1
npm run db:init:remote   # Apply schema.sql to remote dev D1
./scrape-all.sh          # Scrape dev environment
./scrape-all.sh --prod   # Scrape production environment
```

Production deploys happen automatically via GitHub Actions on push to `main`. Use `npx wrangler deploy --env production` for manual prod deploys.

## Data Model

Card types: `holomem`, `oshi`, `support`, `cheer`. Buzz holomem are stored as `holomem` with `is_buzz = 1`. Support cards have a `support_type` (Item, Staff, Mascot, Fan, Event, Tool) and optional `is_limited` flag.

Colors are stored as uppercase enums: `RED`, `GREEN`, `BLUE`, `WHITE`, `PURPLE`, `YELLOW`, `NEUTRAL`.

Art costs and baton pass are stored as JSON arrays of color strings (e.g., `["RED", "COLORLESS", "COLORLESS"]`). `COLORLESS` represents the colorless/neutral cost icon.

Unique constraint is on `id` (INTEGER PRIMARY KEY) — the official site's card ID.

Related tables:
- `card_arts` — holomem moves/attacks
- `card_oshi_skills` — oshi and SP oshi skills
- `card_tags` — hashtags like #EN, #Gen 1
- `card_sets` — set names (cards can belong to multiple sets)
- `card_qna` — Q&A pairs from card detail pages

All text fields are sanitized to replace Unicode non-breaking spaces (U+00A0) with regular spaces.

## Scraper

- Source: `https://en.hololive-official-cardgame.com/cardlist/`
- Phase 1: `/scrape-page-ids?page=N` paginates search results to collect card IDs
- Phase 2: `/scrape-one?id=N` fetches and parses each card detail page with cheerio
- GitHub Actions scrape-prod runs daily at 3 AM UTC
- GitHub Actions scrape-dev is manual trigger only
- 200ms delay between card fetches, 1s delay between pages
- Card detail HTML uses `.cardlist-Detail` container, `h1.name` for card name, `dl > dt/dd` for fields, `.oshi.skill` / `.sp.skill` for oshi skills, `div[class*='arts']` for arts, `div.extra` for extra text, `.cardlist-Detail_QA .qa-List_Item` for Q&A

## API Endpoints

- `GET /` — health check with card count
- `GET /scrape-page-ids?page=N` — returns array of card IDs on a search page
- `GET /scrape-one?id=N` — scrape and save a single card (returns parsed JSON)
- `GET /scrape-status` — returns current card count
- `GET /graphql` — GraphiQL playground
- `POST /graphql` — GraphQL queries

## Deployment

### Dev
```bash
npx wrangler deploy    # Deploys to oshicardapi.luisrvervaet.workers.dev
```

### Production
Push/merge to `main` → GitHub Actions auto-deploys to `api.oshi.cards` using `wrangler deploy --env production`.

GitHub Secrets required:
- `CLOUDFLARE_API_TOKEN` — API token with Workers Scripts Edit + D1 Edit permissions
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID

### Initial Setup
1. Create databases: `npx wrangler d1 create oshicard-db` and `npx wrangler d1 create oshicard-db-prod`
2. Update `database_id` values in `wrangler.toml`
3. Apply schema: `npm run db:init:remote` (dev) and `npx wrangler d1 execute oshicard-db-prod --remote --file=./schema.sql --env production` (prod)
4. Deploy and trigger scrape workflows to populate databases
