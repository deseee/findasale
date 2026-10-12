-- Card scan staging (2026-10-13, ADR-138, batch B1). Additive: two new tables, eight indexes (four of them unique), one foreign key.
-- Creates EMPTY tables. No column is added to Item or ItemCard. Rows arrive only when CARD_SCAN_ENABLED=true.
-- No FK to Sale or Organizer (same precedent as CardIntakeBatch); ownership is enforced in the service.

CREATE TABLE IF NOT EXISTS "CardScanSession" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PHOTO',
    "label" VARCHAR(60),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "defaultGame" TEXT NOT NULL DEFAULT 'MTG',
    "defaultConditionCode" TEXT,
    "defaultFinish" TEXT,
    "nextSeq" INTEGER NOT NULL DEFAULT 0,
    "commitMode" TEXT,
    "commitManifestSha256" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CardScanSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CardScanSession_organizerId_saleId_status_idx" ON "CardScanSession"("organizerId", "saleId", "status");
CREATE INDEX IF NOT EXISTS "CardScanSession_lastActivityAt_idx" ON "CardScanSession"("lastActivityAt");

CREATE TABLE IF NOT EXISTS "CardScanEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "clientEntryId" TEXT,
    "placementId" TEXT,
    "imageSha256" VARCHAR(64),
    "providerId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "readGame" TEXT,
    "readName" VARCHAR(200),
    "readSetCode" VARCHAR(20),
    "readSetName" VARCHAR(120),
    "readCollectorNumber" VARCHAR(20),
    "readLanguage" TEXT,
    "readFinish" TEXT,
    "readScryfallId" VARCHAR(64),
    "readConfidence" DOUBLE PRECISION,
    "readQuantity" INTEGER,
    "suggestedConditionCode" TEXT,
    "suggestedGrader" TEXT,
    "suggestedGrade" TEXT,
    "suggestedCertNumber" VARCHAR(30),
    "suggestionSource" TEXT,
    "resolution" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "resolutionNote" TEXT,
    "game" TEXT NOT NULL DEFAULT 'MTG',
    "printingId" TEXT,
    "acceptAsTyped" BOOLEAN NOT NULL DEFAULT false,
    "cardName" VARCHAR(200),
    "setCode" VARCHAR(20),
    "setName" VARCHAR(120),
    "collectorNumber" VARCHAR(20),
    "language" TEXT,
    "finish" TEXT,
    "conditionCode" TEXT,
    "grader" TEXT,
    "grade" TEXT,
    "certNumber" VARCHAR(30),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "errorCode" TEXT,
    "suspectDuplicateOf" TEXT,
    "committedBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CardScanEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CardScanEntry_sessionId_seq_key" ON "CardScanEntry"("sessionId", "seq");
CREATE UNIQUE INDEX IF NOT EXISTS "CardScanEntry_sessionId_clientEntryId_key" ON "CardScanEntry"("sessionId", "clientEntryId");
CREATE UNIQUE INDEX IF NOT EXISTS "CardScanEntry_sessionId_placementId_key" ON "CardScanEntry"("sessionId", "placementId");
CREATE UNIQUE INDEX IF NOT EXISTS "CardScanEntry_sessionId_imageSha256_key" ON "CardScanEntry"("sessionId", "imageSha256");
CREATE INDEX IF NOT EXISTS "CardScanEntry_sessionId_status_idx" ON "CardScanEntry"("sessionId", "status");
CREATE INDEX IF NOT EXISTS "CardScanEntry_organizerId_idx" ON "CardScanEntry"("organizerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CardScanEntry_sessionId_fkey') THEN
    ALTER TABLE "CardScanEntry" ADD CONSTRAINT "CardScanEntry_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "CardScanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Rollback (manual, not executed by migrate deploy):
-- ## Rollback: z20261013000000_card_scan_intake
-- Down migration: DROP TABLE IF EXISTS "CardScanEntry"; DROP TABLE IF EXISTS "CardScanSession";   (entries first, the FK points at sessions)
-- Playbook: "If deploy vX fails at the scan migration, set CARD_SCAN_ENABLED=false; routes return a disabled answer and nothing writes the tables; then run the DROPs. Committed Items and CardIntakeBatch rows are unaffected because commit writes only to Item, ItemCard and CardIntakeBatch; staging rows are disposable."
