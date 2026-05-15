-- Migration: add ebayStoreUrl to Organizer
-- Feature: eBay Store Link on Organizer Business Profile

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "ebayStoreUrl" TEXT;
