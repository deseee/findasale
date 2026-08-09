-- r2-columns-2026-08-09.sql
-- ADDITIVE ONLY. Adds nullable R2-key columns. Does NOT touch or drop the
-- original esnMemberships/sourcesJson/scrapedMetadata JSON columns.
-- Run via: npx prisma db execute --stdin (see PowerShell block).

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "esnMembershipsR2Key" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "sourcesJsonR2Key" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "scrapedMetadataR2Key" TEXT;
