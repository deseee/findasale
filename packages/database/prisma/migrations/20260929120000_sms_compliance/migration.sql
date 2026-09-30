-- SMS compliance (2026-09-29): recorded consent, STOP suppression list, send log for daily caps.
-- Patrick applies manually (prisma migrate deploy / db execute).
--
-- SAFETY: additive only. Two new nullable columns on SaleSubscriber, two new tables, no DROP,
-- idempotent (safe to run twice). Existing SaleSubscriber rows keep smsConsentAt = NULL, which
-- means they will NOT be texted by POST /notifications/send-sms until the shopper re-subscribes
-- with the consent checkbox. That is intentional (no recorded consent = no marketing text).
--
-- Down migration (safe at any time; nothing else depends on these):
--   ALTER TABLE "SaleSubscriber" DROP COLUMN "smsConsentAt", DROP COLUMN "smsConsentSource";
--   DROP TABLE "SmsOptOut"; DROP TABLE "SmsSendLog";

ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "smsConsentAt" TIMESTAMP(3);
ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "smsConsentSource" TEXT;

CREATE TABLE IF NOT EXISTS "SmsOptOut" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'STOP_REPLY',
    "lastKeyword" TEXT,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsOptOut_phone_key" ON "SmsOptOut"("phone");

CREATE TABLE IF NOT EXISTS "SmsSendLog" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedOptOutCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SmsSendLog_organizerId_createdAt_idx" ON "SmsSendLog"("organizerId", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsSendLog_saleId_idx" ON "SmsSendLog"("saleId");
