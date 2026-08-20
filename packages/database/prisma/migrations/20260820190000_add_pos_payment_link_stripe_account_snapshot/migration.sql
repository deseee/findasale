-- POSPaymentLink Stripe account + charge-type snapshot (2026-08-20)
--
-- WHY: POSPaymentLink never persisted which Stripe account its Payment Link was created
-- against -- the one model the 2026-08-18 HoldInvoice migration (stripeAccountId/chargeType)
-- didn't cover. Two maintenance paths (jobs/posStrandedSaleReconcileCron.ts,
-- services/posPaymentLinkRecorder.ts) re-derived the routing decision live via
-- shouldUseDirectCharge() against the organizer's CURRENT stripeConnectId -- wrong if the
-- organizer re-onboarded or the Direct-charges allowlist changed after the link was created.
-- Confirmed live in production: posStrandedSaleReconcileCron.ts's Stripe lookup for organizer
-- cmnxueoas0005tfv8brnc0kky's payment link failed with "No such payment link" because the
-- link lived on the connected account and the cron queried the platform account (fixed
-- separately in code this session; this migration removes the need to recompute at all going
-- forward). These columns pin what was actually used at link-creation time, mirroring
-- HoldInvoice.stripeAccountId/chargeType's and Purchase.chargeType's existing
-- DIRECT/DESTINATION vocabulary exactly.
--
-- SAFETY: additive and nullable only. No DROP, no ALTER of an existing column, no NOT NULL,
-- no DEFAULT, no backfill. Historical rows stay NULL, which every updated reader treats as
-- "unknown -- fall back to the existing (lossy) re-derivation", so existing-row behaviour is
-- unchanged. New rows are written with the real value going forward.

ALTER TABLE "POSPaymentLink" ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT;
ALTER TABLE "POSPaymentLink" ADD COLUMN IF NOT EXISTS "chargeType" TEXT;

CREATE INDEX IF NOT EXISTS "POSPaymentLink_stripeAccountId_idx" ON "POSPaymentLink"("stripeAccountId");
