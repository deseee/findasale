-- ADR cashier-discretionary-discount (2026-09-25)
-- Cashier Discretionary Discount at Point of Sale (Maple Lake Mall shared register).
-- Hand-written to match schema.prisma exactly, applied via `prisma migrate deploy`
-- (no shadow database involved), matching this sandbox's established pattern (see
-- 20260916160000_add_isr_regeneration_log/migration.sql for precedent).
--
-- 1. Item.originalPrice -- purpose-built anchor for the 20%-of-original cap, distinct
--    from the markdown-cron-owned priceBeforeMarkdown/markdownApplied pair. Backfilled
--    for every existing row from COALESCE(priceBeforeMarkdown, price) so the cap has a
--    real anchor immediately, not a null that zeroes every existing item's discretion
--    room until its next manual price edit.
-- 2. Item.pendingCashierDiscretion{AppliedCents,AppliedByType,AppliedById} -- cart-scoped
--    scratch columns, additive/nullable, no backfill needed (every existing row is not
--    mid-cart).
-- 3. CashierDiscretionGrant -- new table, purely additive, no changes to any existing
--    table's relations besides the three new nullable back-relations below (which add
--    no columns of their own -- Prisma relation fields with no @relation `fields:` array
--    are virtual/back-relations only).
-- 4. Purchase's 6 new audit columns -- additive/nullable, no backfill (existing rows
--    correctly read NULL -- "no discretion, unknown original/pre-discretion price",
--    same NULLABLE/NO-BACKFILL posture as this model's existing FEE SNAPSHOT /
--    SHIPPING DESTINATION blocks).
--
-- SAFETY: additive only except the one backfill UPDATE (Item.originalPrice), which
-- touches no other column and cannot change any item's live price, status, or any
-- money-movement field. No DROP, no ALTER of an existing column's type/nullability.
--
-- Down migration (safe at any time pre-launch of this feature):
--   ALTER TABLE "Purchase" DROP COLUMN "cashierDiscretionPercent";
--   ALTER TABLE "Purchase" DROP COLUMN "cashierDiscretionAmountCents";
--   ALTER TABLE "Purchase" DROP COLUMN "cashierDiscretionAppliedByType";
--   ALTER TABLE "Purchase" DROP COLUMN "cashierDiscretionAppliedById";
--   ALTER TABLE "Purchase" DROP COLUMN "priceOriginalCents";
--   ALTER TABLE "Purchase" DROP COLUMN "priceBeforeDiscretionCents";
--   DROP TABLE "CashierDiscretionGrant";
--   ALTER TABLE "Item" DROP COLUMN "pendingCashierDiscretionAppliedCents";
--   ALTER TABLE "Item" DROP COLUMN "pendingCashierDiscretionAppliedByType";
--   ALTER TABLE "Item" DROP COLUMN "pendingCashierDiscretionAppliedById";
--   ALTER TABLE "Item" DROP COLUMN "originalPrice";

-- 1. Item.originalPrice + backfill
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "originalPrice" DOUBLE PRECISION;
UPDATE "Item" SET "originalPrice" = COALESCE("priceBeforeMarkdown", "price") WHERE "originalPrice" IS NULL;

-- 2. Item cart-scoped scratch columns
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "pendingCashierDiscretionAppliedCents" INTEGER DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "pendingCashierDiscretionAppliedByType" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "pendingCashierDiscretionAppliedById" TEXT;

-- 3. CashierDiscretionGrant
CREATE TABLE IF NOT EXISTS "CashierDiscretionGrant" (
    "id"                  TEXT NOT NULL,
    "hubId"               TEXT NOT NULL,
    "cashierTeamMemberId" TEXT,
    "cashierBoothId"      TEXT,
    "enabled"             BOOLEAN NOT NULL DEFAULT false,
    "setByUserId"         TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierDiscretionGrant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CashierDiscretionGrant" ADD CONSTRAINT "CashierDiscretionGrant_hubId_fkey"
  FOREIGN KEY ("hubId") REFERENCES "SaleHub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashierDiscretionGrant" ADD CONSTRAINT "CashierDiscretionGrant_cashierTeamMemberId_fkey"
  FOREIGN KEY ("cashierTeamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashierDiscretionGrant" ADD CONSTRAINT "CashierDiscretionGrant_cashierBoothId_fkey"
  FOREIGN KEY ("cashierBoothId") REFERENCES "VendorBooth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "CashierDiscretionGrant_hubId_cashierTeamMemberId_key" ON "CashierDiscretionGrant"("hubId", "cashierTeamMemberId");
CREATE UNIQUE INDEX IF NOT EXISTS "CashierDiscretionGrant_hubId_cashierBoothId_key" ON "CashierDiscretionGrant"("hubId", "cashierBoothId");
CREATE INDEX IF NOT EXISTS "CashierDiscretionGrant_hubId_idx" ON "CashierDiscretionGrant"("hubId");

-- 4. Purchase audit columns
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "cashierDiscretionPercent" DECIMAL(5,2);
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "cashierDiscretionAmountCents" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "cashierDiscretionAppliedByType" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "cashierDiscretionAppliedById" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "priceOriginalCents" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "priceBeforeDiscretionCents" INTEGER;
