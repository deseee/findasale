-- Feature #603 (2026-08-05): Platform-wide default best-offer thresholds.
-- Suggested pre-fill (never a silent override) for the per-item eBay best-offer
-- PERCENTAGE fields on the edit-item form. Nullable, additive -- existing rows
-- get NULL and are unaffected until an organizer sets a default.
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "defaultBestOfferAcceptPct" INTEGER;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "defaultBestOfferDeclinePct" INTEGER;

-- Feature #602 (2026-08-05): AI Message-Reply Autosend -- Price + Availability.
-- Separate, deliberately-OFF-by-default opt-in (Patrick's 2026-08-05 decision) --
-- distinct from any prior extension autosend opt-in an organizer may already have.
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "autosendPriceAvailabilityEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Feature #602: decision log for every buyer message run through the price/availability
-- autosend engine, whether or not it actually autosent. Observability only -- not a
-- message inbox. Feeds the 4 monitoring checks folded into findasale-ops-cost-guard §E
-- (parse-confidence fallback rate, post-autosend-availability-race rate,
-- autosends-per-organizer-per-day, zero-threshold-eligible rate).
CREATE TABLE IF NOT EXISTS "MessageAutosendLog" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "itemId" TEXT,
    "category" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "parsedAmount" DECIMAL(10,2),
    "thresholdSource" TEXT,
    "messageTextSnippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAutosendLog_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "MessageAutosendLog" ADD CONSTRAINT "MessageAutosendLog_organizerId_fkey"
        FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "MessageAutosendLog" ADD CONSTRAINT "MessageAutosendLog_itemId_fkey"
        FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "MessageAutosendLog_organizerId_createdAt_idx" ON "MessageAutosendLog"("organizerId", "createdAt");
CREATE INDEX IF NOT EXISTS "MessageAutosendLog_itemId_idx" ON "MessageAutosendLog"("itemId");
CREATE INDEX IF NOT EXISTS "MessageAutosendLog_category_decision_idx" ON "MessageAutosendLog"("category", "decision");
