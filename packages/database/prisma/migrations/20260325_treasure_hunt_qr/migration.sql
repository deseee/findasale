-- Migration: #85 Treasure Hunt QR — Per-sale organizer scavenger hunt clues
-- Adds TreasureHuntQRClue and TreasureHuntQRScan tables
-- Adds treasureHuntEnabled and treasureHuntCompletionBadge to Sale

-- Sale: Treasure Hunt QR fields
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "treasureHuntEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "treasureHuntCompletionBadge" BOOLEAN NOT NULL DEFAULT false;

-- TreasureHuntQRClue: organizer-created clues attached to a sale
CREATE TABLE IF NOT EXISTS "TreasureHuntQRClue" (
    "id"        TEXT NOT NULL,
    "saleId"    TEXT NOT NULL,
    "clueText"  TEXT NOT NULL,
    "hintPhoto" TEXT,
    "category"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreasureHuntQRClue_pkey" PRIMARY KEY ("id")
);

-- TreasureHuntQRScan: shopper scans of individual clues (one per user per clue)
CREATE TABLE IF NOT EXISTS "TreasureHuntQRScan" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "clueId"    TEXT NOT NULL,
    "itemId"    TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreasureHuntQRScan_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "TreasureHuntQRClue_saleId_idx" ON "TreasureHuntQRClue"("saleId");
CREATE UNIQUE INDEX IF NOT EXISTS "TreasureHuntQRScan_userId_clueId_key" ON "TreasureHuntQRScan"("userId", "clueId");
CREATE INDEX IF NOT EXISTS "TreasureHuntQRScan_clueId_idx" ON "TreasureHuntQRScan"("clueId");

-- Foreign keys
ALTER TABLE "TreasureHuntQRClue" ADD CONSTRAINT "TreasureHuntQRClue_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TreasureHuntQRScan" ADD CONSTRAINT "TreasureHuntQRScan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TreasureHuntQRScan" ADD CONSTRAINT "TreasureHuntQRScan_clueId_fkey"
    FOREIGN KEY ("clueId") REFERENCES "TreasureHuntQRClue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TreasureHuntQRScan" ADD CONSTRAINT "TreasureHuntQRScan_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
