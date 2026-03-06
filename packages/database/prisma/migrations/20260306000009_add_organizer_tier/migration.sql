-- Phase 31: Add Organizer Tier Rewards system fields
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "tier" TEXT NOT NULL DEFAULT 'BRONZE';
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "tierUpdatedAt" TIMESTAMP(3);
