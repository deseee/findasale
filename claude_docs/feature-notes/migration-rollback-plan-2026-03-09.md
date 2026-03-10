# Migration Rollback Plan

**Date:** March 9, 2026
**Scope:** FindA.Sale PostgreSQL Database (Neon Production)
**Author:** Architecture Team
**Status:** Active

---

## Overview

This document provides step-by-step rollback procedures for the 5 most recent database migrations, including the Full-Text Search (FTS) migration. Use this playbook when a migration causes:

- Query performance degradation
- Application errors (constraint violations, type mismatches)
- Data corruption or unexpected state changes
- Index bloat or storage issues

**Always test rollbacks in staging first.** Production rollbacks are irreversible without a separate recovery procedure (see Recovery Playbook).

---

## Migrations Covered

| Timestamp | Migration Name | Purpose | Risk Level | Reversible |
|-----------|---|---|---|---|
| 20260312000001 | add_organizer_referral_discount | Adds fee waiver column for organizer referral program | LOW | Yes |
| 20260311000001 | add_sale_type_item_listing_type | Adds enum-like columns + FeeStructure table; backfills data | MEDIUM | Yes (with backfill) |
| 20260310000001 | add_item_fulltext_search_indexes | FTS indexes + searchVector tsvector column | MEDIUM | Yes (safe) |
| 20260309000001 | add_auction_reserve_price | Adds nullable price column for auctions | LOW | Yes |
| 20260309200001 | add_processed_webhook_event | Creates Stripe webhook idempotency table | LOW | Yes |

---

## Migration 1: add_organizer_referral_discount (20260312000001)

**Purpose:** Feature #11 — Organizer Referral Reciprocal Program
Adds `referralDiscountExpiry` to `Organizer` table to track fee waiver expiration date for referred organizers.

### Up() Summary

```sql
ALTER TABLE "Organizer" ADD COLUMN "referralDiscountExpiry" TIMESTAMP(3);
```

**Impact:** Single nullable column addition. No data loss. No backfill required.

### Down() SQL

```sql
ALTER TABLE "Organizer" DROP COLUMN "referralDiscountExpiry";
```

### Verification Query (After Rollback)

```sql
-- Confirm column is removed
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Organizer' AND column_name = 'referralDiscountExpiry';
-- Expected result: 0 rows
```

### Risk Assessment

- **Data Loss Risk:** None (column removal only; no dependent data)
- **Reapply Risk:** Safe. Column can be re-added anytime.
- **Downtime:** 0 seconds (instant column drop)

---

## Migration 2: add_sale_type_item_listing_type (20260311000001)

**Purpose:** B1 ADR — Sale/Item Type Enumeration
Migrates from boolean flags (`isAuctionSale`, `reverseAuction`, `isLiveDrop`) to enum-like `TEXT` columns (`saleType`, `listingType`). Creates `FeeStructure` table for configurable fees by listing type.

### Up() Summary

```sql
ALTER TABLE "Sale" ADD COLUMN "saleType" TEXT NOT NULL DEFAULT 'ESTATE';
ALTER TABLE "Item" ADD COLUMN "listingType" TEXT NOT NULL DEFAULT 'FIXED';

-- Backfill from legacy boolean columns
UPDATE "Sale" SET "saleType" = 'AUCTION' WHERE "isAuctionSale" = true;
UPDATE "Item" SET "listingType" = 'AUCTION'
  WHERE "auctionStartPrice" IS NOT NULL AND "auctionEndTime" IS NOT NULL;
UPDATE "Item" SET "listingType" = 'REVERSE_AUCTION' WHERE "reverseAuction" = true;
UPDATE "Item" SET "listingType" = 'LIVE_DROP' WHERE "isLiveDrop" = true;

-- New table for configurable fee rates
CREATE TABLE "FeeStructure" (
  "id" SERIAL PRIMARY KEY,
  "listingType" TEXT NOT NULL DEFAULT '*',
  "feeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
```

**Impact:** Two new columns, one new table, backfill logic that reads legacy booleans.

### Down() SQL

```sql
-- Drop the new FeeStructure table (no foreign keys reference it in current schema)
DROP TABLE IF EXISTS "FeeStructure" CASCADE;

-- Remove the new enum columns
ALTER TABLE "Sale" DROP COLUMN "saleType";
ALTER TABLE "Item" DROP COLUMN "listingType";
```

**Critical Caveat:**
If the application has already begun writing to `FeeStructure` or storing fee rates, dropping the table loses that configuration data. Coordinate with backend team to export any fee customizations before rolling back.

### Verification Query (After Rollback)

```sql
-- Confirm columns and table are removed
SELECT column_name
FROM information_schema.columns
WHERE table_name IN ('Sale', 'Item')
  AND column_name IN ('saleType', 'listingType');
-- Expected: 0 rows

SELECT EXISTS(SELECT 1 FROM information_schema.tables
  WHERE table_name = 'FeeStructure');
-- Expected: false
```

### Risk Assessment

- **Data Loss Risk:** MEDIUM
  - Fee customizations in `FeeStructure` are lost permanently.
  - Legacy boolean columns (`isAuctionSale`, `reverseAuction`, `isLiveDrop`) retain their values and can be re-synced if needed.
- **Reapply Risk:** Low, but requires the application to re-populate `FeeStructure` if custom rates existed.
- **Downtime:** 5–10 seconds (table drop + column drops on large table may trigger index cleanup).

**Mitigation Before Rollback:**
1. Query `SELECT * FROM "FeeStructure"` and save to a safe location.
2. Notify backend team of rollback intention.
3. Have a backup/export of `FeeStructure` contents.

---

## Migration 3: add_item_fulltext_search_indexes (20260310000001)

**Purpose:** Sprint 4a — Full-Text Search Infrastructure
Adds a stored `tsvector` generated column (`searchVector`) to the `Item` table and creates GIN indexes for FTS queries. Also adds supporting indexes for filtering and trigram-based fallback queries.

### Up() Summary

```sql
-- Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add searchVector generated column (stored)
ALTER TABLE "Item"
ADD COLUMN IF NOT EXISTS "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE("title", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE("description", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("category", '')), 'C')
) STORED;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_item_search_vector" ON "Item" USING gin ("searchVector");
CREATE INDEX IF NOT EXISTS "idx_item_category_condition_status" ON "Item" (category, condition, status);
CREATE INDEX IF NOT EXISTS "idx_item_title_trgm" ON "Item" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_item_sale_status" ON "Item" ("saleId", status);
```

**Impact:**
- Adds ~50–100 bytes per row (stored tsvector) → moderate table growth.
- Creates 4 new indexes (~10–30% additional storage).
- **No downtime:** Indexes are built concurrently in PG 12+.

### Down() SQL

```sql
-- Drop indexes (safe, does not lock table for extended periods)
DROP INDEX IF EXISTS "idx_item_search_vector";
DROP INDEX IF EXISTS "idx_item_category_condition_status";
DROP INDEX IF EXISTS "idx_item_title_trgm";
DROP INDEX IF EXISTS "idx_item_sale_status";

-- Drop the generated column (safe, no data loss)
ALTER TABLE "Item" DROP COLUMN "searchVector";

-- Extension can be left in place (harmless if no longer used)
-- Optionally: DROP EXTENSION IF EXISTS pg_trgm;
```

**Note on Extension:**
The `pg_trvym` extension is left installed by default because dropping it requires `CASCADE` if other objects reference it, and leaving it has minimal overhead. Only drop if storage is constrained.

### Verification Query (After Rollback)

```sql
-- Confirm column is gone
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Item' AND column_name = 'searchVector';
-- Expected: 0 rows

-- Confirm indexes are dropped
SELECT indexname
FROM pg_indexes
WHERE tablename = 'Item'
  AND indexname LIKE 'idx_item%';
-- Expected: only indexes not mentioned above (e.g., natural PK, FK indexes)

-- Confirm extension still exists (OK)
SELECT extname
FROM pg_extension
WHERE extname = 'pg_trgm';
-- Expected: 1 row (safe to keep)
```

### Risk Assessment

- **Data Loss Risk:** NONE
  - The `searchVector` column is derived; removing it does not affect underlying `title`, `description`, or `category`.
  - Index removal only frees disk space.
- **Reapply Risk:** Very Low. All operations are idempotent (IF NOT EXISTS guards).
- **Downtime:** 0 seconds (concurrent index drops).
- **Search Feature Impact:** CRITICAL
  - FTS queries using `searchVector @@ plainto_tsquery(...)` will fail immediately.
  - Application must fall back to ILIKE or cache-based search during rollback window.

**Mitigation Before Rollback:**
1. Notify frontend/search service team of search outage window.
2. Have fallback search logic (ILIKE on title) deployed and ready.
3. Plan rollback during low-traffic window (late night).

---

## Migration 4: add_auction_reserve_price (20260309_add_auction_reserve_price)

**Purpose:** Auction Features
Adds `auctionReservePrice` to the `Item` table to allow organizers to set a minimum acceptable bid for auction items.

### Up() Summary

```sql
ALTER TABLE "Item" ADD COLUMN "auctionReservePrice" DOUBLE PRECISION;
```

**Impact:** Single nullable column. Minimal storage (~8 bytes per row).

### Down() SQL

```sql
ALTER TABLE "Item" DROP COLUMN "auctionReservePrice";
```

### Verification Query (After Rollback)

```sql
-- Confirm column is removed
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Item' AND column_name = 'auctionReservePrice';
-- Expected: 0 rows
```

### Risk Assessment

- **Data Loss Risk:** LOW
  - If reserve prices have been set by organizers, those values are lost.
  - Query `SELECT COUNT(*) FROM "Item" WHERE "auctionReservePrice" IS NOT NULL;` before rollback to assess impact.
- **Reapply Risk:** Safe.
- **Downtime:** 0 seconds.

---

## Migration 5: add_processed_webhook_event (20260309200001)

**Purpose:** P0 Fix — Stripe Webhook Idempotency
Creates `ProcessedWebhookEvent` table to prevent double-processing of Stripe webhook deliveries. Replaces legacy `StripeEvent` table.

### Up() Summary

```sql
CREATE TABLE IF NOT EXISTS "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL UNIQUE,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ProcessedWebhookEvent_eventId_idx" ON "ProcessedWebhookEvent"("eventId");
CREATE INDEX "ProcessedWebhookEvent_processedAt_idx" ON "ProcessedWebhookEvent"("processedAt");
```

**Impact:** New table with 2 indexes. Typically small (100–1000 rows; ~100 KB).

### Down() SQL

```sql
-- Drop the table and its indexes
DROP TABLE IF EXISTS "ProcessedWebhookEvent" CASCADE;
```

**Critical Caveat:**
Dropping this table removes the webhook idempotency ledger. Any Stripe webhooks received during the brief window after the rollback will lack deduplication. This can cause:
- Double-charging users (if charge.succeeded webhook is reprocessed).
- Duplicate transactions/orders.
- Inconsistent payment states.

**Mitigation Before Rollback:**
1. **Stop or pause Stripe webhook delivery** to the application's endpoint.
2. Wait 5+ minutes to ensure no in-flight webhooks are pending.
3. Execute rollback.
4. Re-enable webhooks only after the application is confirmed stable.

### Verification Query (After Rollback)

```sql
-- Confirm table is dropped
SELECT EXISTS(SELECT 1 FROM information_schema.tables
  WHERE table_name = 'ProcessedWebhookEvent');
-- Expected: false

-- Confirm old StripeEvent table is still present (if reverting to legacy behavior)
SELECT EXISTS(SELECT 1 FROM information_schema.tables
  WHERE table_name = 'StripeEvent');
-- Expected: true (if previously existed)
```

### Risk Assessment

- **Data Loss Risk:** HIGH
  - Idempotency ledger is lost; any Stripe webhook received after rollback risks double-processing.
  - Financial/data integrity impact if webhooks retry during or after rollback.
- **Reapply Risk:** Moderate. Requires application restart to reinitialize webhook handler.
- **Downtime:** 5–10 minutes (including safe stop/restart window).

---

## Recovery Playbook

### When to Roll Back

Initiate rollback if:
1. **Performance degradation** — Query latency increases >50% post-migration.
2. **Constraint violations** — Application logs show new CHECK/UNIQUE constraint failures.
3. **Data anomalies** — Unexpected NULL values, type mismatches, or backfill errors.
4. **Critical feature breakage** — Core search, checkout, or billing workflows fail.

**Do NOT roll back for:**
- Cosmetic issues (column ordering, index naming).
- Minor performance tuning needs (optimize indexes first).
- Data validation warnings (apply data fixes instead).

### Step-by-Step Rollback Procedure

#### Phase 1: Preparation (5–10 minutes)

1. **Notify on-call team** and backend lead via Slack #incidents:
   ```
   @backend-lead: Initiating rollback of migration [NAME].
   ETA: 10 min. Monitor orders and search queries.
   ```

2. **Take a backup** (if using Neon, use Neon's point-in-time restore as fallback):
   ```bash
   # Option A: Neon dashboard
   # Navigate to Branch > Backups > Create manual backup

   # Option B: If needed, export current schema and a few key tables
   pg_dump -U postgres -d findasale -s > schema_before_rollback.sql
   psql -U postgres -d findasale -c "COPY Purchase TO STDOUT;" > purchases_backup.csv
   ```

3. **Set DATABASE_URL to directUrl** (required for DDL operations):
   ```bash
   # In .env or deployment, temporarily override:
   export DATABASE_URL="postgresql://user:password@direct-connection-host/findasale"
   # (Neon provides a separate "Direct Connection" string in dashboard)
   ```

4. **Stop application servers** or set them to read-only mode:
   ```bash
   # Mark deployment unhealthy or redirect traffic to a maintenance page
   kubectl set env deployment/findasale-backend READONLY=true
   # Wait 2–3 minutes for in-flight requests to drain
   ```

#### Phase 2: Rollback Execution (2–5 minutes)

5. **Execute the appropriate down() SQL** using the commands above.
   Example for rolling back FTS migration:
   ```sql
   -- Via psql or Neon SQL editor
   \c findasale
   DROP INDEX IF EXISTS "idx_item_search_vector";
   DROP INDEX IF EXISTS "idx_item_category_condition_status";
   DROP INDEX IF EXISTS "idx_item_title_trgm";
   DROP INDEX IF EXISTS "idx_item_sale_status";
   ALTER TABLE "Item" DROP COLUMN "searchVector";
   ```

6. **Mark rollback as completed** in Prisma history (optional, for audit):
   ```bash
   # If using prisma migrate:
   # NOTE: Prisma does NOT have an official rollback command.
   # You must manually delete the migration folder or use `prisma migrate resolve --rolled-back`
   # See: https://www.prisma.io/docs/orm/reference/command-reference#migrate-resolve

   npx prisma migrate resolve --rolled-back
   ```

#### Phase 3: Verification (5 minutes)

7. **Run verification queries** from each migration's section above:
   ```bash
   # For each migration, check that:
   # - Columns are removed (if applicable)
   # - Indexes are dropped
   # - Data integrity is intact
   psql -U postgres -d findasale -c "
   SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'Item' AND column_name IN ('searchVector', 'listingType')
   ORDER BY column_name;
   "
   # Expected: fewer columns than before rollback
   ```

8. **Restart application servers**:
   ```bash
   kubectl set env deployment/findasale-backend READONLY=false
   kubectl rollout restart deployment/findasale-backend
   # OR manually restart Node processes
   ```

9. **Smoke test critical flows**:
   - **Search:** Try searching for an item by title → should use ILIKE fallback or cache.
   - **Checkout:** Complete a test purchase → verify no constraint errors.
   - **Auctions:** Place a bid on an auction item → no errors.
   - **Webhook:** Simulate a Stripe event → check logs for double-processing.

#### Phase 4: Communication (Ongoing)

10. **Update Slack** with status:
    ```
    ✅ Rollback of [MIGRATION] complete.
    Duration: X minutes. No data loss.
    Next steps: Root cause analysis in incident doc.
    ```

11. **Create incident post-mortem** within 24 hours:
    - What caused the issue?
    - How was it detected?
    - What safeguards should prevent recurrence?
    - Assign follow-up tasks.

---

### Emergency Contacts & Escalation

| Role | Slack Handle | On-Call Schedule |
|------|---|---|
| Backend Lead | @backend-lead | [PagerDuty Link] |
| Database Admin | @dba-oncall | [PagerDuty Link] |
| DevOps | @infra-lead | [PagerDuty Link] |
| Patrick (Project Owner) | @patrick | 9 AM–6 PM ET |

---

### Neon-Specific Notes

**FindA.Sale uses Neon PostgreSQL (managed cloud database).**

#### Advantages for Rollback

1. **Point-in-Time Restore (PITR)**
   If rollback via SQL fails or data corruption occurs, restore from a backup branch:
   ```
   Neon Dashboard → Branches → [main] → Restore from backup
   Select timestamp < migration run time
   ```
   **Requires:** Neon Pro plan; 7-day backup retention.

2. **Direct Connection String**
   Migrations require a direct (non-pooled) connection:
   ```
   # Neon Dashboard: Project Settings → Connection Details
   # Copy "Direct Connection" string (different from Pooled Connection)
   DATABASE_URL="postgresql://user:password@[direct-host]/findasale"
   ```
   Do **not** use the pooled connection string for DDL.

3. **Read Replica for Testing**
   Before production rollback, test on a staging branch:
   ```
   Neon Dashboard → Branches → Create new branch from main
   Set STAGING_DATABASE_URL to new branch's direct connection
   Run rollback SQL against staging first
   ```

#### Disadvantages / Caveats

1. **No Instant Rollback Button**
   Unlike some cloud DBs, Neon requires manual SQL or branch restore. There is no "undo migration" feature.

2. **Pooler Connection Issues During DDL**
   PgBouncer (Neon's connection pooler) may disconnect long-running DDL. If you see:
   ```
   ERROR: Connection dropped
   ```
   Always use the **Direct Connection** string, not the pooled one.

3. **Index Build Time on Large Tables**
   Dropping an index on the `Item` table (millions of rows) can take 10+ seconds. Plan accordingly.

---

## Post-Rollback Steps

After a successful rollback:

1. **Update documentation** (STACK.md, RECOVERY.md) with lessons learned.
2. **Code review** the migration that was rolled back — identify root cause.
3. **Re-test in staging** before re-applying a fixed version.
4. **Update this playbook** if new edge cases are discovered.
5. **Archive incident report** for future reference.

---

## Appendix: Useful Queries

### Check Current Schema State

```sql
-- List all columns added by recent migrations
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('Item', 'Sale', 'Organizer', 'ProcessedWebhookEvent', 'FeeStructure')
ORDER BY table_name, ordinal_position;

-- List all indexes on Item table
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'Item'
ORDER BY indexname;

-- Check table sizes (bytes)
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Validate Data After Rollback

```sql
-- Confirm Item table structure is as expected
\d "Item"

-- Check for orphaned rows (if foreign keys were added/removed)
SELECT COUNT(*) FROM "Item" WHERE "saleId" IS NULL;

-- Verify no constraint violations remain
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'Item';
```

### Monitor Rollback Progress

```sql
-- Watch active queries (useful if rollback is slow)
SELECT pid, usename, state, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start DESC;

-- Check index creation/drop progress (PG 12+)
SELECT * FROM pg_stat_progress_create_index;
```

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-03-09 | Architecture Team | Initial rollback plan for 5 recent migrations |

---

**Last Updated:** March 9, 2026
**Next Review:** After each production deployment or schema change
