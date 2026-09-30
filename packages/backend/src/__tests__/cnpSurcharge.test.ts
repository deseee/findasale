/**
 * Card-not-present surcharge helpers (services/cnpSurcharge.ts, 2026-09-30) and its allocation across
 * rows with cashFeeService.allocateCentsProportionally.
 *
 * Pure integer-cents math, no database. Run: pnpm --filter backend test -- cnpSurcharge
 *
 * WHAT THIS PROVES:
 *   - the share is proportional to the principal refunded, round half up, and exactly the whole
 *     surcharge once the card principal is fully refunded
 *   - a sequence of partial refunds sums to EXACTLY the surcharge, never more, for any split
 *   - refunds measured against the card leg on a split purchase
 *   - per-row allocation of the surcharge always sums to the surcharge charged
 *   - receipt fields report the surcharge and the refunded share
 */

import {
  cnpSurchargeShareCents,
  resolveCnpSurchargeRefund,
  refundedSurchargeCentsOf,
  cnpSurchargeReceiptFields,
  CNP_FEE_LABEL,
} from '../services/cnpSurcharge';
import { allocateCentsProportionally } from '../services/cashFeeService';

describe('cnpSurchargeShareCents', () => {
  it('is proportional to the principal refunded (round half up)', () => {
    expect(cnpSurchargeShareCents(365, 0, 10000)).toBe(0);
    expect(cnpSurchargeShareCents(365, 5000, 10000)).toBe(183); // 182.5 rounds up
    expect(cnpSurchargeShareCents(365, 3333, 10000)).toBe(122); // 121.65
    expect(cnpSurchargeShareCents(225, 3000, 6000)).toBe(113); // 112.5 rounds up
  });

  it('is the whole surcharge once the card principal is fully refunded, never more', () => {
    expect(cnpSurchargeShareCents(365, 10000, 10000)).toBe(365);
    expect(cnpSurchargeShareCents(365, 99999, 10000)).toBe(365);
  });

  it('is 0 with no surcharge or no card principal, and ignores junk input', () => {
    expect(cnpSurchargeShareCents(0, 5000, 10000)).toBe(0);
    expect(cnpSurchargeShareCents(365, 5000, 0)).toBe(0);
    expect(cnpSurchargeShareCents(NaN, 5000, 10000)).toBe(0);
    expect(cnpSurchargeShareCents(-5, 5000, 10000)).toBe(0);
  });
});

describe('resolveCnpSurchargeRefund, cumulative across partial refunds', () => {
  it('a full refund returns the full surcharge', () => {
    const r = resolveCnpSurchargeRefund({ surchargeCents: 365, cardPrincipalCents: 10000, priorPrincipalCents: 0, thisPrincipalCents: 10000 });
    expect(r).toEqual({ thisShareCents: 365, priorShareCents: 0, cumulativeShareCents: 365 });
  });

  it('two partial refunds: each gets its own share and they sum to the surcharge', () => {
    const first = resolveCnpSurchargeRefund({ surchargeCents: 365, cardPrincipalCents: 10000, priorPrincipalCents: 0, thisPrincipalCents: 3333 });
    expect(first.thisShareCents).toBe(122);
    const second = resolveCnpSurchargeRefund({ surchargeCents: 365, cardPrincipalCents: 10000, priorPrincipalCents: 3333, thisPrincipalCents: 6667 });
    expect(second.priorShareCents).toBe(122);
    expect(second.thisShareCents).toBe(243);
    expect(first.thisShareCents + second.thisShareCents).toBe(365);
  });

  it.each([
    [[10000]],
    [[5000, 5000]],
    [[1, 9999]],
    [[3333, 3333, 3334]],
    [[1, 1, 1, 9997]],
    [[2500, 2500, 2500, 2500]],
    [[9999, 1]],
    [[100, 200, 300, 400, 9000]],
  ])('any split %j sums to exactly the surcharge and never exceeds it at any step', (parts) => {
    for (const surcharge of [15, 100, 365, 1234, 4999]) {
      let prior = 0;
      let refundedSurcharge = 0;
      for (const p of parts) {
        const r = resolveCnpSurchargeRefund({ surchargeCents: surcharge, cardPrincipalCents: 10000, priorPrincipalCents: prior, thisPrincipalCents: p });
        expect(r.thisShareCents).toBeGreaterThanOrEqual(0);
        refundedSurcharge += r.thisShareCents;
        expect(refundedSurcharge).toBeLessThanOrEqual(surcharge);
        prior += p;
      }
      expect(refundedSurcharge).toBe(surcharge);
    }
  });

  it('a split purchase measures against the card leg: $30 of a $60 card leg returns half the surcharge', () => {
    const r = resolveCnpSurchargeRefund({ surchargeCents: 225, cardPrincipalCents: 6000, priorPrincipalCents: 0, thisPrincipalCents: 3000 });
    expect(r.thisShareCents).toBe(113);
  });

  it('is 0 for a purchase with no surcharge', () => {
    const r = resolveCnpSurchargeRefund({ surchargeCents: 0, cardPrincipalCents: 10000, priorPrincipalCents: 0, thisPrincipalCents: 10000 });
    expect(r).toEqual({ thisShareCents: 0, priorShareCents: 0, cumulativeShareCents: 0 });
  });
});

describe('surcharge allocation across rows (largest remainder)', () => {
  it.each([
    [365, [3334, 3333, 3333]],
    [365, [6000, 4000]],
    [225, [3600, 2400]],
    [15, [1, 1, 1]],
    [365, [1, 9999]],
    [1234, [777, 1, 5000, 4222]],
  ])('surcharge %s over card legs %j: rows sum EXACTLY to the surcharge', (surcharge, legs) => {
    const shares = allocateCentsProportionally(surcharge, legs);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(surcharge);
    shares.forEach((s, i) => {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      // within one cent of the exact proportional share
      const exact = (surcharge * legs[i]) / legs.reduce((a, b) => a + b, 0);
      expect(Math.abs(s - exact)).toBeLessThan(1);
    });
  });

  it('a row with no card leg (fully paid in cash) carries none of the surcharge', () => {
    expect(allocateCentsProportionally(225, [6000, 0])).toEqual([225, 0]);
  });

  it('per-row refunds then sum to the surcharge charged: two rows, each fully refunded', () => {
    const shares = allocateCentsProportionally(365, [3334, 6666]);
    let total = 0;
    for (let i = 0; i < shares.length; i++) {
      total += resolveCnpSurchargeRefund({ surchargeCents: shares[i], cardPrincipalCents: [3334, 6666][i], priorPrincipalCents: 0, thisPrincipalCents: [3334, 6666][i] }).thisShareCents;
    }
    expect(total).toBe(365);
  });
});

describe('receipt fields', () => {
  it('reports the surcharge and how much has been refunded', () => {
    const p = { amount: 100, cnpSurchargeCents: 365, status: 'PAID', refundedAmount: 50 };
    expect(cnpSurchargeReceiptFields(p)).toEqual({ cnpSurchargeAmount: 3.65, cnpSurchargeRefundedAmount: 1.83 });
  });

  it('a REFUNDED row has returned the whole surcharge', () => {
    expect(refundedSurchargeCentsOf({ amount: 100, cnpSurchargeCents: 365, status: 'REFUNDED', refundedAmount: 100 })).toBe(365);
  });

  it('split purchase: cash hand-back does not count toward the card principal', () => {
    // $100 sale, $40 cash, $60 card, surcharge 225; refunded $75 = $60 card + $15 cash by hand
    const p = { amount: 100, cashLegAmount: 40, cnpSurchargeCents: 225, status: 'PAID', refundedAmount: 75, refundCashPortion: 15 };
    expect(refundedSurchargeCentsOf(p)).toBe(225);
    // refunded $30, all card
    expect(refundedSurchargeCentsOf({ ...p, refundedAmount: 30, refundCashPortion: 0 })).toBe(113);
  });

  it('a purchase without a surcharge reports zeros', () => {
    expect(cnpSurchargeReceiptFields({ amount: 100, status: 'PAID' })).toEqual({ cnpSurchargeAmount: 0, cnpSurchargeRefundedAmount: 0 });
    expect(cnpSurchargeReceiptFields({ amount: 100, cnpSurchargeCents: 0, status: 'REFUNDED', refundedAmount: 100 })).toEqual({ cnpSurchargeAmount: 0, cnpSurchargeRefundedAmount: 0 });
  });

  it('the buyer-facing label is exactly "Card-not-present fee"', () => {
    expect(CNP_FEE_LABEL).toBe('Card-not-present fee');
  });
});
