-- Sale Passport (2026-09-29, feature #29 rebuild): dated, place-aware collectible stamp rows.
--
-- WHAT: (1) new table "ShopperPassportStamp" -- one row per stamp earned, with the sale, city,
-- region and earned date, plus a unique (userId, dedupeKey) so every award is idempotent;
-- (2) "StampMilestone"."seenAt" -- null until the milestone unlock toast has been shown.
-- The legacy "ShopperStamp" (per-type counters) and "StampMilestone" rows are untouched and
-- keep working as the lifetime-activity tally. No production data is modified.
--
-- SAFETY: additive only. New table + one new nullable column. No DROP, no data rewrite.
-- Fully idempotent (IF NOT EXISTS / duplicate_object guards) -- safe to run twice.
--
-- Down migration (safe at any time; nothing outside the Sale Passport reads these):
--   DROP TABLE "ShopperPassportStamp";
--   ALTER TABLE "StampMilestone" DROP COLUMN "seenAt";

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShopperPassportStamp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stampKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "saleId" TEXT,
    "cityKey" TEXT,
    "regionKey" TEXT,
    "placeLabel" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopperPassportStamp_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "ShopperPassportStamp" ADD CONSTRAINT "ShopperPassportStamp_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ShopperPassportStamp_userId_dedupeKey_key" ON "ShopperPassportStamp"("userId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "ShopperPassportStamp_userId_stampKey_idx" ON "ShopperPassportStamp"("userId", "stampKey");
CREATE INDEX IF NOT EXISTS "ShopperPassportStamp_userId_earnedAt_idx" ON "ShopperPassportStamp"("userId", "earnedAt");

-- AlterTable (additive, nullable)
ALTER TABLE "StampMilestone" ADD COLUMN IF NOT EXISTS "seenAt" TIMESTAMP(3);
