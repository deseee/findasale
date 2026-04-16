-- Feature #75: eBay Push Quota Tracking
-- Add ebayPushesThisMonth and ebayPushesResetAt fields to Organizer model

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "ebayPushesThisMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "ebayPushesResetAt" TIMESTAMP(3);
