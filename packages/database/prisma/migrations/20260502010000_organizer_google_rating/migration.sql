-- Migration: 20260502010000_organizer_google_rating
-- Adds Google Places rating fields to Organizer model (ADR-073 Phase 2)
-- Populated by enrichment.ts after Google Places Details API lookup

ALTER TABLE "Organizer" ADD COLUMN "googleRating" DECIMAL(3,1);
ALTER TABLE "Organizer" ADD COLUMN "googleRatingCount" INTEGER;
