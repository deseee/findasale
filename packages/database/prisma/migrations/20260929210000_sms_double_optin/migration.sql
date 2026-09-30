-- SMS double opt-in, consent evidence, reservation accounting, email opt-out (2026-09-29)
--
-- WHY:
--   * SaleSubscriber: subscribing with a phone number no longer records consent on the spot (any
--     account could "consent" for any number). It now sets smsConsentPendingAt and sends ONE confirmation
--     text; smsConsentAt is only set when that number replies YES/START. smsConsentIp /
--     smsConsentUserAgent / smsConsentVersion are the consent evidence captured at submit time.
--   * SaleSubscriber.emailOptOutAt: the "stop sale reminders" email link opts a subscriber's rows out
--     of reminder EMAIL only.
--   * SmsSendLog.status / completedAt: bulk sends insert a RESERVED row (sentCount = allowed sends)
--     before sending and reconcile it to COMPLETE afterwards, so the rolling daily cap cannot be
--     undercounted by a crash or a second server process.
--
-- SAFETY: additive only. Nullable columns (plus one NOT NULL column with a default), no DROP, no data
-- rewrite. Every statement is idempotent (IF NOT EXISTS), safe to run twice. Existing SaleSubscriber rows
-- keep their current consent state; existing SmsSendLog rows become status COMPLETE via the default.
-- Apply BEFORE deploying the code that reads/writes these columns (the reminder job and the subscribe
-- endpoint select them; a missing column makes the reminder run send nothing and log an error).
--
-- Down migration (roll the code back first):
--   DROP INDEX IF EXISTS "SmsSendLog_organizerId_status_idx";
--   DROP INDEX IF EXISTS "SaleSubscriber_phone_idx";
--   ALTER TABLE "SmsSendLog" DROP COLUMN IF EXISTS "completedAt", DROP COLUMN IF EXISTS "status";
--   ALTER TABLE "SaleSubscriber"
--     DROP COLUMN IF EXISTS "emailOptOutAt",
--     DROP COLUMN IF EXISTS "smsConsentVersion",
--     DROP COLUMN IF EXISTS "smsConsentUserAgent",
--     DROP COLUMN IF EXISTS "smsConsentIp",
--     DROP COLUMN IF EXISTS "smsConsentPendingAt";

ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "smsConsentPendingAt" TIMESTAMP(3);
ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "smsConsentIp" TEXT;
ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "smsConsentUserAgent" TEXT;
ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "smsConsentVersion" TEXT;
ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "emailOptOutAt" TIMESTAMP(3);

ALTER TABLE "SmsSendLog" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'COMPLETE';
ALTER TABLE "SmsSendLog" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- Inbound STOP / YES look rows up by phone (the existing unique index leads with saleId).
CREATE INDEX IF NOT EXISTS "SaleSubscriber_phone_idx" ON "SaleSubscriber"("phone");
CREATE INDEX IF NOT EXISTS "SmsSendLog_organizerId_status_idx" ON "SmsSendLog"("organizerId", "status");
