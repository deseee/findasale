-- ADR-020 follow-up (2026-07-08): generic platform Stripe Customer id on User.
--
-- Real `npx tsc --noEmit` run by Patrick natively (this VM's TypeScript install is
-- broken and could not catch this) found error TS2353 in
-- vendorBoothCartController.ts's createBoothCartQrSetupIntent -- the QR/in-app rail
-- reads/writes User.stripeCustomerId to reuse a shopper's platform Stripe Customer
-- across repeat booth-cart checkouts, but no such field existed on User. Deliberately
-- NOT reusing the existing User.huntPassStripeCustomerId column, which is scoped to
-- HuntPass SUBSCRIPTION billing -- mixing that Customer's metadata/webhook history
-- with one-off POS purchases would be a real correctness risk, not just a naming
-- nit.
--
-- Additive only. No destructive changes to any existing table.

ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

-- Rollback (manual):
--   ALTER TABLE "User" DROP COLUMN "stripeCustomerId";
