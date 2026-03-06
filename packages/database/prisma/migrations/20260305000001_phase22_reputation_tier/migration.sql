-- Phase 22: Creator Tier Program
-- Add reputationTier, avgRating, totalReviews, totalSales to Organizer

ALTER TABLE "Organizer" ADD COLUMN "reputationTier" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "Organizer" ADD COLUMN "avgRating" DOUBLE PRECISION;
ALTER TABLE "Organizer" ADD COLUMN "totalReviews" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organizer" ADD COLUMN "totalSales" INTEGER NOT NULL DEFAULT 0;