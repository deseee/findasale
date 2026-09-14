-- Booth-rent auto-pay, Square path (2026-09-14). Implements schema §5.1/§5.2 of
-- claude_docs/feature-notes/booth-rent-autopay-square-design-2026-09-13.md -- replaces the
-- permanently-dead Stripe SetupIntent-based booth-fee (rent) auto-pay flow with a Square
-- Shared-Card-on-File + direct-charge-on-the-hub-owner's-own-account design (see that doc's
-- §4 for the full architecture). Purely additive -- no column dropped, renamed, or made
-- NOT NULL without a default. Zero downtime. Hand-authored to match schema.prisma exactly --
-- `prisma migrate dev` cannot run in this sandbox (packages/backend/node_modules/@prisma/client
-- is a broken NTFS junction here, same recurring posture as 20260909170000_square_payment_link_columns
-- and 20260912000000_add_purchase_cash_debt_collected_amount). Applied for real via Patrick's
-- own `prisma migrate deploy` run against Railway.

-- ============================================================
-- Part A -- VendorBooth: Square analogs of the two Stripe fee-billing fields
-- (vendorStripeCustomerId/vendorPaymentMethodId), plus a cancellation-audit timestamp. See
-- schema.prisma's own comment on these columns for the full rationale.
-- ============================================================
ALTER TABLE "VendorBooth" ADD COLUMN "vendorSquarePlatformCustomerId" TEXT;
ALTER TABLE "VendorBooth" ADD COLUMN "vendorSquareCardId" TEXT;
ALTER TABLE "VendorBooth" ADD COLUMN "vendorSquareBillingCancelledAt" TIMESTAMP(3);

-- ============================================================
-- Part B -- VendorBoothFeeCharge: retry/dunning columns + the sweep's own index. The
-- Stripe-era cron had no retry logic at all -- see schema.prisma's own comment on these
-- columns for the exact semantics.
-- ============================================================
ALTER TABLE "VendorBoothFeeCharge" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VendorBoothFeeCharge" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "VendorBoothFeeCharge" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

CREATE INDEX "VendorBoothFeeCharge_nextRetryAt_idx" ON "VendorBoothFeeCharge" ("nextRetryAt");
