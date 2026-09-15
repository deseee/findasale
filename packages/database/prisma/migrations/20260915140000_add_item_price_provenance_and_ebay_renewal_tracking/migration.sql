-- Companion ADRs, 2026-09-15:
--   adr-markdown-cycle-ebay-price-sync-2026-09-15.md
--   adr-ebay-renewal-forecasting-2026-09-15.md
--
-- Additive only. Four nullable Item columns, no defaults, no backfill in this migration
-- (the renewal-anchor backfill is a separate one-time script per the forecasting ADR's
-- Migration Plan -- see scripts/backfillEbayRenewalAnchors.ts -- run manually after this
-- migration deploys, not part of the schema change itself).

-- --- Price-provenance pair (markdown-cycle-ebay-price-sync ADR) ---
-- priceUpdatedAt: stamped whenever FAS changes Item.price for a reason that should
-- propagate to eBay (markdown cron, organizer manual price edit).
-- ebayPriceSyncedAt: stamped when FAS's price is confirmed to match eBay's live offer
-- (successful outbound push, or a pull that found no difference). Together these guard
-- ebayListingSyncCron's pull-sync from clobbering an unpropagated local price change.
-- Both null on every existing row = "no known local change / not yet tracked by this
-- mechanism", which falls through to today's pull-only behavior -- zero behavior change
-- on deploy until the propagation code itself starts stamping these fields.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "priceUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebayPriceSyncedAt" TIMESTAMP(3);

-- --- Renewal-forecast pair (ebay-renewal-forecasting ADR) ---
-- ebayRenewalAnchorAt: effective origin timestamp for this listing's 30-day GTC renewal
-- cycle. Set only when a NEW ebayListingId is assigned (first push, or the self-heal
-- delete+recreate-offer path) -- never touched by in-place PUT-only edits.
-- ebayNextRenewalAt: precomputed forecast (next 30-day GTC boundary after the anchor),
-- recomputed nightly by ebayRenewalForecastCron.ts. Estimate only, not eBay-confirmed.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebayRenewalAnchorAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebayNextRenewalAt" TIMESTAMP(3);

-- Supports the forecast cron's and forecast endpoint's query pattern: AVAILABLE items
-- with an upcoming eBay GTC renewal date.
CREATE INDEX IF NOT EXISTS "Item_status_ebayNextRenewalAt_idx" ON "Item"("status", "ebayNextRenewalAt");
