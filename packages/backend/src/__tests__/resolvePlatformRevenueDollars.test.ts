/**
 * resolvePlatformRevenueDollars (2026-10-12): admin revenue must reflect the app fee ACTUALLY SENT to Square
 * (Purchase.squareAppFeeSentCents, net of Square's processing cost, which the platform bears), scaled by the share
 * of the payment not refunded, and fall back to the gross fee snapshot only for legacy rows where it is NULL.
 */
import { resolvePlatformRevenueDollars, squareAppFeeNetOfProcessingCents } from '../utils/feeCalculator';

const AFTER = new Date('2026-10-12T00:00:00.000Z');

describe('resolvePlatformRevenueDollars with squareAppFeeSentCents', () => {
  it('uses the sent (net) fee, not the gross snapshot', () => {
    const gross = 468; // $4.68 inclusive fee on a $62.46 sale
    const sent = squareAppFeeNetOfProcessingCents(gross, 6246);
    const rev = resolvePlatformRevenueDollars(
      { amount: 62.46, commissionAmount: gross / 100, buyerPremiumAmount: 0, squareAppFeeSentCents: sent, status: 'PAID', createdAt: AFTER },
      'PRO'
    );
    expect(rev).toBeCloseTo(sent / 100, 5);
    expect(rev).toBeLessThan(gross / 100);
  });

  it('scales the sent fee down for a partial refund (Square refunds the app fee proportionally)', () => {
    const rev = resolvePlatformRevenueDollars(
      { amount: 100, commissionAmount: 7.5, squareAppFeeSentCents: 400, refundedAmount: 25, status: 'PAID', createdAt: AFTER },
      'PRO'
    );
    expect(rev).toBeCloseTo(3, 5); // 75% of $4.00
  });

  it('is zero for a fully refunded row, by status or by refundedAmount', () => {
    expect(resolvePlatformRevenueDollars({ amount: 100, squareAppFeeSentCents: 400, status: 'REFUNDED', createdAt: AFTER }, 'PRO')).toBe(0);
    expect(resolvePlatformRevenueDollars({ amount: 100, squareAppFeeSentCents: 400, refundedAmount: 100, status: 'PAID', createdAt: AFTER }, 'PRO')).toBe(0);
    expect(resolvePlatformRevenueDollars({ amount: 100, squareAppFeeSentCents: 400, refundedAmount: 150, status: 'PAID', createdAt: AFTER }, 'PRO')).toBe(0);
  });

  it('is zero (a real zero, not the legacy fallback) when the sent fee is 0', () => {
    expect(resolvePlatformRevenueDollars({ amount: 5, commissionAmount: 0.75, squareAppFeeSentCents: 0, status: 'PAID', createdAt: AFTER }, 'PRO')).toBe(0);
  });

  it('excludes cash-debt padding from revenue', () => {
    const rev = resolvePlatformRevenueDollars(
      { amount: 100, squareAppFeeSentCents: 400 + 150, cashDebtCollectedAmount: 1.5, status: 'PAID', createdAt: AFTER },
      'PRO'
    );
    expect(rev).toBeCloseTo(4, 5);
  });

  it('never goes negative', () => {
    expect(resolvePlatformRevenueDollars({ amount: 100, squareAppFeeSentCents: 100, cashDebtCollectedAmount: 5, status: 'PAID', createdAt: AFTER }, 'PRO')).toBe(0);
  });
});

describe('resolvePlatformRevenueDollars legacy fallback (squareAppFeeSentCents NULL)', () => {
  it('uses the gross snapshot when the sent fee is null or undefined', () => {
    expect(resolvePlatformRevenueDollars({ amount: 210, commissionAmount: 15.75, buyerPremiumAmount: 10, squareAppFeeSentCents: null, createdAt: AFTER }, 'PRO')).toBeCloseTo(25.75, 5);
    expect(resolvePlatformRevenueDollars({ amount: 210, commissionAmount: 15.75, buyerPremiumAmount: 10, createdAt: AFTER }, 'PRO')).toBeCloseTo(25.75, 5);
  });

  it('restates a row with no snapshot at the era rate when the sent fee is null', () => {
    expect(resolvePlatformRevenueDollars({ amount: 100, createdAt: AFTER, source: 'ONLINE', squareAppFeeSentCents: null }, 'SIMPLE')).toBeCloseTo(9.5, 5);
  });
});
