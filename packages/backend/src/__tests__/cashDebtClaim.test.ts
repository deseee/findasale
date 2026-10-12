/**
 * Cash-fee-debt claim (2026-09-30, fix agent F). applyCashDebtToAppFee now CLAIMS the debt atomically
 * BEFORE the charge (conditional decrement whose row count says who got it), pads the fee by exactly what
 * was claimed, and releaseCashDebtClaim re-credits it when the charge does not happen. Two concurrent card
 * sales can therefore never both collect the same debt.
 * Run: pnpm --filter backend test -- cashDebtClaim
 */

// A tiny in-memory organizer table with the semantics the claim relies on: findUnique reads the balance,
// updateMany applies the `gte` guard and the decrement/increment atomically per call.
const store: { org: { id: string; cashFeeBalance: number; cashFeeBalanceUpdatedAt?: Date } } = {
  org: { id: 'org1', cashFeeBalance: 0 },
};
const hooks: { beforeUpdateMany?: () => void } = {};
jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: {
      findUnique: jest.fn(async () => ({ cashFeeBalance: store.org.cashFeeBalance })),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (hooks.beforeUpdateMany) {
          const h = hooks.beforeUpdateMany;
          hooks.beforeUpdateMany = undefined;
          h();
        }
        if (where.id !== store.org.id) return { count: 0 };
        if (where.cashFeeBalance?.gte !== undefined && !(store.org.cashFeeBalance >= where.cashFeeBalance.gte)) return { count: 0 };
        if (data.cashFeeBalance?.decrement !== undefined) store.org.cashFeeBalance = Math.round((store.org.cashFeeBalance - data.cashFeeBalance.decrement) * 100) / 100;
        if (data.cashFeeBalance?.increment !== undefined) store.org.cashFeeBalance = Math.round((store.org.cashFeeBalance + data.cashFeeBalance.increment) * 100) / 100;
        return { count: 1 };
      }),
    },
  },
}));

import { applyCashDebtToAppFee, releaseCashDebtClaim, settleCashDebtCollection } from '../services/cashFeeService';

// 2026-10-11: baseAppFeeCents is the INCLUSIVE fee (500); the app fee SENT to Square is net of Square's 2.9% + 30c on $100.00 (320c) = 180c.
const claim = () => applyCashDebtToAppFee({ organizerId: 'org1', baseAppFeeCents: 500, saleAmountCents: 10000 });

beforeEach(() => {
  store.org.cashFeeBalance = 0;
  hooks.beforeUpdateMany = undefined;
});

describe('applyCashDebtToAppFee claims the debt', () => {
  it('decrements the balance at claim time and pads the fee by the claimed amount', async () => {
    store.org.cashFeeBalance = 15;
    const r = await claim();
    expect(r).toEqual({ appFeeCents: 180 + 1500, debtAppliedCents: 1500 });
    expect(store.org.cashFeeBalance).toBe(0);
  });

  it('two concurrent card sales cannot both collect the same debt', async () => {
    store.org.cashFeeBalance = 15;
    const [a, b] = await Promise.all([claim(), claim()]);
    const collected = a.debtAppliedCents + b.debtAppliedCents;
    expect(collected).toBe(1500); // once, not twice
    expect(store.org.cashFeeBalance).toBe(0);
    expect(Math.max(a.debtAppliedCents, b.debtAppliedCents)).toBe(1500);
    expect(Math.min(a.debtAppliedCents, b.debtAppliedCents)).toBe(0);
    // The sale that lost pays only its normal fee.
    const loser = a.debtAppliedCents === 0 ? a : b;
    expect(loser.appFeeCents).toBe(180);
  });

  it('a lost race re-reads the balance and claims only what is left', async () => {
    store.org.cashFeeBalance = 15;
    // Another sale takes $10 between our read and our conditional decrement.
    hooks.beforeUpdateMany = () => {
      store.org.cashFeeBalance = 5;
    };
    const r = await claim();
    expect(r).toEqual({ appFeeCents: 180 + 500, debtAppliedCents: 500 });
    expect(store.org.cashFeeBalance).toBe(0);
  });

  it('claims nothing when the organizer owes nothing', async () => {
    const r = await claim();
    expect(r).toEqual({ appFeeCents: 180, debtAppliedCents: 0 });
  });

  it('pads on top of the Square-net base and keeps the FINAL sent fee at or under the 60% ceiling', async () => {
    // $1.25 sale, 75c inclusive fee: Square cost 34c -> base 41c; ceiling floor(125 x 0.6) = 75c -> only 34c of debt fits.
    store.org.cashFeeBalance = 10;
    const r = await applyCashDebtToAppFee({ organizerId: 'org1', baseAppFeeCents: 75, saleAmountCents: 125 });
    expect(r).toEqual({ appFeeCents: 75, debtAppliedCents: 34 });
    expect(r.appFeeCents).toBeLessThanOrEqual(Math.floor(125 * 0.6));
    expect(store.org.cashFeeBalance).toBe(9.66); // only the 34c that fit was claimed
  });
});

describe('releaseCashDebtClaim and settleCashDebtCollection', () => {
  it('re-credits exactly the claimed amount when the charge failed', async () => {
    store.org.cashFeeBalance = 15;
    const r = await claim();
    expect(store.org.cashFeeBalance).toBe(0);
    await releaseCashDebtClaim({ organizerId: 'org1', debtAppliedCents: r.debtAppliedCents });
    expect(store.org.cashFeeBalance).toBe(15);
  });

  it('releasing 0 is a no-op', async () => {
    store.org.cashFeeBalance = 7;
    await releaseCashDebtClaim({ organizerId: 'org1', debtAppliedCents: 0 });
    expect(store.org.cashFeeBalance).toBe(7);
  });

  it('settleCashDebtCollection no longer moves money (the claim already did)', async () => {
    store.org.cashFeeBalance = 15;
    const r = await claim();
    await settleCashDebtCollection({ organizerId: 'org1', debtAppliedCents: r.debtAppliedCents });
    expect(store.org.cashFeeBalance).toBe(0); // not driven negative or decremented twice
  });
});
