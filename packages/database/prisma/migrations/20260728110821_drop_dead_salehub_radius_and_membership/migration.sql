-- Sale Hubs geo-radius cleanup (ADR-014 follow-up): the pre-ADR-014
-- "Neighborhood Sale Day" geo-radius membership mechanism (SaleHub.radiusKm +
-- SaleHubMembership join table) was fully superseded by ADR-014's Flea Market
-- Events / VendorBooth model, which attaches to a hub directly via
-- VendorBooth.hubId with zero geo/distance logic. Confirmed this session:
-- radiusKm is never read to gate VendorBooth visibility or hub-join eligibility
-- for any hub, and SaleHubMembership has 0 rows in production (verified via a
-- direct Railway row-count check). Patrick approved removal after that
-- verification. Pure structural drop, no data migration needed.

-- Drop the now-fully-dead SaleHubMembership join table (0 rows in production).
DROP TABLE IF EXISTS "SaleHubMembership";

-- Drop the now-fully-dead SaleHub.radiusKm column (superseded by VendorBooth.hubId
-- direct attachment -- no distance/radius gating exists anywhere in the current
-- vendor-mall product).
ALTER TABLE "SaleHub" DROP COLUMN IF EXISTS "radiusKm";
