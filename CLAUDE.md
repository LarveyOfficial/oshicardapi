# Oshi Card API

## Overview

GraphQL API for the hololive Official Card Game (hOCG). Scrapes card data from the official English website and serves it via a public GraphQL endpoint. Hosted on Cloudflare Workers with D1 (SQLite).

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **GraphQL**: graphql-yoga
- **HTML Parsing**: cheerio
- **Build/Deploy**: Wrangler CLI
- **Automated Scraping**: GitHub Actions (daily cron)

## Project Structure

```
wrangler.toml              # Workers config, D1 binding
schema.sql                 # D1 database schema (run with wrangler d1 execute)
scrape-all.sh              # Local scrape script (calls API endpoints)
.github/workflows/
  scrape.yml               # GitHub Actions daily cron — scrapes all cards
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
    client.ts              # HTTP fetch with 500ms delay + retry
```

## Key Commands

```bash
npm run dev              # Start local dev server (wrangler dev)
npm run deploy           # Deploy to Cloudflare Workers
npm run db:init          # Apply schema.sql to local D1
npm run db:init:remote   # Apply schema.sql to remote D1
./scrape-all.sh          # Manually trigger a full scrape via API endpoints
```

## Data Model

Card types: `holomem`, `oshi`, `support`, `cheer`. Buzz holomem are stored as `holomem` with `is_buzz = 1`. Support cards have a `support_type` (Item, Staff, Mascot, Fan, Event, Tool) and optional `is_limited` flag.

Colors are stored as uppercase enums: `RED`, `GREEN`, `BLUE`, `WHITE`, `PURPLE`, `YELLOW`, `NEUTRAL`.

Art costs and baton pass are stored as JSON arrays of color strings (e.g., `["RED", "COLORLESS", "COLORLESS"]`). `COLORLESS` represents the colorless/neutral cost icon.

Related tables: `card_arts` (holomem moves), `card_oshi_skills` (oshi/sp skills), `card_tags` (hashtags like #EN, #Gen 1).

Unique constraint is `(card_number, rarity)` — same card number can exist at different rarities.

## Scraper

- Source: `https://en.hololive-official-cardgame.com/cardlist/`
- Phase 1: `/scrape-page-ids?page=N` paginates search results to collect card IDs
- Phase 2: `/scrape-one?id=N` fetches and parses each card detail page with cheerio
- GitHub Actions runs daily at 3 AM UTC, calling these endpoints sequentially
- 500ms delay between card fetches, 5s delay between pages (avoids source rate limiting)
- Card detail HTML uses `.cardlist-Detail` container, `h1.name` for card name, `dl > dt/dd` for fields, `.oshi.skill` / `.sp.skill` for oshi skills, `div[class*='arts']` for arts, `div.extra` for extra text

## API Endpoints

- `GET /` — health check with card count
- `GET /scrape-page-ids?page=N` — returns array of card IDs on a search page
- `GET /scrape-one?id=N` — scrape and save a single card (returns parsed JSON)
- `GET /scrape-status` — returns current card count
- `GET /graphql` — GraphiQL playground
- `POST /graphql` — GraphQL queries

## Deployment

1. `npx wrangler d1 create oshicard-db` and update `database_id` in `wrangler.toml`
2. `npm run db:init:remote`
3. `npm run deploy`
4. Run `./scrape-all.sh` or trigger the GitHub Action to populate the DB
