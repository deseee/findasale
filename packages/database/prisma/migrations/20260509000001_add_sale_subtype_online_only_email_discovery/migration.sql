-- Migration: add_sale_subtype_online_only_email_discovery
-- Covers three pending schema additions:
--   1. emailDiscovery fields on Organizer (schema added S698, migration file never generated)
--   2. isOnlineOnly on Sale (Design S703 - wizard Online Only toggle)
--   3. saleSubtype on Sale (Design S703 - sale subtype variants)
-- All statements use IF NOT EXISTS to be safe if any column already exists in production.

-- Organizer: email discovery tracking
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "emailDiscoveryMethod" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "emailDiscoveryConfidence" DOUBLE PRECISION;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "emailDiscoveredAt" TIMESTAMP(3);

-- Sale: online-only flag
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "isOnlineOnly" BOOLEAN NOT NULL DEFAULT false;

-- Sale: subtype variant
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "saleSubtype" TEXT;
