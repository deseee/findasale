-- Pricing engine: add the new Etsy adapter's PricingSourceConfig row (2026-08-25).
-- Etsy Open API v3 (openapi.etsy.com/v3/application/listings/active) -- researched and built
-- this session as a new lead not in the original pricing-engine-consolidation ADR. Covers
-- Collectibles/Art/Jewelry/Glassware/Cast Iron/Clothing -- categories where Etsy's marketplace
-- is a stronger comp than a plain eBay title search. Pure data change against an existing
-- table -- no schema/column changes.
--
-- enabled=TRUE from day one, matching the GSA/Discogs pattern: this is safe even with no
-- ETSY_API_KEY set yet, because EtsyAdapter.isConfigured() (unlike GSA's DEMO_KEY fallback)
-- strictly requires the env var -- the orchestrator/registry already skip any adapter where
-- isConfigured() is false, so this row does nothing until Patrick sets ETSY_API_KEY in Railway.
--
-- apiQuotaDaily=2000: conservative initial seed against Etsy's real confirmed limit of
-- 10,000 requests/day (rolling 24h window) + 10 QPS -- same "start conservative, raise later"
-- pattern used for GSA's quota bump earlier this session.
INSERT INTO "PricingSourceConfig"
  ("id", "sourceId", "enabled", "tier", "apiQuotaDaily", "apiUsedToday", "lastResetAt", "consecutiveFailures", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'etsy', TRUE, 1, 2000, 0, now(), 0, now(), now())
ON CONFLICT ("sourceId") DO NOTHING;
