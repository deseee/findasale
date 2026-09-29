-- Extension Runtime Log (2026-09-29): observability for the browser extension's own
-- background-worker activity, which previously had NO server-side trace at all -- every
-- debugging session before this had to infer what the extension actually did indirectly
-- from PendingListingRemoval/MarketplaceListingJob row changes, with no way to see a real
-- outcome, error, or reason (surfaced by a real session unable to verify the Craigslist
-- Renew-All completion path any other way). Lightweight event log, not a message store --
-- see schema.prisma's own comment on ExtensionRuntimeLog for field-size/retention notes.
--
-- SAFETY: additive only. New table, no change to any existing table. No DROP.
--
-- Down migration (safe at any time -- nothing else depends on this table):
--   DROP TABLE "ExtensionRuntimeLog";

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExtensionRuntimeLog" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "platform" TEXT,
    "itemId" TEXT,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionRuntimeLog_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "ExtensionRuntimeLog" ADD CONSTRAINT "ExtensionRuntimeLog_organizerId_fkey"
        FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ExtensionRuntimeLog_organizerId_createdAt_idx" ON "ExtensionRuntimeLog"("organizerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ExtensionRuntimeLog_source_createdAt_idx" ON "ExtensionRuntimeLog"("source", "createdAt");
CREATE INDEX IF NOT EXISTS "ExtensionRuntimeLog_level_createdAt_idx" ON "ExtensionRuntimeLog"("level", "createdAt");
