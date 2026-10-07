/**
 * Split-tender ledger + validation helpers (services/cashFeeService.ts, 2026-09-29).
 *
 * NOT EXECUTED when written: the dev machine had no working jest/tsc (disk full), so this suite
 * was authored against the source by reading it. Run it before merging:
 *   pnpm --filter backend test -- posSplitTenderLedger
 *
 * Unlike posManualCardPayment.test.ts this suite hits NO database: ../lib/prisma is replaced by
 * a plain object of jest.fn()s (the $transaction mock just runs the callback against that same
 * object), so it only exercises cashFeeService's own logic.
 *
 * Covers:
 *   - isValidCents / validateSplitTender: integer cents, bounds, EXACT cash + card = total
 *   - cardLegProblem: $0.50 minimum card leg and the app-fee ceiling
 *   - allocateCentsProportionally: always sums exactly to the total
 *   - resolveSplitRefund: card-first processor refund, cash-by-hand remainder + message
 *   - accrueCashFeeOnce: exactly-once (duplicate ledger row -> no balance increment)
 *   - accrueSplitCashLegOnce: IN_PERSON tier rate, no flat floor on cash, referral discount = no accrual
 *   - wouldExceedCashFeeExposureCap: pending split cash counts toward the cap
 *   - getPendingSplitCashCommission: paid-and-accrued links are not double counted
 */

jest.mock('../lib/prisma', () => {
  const p: any = {
    organizer: { findUnique: jest.fn(), update: jest.fn() },
    pOSPaymentRequest: { findMany: jest.fn() },
    pOSPaymentLink: { findMany: jest.fn() },
    cashFeeAccrual: { createMany: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  return { prisma: p };
});

import { prisma } from '../lib/prisma';
import {
  MAX_POS_AMOUNT_CENTS,
  MIN_SPLIT_CARD_LEG_CENTS,
  isValidCents,
  validateSplitTender,
  cardLegProblem,
  allocateCentsProportionally,
  resolveSplitRefund,
  accrueCashFeeOnce,
  accrueSplitCashLegOnce,
  wouldExceedCashFeeExposureCap,
  getPendingSplitCashCommission,
} from '../services/cashFeeService';

const db: any = prisma;

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  db.organizer.update.mockResolvedValue({});
  db.pOSPaymentRequest.findMany.mockResolvedValue([]);
  db.pOSPaymentLink.findMany.mockResolvedValue([]);
  db.cashFeeAccrual.findMany.mockResolvedValue([]);
});

describe('isValidCents', () => {
  it('accepts whole positive cents up to the bound', () => {
    expect(isValidCents(1)).toBe(true);
    expect(isValidCents(MAX_POS_AMOUNT_CENTS)).toBe(true);
  });
  it('rejects fractions, zero, negatives, NaN, strings and over-bound values', () => {
    expect(isValidCents(10.5)).toBe(false);
    expect(isValidCents(0)).toBe(false);
    expect(isValidCents(-100)).toBe(false);
    expect(isValidCents(NaN)).toBe(false);
    expect(isValidCents(Infinity)).toBe(false);
    expect(isValidCents('500')).toBe(false);
    expect(isValidCents(null)).toBe(false);
    expect(isValidCents(MAX_POS_AMOUNT_CENTS + 1)).toBe(false);
  });
});

describe('validateSplitTender', () => {
  it('accepts an exact split', () => {
    expect(validateSplitTender({ totalCents: 10000, cashCents: 4000, cardCents: 6000 })).toEqual({ ok: true });
  });
  it('rejects a one-cent discrepancy (no tolerance)', () => {
    const r = validateSplitTender({ totalCents: 10000, cashCents: 4000, cardCents: 6001 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.code).toBe('SPLIT_SUM_MISMATCH');
    }
  });
  it('rejects non-integer, zero and oversized legs with INVALID_SPLIT_AMOUNT', () => {
    for (const bad of [
      { totalCents: 1000, cashCents: 400.5, cardCents: 599.5 },
      { totalCents: 1000, cashCents: 0, cardCents: 1000 },
      { totalCents: 1000, cashCents: -1, cardCents: 1001 },
      { totalCents: MAX_POS_AMOUNT_CENTS + 2, cashCents: 1, cardCents: MAX_POS_AMOUNT_CENTS + 1 },
    ]) {
      const r = validateSplitTender(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_SPLIT_AMOUNT');
    }
  });
});

describe('cardLegProblem', () => {
  it('blocks a card leg below the minimum', () => {
    expect(cardLegProblem({ cardCents: MIN_SPLIT_CARD_LEG_CENTS - 1, appFeeCents: 0, isSplit: true })).toMatch(/minimum/);
  });
  it('allows exactly the minimum when the fee fits', () => {
    expect(cardLegProblem({ cardCents: MIN_SPLIT_CARD_LEG_CENTS, appFeeCents: 0, isSplit: false })).toBeNull();
  });
  it('blocks when the platform fee would be almost the whole card leg', () => {
    // $0.75 minimum fee on a $0.80 card leg
    expect(cardLegProblem({ cardCents: 80, appFeeCents: 75, isSplit: true })).toMatch(/minimum platform fee/);
  });
  it('allows a normal split', () => {
    expect(cardLegProblem({ cardCents: 6000, appFeeCents: 480, isSplit: true })).toBeNull();
  });
  it('suggests the right way out for split vs non-split', () => {
    expect(cardLegProblem({ cardCents: 10, appFeeCents: 0, isSplit: true })).toMatch(/more of this sale in cash/);
    expect(cardLegProblem({ cardCents: 10, appFeeCents: 0, isSplit: false })).toMatch(/Take this sale in cash/);
  });
});

describe('allocateCentsProportionally', () => {
  it('sums exactly to the total', () => {
    const shares = allocateCentsProportionally(1000, [333, 333, 334]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it('sums exactly for awkward remainders and never goes negative', () => {
    const shares = allocateCentsProportionally(1, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1);
    expect(shares.every((s) => s >= 0)).toBe(true);
  });
  it('returns zeros when there is nothing to allocate', () => {
    expect(allocateCentsProportionally(0, [100, 200])).toEqual([0, 0]);
    expect(allocateCentsProportionally(500, [0, 0])).toEqual([0, 0]);
  });
  it('is proportional for a simple case', () => {
    expect(allocateCentsProportionally(400, [100, 300])).toEqual([100, 300]);
  });

  // Largest-remainder method (money review P2): the leftover cents go to the rows with the biggest
  // fractional part, not to whichever row happens to be first or last.
  it('hands leftover cents to the largest remainders, not to a fixed row', () => {
    // exact shares 3.33, 3.33, 3.33 -> one leftover cent, all remainders tie -> the largest weight/earliest row
    expect(allocateCentsProportionally(10, [1, 1, 1])).toEqual([4, 3, 3]);
    // exact shares 0.6, 0.3, 0.1 of 1 cent: the 0.6 row gets it
    expect(allocateCentsProportionally(1, [6, 3, 1])).toEqual([1, 0, 0]);
    // exact shares 6.1, 6.9, 7.0 of 20: floors sum to 19, the one leftover cent goes to the .9 remainder (row 1)
    expect(allocateCentsProportionally(20, [61, 69, 70])).toEqual([6, 7, 7]);
  });
  it('a zero-weight row never receives cents', () => {
    expect(allocateCentsProportionally(7, [0, 1, 1])).toEqual([0, 4, 3]);
  });
  it('keeps the total when the total exceeds what weights alone would explain (discounted cart)', () => {
    expect(allocateCentsProportionally(9000, [5000, 5000])).toEqual([4500, 4500]);
    expect(allocateCentsProportionally(8999, [5000, 5000]).reduce((a, b) => a + b, 0)).toBe(8999);
  });

  // Randomized invariant test with a fixed seed (deterministic in CI): for many random totals and
  // weight vectors, the shares are non-negative integers, sum EXACTLY to the total, never differ from
  // the exact proportional share by a whole cent or more, and a zero-weight row gets nothing.
  it('holds the allocation invariants over 5000 random cases', () => {
    let seed = 20260929;
    const rand = () => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    for (let n = 0; n < 5000; n++) {
      const rows = int(1, 12);
      const weights = Array.from({ length: rows }, () => (rand() < 0.15 ? 0 : int(1, 500000)));
      const total = int(0, 2000000);
      const shares = allocateCentsProportionally(total, weights);
      const sumW = weights.reduce((a, b) => a + b, 0);
      expect(shares).toHaveLength(rows);
      expect(shares.every((s) => Number.isInteger(s) && s >= 0)).toBe(true);
      if (total > 0 && sumW > 0) {
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        shares.forEach((s, i) => {
          const exact = (total * weights[i]) / sumW;
          expect(Math.abs(s - exact)).toBeLessThan(1);
          if (weights[i] === 0) expect(s).toBe(0);
        });
      } else {
        expect(shares.every((s) => s === 0)).toBe(true);
      }
    }
  });
});

describe('resolveSplitRefund', () => {
  it('passes a non-split purchase straight through', () => {
    const r = resolveSplitRefund({ amount: 100, cashLegAmount: null }, 40);
    expect(r).toMatchObject({ isSplit: false, processorRefundAmount: 40, cashPortionToRefundByHand: 0, message: null });
  });
  it('refunds a partial that fits inside the card leg entirely to the card', () => {
    const r = resolveSplitRefund({ amount: 100, cashLegAmount: 40 }, 50);
    expect(r.isSplit).toBe(true);
    expect(r.cardCollectedAmount).toBe(60);
    expect(r.processorRefundAmount).toBe(50);
    expect(r.cashPortionToRefundByHand).toBe(0);
    expect(r.message).toBeNull();
  });
  it('caps the processor refund at the card leg and reports the cash to hand back on a full refund', () => {
    const r = resolveSplitRefund({ amount: 100, cashLegAmount: 40 }, 100);
    expect(r.processorRefundAmount).toBe(60);
    expect(r.cashPortionToRefundByHand).toBe(40);
    expect(r.message).toContain('Cash portion to refund by hand: $40.00');
    expect(r.message).toContain('$60.00 was refunded to the card');
  });
  it('handles a refund that only partly reaches into the cash leg', () => {
    const r = resolveSplitRefund({ amount: 100, cashLegAmount: 40 }, 75);
    expect(r.processorRefundAmount).toBe(60);
    expect(r.cashPortionToRefundByHand).toBe(15);
  });
  it('never asks the processor for more than it captured (no float drift)', () => {
    const r = resolveSplitRefund({ amount: 33.33, cashLegAmount: 11.11 }, 33.33);
    expect(r.processorRefundAmount + r.cashPortionToRefundByHand).toBeCloseTo(33.33, 2);
    expect(r.processorRefundAmount).toBeLessThanOrEqual(22.22);
  });
});

describe('accrueCashFeeOnce', () => {
  const base = {
    organizerId: 'org1',
    sourceType: 'POS_PAYMENT_REQUEST' as const,
    sourceId: 'req1',
    cashAmountCents: 4000,
    commission: 3.2,
  };

  it('writes the ledger row and increments the balance on first call', async () => {
    db.cashFeeAccrual.createMany.mockResolvedValue({ count: 1 });
    const r = await accrueCashFeeOnce(base);
    expect(r).toEqual({ accrued: 3.2, duplicate: false });
    expect(db.cashFeeAccrual.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true, data: [expect.objectContaining({ commissionCents: 320, sourceId: 'req1' })] })
    );
    expect(db.organizer.update).toHaveBeenCalledTimes(1);
    expect(db.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 3.2 });
  });

  it('does NOT increment the balance when the ledger row already exists (replay)', async () => {
    db.cashFeeAccrual.createMany.mockResolvedValue({ count: 0 });
    const r = await accrueCashFeeOnce(base);
    expect(r).toEqual({ accrued: 0, duplicate: true });
    expect(db.organizer.update).not.toHaveBeenCalled();
  });

  it('records nothing for a zero commission (referral discount)', async () => {
    const r = await accrueCashFeeOnce({ ...base, commission: 0 });
    expect(r).toEqual({ accrued: 0, duplicate: false });
    expect(db.cashFeeAccrual.createMany).not.toHaveBeenCalled();
    expect(db.organizer.update).not.toHaveBeenCalled();
  });

  it('runs inside the caller transaction when tx is passed (no nested $transaction)', async () => {
    const tx: any = {
      cashFeeAccrual: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      organizer: { update: jest.fn().mockResolvedValue({}) },
    };
    await accrueCashFeeOnce({ ...base, tx });
    expect(tx.cashFeeAccrual.createMany).toHaveBeenCalledTimes(1);
    expect(tx.organizer.update).toHaveBeenCalledTimes(1);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.organizer.update).not.toHaveBeenCalled();
  });

  it('propagates a database failure so the caller can abort its own transaction', async () => {
    db.cashFeeAccrual.createMany.mockRejectedValue(new Error('db down'));
    await expect(accrueCashFeeOnce(base)).rejects.toThrow('db down');
    expect(db.organizer.update).not.toHaveBeenCalled();
  });
});

describe('accrueSplitCashLegOnce', () => {
  it('charges a SIMPLE organizer the 8% in-person rate on the cash leg', async () => {
    db.cashFeeAccrual.createMany.mockResolvedValue({ count: 1 });
    const r = await accrueSplitCashLegOnce({
      organizer: { id: 'org1', subscriptionTier: 'SIMPLE' },
      sourceType: 'MANUAL_CARD',
      sourceId: 'sq1',
      cashAmountCents: 10000,
    });
    expect(r.accrued).toBe(8);
  });

  it('charges a TEAMS organizer the 6% in-person rate', async () => {
    db.cashFeeAccrual.createMany.mockResolvedValue({ count: 1 });
    const r = await accrueSplitCashLegOnce({
      organizer: { id: 'org1', subscriptionTier: 'TEAMS' },
      sourceType: 'MANUAL_CARD',
      sourceId: 'sq2',
      cashAmountCents: 10000,
    });
    expect(r.accrued).toBe(6);
  });

  it('charges plain rate x amount on a small cash leg (no $0.75 floor on cash)', async () => {
    db.cashFeeAccrual.createMany.mockResolvedValue({ count: 1 });
    const r = await accrueSplitCashLegOnce({
      organizer: { id: 'org1', subscriptionTier: 'SIMPLE' },
      sourceType: 'POS_PAYMENT_LINK',
      sourceId: 'link1',
      cashAmountCents: 500,
    });
    expect(r.accrued).toBe(0.4); // 8% SIMPLE in-person of $5.00, no flat minimum (Patrick ruling 2026-10-07)
  });

  it('accrues nothing during an active referral discount', async () => {
    const r = await accrueSplitCashLegOnce({
      organizer: { id: 'org1', subscriptionTier: 'SIMPLE', referralDiscountExpiry: new Date(Date.now() + 86400000) },
      sourceType: 'POS_PAYMENT_REQUEST',
      sourceId: 'req9',
      cashAmountCents: 10000,
    });
    expect(r).toEqual({ accrued: 0, duplicate: false });
    expect(db.cashFeeAccrual.createMany).not.toHaveBeenCalled();
  });
});

describe('wouldExceedCashFeeExposureCap (pending split cash)', () => {
  it('is false when balance + new commission stays under the cap', async () => {
    db.organizer.findUnique.mockResolvedValue({ cashFeeBalance: 90, subscriptionTier: 'SIMPLE', referralDiscountExpiry: null });
    expect(await wouldExceedCashFeeExposureCap({ organizerId: 'org1', commission: 5 })).toBe(false);
  });

  it('counts an unpaid split request: 90 balance + 8 pending + 5 new = 103 > 100', async () => {
    db.organizer.findUnique.mockResolvedValue({ cashFeeBalance: 90, subscriptionTier: 'SIMPLE', referralDiscountExpiry: null });
    db.pOSPaymentRequest.findMany.mockResolvedValue([{ cashAmountCents: 10000 }]); // 8% of $100 = $8
    expect(await wouldExceedCashFeeExposureCap({ organizerId: 'org1', commission: 5 })).toBe(true);
  });

  it('ignores pending cash when includePending is false (old balance-only behavior)', async () => {
    db.organizer.findUnique.mockResolvedValue({ cashFeeBalance: 90, subscriptionTier: 'SIMPLE', referralDiscountExpiry: null });
    db.pOSPaymentRequest.findMany.mockResolvedValue([{ cashAmountCents: 10000 }]);
    expect(await wouldExceedCashFeeExposureCap({ organizerId: 'org1', commission: 5, includePending: false })).toBe(false);
    expect(db.pOSPaymentRequest.findMany).not.toHaveBeenCalled();
  });

  it('reads through the caller tx client when given one', async () => {
    const tx: any = {
      organizer: { findUnique: jest.fn().mockResolvedValue({ cashFeeBalance: 0, subscriptionTier: 'SIMPLE', referralDiscountExpiry: null }) },
      pOSPaymentRequest: { findMany: jest.fn().mockResolvedValue([]) },
      pOSPaymentLink: { findMany: jest.fn().mockResolvedValue([]) },
      cashFeeAccrual: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await wouldExceedCashFeeExposureCap({ organizerId: 'org1', commission: 5, tx });
    expect(tx.organizer.findUnique).toHaveBeenCalled();
    expect(db.organizer.findUnique).not.toHaveBeenCalled();
  });

  it('a zero commission never trips the cap', async () => {
    expect(await wouldExceedCashFeeExposureCap({ organizerId: 'org1', commission: 0 })).toBe(false);
    expect(db.organizer.findUnique).not.toHaveBeenCalled();
  });
});

describe('getPendingSplitCashCommission', () => {
  it('sums pending requests and links, skipping COMPLETED links that already have a ledger row', async () => {
    db.pOSPaymentRequest.findMany.mockResolvedValue([{ cashAmountCents: 10000 }]); // $8
    db.pOSPaymentLink.findMany.mockResolvedValue([
      { id: 'active1', status: 'ACTIVE', cashAmountCents: 5000 }, // $4
      { id: 'done-accrued', status: 'COMPLETED', cashAmountCents: 20000 }, // skipped
      { id: 'done-unaccrued', status: 'COMPLETED', cashAmountCents: 10000 }, // $8
    ]);
    db.cashFeeAccrual.findMany.mockResolvedValue([{ sourceId: 'done-accrued' }]);
    const total = await getPendingSplitCashCommission({ organizerId: 'org1', rate: 0.08 });
    expect(total).toBe(20);
  });

  it('is 0 at a zero rate without touching the database', async () => {
    expect(await getPendingSplitCashCommission({ organizerId: 'org1', rate: 0 })).toBe(0);
    expect(db.pOSPaymentRequest.findMany).not.toHaveBeenCalled();
  });
});
