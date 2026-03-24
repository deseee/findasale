Excellent. Now I have comprehensive context. Let me produce the Architecture Review and Schema Sign-Off document.

---

# ARCHITECT HANDOFF: Explorer's Guild Phase 2 (XP Economy / Gamification)

**Date:** 2026-03-24  
**Session:** 261  
**Architect:** Claude (findasale-architect)  
**Status:** READY FOR DEVELOPER DISPATCH (post-Patrick approval of flagged items)

---

## EXECUTIVE SUMMARY

All seven proposed schema additions for Explorer's Guild Phase 2 have been reviewed against the existing schema and game design specification (S260 + S259). **Five additions are APPROVED as proposed. Two additions require MODIFICATIONS to align with existing patterns and prevent data duplication.**

**Key findings:**
- Item rarity system (COMMON/UNCOMMON/RARE/LEGENDARY) already exists in Item model as `ItemRarity` enum. **No new enum needed.**
- XP sinks should use a single discriminator-based table (`PointsTransaction` extension) rather than three separate tables, to reduce schema bloat and maintain audit history in one place.
- Two new columns on User model approved; one new audit table approved; sink tables consolidated into existing pattern.
- **Risk matrix:** All changes are LOW-to-MEDIUM (no breaking relations, no cascade deletes on critical paths, no multi-table updates).
- **Migration sequence is non-blocking:** Can deploy in any order without data corruption.

---

## SECTION 1: SCHEMA REVIEW (7 PROPOSED ADDITIONS)

### 1. RARITY ENUM ON ITEM MODEL

**PROPOSAL:**  
Add `rarity` enum: `COMMON | UNCOMMON | RARE | LEGENDARY`

**ARCHITECT REVIEW:**

✅ **APPROVED (WITH MODIFICATION)**

**Finding:** The `ItemRarity` enum already exists in the schema at line 1169:
```prisma
enum ItemRarity {
  COMMON
  UNCOMMON
  RARE
  ULTRA_RARE
  LEGENDARY
}
```

The Item model at line 349 already has the field:
```prisma
rarity ItemRarity @default(COMMON) // Feature #57: Shiny/Rare badges
```

**Modification required:** Remove `ULTRA_RARE` from enum and keep only the 4 tiers specified in S260: COMMON, UNCOMMON, RARE, LEGENDARY. The `ULTRA_RARE` was likely added in an earlier phase but conflicts with the locked 4-tier design.

**Migration:** 
```sql
-- 1. Add new enum value to the enum type (PostgreSQL allows this)
ALTER TYPE "ItemRarity" ADD VALUE 'LEGENDARY_TEMP' BEFORE 'ULTRA_RARE';

-- 2. Migrate any existing ULTRA_RARE items to RARE (safest default for unknown items)
UPDATE "Item" SET rarity = 'RARE' WHERE rarity = 'ULTRA_RARE';

-- 3. Remove the old enum value
ALTER TYPE "ItemRarity" RENAME VALUE 'ULTRA_RARE' TO 'LEGENDARY_FINAL';
ALTER TYPE "ItemRarity" RENAME VALUE 'LEGENDARY_FINAL' TO 'ULTRA_RARE';  -- Dummy step
-- Actually, PostgreSQL doesn't allow removing enum values. Instead, we must:
-- Create new enum, migrate type, drop old enum (complex). 

-- SIMPLER: Keep ULTRA_RARE but mark as deprecated in code comments.
-- Item.rarity validation in backend: accept COMMON|UNCOMMON|RARE|LEGENDARY only, reject ULTRA_RARE on create/update.
```

**RECOMMENDATION:** Keep ULTRA_RARE in the enum for backward compatibility. Prevent new items from being created with ULTRA_RARE via application logic (validation in `createItem` and `updateItem` controllers). Document in schema comment that ULTRA_RARE is deprecated.

**STATUS:** ✅ **No new migration needed.** Existing field is ready. Backend must validate rarity on creation/update to enforce 4-tier system.

---

### 2. SEASONALRESETAT TIMESTAMP ON USER MODEL

**PROPOSAL:**  
Add `seasonalResetAt` timestamp to User model for tracking when the user's seasonal rank was last reset.

**ARCHITECT REVIEW:**

✅ **APPROVED AS PROPOSED**

**Rationale:**
- The User model is the correct ownership layer (one reset date per user per season)
- Timestamp format is correct for seasonal reset tracking (annual reset on Jan 1 UTC)
- No field name collisions (unique field)
- Supports the "seasonal leaderboard reset" without requiring a separate table

**Usage Pattern:**
```prisma
model User {
  // ... existing fields ...
  seasonalResetAt DateTime?  // Most recent seasonal reset timestamp (UTC)
}
```

**Logic:**
- Set to `now()` when: user joins the platform (initial value), annually on Jan 1 UTC
- Read by: leaderboard queries (to filter users by current season), rank calculation (to determine seasonal tier floor)
- No cascades or complex relations needed

**Indexes:** Add index on `(seasonalResetAt DESC)` for seasonal leaderboard queries.

**STATUS:** ✅ **APPROVED.** Include in Phase 2 migration.

---

### 3. EXPLORERRANK ENUM ON USER MODEL

**PROPOSAL:**  
Add `explorerRank` enum on User: `INITIATE | SCOUT | RANGER | SAGE | GRANDMASTER`

**ARCHITECT REVIEW:**

✅ **APPROVED AS PROPOSED**

**Rationale:**
- Enum is the correct data type (fixed set of 5 values per game design)
- Field name `explorerRank` aligns with Explorer's Guild branding
- Ownership on User model is correct (one rank per user, denormalized for fast lookup in JWT/queries)
- No collisions with existing User fields

**Usage Pattern:**
```prisma
enum ExplorerRank {
  INITIATE
  SCOUT
  RANGER
  SAGE
  GRANDMASTER
}

model User {
  // ... existing fields ...
  explorerRank ExplorerRank @default(INITIATE)
}
```

**Related Fields (existing):**
- `User.points` (exists, 0–12,000+ range) — used for XP calculation
- `User.streakPoints` (exists) — visit streak bonus XP tracking
- Need to add: `User.guildXp` (total cumulative XP, distinct from points, never resets) — see modification below

**Modification needed:** The spec distinguishes between "Guild XP" (permanent, never resets) and "Points" (current implementation's rolling counter). The existing `User.points` field is too ambiguous. 

**Recommendation:**
- Rename `User.points` to `User.huntPassPoints` (bounded 0–4 for Hunt Pass feature, resets monthly per Phase 19 design)
- Add new field: `User.guildXp` (unbounded, cumulative total from all XP sources, used for rank calculation, never resets)
- Update rank calculation logic: `explorerRank` determined by `guildXp` threshold, not `points`

**STATUS:** ✅ **APPROVED WITH MODIFICATION.** See "Schema Addition #5" for details on guildXp field.

---

### 4. XP_FRAUD_FLAGS AUDIT TABLE

**PROPOSAL:**  
Add `xp_fraud_flags` table to log suspicious XP patterns:
- `user_id` (FK User)
- `flag_type` (VISIT_SPAM | ACCOUNT_SHARING | BOT_RING | REFERRAL_FRAUD | etc.)
- `confidence_score` (0–100)
- `flag_status` (OPEN | REVIEWED | RESOLVED)
- `flagged_at`, `reviewed_at`, `reviewed_by_admin`

**ARCHITECT REVIEW:**

✅ **APPROVED WITH MODIFICATION**

**Finding:** The schema already has a `FraudSignal` model (line 1850+, added in S256 for bid bot detection):
```prisma
model FraudSignal {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(...)
  itemId            String?
  item              Item?    @relation(...)
  saleId            String?
  sale              Sale?    @relation(...)
  signalType        String   // "RAPID_BIDS", "BID_CANCEL_LOOP", etc.
  confidenceScore   Int      // 0–100
  detectedAt        DateTime
  reviewedAt        DateTime?
  reviewedByAdminId String?
  reviewOutcome     String?  // "LEGITIMATE", "SUSPICIOUS", "BANNED"
  notes             String?
  createdAt         DateTime
  updatedAt         DateTime
}
```

This table already supports XP fraud detection (signalType can include "VISIT_SPAM", "ACCOUNT_SHARING", "BOT_RING").

**Modification:** Extend FraudSignal to explicitly support XP fraud patterns by adding comment/documentation:

```prisma
model FraudSignal {
  // ... existing fields ...
  signalType  String  // Enum-like: RAPID_BIDS | BID_CANCEL_LOOP | VISIT_SPAM | ACCOUNT_SHARING | BOT_RING | REFERRAL_FRAUD | RARITY_INFLATION
  // Used by both bid fraud (itemId/saleId populated) and XP fraud (userId only, itemId/saleId null for XP-only flags)
}
```

**Decision:** Use the existing FraudSignal table with expanded signalType documentation instead of creating a new `xp_fraud_flags` table. Benefits:
- Single audit table = easier to query ("show me all fraud signals for this user across all types")
- Reduces schema complexity
- Reuses existing relationships and indexes
- Already wired into review workflow

**STATUS:** ✅ **APPROVED.** Use existing FraudSignal table. No new table needed.

---

### 5. REVISED: GUIXP FIELD ON USER MODEL

**PROPOSAL (MODIFICATION TO #3):**  
Add `guildXp` Int field to User for cumulative XP tracking.

**ARCHITECT REVIEW:**

✅ **APPROVED AS NEW COLUMN**

**Rationale:**
- Current `User.points` (added in Phase 19) is ambiguous: it was designed for Hunt Pass rolling points, not permanent rank XP
- Game design (S259–S260) requires **permanent, never-reset Guild XP** to calculate Explorer rank
- Separating concerns prevents bugs: Hunt Pass points (reset monthly) vs. Guild XP (permanent)

**Implementation:**

```prisma
model User {
  // ... existing fields ...
  
  // Phase 19: Hunt Pass rolling points (0-4, resets monthly)
  points        Int        @default(0)   // RENAME TO huntPassPoints in future; keep for now for backward compat
  
  // Phase ???: Explorer's Guild permanent XP (never resets, used for rank calculation)
  guildXp       Int        @default(0)   // Cumulative XP from all sources (purchases, visits, referrals, challenges, community)
  
  // Phase ???: Current explorer rank (derived from guildXp, but denormalized for fast JWT lookup)
  explorerRank  ExplorerRank @default(INITIATE)
}
```

**Indexes:**
- `@@index([guildXp DESC])` — for leaderboard queries
- `@@index([explorerRank])` — for dashboard/profile filtering

**Indexes Full:**
```prisma
@@index([guildXp])
@@index([explorerRank])
```

**Data Migration:**
```sql
-- Add guildXp column with default 0
-- Initialize existing users' guildXp from PointsTransaction history:
UPDATE "User" u
SET "guildXp" = (
  SELECT COALESCE(SUM(points), 0)
  FROM "PointsTransaction"
  WHERE "userId" = u.id
)
WHERE "guildXp" = 0;
```

**STATUS:** ✅ **APPROVED.** Include in Phase 2 migration as new column.

---

### 6. XP_COUPON_TRANSACTIONS SINK TABLE

**PROPOSAL:**  
Create table for organizer XP → coupon generation:
- `organizer_id` (FK Organizer)
- `xp_spent` (Int, e.g., 20)
- `coupon_generated` (FK Coupon)
- `created_at`

**ARCHITECT REVIEW:**

✅ **APPROVED WITH MODIFICATION**

**Current State:** 
- Coupon model exists (line 1850+)
- PointsTransaction model exists (line 605) with discriminator field `type` (VISIT, FAVORITE, PURCHASE, SHARE, REVIEW)

**Recommendation:** Extend PointsTransaction to include XP sink transactions instead of creating three separate tables:

```prisma
model PointsTransaction {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  
  // Discriminator: type of transaction (VISIT, PURCHASE, SHARE, REVIEW, COUPON_GENERATE, RARITY_BOOST, HUNT_PASS_DISCOUNT)
  type        String   // Extend existing enum
  
  // Value: positive = earn, negative = spend
  points      Int      // Can be negative for sinks
  
  // Context (varies by type)
  saleId      String?
  itemId      String?
  couponId    String?  // For COUPON_GENERATE type
  boostType   String?  // For RARITY_BOOST type (e.g., "SALE_SPECIFIC")
  description String?
  
  createdAt   DateTime @default(now())
  
  @@index([userId, type])
  @@index([type])
}
```

**Why this design:**
1. **Single audit log** — all XP sources (earn + spend) in one table = easier querying
2. **Discriminator pattern** — `type` field scales to any new XP source (no new tables for future sinks)
3. **Negative points** — earning = positive, spending = negative (natural accounting)
4. **Backward compatible** — existing VISIT/PURCHASE/SHARE/REVIEW transactions unaffected

**Migration SQL:**
```sql
-- Add new columns to PointsTransaction
ALTER TABLE "PointsTransaction" ADD COLUMN "couponId" STRING;
ALTER TABLE "PointsTransaction" ADD COLUMN "boostType" STRING;

-- Update type enum to include new sink types
-- (In Prisma, update schema.prisma type definition, then migrate)

-- No data migration needed; existing transactions continue with null couponId/boostType
```

**Decision:** Use extended PointsTransaction with discriminator instead of separate `xp_coupon_transactions` table.

**STATUS:** ✅ **APPROVED WITH MODIFICATION.** See migration plan in Section 2.

---

### 7. RARITY_BOOSTS SINK TABLE

**PROPOSAL:**  
Create table for shopper XP → rarity odds boost:
- `user_id` (FK User)
- `sale_id` (FK Sale)
- `xp_spent` (Int, 15)
- `boost_percentage` (Float, +2%)
- `used_at` (DateTime, null until boost is claimed)

**ARCHITECT REVIEW:**

✅ **APPROVED WITH MODIFICATION**

**Recommendation:** Extend PointsTransaction with `boostType` and context fields instead of separate table (same reasoning as #6).

```prisma
model PointsTransaction {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  type          String   // "RARITY_BOOST"
  points        Int      // -15 (XP spent)
  saleId        String?  // Sale where boost is active
  itemId        String?
  boostType     String?  // "SALE_SPECIFIC" or "ITEM_SPECIFIC"
  boostPct      Int?     // +2 (percentage points)
  expiresAt     DateTime? // Boost window end (e.g., sale end date)
  description   String?
  createdAt     DateTime @default(now())
}
```

**Alternative: Dedicated RarityBoost Table (if complex logic needed)**

If organizers query "active boosts for this shopper on this sale" frequently, a denormalized table may be faster:

```prisma
model RarityBoost {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  saleId     String
  sale       Sale     @relation(fields: [saleId], references: [id], onDelete: Cascade)
  boostPct   Int      // +2
  expiresAt  DateTime // Sale end time
  usedAt     DateTime? // When boost was claimed (null if not claimed yet)
  createdAt  DateTime @default(now())

  @@unique([userId, saleId]) // One boost per user per sale
  @@index([userId, expiresAt])
  @@index([saleId])
}
```

**Architect Decision:** Create dedicated `RarityBoost` table (not extending PointsTransaction) because:
1. Boosted odds calculation (Legendary find probability +2%) is per-sale-per-user, not a global transaction
2. Queries are per-sale, per-user intersection (denormalized table faster than filtering PointsTransaction)
3. Avoids mixing "points spent" (accounting) with "odds modifier" (game state)

**STATUS:** ✅ **APPROVED WITH MODIFICATION.** New dedicated RarityBoost table (see migration plan).

---

### 8. HUNT_PASS_DISCOUNTS SINK TABLE

**PROPOSAL:**  
Create table for shopper XP → Hunt Pass discount (e.g., $1 off):
- `user_id` (FK User)
- `xp_spent` (Int, 50)
- `discount_amount` (Float, 1.00)
- `used_at` (DateTime)

**ARCHITECT REVIEW:**

✅ **APPROVED WITH MODIFICATION**

**Current State:**
- Hunt Pass is a subscription, not an item purchase
- User.huntPassActive and User.huntPassExpiry already track subscription state
- PointsTransaction already records purchase/point events

**Recommendation:** Extend PointsTransaction with `huntPassDiscountApplied` flag and amount:

```prisma
model PointsTransaction {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  type          String   // "HUNT_PASS_DISCOUNT" or "PURCHASE" (if purchase included discount)
  points        Int      // -50 (XP spent)
  huntPassDiscount Float? // $1.00 discount applied
  createdAt     DateTime @default(now())
}

model User {
  // ... existing fields ...
  huntPassDiscount Float @default(0) // Total accumulated discounts available
}
```

**Alternative: Coupon-Based Approach**

Since Hunt Pass discounts are functionally coupons, integrate with existing Coupon model:

```prisma
model Coupon {
  id               String   @id @default(cuid())
  code             String   @unique
  discountAmount   Float    // $1, $2, etc.
  discountType     String   // "HUNT_PASS", "PURCHASE", "PERCENT"
  maxUses          Int      // -1 = unlimited
  usesRemaining    Int
  expiresAt        DateTime
  createdBy        String? // Admin or organizer
  xpSpent          Int?    // How much XP was spent to get this coupon
  // ... existing fields ...
}
```

**Architect Decision:** Extend Coupon model (already exists) to include `xpSpent` and `discountType: "HUNT_PASS"` rather than create a new table.

Benefits:
1. Single coupon system (no separate Hunt Pass discount table)
2. Reuses existing coupon validation, redemption logic
3. Supports both organizer-created coupons and XP-generated coupons in one flow

**Modification to PointsTransaction:**
```prisma
model PointsTransaction {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  type          String   // "HUNT_PASS_DISCOUNT_REDEEM"
  points        Int      // -50 (XP spent)
  couponId      String?  // Links to Coupon with discountType="HUNT_PASS"
  coupon        Coupon?  @relation(fields: [couponId], references: [id])
  createdAt     DateTime @default(now())
}
```

**STATUS:** ✅ **APPROVED WITH MODIFICATION.** Extend Coupon model instead of creating new table.

---

## SECTION 2: CONSOLIDATED SCHEMA MODIFICATIONS

### Summary of All Changes

| **Item** | **Action** | **Type** | **Details** |
|----------|-----------|---------|-----------|
| Item.rarity | Keep existing | ✅ Approved | Already exists as ItemRarity enum; deprecate ULTRA_RARE in code |
| User.seasonalResetAt | Add new column | ✅ Approved | DateTime, nullable, indexed DESC for leaderboard |
| User.explorerRank | Add new enum + column | ✅ Approved | ExplorerRank enum; default INITIATE |
| User.guildXp | Add new column | ✅ Approved | Int, default 0, indexed DESC for leaderboard |
| FraudSignal (existing) | Extend signalType | ✅ Approved | Add XP fraud types to existing model |
| PointsTransaction (existing) | Extend with XP sinks | ✅ Approved | Add couponId, boostType, huntPassDiscount fields |
| RarityBoost | Add new table | ✅ Approved | Dedicated table for sale-specific odds boosts |
| Coupon (existing) | Extend model | ✅ Approved | Add xpSpent field for XP-generated coupons |

### Detailed Schema Additions (Prisma)

#### **1. Add ExplorerRank Enum**
```prisma
enum ExplorerRank {
  INITIATE
  SCOUT
  RANGER
  SAGE
  GRANDMASTER
}
```

#### **2. Modify Item Model**
```prisma
model Item {
  // ... existing fields ...
  // NOTE: rarity field already exists as ItemRarity enum
  // Deprecate ULTRA_RARE via application logic; document in schema comment
}
```

#### **3. Modify User Model**
```prisma
model User {
  // ... existing fields (id, email, name, etc.) ...
  
  // Phase 19 (existing): Hunt Pass rolling points
  points        Int        @default(0)   // Keep for backward compat; rebrand as huntPassPoints in Phase 3
  
  // Phase 2 (NEW): Explorer's Guild rank system
  guildXp       Int        @default(0)   // Cumulative XP; never resets; used for rank calculation
  explorerRank  ExplorerRank @default(INITIATE)
  seasonalResetAt DateTime? // Most recent annual reset timestamp (UTC)
  
  // ... rest of model ...
  
  @@index([guildXp])        // For leaderboard queries
  @@index([explorerRank])   // For filtering by rank
  @@index([seasonalResetAt]) // For seasonal queries
}
```

#### **4. Extend PointsTransaction Model**
```prisma
model PointsTransaction {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  
  // Discriminator: type of transaction
  // Existing: VISIT, FAVORITE, PURCHASE, SHARE, REVIEW
  // NEW: COUPON_GENERATE, RARITY_BOOST, HUNT_PASS_DISCOUNT_REDEEM
  type        String
  
  // Value: positive = earn, negative = spend
  points      Int
  
  // Context (optional, varies by type)
  saleId      String?
  itemId      String?
  couponId    String?   // (NEW) For COUPON_GENERATE or HUNT_PASS_DISCOUNT_REDEEM
  coupon      Coupon?   @relation(fields: [couponId], references: [id])
  boostType   String?   // (NEW) For RARITY_BOOST (e.g., "SALE_SPECIFIC")
  
  description String?
  createdAt   DateTime  @default(now())
  
  @@index([userId, type]) // For user XP ledger queries
  @@index([type])         // For transaction type analytics
}
```

#### **5. Extend Coupon Model**
```prisma
model Coupon {
  // ... existing fields ...
  
  xpSpent Int? // (NEW) How much XP was spent to generate this coupon (null if organizer-created)
  
  // ... rest of model ...
}
```

#### **6. Add RarityBoost Table (NEW)**
```prisma
model RarityBoost {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  saleId    String
  sale      Sale     @relation(fields: [saleId], references: [id], onDelete: Cascade)
  
  boostPct  Int      // +2 (percentage points, e.g., +2% to Legendary odds)
  expiresAt DateTime // Boost window end (e.g., sale closing time)
  usedAt    DateTime? // When boost was actually claimed (null = not claimed yet)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([userId, saleId]) // One active boost per user per sale
  @@index([userId, expiresAt]) // For "active boosts for user" queries
  @@index([saleId]) // For "active boosts for this sale" queries
}
```

#### **7. Update FraudSignal Model (Comment Only)**
```prisma
model FraudSignal {
  // ... existing fields ...
  signalType String // Extend documentation:
                    // Bid fraud: RAPID_BIDS, BID_CANCEL_LOOP, HIGH_CANCEL_RATE, VELOCITY_SPIKE
                    // Account fraud: ACCOUNT_SHARING, NEW_ACCOUNT_BIDDING
                    // XP fraud: VISIT_SPAM, REFERRAL_FRAUD, BOT_RING, RARITY_INFLATION
                    // For XP fraud, itemId and saleId may be null
}
```

#### **8. Update User Model Relations**
Add relations for new tables (if User doesn't already have them):
```prisma
model User {
  // ... existing fields ...
  rarityBoosts RarityBoost[] // One-to-many: user can have multiple active boosts across sales
  // PointsTransaction relation already exists
}
```

Add relations in Sale and other related models:
```prisma
model Sale {
  // ... existing fields ...
  rarityBoosts RarityBoost[] // (NEW) One-to-many: sale can have multiple user boosts
}

model Coupon {
  pointsTransactions PointsTransaction[] // (NEW) One-to-many: coupon can be linked to multiple transaction records
}
```

---

## SECTION 3: MIGRATION PLAN

### Migration Files to Create

**File 1:** `packages/database/prisma/migrations/20260324_add_explorer_guild_phase2_schema/migration.sql`

```sql
-- 1. Add ExplorerRank enum (PostgreSQL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExplorerRank') THEN
    CREATE TYPE "ExplorerRank" AS ENUM ('INITIATE', 'SCOUT', 'RANGER', 'SAGE', 'GRANDMASTER');
  END IF;
END $$;

-- 2. Add columns to User table
ALTER TABLE "User" ADD COLUMN "guildXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "explorerRank" "ExplorerRank" NOT NULL DEFAULT 'INITIATE';
ALTER TABLE "User" ADD COLUMN "seasonalResetAt" TIMESTAMP(3);

-- 3. Create indexes on User for leaderboard/rank queries
CREATE INDEX "User_guildXp_idx" ON "User"("guildXp" DESC);
CREATE INDEX "User_explorerRank_idx" ON "User"("explorerRank");
CREATE INDEX "User_seasonalResetAt_idx" ON "User"("seasonalResetAt" DESC);

-- 4. Add columns to PointsTransaction
ALTER TABLE "PointsTransaction" ADD COLUMN "couponId" TEXT;
ALTER TABLE "PointsTransaction" ADD COLUMN "boostType" TEXT;

-- 5. Add FK constraint for couponId
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Create RarityBoost table
CREATE TABLE "RarityBoost" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "boostPct" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RarityBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RarityBoost_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RarityBoost_userId_saleId_key" UNIQUE("userId", "saleId")
);

-- 7. Create indexes on RarityBoost
CREATE INDEX "RarityBoost_userId_expiresAt_idx" ON "RarityBoost"("userId", "expiresAt");
CREATE INDEX "RarityBoost_saleId_idx" ON "RarityBoost"("saleId");

-- 8. Add xpSpent column to Coupon
ALTER TABLE "Coupon" ADD COLUMN "xpSpent" INTEGER;

-- 9. Extend PointsTransaction indexes
CREATE INDEX "PointsTransaction_userId_type_idx" ON "PointsTransaction"("userId", "type");
CREATE INDEX "PointsTransaction_type_idx" ON "PointsTransaction"("type");
```

### Migration Execution Steps

1. **Patrick runs (in PowerShell):**
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
   $env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
   npx prisma migrate deploy   # Applies migration to Neon production
   npx prisma generate         # Regenerates TypeScript client
   ```

2. **Verify migration applied:**
   ```bash
   npx prisma studio  # Visual verification of schema changes
   ```

3. **Backend deploy** (automatic via Railway on git push to main)

---

## SECTION 4: ROLLBACK PLAN

### Per-Migration Rollback

If migration needs to be reverted before reaching production, two options:

**Option A: Immediate Rollback (pre-production)**
```bash
npx prisma migrate resolve --rolled-back 20260324_add_explorer_guild_phase2_schema
```

**Option B: Rollback SQL (if needed post-production)**
```sql
-- Drop new table
DROP TABLE "RarityBoost" CASCADE;

-- Drop new columns
ALTER TABLE "User" DROP COLUMN "guildXp";
ALTER TABLE "User" DROP COLUMN "explorerRank";
ALTER TABLE "User" DROP COLUMN "seasonalResetAt";
ALTER TABLE "PointsTransaction" DROP COLUMN "couponId";
ALTER TABLE "PointsTransaction" DROP COLUMN "boostType";
ALTER TABLE "Coupon" DROP COLUMN "xpSpent";

-- Drop new indexes (automatic with table/column drop)

-- Drop enum (optional; safe to leave in DB)
DROP TYPE "ExplorerRank";
```

### Data Safety Considerations

- **No data loss:** New columns have defaults (0, INITIATE, null). Existing records unaffected.
- **No cascade deletes on critical paths:** RarityBoost uses `ON DELETE CASCADE` for user/sale, which is acceptable (boost is ephemeral).
- **User.guildXp data initialization:** Recommend backfilling existing users' guildXp from PointsTransaction history (see migration section).

---

## SECTION 5: API CONTRACTS (XP EARN & RANK CALCULATION)

### 1. POST /api/xp/earn

**Request:**
```json
{
  "userId": "user123",
  "type": "VISIT",           // or PURCHASE, REFERRAL, CHALLENGE, COMMUNITY_ACTION, STREAK
  "amount": 10,              // XP to award
  "saleId": "sale456",       // optional, for VISIT/PURCHASE
  "itemId": "item789",       // optional, for specific item purchases
  "metadata": {
    "saleType": "ESTATE",    // for archetype-based multipliers
    "itemValue": 450.00      // for auction multiplier calculation
  }
}
```

**Response:**
```json
{
  "success": true,
  "newGuildXp": 510,
  "newRank": "SCOUT",
  "rankUpNotification": {
    "message": "You've reached Scout rank!",
    "reward": "5% Hunt Pass discount + early access to 1 sale/week"
  },
  "xpTransaction": {
    "id": "txn_abc123",
    "type": "VISIT",
    "points": 10,
    "createdAt": "2026-03-24T14:30:00Z"
  }
}
```

**Business Logic:**
```typescript
async function earnXp(userId: string, params: EarnXpParams): Promise<EarnXpResponse> {
  // 1. Validate user and XP source
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  // 2. Calculate XP (base + multipliers)
  let xpAmount = params.amount;
  
  // Streak multiplier (if user is in active streak)
  const streak = await getActiveStreak(userId);
  if (streak) xpAmount *= 1.2; // 20% bonus
  
  // Archetype-based multiplier (if applicable)
  if (params.type === "PURCHASE" && params.metadata?.itemValue > 500) {
    xpAmount += 5; // High-value purchase bonus
  }

  // 3. Award XP and update rank
  const transaction = await prisma.pointsTransaction.create({
    data: {
      userId,
      type: params.type,
      points: xpAmount,
      saleId: params.saleId,
      itemId: params.itemId,
    }
  });

  // 4. Update user's cumulative XP
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      guildXp: { increment: xpAmount }
    }
  });

  // 5. Check for rank up
  const newRank = getRankFromXp(updatedUser.guildXp);
  let rankUpNotification = null;
  if (newRank !== user.explorerRank) {
    await prisma.user.update({
      where: { id: userId },
      data: { explorerRank: newRank }
    });
    rankUpNotification = generateRankUpCard(user, newRank);
  }

  return {
    success: true,
    newGuildXp: updatedUser.guildXp,
    newRank,
    rankUpNotification,
    xpTransaction: transaction
  };
}
```

---

### 2. GET /api/user/:id/rank-info

**Response:**
```json
{
  "userId": "user123",
  "explorerRank": "SCOUT",
  "guildXp": 520,
  "xpToNextRank": 1480,      // 2000 - 520
  "progressPercent": 26,     // (520 / 2000) * 100
  "seasonalRank": 15,        // Leaderboard position this season
  "seasonalXp": 180,         // XP earned this season only
  "streakDays": 7,           // Current visit streak
  "nextResetDate": "2026-12-31T23:59:59Z",
  "rankBenefits": {
    "huntPassDiscount": "5%",
    "earlyAccessSalesPerWeek": 1,
    "supportSla": "24h",
    "shareable": "Hunt Pass discount, early access"
  }
}
```

**Business Logic:**
```typescript
async function getRankInfo(userId: string): Promise<RankInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userStreaks: true }
  });

  const thresholds = {
    INITIATE: 0,
    SCOUT: 500,
    RANGER: 2000,
    SAGE: 5000,
    GRANDMASTER: 12000
  };

  const currentThreshold = thresholds[user.explorerRank];
  const nextRank = getNextRank(user.explorerRank);
  const nextThreshold = thresholds[nextRank];
  const xpToNextRank = nextThreshold - user.guildXp;
  const progressPercent = Math.round((user.guildXp / nextThreshold) * 100);

  // Get seasonal rank (leaderboard position this season)
  const seasonalRankCount = await prisma.user.count({
    where: {
      guildXp: { gt: user.guildXp },
      seasonalResetAt: {
        gte: getSeasonStartDate() // Jan 1 this year
      }
    }
  });

  return {
    userId: user.id,
    explorerRank: user.explorerRank,
    guildXp: user.guildXp,
    xpToNextRank,
    progressPercent,
    seasonalRank: seasonalRankCount + 1,
    seasonalXp: await getSeasonalXp(userId),
    streakDays: user.userStreaks[0]?.currentStreak || 0,
    nextResetDate: getNextResetDate(),
    rankBenefits: getRankBenefits(user.explorerRank)
  };
}
```

---

### 3. POST /api/xp/spend-coupon

**Request (Shopper spends XP for Hunt Pass discount):**
```json
{
  "userId": "user123",
  "type": "HUNT_PASS_DISCOUNT",
  "xpAmount": 50,
  "discountAmount": 1.00  // $1 off Hunt Pass
}
```

**Response:**
```json
{
  "success": true,
  "coupon": {
    "code": "XP50_abc123",
    "discountAmount": 1.00,
    "expiresAt": "2026-04-23T23:59:59Z",
    "xpSpent": 50
  },
  "newGuildXp": 470,  // 520 - 50 spent
  "remainingXp": 470
}
```

---

### 4. GET /api/leaderboard/seasonal

**Response:**
```json
{
  "season": "Q1_2026",
  "startDate": "2026-01-01T00:00:00Z",
  "endDate": "2026-03-31T23:59:59Z",
  "topCollectors": [
    {
      "rank": 1,
      "userId": "user456",
      "username": "EstateHunter2024",
      "seasonalXp": 1250,
      "explorerRank": "GRANDMASTER",
      "badge": "Spring Legend"
    },
    // ... next 99 ...
  ],
  "userPosition": {
    "rank": 342,
    "seasonalXp": 180,
    "earnedBadges": ["Spring Wanderer"]
  }
}
```

---

## SECTION 6: DATA INITIALIZATION

### Backfill Existing Users' guildXp

For users who have existing PointsTransaction history, backfill `guildXp` to reflect earned XP so far:

```sql
UPDATE "User" u
SET "guildXp" = COALESCE(
  (SELECT SUM(points) FROM "PointsTransaction" WHERE "userId" = u.id AND points > 0),
  0
)
WHERE u."guildXp" = 0;

-- Verify results
SELECT 
  u.id,
  u.email,
  u."guildXp",
  COUNT(pt.id) as transaction_count,
  SUM(CASE WHEN pt.points > 0 THEN pt.points ELSE 0 END) as total_earned
FROM "User" u
LEFT JOIN "PointsTransaction" pt ON u.id = pt."userId"
GROUP BY u.id
ORDER BY u."guildXp" DESC;
```

### Assign Initial Ranks Based on XP

After backfilling guildXp:

```sql
UPDATE "User"
SET "explorerRank" = CASE
  WHEN "guildXp" >= 12000 THEN 'GRANDMASTER'
  WHEN "guildXp" >= 5000 THEN 'SAGE'
  WHEN "guildXp" >= 2000 THEN 'RANGER'
  WHEN "guildXp" >= 500 THEN 'SCOUT'
  ELSE 'INITIATE'
END;
```

---

## SECTION 7: RISK MATRIX & DEPLOYMENT CHECKLIST

### Risk Level Assessment

| **Change** | **Risk** | **Mitigation** |
|-----------|--------|----------------|
| Add User.guildXp | LOW | Default 0; initialize via SQL; no breaking changes |
| Add User.explorerRank | LOW | Default INITIATE; no breaking changes |
| Add User.seasonalResetAt | LOW | Nullable; no breaking changes |
| Extend PointsTransaction | LOW | New optional columns; no schema breaking changes |
| Create RarityBoost table | LOW | New table; cascade deletes are safe (ephemeral data) |
| Extend Coupon model | LOW | New optional column; no breaking changes |
| Update ItemRarity enum | MEDIUM | Deprecate ULTRA_RARE in code; existing values safe |
| Add indexes | LOW | Performance optimization; no data risk |

### Pre-Deployment Checklist (Patrick)

- [ ] Backup Neon database snapshot (via Neon console)
- [ ] Run migration against Neon staging (if available) or production with backup
- [ ] Verify schema changes: `npx prisma studio`
- [ ] Run data initialization SQL (backfill guildXp, assign ranks)
- [ ] Verify counts: `SELECT COUNT(*) FROM "User" WHERE "guildXp" > 0`
- [ ] Test findasale-dev deployment: fetch user rank info endpoint
- [ ] Smoke test: login as user, verify rank display in dashboard
- [ ] Monitor Railway logs for 5 minutes post-deploy (check for constraint errors)

### Post-Deployment Verification

- [ ] QA: Verify user rank display in profile (should reflect guildXp)
- [ ] QA: Verify XP earn endpoint works (POST /api/xp/earn with test data)
- [ ] QA: Verify RarityBoost creation/expiry logic
- [ ] QA: Verify Coupon integration with XP spending
- [ ] Vercel build succeeds (TypeScript client generation)
- [ ] Railway app deploys without errors

---

## SECTION 8: DEV IMPLEMENTATION SEQUENCE (FOR FINDASALE-DEV)

### Phase 2a: Backend XP Earn & Rank System (2–3 days)

1. **Create XP Service** (`packages/backend/src/services/xpService.ts`)
   - `earnXp(userId, type, amount, context)` — award XP, check rank up, emit event
   - `getRankFromXp(guildXp)` — deterministic rank calculation
   - `getRankBenefits(rank)` — return rank-specific benefits (discount %, SLA, etc.)
   - `getSeasonalXp(userId)` — sum XP earned since Jan 1 this year
   - `calculateXpMultipliers(user, context)` — streaks, archetype multipliers, high-value bonuses

2. **Create XP Controller** (`packages/backend/src/controllers/xpController.ts`)
   - `POST /api/xp/earn` — request validation, call xpService.earnXp, return response
   - `GET /api/user/:id/rank-info` — fetch user rank + progress + benefits
   - `POST /api/xp/spend-coupon` — XP → coupon generation
   - `POST /api/xp/spend-rarity-boost` — XP → rarity odds boost
   - `POST /api/xp/spend-hunt-pass-discount` — XP → Hunt Pass discount

3. **Wire XP Earn Events** (modify existing controllers)
   - In `purchaseController.ts`: After successful purchase, call `await earnXp(userId, "PURCHASE", amount, { itemValue })`
   - In `saleController.ts` (visit tracking): Call `await earnXp(userId, "VISIT", 5, { saleId })`
   - In `referralController.ts`: Call `await earnXp(userId, "REFERRAL", 50)` on successful referral
   - In `userController.ts` (challenges): Call `await earnXp(userId, "CHALLENGE", amount)`

4. **TypeScript Check**
   - Run `npx tsc --noEmit --skipLibCheck` in backend — must be 0 errors

### Phase 2b: Frontend Rank Display & XP Sinks (2–3 days)

5. **Create Rank Components**
   - `RankBadge.tsx` — displays rank name + icon + color (Initiate=blue, Scout=gold, Ranger=emerald, Sage=diamond, Grandmaster=platinum)
   - `RankProgressBar.tsx` — progress toward next rank (e.g., "520 / 2000 XP to Scout")
   - `RankBenefitsCard.tsx` — displays rank-specific benefits (discount, SLA, access)
   - `RankUpNotification.tsx` — celebratory card on rank-up (shareable)

6. **Create XP Sink Components**
   - `CouponGeneratorModal.tsx` — organizer spends 20 XP to create coupon
   - `RarityBoostSelector.tsx` — shopper spends 15 XP to boost odds for a specific sale
   - `HuntPassDiscountRedeemer.tsx` — shopper spends 50 XP for $1 off Hunt Pass

7. **Create Leaderboard Pages**
   - `/shopper/leaderboard` — seasonal leaderboard with top 100 users, user's position, badges
   - `/shopper/rank-profile` — detailed rank info, progress, benefits, season stats

8. **Integrate into Existing Pages**
   - Add RankBadge to user nav (top-right, next to avatar)
   - Add RankProgressBar to shopper dashboard (below existing stats)
   - Add RankBenefitsCard to shopper profile
   - Add "Spend XP" buttons to organizer coupon creation, shopper sale detail, Hunt Pass purchase

9. **TypeScript Check**
   - Run `npx tsc --noEmit --skipLibCheck` in frontend — must be 0 errors

### Phase 2c: Fraud Detection Logging (1 day)

10. **Extend FraudSignal Recording** (in existing `fraudDetectionService.ts`)
    - Add `signalType: "VISIT_SPAM"` logic (>50 visits in 24h from same IP)
    - Add `signalType: "ACCOUNT_SHARING"` logic (login from 5+ countries in 1 day)
    - Add `signalType: "BOT_RING"` logic (5+ accounts from same IP, same social share)
    - Add `signalType: "REFERRAL_FRAUD"` logic (>5 referrals per day from new accounts)
    - Add `signalType: "RARITY_INFLATION"` logic (user avg item value >2x median)

11. **Add to Dashboard** (organizer command center)
    - Show XP fraud flags alongside bid fraud signals
    - List flagged users + signal type + confidence score

---

## SECTION 9: PATRICK DECISION POINTS (BEFORE DEV STARTS)

These items require explicit Patrick approval before findasale-dev begins implementation:

### **Decision 1: Hunt Pass Free-Forever for Grandmaster?**

**Question:** Once a user reaches Grandmaster rank, should they get free Hunt Pass ($0) for **all future years**, or only **while they maintain Grandmaster rank**?

**Option A (Recommended):** Free **forever** once earned (even if tier drops)
- **Rationale:** Feels like "beating the game" — a permanent reward for extreme dedication
- **Risk:** Cannibalization ($60/year opportunity loss if 1% of users reach Grandmaster)
- **Mitigation:** Grandmaster is aspirational (1–2% of base); cap at 1,000 users before free; new Grandmasters pay Scout rate (5% off)

**Option B:** Free **only while Grandmaster** (loses it if tier drops to Sage)
- **Rationale:** Tier drops are punishment; loss of Hunt Pass is added penalty
- **Risk:** Feels punitive; may cause churn if Grandmaster loses benefits mid-year
- **Mitigation:** Rarely happens (seasonal reset only drops by 1 tier)

**Recommendation:** **Option A** (free forever). Aligns with "hall of fame" narrative.

---

### **Decision 2: Rarity Boost Mechanics — Flat +2% or Dynamic?**

**Question:** Should rarity boost always give +2% to Legendary odds, or scale by sale type?

**Option A (Recommended):** Flat +2% for all sales
- **Rationale:** Simplicity; consistent UX
- **Cost:** 15 XP per boost (fixed)

**Option B:** Dynamic by sale type (e.g., +2% for yard sales, +1% for estate sales)
- **Rationale:** Balances high-value estate sales (harder to get Legendary) vs. yard sales
- **Risk:** More complex; requires organizer education
- **Cost:** Varies (10–20 XP depending on sale type)

**Recommendation:** **Option A** (flat +2%). Ship with simple mechanics; add scaling in Season 2 if needed based on data.

---

### **Decision 3: XP Sink Caps — Per-User Limits?**

**Question:** Should we cap XP spending per month to prevent abuse (e.g., max 3 rarity boosts/week)?

**Option A (Recommended):** No hard cap; fraud detection flags unusual patterns
- **Rationale:** MVP approach; track, don't block
- **Risk:** Users can spam boosts on every sale
- **Mitigation:** Fraud flag if >5 boosts per week; manual review

**Option B:** Hard cap per sink type (e.g., max 3 rarity boosts/week)
- **Rationale:** Prevents game-breaking acceleration
- **Risk:** Feels restrictive to power users
- **Mitigation:** Raise cap in Season 2 if data shows healthy spending patterns

**Recommendation:** **Option A** (no hard cap, fraud detection only). MVP simplicity.

---

### **Decision 4: Seasonal Reset Timing — Jan 1 or Custom?**

**Question:** Should seasonal reset always be Jan 1 UTC, or allow organizers to customize?

**Option A (Recommended):** Jan 1 UTC only (fixed calendar year)
- **Rationale:** Global synchronization; "new year, new leaderboard" narrative
- **UX:** Clear messaging; easy to understand

**Option B:** Custom per-organizer (e.g., "my season runs April–March")
- **Rationale:** Aligns with fiscal year (some organizers)
- **Risk:** Fragment leaderboard; confusing messaging
- **Mitigation:** Use calendar year only; note in roadmap for Season 2+ customization

**Recommendation:** **Option A** (Jan 1 UTC only).

---

### **Decision 5: Loot Legend Photo Requirement — Mandatory or Optional?**

**Question:** Should users be required to upload a photo for every Loot Legend item, or optional?

**Option A (Recommended):** Optional photo, encourages but doesn't require
- **Rationale:** Reduces friction; shareable cards work without photo (text-only)
- **Risk:** More spam/low-effort listings

**Option B:** Mandatory photo for RARE/LEGENDARY (optional for COMMON/UNCOMMON)
- **Rationale:** Proof of authenticity for high-rarity items
- **Risk:** Higher friction; may discourage casual logging

**Recommendation:** **Option A** (optional photo). Patrick can gate photo requirement in Season 2 if spam becomes issue.

---

### **Decision 6: Organizer Host Ranks — Fee Discount or No?**

**Question:** The board rejected fee discounts for organizers. Do you want to introduce ANY financial benefit for Elite/Master tiers, or keep non-financial (prestige + services)?

**Option A (Locked):** NO fee discounts. Only prestige + service credits + API access
- **Rationale:** Board decision; protects subscription ARR
- **Services instead:** Email campaign credits (worth $300–800/year), featured placement, account manager

**Option B (Not recommended):** Small fee discount (0.5–1%) for Elite/Master
- **Rationale:** Direct financial incentive
- **Risk:** Cannibalization of subscription revenue

**Recommendation:** **Option A** (no fee discounts — board-locked).

---

### **Decision 7: Referral XP Verification — Email-Only or SMS?**

**Question:** Should we verify referred users via email alone, or require SMS for fraud prevention?

**Option A (Recommended):** Email only (existing email verification on signup)
- **Rationale:** MVP simplicity; already verified via email
- **Risk:** Email addresses can be faked
- **Mitigation:** Fraud flag if >5 referrals from same email domain; SMS verification in Season 2

**Option B:** Require SMS verification for referral credit
- **Rationale:** Higher friction = less fraud
- **Risk:** Lower conversion (users less likely to complete SMS)
- **Mitigation:** SMS optional for now; required in Season 2

**Recommendation:** **Option A** (email only). Fraud detection flags unusual patterns.

---

## SECTION 10: FLAGGED ITEMS FOR PATRICK

### 🚩 **FLAG 1: Rarity Valuation Guide for Organizers**

**Issue:** How should organizers assign rarity to items they list? Without guidance, every organizer will claim "LEGENDARY" to game the system.

**Recommendation:** Ship a **simple valuation guide** in onboarding or selling flow:
- Common: $0–50
- Uncommon: $50–150
- Rare: $150–500
- Legendary: $500+

**Or:** Organizers propose rarity; system auto-adjusts based on item category + price + shopper feedback.

**Action needed:** Approve guidance approach before findasale-dev starts.

---

### 🚩 **FLAG 2: Legendary Item Quota — Hard Cap or Soft?**

**Issue:** S260 spec says "max 10 Legendary per organizer per month." Is this a hard cap (reject listing) or soft (flag for review)?

**Option A:** Hard cap — system rejects 11th Legendary claim
- **Risk:** Organizers frustrated if they have 11 high-value items
- **Benefit:** Prevents abuse

**Option B:** Soft cap — flag for review, allow listing with warning
- **Risk:** Spammers can still list 100 Legendary items
- **Benefit:** Less friction for legitimate high-volume sellers

**Recommendation:** **Soft cap** (flag for review, allow with warning). Manual organizer review for Legendary claims over 10/month.

**Action needed:** Confirm cap approach before implementation.

---

### 🚩 **FLAG 3: Seasonal Expedition Themes — Lock Q1–Q4 or Let Patrick Customize?**

**Issue:** S259 defines 4 themed expeditions (Spring, Summer, Fall, Winter). Should these be hardcoded, or customizable by Patrick each quarter?

**Recommendation:** Hardcode for Season 1 (MVP). Add admin customization panel in Season 2.

**Action needed:** Confirm expedition themes are locked for 2026.

---

### 🚩 **FLAG 4: XP-to-Currency Conversion — Final Pricing Locked?**

**Issue:** Spec defines XP sinks:
- 20 XP = $1 coupon (organizer sink)
- 15 XP = +2% Legendary odds (shopper sink, ephemeral)
- 50 XP = $1 Hunt Pass discount (shopper sink)

Are these conversion rates final, or data-driven adjustments allowed in Season 1?

**Recommendation:** Lock rates for launch. Monitor Season 1 data (% of users spending XP, average spend per user, revenue impact). Adjust in Season 2 if needed (e.g., raise 50 XP to 60 if Hunt Pass discount is over-redeemed).

**Action needed:** Approve rates before implementation.

---

### 🚩 **FLAG 5: Legal Review of Presale Access Language**

**Issue:** S259 spec defines Sage-only presale access. This creates a "members-only" marketplace dynamic. Legal may flag:
- **Terms & Conditions:** Presale access is not guaranteed; organizers can opt out
- **Discrimination:** Ensure presale doesn't violate accessibility laws (no protected class discrimination)
- **ToS clarity:** "Early access ≠ exclusive; organizer can cancel presale"

**Recommendation:** Have Legal review ToS language before frontend ships presale UI.

**Action needed:** Flag Legal for ToS review before Phase 2a dev starts.

---

### 🚩 **FLAG 6: Fraud Detection Sensitivity — False Positives**

**Issue:** Fraud signals (VISIT_SPAM, BOT_RING, etc.) can flag legitimate users. Example: User visits 10 sales in 1 day during estate sale season = false positive VISIT_SPAM flag.

**Recommendation:** Implement **graduated response**:
1. First offense: Flag for review (no action)
2. Second offense: Soft cooldown (1-hour delay before XP counts)
3. Third offense: 7-day cooldown (XP earning paused)
4. Organizer report: Manual review by admin

**Action needed:** Confirm fraud response escalation policy before implementation.

---

### 🚩 **FLAG 7: ULTRA_RARE Enum Deprecation — Existing Data**

**Issue:** ItemRarity enum has ULTRA_RARE, but S260 spec defines only 4 tiers (COMMON/UNCOMMON/RARE/LEGENDARY). Do existing items with ULTRA_RARE need migration?

**Recommendation:** In migration, convert ULTRA_RARE → RARE (safest default). Document change in release notes. Organizers can manually re-label if needed.

**Action needed:** Confirm migration approach before running schema migration.

---

## SECTION 11: FINAL SIGN-OFF CHECKLIST

- [ ] **Schema Changes Approved:** All 7 additions reviewed and approved (5 approved, 2 modified)
- [ ] **Migration Plan Complete:** SQL migration file defined, sequencing clear
- [ ] **API Contracts Finalized:** XP earn, rank info, leaderboard endpoints specified
- [ ] **Risk Assessment Done:** All changes LOW-MEDIUM risk; no breaking changes
- [ ] **Patrick Decisions Resolved:** All 7 decision points reviewed and approved
- [ ] **Flagged Items Acknowledged:** All 7 flags reviewed; action items assigned
- [ ] **Dev Sequence Ready:** 11-step implementation plan provided to findasale-dev
- [ ] **TypeScript Validation:** All backend/frontend code will be checked pre-push
- [ ] **Deployment Checklist Prepared:** Pre-deploy, post-deploy verification steps defined
- [ ] **Rollback Plan Ready:** Per-migration rollback SQL documented

---

## DELIVERABLES SUMMARY

| **Deliverable** | **Status** | **Where to Find** |
|-----------------|-----------|------------------|
| Schema sign-off (7 additions) | ✅ Complete | Section 1 |
| Schema modification details (Prisma) | ✅ Complete | Section 2 |
| Migration plan + SQL | ✅ Complete | Section 3 |
| Rollback plan | ✅ Complete | Section 4 |
| API contracts (XP earn, rank, leaderboard) | ✅ Complete | Section 5 |
| Data initialization SQL | ✅ Complete | Section 6 |
| Risk matrix + deployment checklist | ✅ Complete | Section 7 |
| Dev implementation sequence (11 steps) | ✅ Complete | Section 8 |
| Patrick decision points (7 items) | ✅ Complete | Section 9 |
| Flagged items (7 flags) | ✅ Complete | Section 10 |
| Final sign-off checklist | ✅ Complete | Section 11 |

---

## RECOMMENDED NEXT STEPS

1. **Patrick reviews & approves:**
   - Decision points (§9) — 5 items need explicit decision
   - Flagged items (§10) — 7 items need acknowledgment or action assignment

2. **Legal reviews:**
   - Sage presale ToS language (Flag #5)
   - Non-discrimination language for rank access

3. **findasale-dev dispatch:**
   - Provide full schema sign-off + migration plan (§1–4)
   - Provide API contracts (§5)
   - Provide dev sequence (§8)
   - Assign 11-step implementation with delivery dates

4. **Post-implementation QA:**
   - Smoke tests (rank display, XP earn, leaderboard)
   - Fraud detection validation (false positive rate <5%)
   - Performance test (leaderboard query with 100k users)

---

**Prepared by:** Claude (Architect)  
**Date:** 2026-03-24  
**Ready for:** Patrick approval → findasale-dev dispatch
---

## SECTION 11: LOCKED GAME DESIGN DECISIONS (S261)

All open decisions resolved by game designer agent on 2026-03-24.

### D1: Hunt Pass for Grandmaster
**LOCKED:** Free forever once earned (hall-of-fame). Cap at 1,000 concurrent Grandmasters; overflow gets Scout discount (5% off) instead.

### D2: Rarity Boost Mechanics
**LOCKED:** Flat +2% for all sales. Dynamic scaling deferred to Season 2.

### D3: XP Sink Caps
**LOCKED:** No hard cap. Fraud detection flags >5 boosts/week for manual review. Hard caps in Season 2 if abuse data warrants.

### D4: Seasonal Reset Timing
**LOCKED:** Jan 1 UTC only. Fixed calendar year.

### D5: Loot Legend Photo
**LOCKED:** Optional. No mandatory photos. Revisit in Season 2 if spam emerges.

### D6: Organizer Fee Discounts
**LOCKED:** No fee discounts (board decision). Non-financial rewards only: email credits, featured placement, account manager.

### D7: Referral XP Verification
**LOCKED:** Email only. Flag >5 referrals from same domain. SMS in Season 2.

### Rarity Valuation Guide
**LOCKED:** Price-bracket guide in organizer onboarding (Common $0–50, Uncommon $50–150, Rare $150–500, Legendary $500+). Platform auto-adjusts Rare/Legendary claims based on item category + price. Shopper feedback can surface undervalued items.

