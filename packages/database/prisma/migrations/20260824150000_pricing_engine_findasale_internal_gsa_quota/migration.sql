-- Pricing engine consolidation (2026-08-24): add the new findasaleInternal source row
-- and raise GSA's daily quota now that both adapters are live (see
-- claude_docs/feature-notes/pricing-engine-consolidation-adr-2026-08-24.md, Addendum 2 §3/§6
-- item 16). Pure data changes against an existing table -- no schema/column changes.

-- Seed: findasaleInternal (FindA.Sale's own confirmed-sold comps, tier 2). No external API
-- key or quota -- it queries our own database directly.
INSERT INTO "PricingSourceConfig"
  ("id", "sourceId", "enabled", "tier", "apiQuotaDaily", "apiUsedToday", "lastResetAt", "consecutiveFailures", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'findasaleInternal', TRUE, 2, NULL, 0, now(), 0, now(), now())
ON CONFLICT ("sourceId") DO NOTHING;

-- GSA Auctions API: confirmed real rate limit is 5,000 calls/day, 5 calls/5 seconds
-- (gsa.github.io/auctions_api docs). Raise the conservative initial seed of 100 to 500 --
-- still well under GSA's own cap, with headroom matching the Discogs-style pattern.
UPDATE "PricingSourceConfig" SET "apiQuotaDaily" = 500 WHERE "sourceId" = 'gsa';
