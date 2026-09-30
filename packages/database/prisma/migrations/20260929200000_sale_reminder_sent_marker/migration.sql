-- Sale reminder sent marker (2026-09-29)
--
-- WHY: emailReminderJob runs hourly at :06 but the one-day window was 2 hours wide (a sale sat inside it
-- on two runs, so subscribers got duplicate emails, pushes and texts) and the two-hour window was only
-- 30 minutes wide (most sales fell between two runs and were missed). The windows are now wide enough
-- for hourly runs (day before: start in +23h..+25h, two hours: start in +1h..+3h) and this table makes
-- every reminder at-most-once per subscriber.
--
--   * SaleReminderSent -- one row per (subscriberId, saleId, kind), UNIQUE. The job inserts the row with
--     createMany(skipDuplicates) BEFORE sending; count 1 means "this run owns the send". If the send
--     fails the row is deleted so a later run inside the window can retry.
--   * kind: 'DAY_BEFORE' | 'TWO_HOURS' claim email + push. 'DAY_BEFORE_SMS' | 'TWO_HOURS_SMS' claim the
--     text separately: a text skipped for quiet hours writes NO row, so a later run can still send it,
--     while the email that already went out is not repeated.
--   * subscriberId FK -> SaleSubscriber ON DELETE CASCADE (sale delete cascades to subscribers).
--     saleId is a plain string (no FK) so this stays additive and touches no existing table.
--
-- SAFETY: additive only. One new table, no DROP, no data rewrite, no backfill. Fully idempotent: every
-- statement is guarded, so re-running is a no-op. Apply BEFORE deploying the code that reads it; the job
-- fails closed (sends nothing, logs an error) if the table is missing rather than risk duplicate sends.
--
-- Down migration (roll the code back first; the job needs the table):
--   DROP TABLE IF EXISTS "SaleReminderSent";

-- CreateTable
CREATE TABLE IF NOT EXISTS "SaleReminderSent" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReminderSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SaleReminderSent_subscriberId_saleId_kind_key" ON "SaleReminderSent"("subscriberId", "saleId", "kind");
CREATE INDEX IF NOT EXISTS "SaleReminderSent_saleId_idx" ON "SaleReminderSent"("saleId");

-- AddForeignKey (guarded: ADD CONSTRAINT has no IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SaleReminderSent_subscriberId_fkey'
  ) THEN
    ALTER TABLE "SaleReminderSent"
      ADD CONSTRAINT "SaleReminderSent_subscriberId_fkey"
      FOREIGN KEY ("subscriberId") REFERENCES "SaleSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
