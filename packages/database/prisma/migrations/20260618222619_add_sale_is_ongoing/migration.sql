-- Permanent-storefront model (RETAIL): add isOngoing flag.
-- isOngoing=true means the sale never expires and is always treated as current/live
-- in discovery, feeds, search, and sitemap. endDate stays a normal value (no sentinel).
ALTER TABLE "Sale" ADD COLUMN "isOngoing" BOOLEAN NOT NULL DEFAULT false;
