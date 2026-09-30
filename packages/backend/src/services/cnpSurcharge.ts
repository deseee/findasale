/**
 * cnpSurcharge.ts -- pure integer-cents helpers for the POS card-not-present (CNP) surcharge
 * (2026-09-30). No I/O, no Prisma, so both the refund path and the receipt builders can share it.
 *
 * BACKGROUND: manualCardPayment (posPaymentController.ts) charges the buyer a surcharge of
 * 3.5% + $0.15 on top of the sale when the cashier keys a card by hand. Purchase.amount EXCLUDES it
 * (so it is never sale revenue and never platform-fee base) and Purchase.cnpSurchargeCents records
 * this row's share of it.
 *
 * DECISION (2026-09-30, card-network surcharge rules): a refund returns the surcharge in proportion
 * to the principal refunded. A full refund returns the full surcharge; a partial refund returns
 * surcharge * principalRefunded / cardPrincipal. Split-tender rows measure against the CARD leg
 * (amount - cashLegAmount), because the surcharge was only ever charged on the card portion and the
 * cash leg is handed back by hand.
 *
 * Cumulative by construction: the share for one refund is share(cumulative principal after it) minus
 * share(cumulative principal before it), where share() is one fixed rounding function of the
 * cumulative principal. So any sequence of partial refunds sums to exactly share(total principal),
 * and once the card principal is fully refunded the surcharge is fully refunded, never more.
 */

/** Buyer-facing label for the surcharge line on every receipt and refund message. */
export const CNP_FEE_LABEL = 'Card-not-present fee';

const toCents = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
};

const toWholeCents = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
};

/**
 * Surcharge cents refunded once `principalCents` of `cardPrincipalCents` has been refunded.
 * Round half up, integers only. 0 when there is no surcharge or no card principal; the full
 * surcharge once principalCents >= cardPrincipalCents.
 */
export function cnpSurchargeShareCents(surchargeCents: number, principalCents: number, cardPrincipalCents: number): number {
  const s = toWholeCents(surchargeCents);
  const c = toWholeCents(cardPrincipalCents);
  if (s <= 0 || c <= 0) return 0;
  const p = Math.min(c, toWholeCents(principalCents));
  if (p <= 0) return 0;
  if (p >= c) return s;
  return Math.min(s, Math.floor((2 * s * p + c) / (2 * c)));
}

export interface CnpSurchargeRefundShare {
  /** Surcharge cents to add to THIS refund. */
  thisShareCents: number;
  /** Surcharge cents already returned by earlier refunds. */
  priorShareCents: number;
  /** Surcharge cents returned once this refund lands. Never exceeds the surcharge. */
  cumulativeShareCents: number;
}

/**
 * Surcharge share of one refund. `priorPrincipalCents` is the card principal already refunded
 * before this refund and `thisPrincipalCents` the card principal this refund returns (both in
 * cents, card leg only).
 */
export function resolveCnpSurchargeRefund(args: {
  surchargeCents: number;
  cardPrincipalCents: number;
  priorPrincipalCents: number;
  thisPrincipalCents: number;
}): CnpSurchargeRefundShare {
  const prior = toWholeCents(args.priorPrincipalCents);
  const cumulativePrincipal = prior + toWholeCents(args.thisPrincipalCents);
  const priorShareCents = cnpSurchargeShareCents(args.surchargeCents, prior, args.cardPrincipalCents);
  const cumulativeShareCents = cnpSurchargeShareCents(args.surchargeCents, cumulativePrincipal, args.cardPrincipalCents);
  return { thisShareCents: Math.max(0, cumulativeShareCents - priorShareCents), priorShareCents, cumulativeShareCents };
}

export interface CnpPurchaseLike {
  amount: number;
  status?: string | null;
  cashLegAmount?: number | null;
  refundedAmount?: number | null;
  refundCashPortion?: number | null;
  cnpSurchargeCents?: number | null;
}

/** Card principal (cents) the processor captured for this row: amount minus any cash leg. */
export function cardPrincipalCentsOf(purchase: CnpPurchaseLike): number {
  return Math.max(0, toCents(purchase.amount) - toCents(purchase.cashLegAmount));
}

/** Card principal (cents) already refunded through the processor: refunded value minus the cash hand-back. */
export function refundedCardPrincipalCentsOf(purchase: CnpPurchaseLike): number {
  const refunded = Math.max(0, toCents(purchase.refundedAmount));
  const cashBack = Math.min(refunded, Math.max(0, toCents(purchase.refundCashPortion)));
  return Math.min(cardPrincipalCentsOf(purchase), refunded - cashBack);
}

/**
 * Surcharge cents refunded on a purchase so far (for receipts and history). A REFUNDED row has
 * returned all of it.
 */
export function refundedSurchargeCentsOf(purchase: CnpPurchaseLike): number {
  const surcharge = toWholeCents(purchase.cnpSurchargeCents);
  if (surcharge <= 0) return 0;
  if (purchase.status === 'REFUNDED') return surcharge;
  return cnpSurchargeShareCents(surcharge, refundedCardPrincipalCentsOf(purchase), cardPrincipalCentsOf(purchase));
}

/** Receipt-ready view of a purchase's surcharge, in dollars. Zeros when the row has no surcharge. */
export function cnpSurchargeReceiptFields(purchase: CnpPurchaseLike): {
  cnpSurchargeAmount: number;
  cnpSurchargeRefundedAmount: number;
} {
  const surcharge = toWholeCents(purchase.cnpSurchargeCents);
  return {
    cnpSurchargeAmount: surcharge / 100,
    cnpSurchargeRefundedAmount: refundedSurchargeCentsOf(purchase) / 100,
  };
}
