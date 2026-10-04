-- Card catalog + intake ledger (2026-10-03, ADR-134). Additive: four new tables, one index, one foreign key.
-- Creates EMPTY tables (a few KB). Rows arrive only when CARD_CATALOG_ENABLED=true (headroom decision D1).
CREATE TABLE IF NOT EXISTS "CardPrinting" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "setCode" TEXT NOT NULL,
    "setName" TEXT,
    "collectorNumber" TEXT,
    "language" TEXT,
    "rarity" TEXT,
    "releaseYear" INTEGER,
    "finishes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scryfallId" TEXT,
    "tcgplayerProductId" INTEGER,
    "cardmarketId" INTEGER,
    "imageSmallUrl" TEXT,
    "imageNormalUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardPrinting_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CardPrinting_game_nameNorm_idx" ON "CardPrinting"("game", "nameNorm");
CREATE INDEX IF NOT EXISTS "CardPrinting_game_nameNorm_pattern_idx" ON "CardPrinting"("game", "nameNorm" text_pattern_ops);
CREATE INDEX IF NOT EXISTS "CardPrinting_game_setCode_collectorNumber_idx" ON "CardPrinting"("game", "setCode", "collectorNumber");
CREATE INDEX IF NOT EXISTS "CardPrinting_tcgplayerProductId_idx" ON "CardPrinting"("tcgplayerProductId");

CREATE TABLE IF NOT EXISTS "CardPrice" (
    "printingId" TEXT NOT NULL,
    "usd" DECIMAL(10,2),
    "usdFoil" DECIMAL(10,2),
    "usdEtched" DECIMAL(10,2),
    "usdReverse" DECIMAL(10,2),
    "asOf" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CardPrice_pkey" PRIMARY KEY ("printingId")
);

CREATE TABLE IF NOT EXISTS "CardDataSource" (
    "source" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" VARCHAR(500),
    "sourceVersion" TEXT,
    "rowsUpserted" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CardDataSource_pkey" PRIMARY KEY ("source")
);

CREATE TABLE IF NOT EXISTS "CardIntakeBatch" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileName" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "committedThroughRow" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "mergedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorSample" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CardIntakeBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CardIntakeBatch_organizerId_saleId_fileSha256_mode_key"
  ON "CardIntakeBatch"("organizerId", "saleId", "fileSha256", "mode");
CREATE INDEX IF NOT EXISTS "CardIntakeBatch_saleId_idx" ON "CardIntakeBatch"("saleId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CardPrice_printingId_fkey') THEN
    ALTER TABLE "CardPrice" ADD CONSTRAINT "CardPrice_printingId_fkey"
      FOREIGN KEY ("printingId") REFERENCES "CardPrinting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemCard_catalogPrintingId_fkey') THEN
    ALTER TABLE "ItemCard" ADD CONSTRAINT "ItemCard_catalogPrintingId_fkey"
      FOREIGN KEY ("catalogPrintingId") REFERENCES "CardPrinting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
