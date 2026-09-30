-- Crew Invasion per-member redemption (2026-09-29)
--
-- WHY: the redemption service consumed a code CREW-WIDE (CrewInvasionCode.usedAt), so the first
-- member to get an invoice used up the discount for the whole crew, contradicting the toast every
-- member receives ("one use each"). This table records one redemption per (code, member).
--
--   * CrewInvasionRedemption.activeKey -- UNIQUE "<codeId>:<userId>" while the redemption is live,
--     NULL once released. Same active-key pattern as ConsignorPayoutItem.activeItemKey: it makes a
--     double redeem impossible while letting a released redemption (unpaid invoice cancelled or
--     expired) be redeemed again. NULLs are distinct in Postgres, so released rows coexist.
--   * CrewInvasionRedemption.holdInvoiceId -- the discounted HoldInvoice (plain string, no FK) so
--     releaseInvoice / invoiceExpiryJob can restore the redemption.
--   * CrewInvasionCode.usedAt stays for compatibility and is no longer read as a gate.
--
-- SAFETY: additive only. One new table, no DROP, no data rewrite, no backfill (codes issued
-- before this migration have no redemption rows and are simply redeemable once per member).
-- Fully idempotent: every statement is guarded, so re-running is a no-op. Apply manually.
--
-- Down migration (safe at any time; the app tolerates the table being absent only if the
-- service is also rolled back, so roll the code back first):
--   DROP TABLE IF EXISTS "CrewInvasionRedemption";

-- CreateTable
CREATE TABLE IF NOT EXISTS "CrewInvasionRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "holdInvoiceId" TEXT,
    "activeKey" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "CrewInvasionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CrewInvasionRedemption_activeKey_key" ON "CrewInvasionRedemption"("activeKey");
CREATE INDEX IF NOT EXISTS "CrewInvasionRedemption_codeId_idx" ON "CrewInvasionRedemption"("codeId");
CREATE INDEX IF NOT EXISTS "CrewInvasionRedemption_userId_idx" ON "CrewInvasionRedemption"("userId");
CREATE INDEX IF NOT EXISTS "CrewInvasionRedemption_holdInvoiceId_idx" ON "CrewInvasionRedemption"("holdInvoiceId");

-- AddForeignKey (guarded: ADD CONSTRAINT has no IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CrewInvasionRedemption_codeId_fkey'
  ) THEN
    ALTER TABLE "CrewInvasionRedemption"
      ADD CONSTRAINT "CrewInvasionRedemption_codeId_fkey"
      FOREIGN KEY ("codeId") REFERENCES "CrewInvasionCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
