-- ADR-103 Phase 5 (2026-09-03): persisted, zone-independent carrier-surcharge risk tier
-- for Item, computed by classifyPackageSurchargeTrigger() from package dims/weight/type.
-- Purely additive -- nullable, no default, no data migration needed. null = safe (no known
-- carrier oversize surcharge risk). Values written by the app: 'AHS' | 'LARGE_PACKAGE' |
-- 'USPS_NONSTANDARD'. Not a dollar amount -- that stays computed live, per-organizer-zone,
-- by computeSurchargeForCarrier() in ebayRateEstimateService.ts and is never stored.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "shippingMarginRiskTier" TEXT;

-- Lets an organizer/admin "listings at risk of eating margin on shipping" view query
-- WHERE "shippingMarginRiskTier" IS NOT NULL without a full table scan.
CREATE INDEX IF NOT EXISTS "Item_shippingMarginRiskTier_idx" ON "Item"("shippingMarginRiskTier");
