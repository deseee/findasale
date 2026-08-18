-- Migration: add_marketplace_job_platform_values
-- 2026-08-18 (S-CROSSLISTER-ESTATE-VERTICAL-RESEARCH batch 5) -- adds POSHMARK/MERCARI/VINTED/
-- GRAILED to the MarketplaceJobPlatform enum (previously FACEBOOK/CRAIGSLIST/GUMTREE_AU).
-- These were originally given to Patrick as raw `ALTER TYPE ... ADD VALUE` commands to run
-- directly against Railway (the documented Option B pattern for DDL-only changes, per the
-- dev-environment skill) -- correct for production, but that pattern skips CI's ephemeral test
-- database entirely, since CI only runs `prisma migrate deploy` (committed migration files), never
-- arbitrary DDL a human ran by hand. Converting this into a real migration file closes that CI-
-- parity gap so future tests that create a MarketplaceListingJob row for these platforms don't
-- silently pass in CI while the values are genuinely missing from any database CI actually uses.
-- Safe to run again if Patrick already applied the raw ALTER TYPE commands manually --
-- IF NOT EXISTS makes every statement idempotent.
ALTER TYPE "MarketplaceJobPlatform" ADD VALUE IF NOT EXISTS 'POSHMARK';
ALTER TYPE "MarketplaceJobPlatform" ADD VALUE IF NOT EXISTS 'MERCARI';
ALTER TYPE "MarketplaceJobPlatform" ADD VALUE IF NOT EXISTS 'VINTED';
ALTER TYPE "MarketplaceJobPlatform" ADD VALUE IF NOT EXISTS 'GRAILED';
