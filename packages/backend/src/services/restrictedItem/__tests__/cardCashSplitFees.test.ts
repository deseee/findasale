/** Fees on a gate-split cart (2026-11-06): card part follows card rules (flat minimum), cash part has no minimum. */
import { computeCardCashSplitFees } from '../cardCashSplitFees';
import { calculateInclusiveCommissionCents, MINIMUM_TRANSACTION_FEE_CENTS } from '../../../utils/feeCalculator';

describe('computeCardCashSplitFees', () => {
  it('card part gets the inclusive rate with the flat minimum; cash part gets the cash rate with no minimum', () => {
    const f = computeCardCashSplitFees({ tier: 'PRO', channel: 'ONLINE', cardAmountCents: 500, cashAmountCents: 500, cashRate: 0.06 });
    expect(f.cardPlatformFeeCents).toBe(calculateInclusiveCommissionCents(500, 'PRO', 'ONLINE'));
    expect(f.cardPlatformFeeCents).toBe(MINIMUM_TRANSACTION_FEE_CENTS);
    expect(f.cashCommissionCents).toBe(30);
    expect(f.totalPlatformFeeCents).toBe(MINIMUM_TRANSACTION_FEE_CENTS + 30);
  });

  it('an all-cash split has no card fee at all (no minimum)', () => {
    const f = computeCardCashSplitFees({ tier: 'SIMPLE', channel: 'IN_PERSON', cardAmountCents: 0, cashAmountCents: 300, cashRate: 0.08 });
    expect(f.cardPlatformFeeCents).toBe(0);
    expect(f.cashCommissionCents).toBe(24);
  });

  it('a referral discount zeroes both parts', () => {
    const f = computeCardCashSplitFees({ tier: 'PRO', channel: 'ONLINE', cardAmountCents: 5000, cashAmountCents: 5000, cashRate: 0, referralDiscountActive: true });
    expect(f.totalPlatformFeeCents).toBe(0);
  });
});
