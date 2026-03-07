# Production Migration Runbook — CA2
**Last Updated:** 2026-03-05 | **Tier:** 1 — Load before any database operation

---

## TL;DR — Safe Production Deploy Command

Railway runs this automatically on every deploy (via `Procfile` / start command):
```
cd /app/packages/database && npx prisma migrate deploy
```

If Railway is configured correctly this runs on every push to main — no manual action needed.
Verify in Railway dashboard: Settings → Deploy → Start command.

---

## Pending Migrations (as of 2026-03-05)

These 4 migrations are in the repo but may not yet be applied to Railway/Neon production:

| Migration | What it does | Risk |
|-----------|-------------|------|
| `20260305000006_v3_bounties` | Creates `MissingListingBounty` table (shopper bounty requests) | Low — additive only |
| `20260305000007_w1_shipping` | Adds `shippingAvailable` + `shippingPrice` to `Item` | Low — nullable column addition |
| `20260305000008_x1_webhooks` | Creates `Webhook` table (Zapier integration) | Low — additive only |
| `20260305000009_add_follow_table` | Creates `Follow` table with unique constraint | Low — additive only |

All 4 are **additive-only** — no column drops, no renames, no data-loss risk.

---

## Verify What's Applied in Production

Check Neon directly (Railway environment → add `DIRECT_URL` if not set):
```sql
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 10;
```
Or check Railway logs on last deploy — look for:
```
Applying migration `20260305000006_v3_bounties`
```

---

## Manual Trigger (if Railway auto-migrate is not configured)

From Railway shell or a one-off deploy command:
```bash
cd /app/packages/database && npx prisma migrate deploy
```

Do NOT use `prisma db push` or `prisma migrate dev` in production. Ever.

---

## Local Dev Sync

Docker local postgres should match production schema. Apply pending migrations locally:
```powershell
docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma migrate deploy"
```

Then regenerate the Prisma client:
```powershell
docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma generate"
```

---

## Schema Health Check

Run this after any migration to confirm Prisma client matches schema:
```powershell
docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma validate"
```

Expected output: `The schema at ... is valid 🚀`

---

## Emergency Rollback (Local Only)

There is no safe automated rollback for PostgreSQL migrations. If a migration causes issues in production:
1. Identify the breaking column/table
2. Write a manual compensating migration (e.g., `ALTER TABLE ... DROP COLUMN IF EXISTS`)
3. Deploy via `prisma migrate dev --name rollback_description` (local) → push to repo → Railway redeploys

Never run `prisma migrate reset` against production — it drops and recreates the entire database.

---

## Schema Authority Files

- Schema definition: `packages/database/prisma/schema.prisma`
- Migration files: `packages/database/prisma/migrations/`
- Production DB: Neon (connection string in Railway env as `DATABASE_URL`)
- Direct URL (for migrations): `DIRECT_URL` in Railway env (Neon connection pooler bypass)

---

## Upcoming Schema Changes Needed

None pending as of 2026-03-05. Next schema work tied to:
- CD2 Phase 2 engagement features (may need notifications/events tables — TBD)
- CA6 feature polish (no schema changes anticipated)
