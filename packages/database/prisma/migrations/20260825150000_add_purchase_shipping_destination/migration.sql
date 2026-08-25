-- ADR-110 Track 1: Purchase shipping destination (2026-08-25)
--
-- WHY: native (non-eBay) FindA.Sale checkout had no buyer shipping address anywhere in the
-- schema, so (a) the FedEx destination-ZIP surcharge could never be priced for real (the
-- checkout charge path had no ZIP to pass to the rate engine) and (b) an organizer had no
-- in-app way to know where to mail a sold item. These columns close both gaps. See
-- claude_docs/feature-notes/ADR-110-fedex-destination-zip-real-pricing.md Section 5/8.
--
-- SAFETY: additive and nullable only, same posture as the 20260817180000_purchase_fee_snapshot
-- precedent this mirrors. No DROP, no ALTER of an existing column, no NOT NULL. Every existing
-- row and every non-shipping Purchase (POS, vendor booth, auction pickup, Hold-to-Pay) leaves
-- these NULL forever -- populated going forward only by the native checkout flow once it
-- collects a real buyer ZIP.

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingAddressLine1" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingAddressLine2" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingCity" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingState" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingZip" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingCountry" TEXT DEFAULT 'US';
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shippingFedexSurchargeTier" TEXT;
