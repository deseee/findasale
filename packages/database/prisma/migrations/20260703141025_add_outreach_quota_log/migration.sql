-- Outreach-only daily attempt counter, separate from EmailQuotaLog (platform-wide
-- Gmail-rail counter). Fixes OUTREACH_DAILY_CAP being silently consumed by ordinary
-- transactional email volume (found during 2026-07-03 deliverability health sweep).
CREATE TABLE "OutreachQuotaLog" (
  "date"      TEXT NOT NULL,
  "count"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutreachQuotaLog_pkey" PRIMARY KEY ("date")
);
