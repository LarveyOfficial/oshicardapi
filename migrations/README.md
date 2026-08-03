# Migrations

One-off data migrations, applied manually. `schema.sql` is idempotent DDL and
can be re-run any time; these files change existing rows and are meant to run
once per database.

```bash
# production
npx wrangler d1 execute oshicard-db-prod --file=./migrations/<file>.sql --remote

# preview
npx wrangler d1 execute oshicard-db --file=./migrations/<file>.sql --remote

# local
npx wrangler d1 execute oshicard-db-prod --file=./migrations/<file>.sql --local
```

| File | What it does |
|------|--------------|
| `001_release_date_iso.sql` | Rewrites `cards.release_date` from `July 11, 2025` to `2025-07-11` so `RELEASE_DATE` sorts chronologically. Safe to re-run. |
