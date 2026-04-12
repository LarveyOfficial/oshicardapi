# Oshi Card API

## Overview

GraphQL API for the hololive Official Card Game (hOCG). Scrapes card data from the official English website and serves it via a public GraphQL endpoint. Hosted on Cloudflare Workers with D1 (SQLite).

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **GraphQL**: graphql-yoga
- **HTML Parsing**: cheerio
- **Build/Deploy**: Wrangler CLI

## Project Structure

```
wrangler.toml              # Workers config, D1 binding, cron trigger
schema.sql                 # D1 database schema (run with wrangler d1 execute)
src/
  index.ts                 # Worker entry: GraphQL + cron + scrape endpoints
  types.ts                 # Shared TypeScript types (DB rows, parsed cards, env)
  schema/
    typeDefs.ts            # GraphQL type definitions (Card, filters, enums)
    resolvers.ts           # GraphQL resolvers (queries D1)
  db/
    queries.ts             # SQL query builders (upsert, search, filters)
  scraper/
    index.ts               # Batch scrape orchestrator (collects IDs, processes in batches of 50)
    parseList.ts           # Extracts card IDs from search result HTML
    parseDetail.ts         # Parses card detail pages into structured data
    client.ts              # HTTP fetch with 1s delay + retry
```

## Key Commands

```bash
npm run dev              # Start local dev server (wrangler dev)
npm run deploy           # Deploy to Cloudflare Workers
npm run db:init          # Apply schema.sql to local D1
npm run db:init:remote   # Apply schema.sql to remote D1
```

## Data Model

Card types: `holomem`, `oshi`, `support`, `cheer`. Buzz holomem are stored as `holomem` with `is_buzz = 1`. Support cards have a `support_type` (Item, Staff, Mascot, Fan, Event, Tool) and optional `is_limited` flag.

Related tables: `card_arts` (holomem moves), `card_oshi_skills` (oshi/sp skills), `card_tags` (hashtags like #EN, #Gen 1).

## Scraper

- Source: `https://en.hololive-official-cardgame.com/cardlist/`
- Phase 1: Paginates `/cardsearch_ex?view=image&page=N` to collect all card IDs
- Phase 2: Fetches `/cardlist/?id=N` for each card, parses HTML with cheerio
- Runs in batches of 50 cards per cron invocation (Workers have 30s CPU limit)
- Progress tracked in `scrape_state` table
- Cron runs weekly (Monday 3 AM UTC) via `wrangler.toml`
- Card detail HTML uses `.cardlist-Detail` container, `h1.name` for card name, `dl > dt/dd` for fields, `.oshi.skill` / `.sp.skill` for oshi skills, `div[class*='arts']` for arts

## Testing Endpoints

- `GET /` — health check with card count
- `GET /scrape` — triggers a scrape batch
- `GET /scrape-one?id=N` — scrape and return a single card (parser debugging)
- `GET /graphql` — GraphiQL playground
- `POST /graphql` — GraphQL queries

## Deployment

1. `npx wrangler d1 create oshicard-db` and update `database_id` in `wrangler.toml`
2. `npm run db:init:remote`
3. `npm run deploy`
4. Hit `/scrape` repeatedly to populate the DB (50 cards per invocation)
