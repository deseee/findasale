-- ItemCard (2026-10-03, ADR-134): 1:1 card record for an Item. Additive: one new table, no change to "Item".
-- catalogPrintingId is a plain column here; its foreign key to "CardPrinting" is added by migration 2.
CREATE TABLE IF NOT EXISTS "ItemCard" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizerId" TEXT,
    "game" TEXT NOT NULL,
    "productType" TEXT NOT NULL DEFAULT 'SINGLE',
    "cardName" TEXT,
    "setCode" TEXT,
    "setName" TEXT,
    "collectorNumber" TEXT,
    "language" TEXT,
    "finish" TEXT,
    "rarity" TEXT,
    "conditionCode" TEXT,
    "grader" TEXT,
    "grade" TEXT,
    "certNumber" VARCHAR(30),
    "releaseYear" INTEGER,
    "scryfallId" TEXT,
    "tcgplayerProductId" INTEGER,
    "cardmarketId" INTEGER,
    "catalogPrintingId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemCard_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ItemCard_releaseYear_check" CHECK ("releaseYear" IS NULL OR ("releaseYear" >= 1900 AND "releaseYear" <= 2100))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemCard_itemId_key" ON "ItemCard"("itemId");
CREATE INDEX IF NOT EXISTS "ItemCard_organizerId_dedupKey_idx" ON "ItemCard"("organizerId", "dedupKey");
CREATE INDEX IF NOT EXISTS "ItemCard_game_setCode_collectorNumber_idx" ON "ItemCard"("game", "setCode", "collectorNumber");
CREATE INDEX IF NOT EXISTS "ItemCard_scryfallId_idx" ON "ItemCard"("scryfallId");
CREATE INDEX IF NOT EXISTS "ItemCard_tcgplayerProductId_idx" ON "ItemCard"("tcgplayerProductId");
CREATE INDEX IF NOT EXISTS "ItemCard_catalogPrintingId_idx" ON "ItemCard"("catalogPrintingId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemCard_itemId_fkey') THEN
    ALTER TABLE "ItemCard" ADD CONSTRAINT "ItemCard_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
