-- U1 (2026-10-04): ItemMarketplacePush, one row per marketplace push attempt from the item editor.
-- Lets the organizer see what was pushed and why a push failed. Additive and idempotent.
-- SAFETY: apply BEFORE deploying the matching backend build. No data is rewritten, no backfill.
-- platform/trigger/status are plain TEXT (no enum DDL). errorMessage is truncated to 500 chars by the writer.

CREATE TABLE IF NOT EXISTS "ItemMarketplacePush" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "fieldsAttempted" TEXT[],
    "fieldsPushed" TEXT[],
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemMarketplacePush_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ItemMarketplacePush_itemId_createdAt_idx" ON "ItemMarketplacePush"("itemId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ItemMarketplacePush_organizerId_status_acknowledgedAt_idx" ON "ItemMarketplacePush"("organizerId", "status", "acknowledgedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemMarketplacePush_itemId_fkey') THEN
    ALTER TABLE "ItemMarketplacePush" ADD CONSTRAINT "ItemMarketplacePush_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
