-- UspsZoneChartEntry (ADR-103 Phase 2): cache of real USPS zone-chart lookups keyed by
-- originZip3/destZip3 pair. Additive only, no changes to existing tables. Lazy-populated
-- -- no backfill needed, a missing row simply means coverageZoneForOrigin falls back to
-- the 8-band mileage approximation (see ebayRateEstimateService.ts).
CREATE TABLE IF NOT EXISTS "UspsZoneChartEntry" (
    "originZip3" TEXT NOT NULL,
    "destZip3" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UspsZoneChartEntry_pkey" PRIMARY KEY ("originZip3","destZip3")
);

CREATE INDEX IF NOT EXISTS "UspsZoneChartEntry_originZip3_idx" ON "UspsZoneChartEntry"("originZip3");
