-- Routing fallback (2026-08-16): make the eBay policy-routing last resort an explicit
-- organizer choice instead of an implicit fall-through to EbayConnection.fulfillmentPolicyId.
-- Additive and backfill-safe: every existing row gets 'CALCULATED', which reproduces the
-- product's intended default behaviour (eBay computes the real rate at checkout).
ALTER TABLE "EbayPolicyMapping"
  ADD COLUMN IF NOT EXISTS "fallbackStrategy" TEXT NOT NULL DEFAULT 'CALCULATED';
