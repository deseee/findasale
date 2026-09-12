-- Cash-fee-debt recoupment column (2026-09-12, Stripe removal). Adds
-- Purchase.cashDebtCollectedAmount, the nullable third component of
-- platformFeeAmount (buyerPremiumAmount + commissionAmount + cashDebtCollectedAmount) that
-- records how much of a purchase's platform fee was debt recoupment against an organizer's
-- accrued Organizer.cashFeeBalance, replacing the Stripe on-demand-payout collection path
-- (payoutController.ts's now-removed createPayout). See schema.prisma's own comment on this
-- column, and cashFeeService.ts's applyCashDebtToAppFee/settleCashDebtCollection, for the
-- full rationale.
--
-- Purely additive, nullable, no backfill, no default -- every existing row and every future
-- purchase from an organizer with no cashFeeBalance owed is unaffected (NULL means "no debt
-- recoupment happened"). Hand-authored to match schema.prisma exactly -- `prisma migrate dev`
-- cannot run in this sandbox (packages/backend/node_modules/@prisma/client is a broken NTFS
-- junction here, confirmed recurring across prior sessions -- same posture as
-- 20260909170000_square_payment_link_columns). Applied for real via Patrick's own
-- `prisma migrate deploy` run against Railway.

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "cashDebtCollectedAmount" DOUBLE PRECISION;
