/**
 * Fees for a mixed cart split by the card gate (2026-11-06). Pure.
 *
 * Card portion: card rules -- the inclusive rate for the channel with the flat per-transaction minimum
 *   (calculateInclusiveCommissionCents; Patrick 2026-10-07: the flat minimum applies to card only).
 * Cash portion: the cash commission rate with NO minimum (cashFeeService.cashCommissionOn; Patrick 2026-10-07).
 *   The cash portion is FindA.Sale-recorded cash (the existing processCashSaleCore / pos-cash recording), not an
 *   off-platform sale: off-platform sales (OffPlatformSale) carry no fee at all (Patrick 2026-10-23) and are untouched.
 * 99-cent rule is applied by the gate itself (decideCardSplit) before this is called.
 */
import { calculateInclusiveCommissionCents, type PaymentChannel, type SubscriptionTier } from '../../utils/feeCalculator';

export interface SplitFees {
  cardAmountCents: number;
  cashAmountCents: number;
  cardPlatformFeeCents: number;
  cashCommissionCents: number;
  totalPlatformFeeCents: number;
}

export function computeCardCashSplitFees(params: {
  tier: SubscriptionTier;
  channel: PaymentChannel;
  cardAmountCents: number;
  cashAmountCents: number;
  /** cash commission rate as a fraction (cashFeeService.resolveCashCommissionRate); 0 for a referral discount. */
  cashRate: number;
  /** true while a referral discount is active: card fee is 0 as well (no minimum). */
  referralDiscountActive?: boolean;
}): SplitFees {
  const card = Math.max(0, Math.round(params.cardAmountCents));
  const cash = Math.max(0, Math.round(params.cashAmountCents));
  const cardPlatformFeeCents = params.referralDiscountActive ? 0 : calculateInclusiveCommissionCents(card, params.tier, params.channel);
  const cashCommissionCents = params.cashRate > 0 ? Math.round(cash * params.cashRate) : 0;
  return {
    cardAmountCents: card,
    cashAmountCents: cash,
    cardPlatformFeeCents,
    cashCommissionCents,
    totalPlatformFeeCents: cardPlatformFeeCents + cashCommissionCents,
  };
}
