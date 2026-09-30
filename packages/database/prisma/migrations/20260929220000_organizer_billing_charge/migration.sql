-- Organizer subscription charge ledger (2026-09-29)
--
-- WHY: createSquareBillingSubscription used to store a card and grant PRO/TEAMS without charging, and
-- squareBillingChargeJob had no durable record of which billing periods were already paid, so a retry
-- or a catch-up run could not prove "this period is already COMPLETED". This table is that record.
--
--   * OrganizerBillingCharge -- one row per (organizerId, periodKey), UNIQUE. Claimed PENDING BEFORE
--     Square is called, then COMPLETED (squarePaymentId set) or FAILED (failureReason set).
--     COMPLETED is terminal: code never overwrites it with FAILED, and a retry that finds COMPLETED
--     applies the tier/period grant without charging again.
--   * organizerId is a plain string (no FK) so this stays additive and touches no existing table.
--
-- SAFETY: additive only. One new table, no DROP, no data rewrite, no backfill. Fully idempotent: every
-- statement is guarded, so re-running is a no-op. Apply BEFORE deploying the code that reads it; the
-- subscribe endpoint and the charge job fail CLOSED (no charge, no grant, error logged) if the table
-- is missing.
--
-- Down migration (roll the code back first; the endpoint and job need the table):
--   DROP TABLE IF EXISTS "OrganizerBillingCharge";

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrganizerBillingCharge" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "squarePaymentId" TEXT,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OrganizerBillingCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerBillingCharge_organizerId_periodKey_key" ON "OrganizerBillingCharge"("organizerId", "periodKey");
CREATE INDEX IF NOT EXISTS "OrganizerBillingCharge_organizerId_createdAt_idx" ON "OrganizerBillingCharge"("organizerId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrganizerBillingCharge_status_idx" ON "OrganizerBillingCharge"("status");
