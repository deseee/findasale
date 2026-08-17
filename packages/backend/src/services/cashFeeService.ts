import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';

/**
 * ── CASH / OFF-PLATFORM COMMISSION ACCRUAL ───────────────────────────────────────────────
 *
 * FindA.Sale charges the organizer commission (10% SIMPLE / 8% PRO+TEAMS -- see
 * utils/feeCalculator.ts, the source of truth) on EVERY sale, including sales the platform's
 * Stripe account never touches. On a card sale Stripe collects that commission for us as
 * `application_fee_amount`. On a CASH / in-person sale the organizer physically pockets the
 * whole amount, so there is nothing for Stripe to take a cut of -- the commission instead
 * accrues to `Organizer.cashFeeBalance` and is netted out of their next Stripe payout
 * (controllers/payoutController.ts: deducted at `requestPayout`, the payout is refused when
 * the balance exceeds it, and the balance is zeroed once the payout succeeds).
 *
 * WHY THIS FILE EXISTS (2026-08-17): that accrual was implemented INLINE inside
 * terminalController.processCashSaleCore and nowhere else. The markSold settlement router's
 * RECORD mode (controllers/reservationController.ts) -- the OTHER cash path, and the one an
 * organizer reaches from the holds screen -- wrote `platformFeeAmount: 0` on the Purchase and
 * never touched `cashFeeBalance` at all, so FindA.Sale earned exactly nothing on every cash
 * sale settled that way. Two implementations of "what does a cash sale owe" could not stay in
 * sync because there was only ever one. Now there is one, here, and both call it.
 *
 * DO NOT hardcode 0.10 (or any rate) at a call site. Resolve it through
 * `resolveCashCommissionRate` so a cash sale is charged the same way a card sale in the same
 * controller is.
 */

/**
 * Prisma v5: `prisma` is $extends-wrapped, so the client handed to an interactive
 * `$transaction(cb)` callback is the EXTENDED transaction flavour, which is not assignable to
 * the plain `Prisma.TransactionClient`. Accept either -- same pattern and same reasoning as
 * services/itemStockService.ts's `SellItemUnitsTx`.
 */
export type CashFeeClient =
  | Prisma.TransactionClient
  | Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/** Round to cents. Money is stored as Float on Purchase/Organizer; never let a rate product
 *  reach the database at full binary precision. */
export const roundMoney = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** The organizer fields the rate resolution needs. Both are already selected by
 *  `utils/posAuth.resolveOrganizerOrTeamMember` and present on a full Organizer row. */
export interface CashCommissionOrganizer {
  subscriptionTier: string | null;
  /** Optional: callers that did not select it simply get no referral discount applied, which
   *  is the pre-existing behaviour of the Terminal cash path. */
  referralDiscountExpiry?: Date | null;
}

/**
 * THE rate a cash / off-platform sale is charged at, resolved exactly the way every other
 * charge path in this codebase resolves it:
 *
 *   1. An active referral discount zeroes the commission (mirrors terminalController's card
 *      path, `hasReferralDiscount ? 0 : baseFeeRate`).
 *   2. Otherwise the global `FeeStructure` override row (`listingType: '*'`), which is the
 *      established convention shared by stripeController.createPaymentIntent,
 *      terminalController (card AND cash), jobs/auctionJob and
 *      services/nativeShippingSuggestionService.
 *   3. Otherwise the organizer's tier rate from utils/feeCalculator.
 *
 * NOTE FOR REVIEW, not a bug introduced here: every `FeeStructure` row in production today has
 * `listingType='*'` and `feeRate=0.1`, so step 2 currently pins EVERY organizer -- PRO and
 * TEAMS included -- to the 10% SIMPLE rate on every path listed above, not just this one.
 * That is a platform-wide question about whether the FeeStructure override should still
 * outrank the tier rate; it is deliberately NOT changed here, because changing it would
 * silently re-price every charge path at once. Flagged, not fixed.
 */
export async function resolveCashCommissionRate(
  organizer: CashCommissionOrganizer,
  tx?: CashFeeClient
): Promise<number> {
  const hasReferralDiscount =
    organizer.referralDiscountExpiry != null && organizer.referralDiscountExpiry > new Date();
  if (hasReferralDiscount) return 0;

  const client: Prisma.TransactionClient = (tx ?? prisma) as Prisma.TransactionClient;
  const feeStructure = await client.feeStructure.findFirst({ where: { listingType: '*' } });
  return feeStructure?.feeRate ?? getPlatformFeeRate(organizer.subscriptionTier as SubscriptionTier);
}

/** The commission owed on one line's amount, in dollars, rounded to cents. */
export const cashCommissionOn = (amount: number, rate: number): number =>
  roundMoney((Number(amount) || 0) * rate);

/**
 * Add `commission` dollars to the organizer's running cash-fee balance and stamp the
 * "as of" timestamp payoutController's 30-day staleness warning reads.
 *
 * Pass the transaction client when the caller is inside one: the accrual then commits or rolls
 * back atomically with the Purchase rows it belongs to, so a failed settlement can never leave
 * a debt behind for a sale that was not recorded.
 *
 * Returns the amount actually accrued (0 when the commission rounds to nothing, e.g. a $0 item
 * or an active referral discount) so callers can report the real number back to the organizer
 * rather than re-deriving it.
 */
export async function accrueCashFeeBalance(params: {
  organizerId: string;
  commission: number;
  tx?: CashFeeClient;
}): Promise<number> {
  const accrued = roundMoney(params.commission);
  if (!(accrued > 0)) return 0;

  const client: Prisma.TransactionClient = (params.tx ?? prisma) as Prisma.TransactionClient;
  await client.organizer.update({
    where: { id: params.organizerId },
    data: {
      cashFeeBalance: { increment: accrued },
      cashFeeBalanceUpdatedAt: new Date(),
    },
  });
  return accrued;
}
