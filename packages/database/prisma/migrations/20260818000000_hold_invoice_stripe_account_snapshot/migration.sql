-- HoldInvoice Stripe account + charge-type snapshot (2026-08-18)
--
-- WHY: HoldInvoice never persisted which Stripe account its Checkout Session was created
-- against. Every maintenance path (utils/expireCheckoutSession.ts,
-- services/holdInvoicePaymentRecorder.ts, controllers/stripeController.ts charge.failed,
-- jobs/invoiceExpiryJob.ts, jobs/deadInvoicePaidSweepJob.ts) re-derived it from
-- `event.account` (absent on non-Connect webhook deliveries) or the organizer's CURRENT
-- `stripeConnectId` (wrong if the organizer re-onboarded, or the Direct-charges allowlist
-- changed, after the session was originally created). These columns pin what was actually
-- used at checkout-session-creation time, mirroring Purchase.chargeType /
-- Purchase.stripeAccountId's existing DIRECT/DESTINATION vocabulary.
--
-- SAFETY: additive and nullable only. No DROP, no ALTER of an existing column, no NOT NULL,
-- no DEFAULT, no backfill. Historical rows stay NULL, which every updated reader treats as
-- "unknown -- fall back to the existing (lossy) re-derivation", so existing-row behaviour is
-- unchanged. New rows are written with the real value going forward.

ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "chargeType" TEXT;

CREATE INDEX IF NOT EXISTS "HoldInvoice_stripeAccountId_idx" ON "HoldInvoice"("stripeAccountId");
