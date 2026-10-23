-- OrganizerAutoQueueLimit (2026-10-23): optional per-organizer auto queue test limits (max new listings per
-- autolist-queue response, and/or an explicit allowlist of the organizer's own item ids). No row = no limits.
--
-- SAFETY: additive. New table only; no existing table or data changes. Idempotent (IF NOT EXISTS).
-- No FK on purpose: schema.prisma models no relation (so every Organizer read is unaffected if this table is
-- missing), and a row left behind by a deleted organizer is never read.
-- ROLLBACK: DROP TABLE IF EXISTS "OrganizerAutoQueueLimit"; (code treats a missing table as "no limits").
CREATE TABLE IF NOT EXISTS "OrganizerAutoQueueLimit" (
  "organizerId" TEXT NOT NULL,
  "maxNewPerRun" INTEGER,
  "onlyItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizerAutoQueueLimit_pkey" PRIMARY KEY ("organizerId")
);
