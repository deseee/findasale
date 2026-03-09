# Migration Rollback Plan — FindA.Sale
Last updated: 2026-03-09

## Overview
This document provides safe rollback SQL and decision logic for the 4 most recent Neon production migrations (applied 2026-03-09 to 2026-03-11). Use this to recover quickly if a migration causes production data or performance issues post-deploy.

---

## How to Execute a Rollback

### Prerequisites
- Access to Neon production database (credentials in `packages/backend/.env` — commented-out section with `DATABASE_URL`)
- psql or Neon web console access
- Backend service can tolerate brief read errors during rollback (queries to rolled-back columns will fail)

### Rollback Steps
1. **Identify the problematic migration** using the Decision Tree below and railway/backend logs
2. **Run the down SQL** from the appropriate section below
3. **Verify the rollback** by checking table structure: `\d "TableName"` in psql
4. **Remove/rename the migration folder** locally (e.g., `mv 20260309000001_add_item_is_ai_tagged 20260309000001_add_item_is_ai_tagged.rolled_back`)
5. **Redeploy backend** to Railway — the app will be aware the migration is reversed
6. **Test** a sample request that depends on the rolled-back feature to confirm no app crashes

### Rollback in Neon Console (No psql Access)
If you don't have psql installed, use Neon's web SQL editor:
1. Log into Neon console
2. Navigate to your production database
3. Open the SQL Editor
4. Paste the down SQL from the section below
5. Execute

---

## Migration Rollback Catalog

### 1. `20260311000001_add_sale_type_item_listing_type`
**Applied:** 2026-03-11 (most recent)
**Status:** CRITICAL — introduces FeeStructure table; data-dependent

#### What It Does
- Adds `saleType` enum column to `Sale` table (defaults to 'ESTATE')
- Adds `listingType` enum column to `Item` table (defaults to 'FIXED')
- Creates `FeeStructure` table for fee rate configuration by listing type
- Backfills `saleType` from existing `isAuctionSale` boolean
- Backfills `listingType` from auction/reverse/live-drop flags

#### Down SQL
```sql
-- Drop FeeStructure table (cascades any foreign keys)
DROP TABLE IF EXISTS "FeeStructure" CASCADE;

-- Remove new columns from Item
ALTER TABLE "Item" DROP COLUMN IF EXISTS "listingType";

-- Remove new column from Sale
ALTER TABLE "Sale" DROP COLUMN IF EXISTS "saleType";
```

**Risk:** MEDIUM
**Data Loss on Rollback:** Yes (FeeStructure records deleted, but `saleType`/`listingType` backfills are lost; original `isAuctionSale` flag remains intact)
**Downtime Required:** No (DDL on idle tables)
**Notes:**
- FeeStructure table has no dependencies yet (no foreign keys referencing it)
- If fees have been configured in production, **take a backup of FeeStructure before rolling back**:
  ```sql
  SELECT * FROM "FeeStructure" INTO OUTFILE '/tmp/fee_structure_backup.txt';
  -- or export via Neon console CSV
  ```
- Reverting this migration will cause any feature code querying `saleType` or `listingType` to fail; only roll back if migration broke the app or data is corrupted

---

### 2. `20260310000001_add_item_fulltext_search_indexes`
**Applied:** 2026-03-10
**Status:** LOW-RISK — indexes only, no data modification

#### What It Does
- Enables `pg_trgm` extension (trigram matching for ILIKE queries)
- Adds `searchVector` generated tsvector column to `Item` (auto-computed from title+description+category, stored on disk)
- Creates GIN index on `searchVector` for full-text search (powers `@@` operator)
- Creates supporting indexes on `(category, condition, status)` and `(saleId, status)`
- Creates trigram index on title for ILIKE fallback

#### Down SQL
```sql
-- Drop all search-related indexes (safe, non-blocking)
DROP INDEX IF EXISTS "idx_item_search_vector";
DROP INDEX IF EXISTS "idx_item_category_condition_status";
DROP INDEX IF EXISTS "idx_item_title_trgm";
DROP INDEX IF EXISTS "idx_item_sale_status";

-- Drop the searchVector generated column
ALTER TABLE "Item" DROP COLUMN IF EXISTS "searchVector";

-- Extension can remain (no harm if unused)
```

**Risk:** LOW
**Data Loss on Rollback:** No (indexes are non-data-bearing)
**Downtime Required:** No (index drops are non-blocking on PostgreSQL 12+)
**Notes:**
- This migration is **safe to rollback anytime**
- If app crashes immediately after deploy, this is unlikely the cause (search is a read path, not critical)
- Rollback will cause search queries to fall back to slower sequential scans or fail if code hardcodes `@@` operator; ensure backend has fallback logic

---

### 3. `20260309_add_auction_reserve_price`
**Applied:** 2026-03-09
**Status:** LOW-RISK — simple additive column

#### What It Does
- Adds `auctionReservePrice` column to `Item` table (nullable DOUBLE PRECISION)
- No defaults, no backfill, no dependent data

#### Down SQL
```sql
-- Remove the auctionReservePrice column
ALTER TABLE "Item" DROP COLUMN IF EXISTS "auctionReservePrice";
```

**Risk:** LOW
**Data Loss on Rollback:** Yes (any reserve prices entered post-deploy are deleted)
**Downtime Required:** No (column drop is non-blocking)
**Notes:**
- **Safest migration to rollback** — purely additive, no constraints, no backfills
- Only roll back if organizers haven't yet entered reserve prices; if they have, consider keeping the column and just disabling the UI
- Rollback will not affect existing auction data or pricing logic

---

### 4. `20260309000001_add_item_is_ai_tagged`
**Applied:** 2026-03-09
**Status:** LOW-RISK — simple additive flag

#### What It Does
- Adds `isAiTagged` boolean column to `Item` table
- Defaults to `false` (no backfill required)
- Used for organizer transparency disclosure and shopper-facing notices

#### Down SQL
```sql
-- Remove the isAiTagged column
ALTER TABLE "Item" DROP COLUMN IF EXISTS "isAiTagged";
```

**Risk:** LOW
**Data Loss on Rollback:** Yes (any AI-tagged flags set post-deploy are deleted)
**Downtime Required:** No (column drop is non-blocking)
**Notes:**
- **Safe to rollback anytime**
- If organizers have been using the AI tagging feature, rolling back will cause that metadata to be lost
- Feature code checking `isAiTagged` will return NULL/falsey, potentially hiding AI-generated content disclosure
- Consider disabling the UI instead of rolling back if the column has data

---

## Emergency Decision Tree

```
IF production backend crashes or reports errors post-deploy
  ├─ Check Railway logs for migration-related errors
  │  └─ Grep for "migration", "Prisma", "ALTER TABLE", "schema mismatch"
  │
  ├─ IF error mentions "FeeStructure" or "saleType" or "listingType"
  │  └─ LIKELY CULPRIT: 20260311000001_add_sale_type_item_listing_type
  │     → Read FeeStructure backup (see notes above) if fees configured
  │     → Run down SQL for 20260311000001
  │     → Redeploy backend
  │     → Test fee calculations and sale type queries
  │
  ├─ ELSE IF error mentions "searchVector" or "tsvector" or "search query timeout"
  │  └─ LIKELY CULPRIT: 20260310000001_add_item_fulltext_search_indexes
  │     → Run down SQL for 20260310000001
  │     → Redeploy backend
  │     → Verify search endpoint responds (may revert to slower sequential scans)
  │
  ├─ ELSE IF error mentions "auctionReservePrice" or reserve-related logic
  │  └─ LIKELY CULPRIT: 20260309_add_auction_reserve_price
  │     → Run down SQL for 20260309_add_auction_reserve_price
  │     → Redeploy backend
  │     → Test auction creation and pricing
  │
  ├─ ELSE IF error mentions "isAiTagged" or AI-related metadata
  │  └─ LIKELY CULPRIT: 20260309000001_add_item_is_ai_tagged
  │     → Run down SQL for 20260309000001
  │     → Redeploy backend
  │     → Test item creation and AI disclosure
  │
  └─ ELSE (error not migration-related)
     └─ Check application logs (see RECOVERY.md #10 for backend crash loop diagnosis)
        → Check nodemon error logs
        → Verify pnpm/dependency health
        → Check for circular imports or broken API contracts
```

---

## Rollback Checklist

Before rolling back, confirm:
- [ ] Database backup exists (Neon auto-backs up; verify in console)
- [ ] Backend service is accessible via Railway logs
- [ ] You have read-write access to the Neon production database
- [ ] The down SQL matches the migration name in `packages/database/prisma/migrations/`
- [ ] App team is notified and standing by to redeploy

After rolling back:
- [ ] Verify table structure: `\d "Item"` shows column removed
- [ ] Rename/remove local migration folder
- [ ] Redeploy backend via Railway
- [ ] Test basic CRUD operations (create sale, add item, etc.)
- [ ] Monitor logs for 5 minutes post-deploy
- [ ] Notify team of successful rollback

---

## Notes for Beta Launch

1. **Risk Ranking (by severity):**
   - 20260309_add_auction_reserve_price: **LOWEST** (pure additive, no backfill)
   - 20260309000001_add_item_is_ai_tagged: **LOW** (pure additive, no backfill)
   - 20260310000001_add_item_fulltext_search_indexes: **LOW** (indexes only)
   - 20260311000001_add_sale_type_item_listing_type: **MEDIUM** (data transforms, new table)

2. **Fastest Rollback:** 20260309_add_auction_reserve_price (2 minutes)

3. **Most Data Loss Risk:** 20260311000001 (FeeStructure data, backfilled saleType/listingType)

4. **Never Rollback If:**
   - Organizers have entered reserve prices and depend on that data
   - AI tagging has been enabled and shoppers see disclosure notices
   - Fees have been configured in FeeStructure and are in use
   - Search feature is actively being used in production (rollback degrades performance)

5. **Backup Recommendation Before Beta:**
   ```sql
   -- Capture FeeStructure state
   SELECT * FROM "FeeStructure";

   -- Capture sample data to verify backfills worked correctly
   SELECT id, "isAuctionSale", "saleType" FROM "Sale" LIMIT 10;
   SELECT id, "isLiveDrop", "reverseAuction", "listingType" FROM "Item" LIMIT 10;
   ```

---

## Related Documentation
- **Full recovery procedures:** `RECOVERY.md`
- **Database schema authority:** `packages/database/schema.prisma`
- **Migration commands:** `packages/database/README.md`
- **Neon credentials:** `packages/backend/.env` (commented section)

