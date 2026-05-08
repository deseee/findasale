-- Migration: 20260508000002_email_discovery_fields
-- Adds email discovery tracking fields to Organizer model

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "emailDiscoveryMethod" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "emailDiscoveryConfidence" DOUBLE PRECISION;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "emailDiscoveredAt" TIMESTAMP(3);
