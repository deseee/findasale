/**
 * Fee source of truth (2026-09-30). Every real charge path already charges the INCLUSIVE rates (SIMPLE
 * 8% in person / 9.5% online, PRO and TEAMS 6% / 7.5%, $0.75 minimum, card processing included). This suite
 * pins (1) the exact charge amounts, (2) the era-aware restatement used by reports, (3) the earnings
 * breakdown no longer estimating a separate processor fee on inclusive-model sales, and (4) the admin
 * revenue reports reading the stored fee snapshot instead of GMV x the retired 10% / 8%.
 */
const mockPurchaseFindMany = jest.fn();
const mockOrganizerFindUnique = jest.fn();
const mockOrganizerFindMany = jest.fn();
const mockOrganizerCount = jest.fn();
const mockQueryRaw = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    purchase: { findMany: (...a: any[]) => mockPurchaseFindMany(...a) },
    organizer: {
      findUnique: (...a: any[]) => mockOrganizerFindUnique(...a),
      findMany: (...a: any[]) => mockOrganizerFindMany(...a),
      count: (...a: any[]) => mockOrganizerCount(...a),
    },
    $queryRaw: (...a: any[]) => mockQueryRaw(...a),
  },
}));
jest.mock('../../services/shippingLabelService', () => ({
  buyCheapestLabel: jest.fn(),
  ShippingLabelPurchaseError: class ShippingLabelPurchaseError extends Error {},
}));

import {
  calculateInclusiveCommissionCents,
  getInclusivePlatformFeeRate,
  getPlatformFeeRate,
  resolveReportingFeeRate,
  resolvePlatformRevenueDollars,
  isInclusiveFeeEra,
  INCLUSIVE_FEE_MODEL_EFFECTIVE_AT,
  MINIMUM_TRANSACTION_FEE_CENTS,
} from '../../utils/feeCalculator';
import { getEarningsBreakdown } from '../payoutController';
import { getRevenueReport, getOrganizerPerformance } from '../adminReportsController';

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(b: any) { this.body = b; return this; },
  };
  return res;
}

const AFTER = new Date('2026-10-05T12:00:00.000Z');
const BEFORE = new Date('2026-09-10T12:00:00.000Z');

describe('charge amounts: the inclusive rates every real charge path uses', () => {
  it('$100.00 sale, all tier / channel pairs', () => {
    expect(calculateInclusiveCommissionCents(10000, 'SIMPLE', 'IN_PERSON')).toBe(800);
    expect(calculateInclusiveCommissionCents(10000, 'SIMPLE', 'ONLINE')).toBe(950);
    expect(calculateInclusiveCommissionCents(10000, 'PRO', 'IN_PERSON')).toBe(600);
    expect(calculateInclusiveCommissionCents(10000, 'PRO', 'ONLINE')).toBe(750);
    expect(calculateInclusiveCommissionCents(10000, 'TEAMS', 'IN_PERSON')).toBe(600);
    expect(calculateInclusiveCommissionCents(10000, 'TEAMS', 'ONLINE')).toBe(750);
    expect(calculateInclusiveCommissionCents(10000, null, 'ONLINE')).toBe(950); // null tier is SIMPLE
  });

  it('$0.75 minimum floors small sales, and a zero-dollar charge carries no fee', () => {
    expect(MINIMUM_TRANSACTION_FEE_CENTS).toBe(75);
    expect(calculateInclusiveCommissionCents(500, 'PRO', 'ONLINE')).toBe(75); // 7.5% of $5 is 38 cents
    expect(calculateInclusiveCommissionCents(0, 'SIMPLE', 'ONLINE')).toBe(0);
  });

  it('the legacy 10% / 8% still exists ONLY as a distinct function (no charge path calls it)', () => {
    expect(getPlatformFeeRate('SIMPLE')).toBe(0.1);
    expect(getPlatformFeeRate('PRO')).toBe(0.08);
    expect(getInclusivePlatformFeeRate('SIMPLE', 'ONLINE')).toBe(0.095);
  });
});

describe('era-aware restatement for reports', () => {
  it('cutover is 2026-09-24 UTC', () => {
    expect(INCLUSIVE_FEE_MODEL_EFFECTIVE_AT.toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(isInclusiveFeeEra(BEFORE)).toBe(false);
    expect(isInclusiveFeeEra(AFTER)).toBe(true);
  });

  it('a purchase from before the model is restated at the legacy rate it was really charged', () => {
    expect(resolveReportingFeeRate('SIMPLE', BEFORE, 'ONLINE')).toBe(0.1);
    expect(resolveReportingFeeRate('PRO', BEFORE, 'POS')).toBe(0.08);
  });

  it('a purchase from the inclusive era is restated at the inclusive rate for its channel', () => {
    expect(resolveReportingFeeRate('SIMPLE', AFTER, 'ONLINE')).toBe(0.095);
    expect(resolveReportingFeeRate('SIMPLE', AFTER, 'POS')).toBe(0.08);
    expect(resolveReportingFeeRate('TEAMS', AFTER, 'ONLINE')).toBe(0.075);
    expect(resolveReportingFeeRate('PRO', AFTER, 'POS')).toBe(0.06);
  });

  it('platform revenue prefers the snapshot (commission + buyer premium, cash-debt recoupment excluded)', () => {
    expect(resolvePlatformRevenueDollars({ amount: 210, commissionAmount: 15.75, buyerPremiumAmount: 10, createdAt: AFTER }, 'PRO')).toBeCloseTo(25.75, 5);
    expect(resolvePlatformRevenueDollars({ amount: 100, commissionAmount: 0, buyerPremiumAmount: 0, createdAt: AFTER }, 'PRO')).toBe(0); // referral discount: a real zero
  });

  it('with no snapshot it falls back by era', () => {
    expect(resolvePlatformRevenueDollars({ amount: 100, createdAt: BEFORE, source: 'ONLINE' }, 'SIMPLE')).toBeCloseTo(10, 5);
    expect(resolvePlatformRevenueDollars({ amount: 100, createdAt: AFTER, source: 'ONLINE' }, 'SIMPLE')).toBeCloseTo(9.5, 5);
    expect(resolvePlatformRevenueDollars({ amount: 100, createdAt: AFTER, source: 'POS' }, 'PRO')).toBeCloseTo(6, 5);
  });
});

describe('getEarningsBreakdown: card processing is included, no separate processor fee on top', () => {
  const organizer = { id: 'org_1', subscriptionTier: 'PRO', cashFeeBalance: 0, cashFeeBalanceUpdatedAt: null };
  const row = (over: any) => ({
    id: 'p1', amount: 100, status: 'PAID', processor: 'SQUARE', source: 'ONLINE', createdAt: AFTER,
    item: { id: 'i1', title: 'Lamp', category: 'x', listingType: 'FIXED', auctionStartPrice: null },
    sale: { id: 's1', title: 'Sale', startDate: AFTER, coversFee: false },
    commissionAmount: null, buyerPremiumAmount: null, organizerAbsorbedPremium: null, cnpSurchargeCents: 0, shippingZip: null,
    ...over,
  });
  const run = async (purchases: any[]) => {
    mockOrganizerFindUnique.mockResolvedValue(organizer);
    mockPurchaseFindMany.mockResolvedValue(purchases);
    const res = makeRes();
    await getEarningsBreakdown({ user: { id: 'u1', roles: ['ORGANIZER'], role: 'ORGANIZER' }, query: {} } as any, res);
    return res;
  };
  beforeEach(() => jest.clearAllMocks());

  it('an inclusive-era sale with a fee snapshot: processor fee 0, net = sale minus platform fee', async () => {
    const res = await run([row({ commissionAmount: 7.5, buyerPremiumAmount: 0 })]);
    const item = res.body.items[0];
    expect(item.platformFee).toBe(7.5);
    expect(item.processorFee).toBe(0);
    expect(item.processorFeeLabel).toBe('Included in platform fee');
    expect(item.netPayout).toBe(92.5);
    expect(res.body.totals.totalProcessorFees).toBe(0);
  });

  it('an inclusive-era sale with NO snapshot is restated at the inclusive channel rate, not 8%', async () => {
    const res = await run([row({ source: 'POS' }), row({ id: 'p2', source: 'ONLINE' })]);
    expect(res.body.items[0].platformFee).toBe(6); // PRO in person 6%
    expect(res.body.items[1].platformFee).toBe(7.5); // PRO online 7.5%
    expect(res.body.items.every((i: any) => i.processorFee === 0)).toBe(true);
  });

  it('a sale from BEFORE the model keeps the legacy restatement and its separate processor estimate', async () => {
    const res = await run([row({ createdAt: BEFORE })]);
    const item = res.body.items[0];
    expect(item.platformFee).toBe(8); // PRO legacy 8%
    expect(item.processorFee).toBe(3.2); // 2.9% + $0.30 of $100
    expect(item.processorFeeLabel).toBe('Square');
    expect(item.netPayout).toBe(88.8);
  });

  it('the note states card processing is included and no longer claims a separate processor fee is estimated on top', async () => {
    const res = await run([row({ commissionAmount: 7.5, buyerPremiumAmount: 0 })]);
    expect(res.body.note).toMatch(/Card processing is included in that fee/);
    expect(res.body.note).toMatch(/no separate processor fee on top/);
    expect(res.body.note).not.toMatch(/Processor fee is estimated per sale/);
    expect(res.body.note).not.toMatch(/\u2014/); // no em dash in user-facing copy
  });
});

describe('admin revenue reports read the stored fee snapshot, not GMV x 10% / 8%', () => {
  beforeEach(() => jest.clearAllMocks());
  const purchase = (over: any) => ({
    id: 'p', amount: 100, createdAt: new Date(), source: 'ONLINE', commissionAmount: null, buyerPremiumAmount: null,
    item: { sale: { organizer: { subscriptionTier: 'PRO' } } },
    ...over,
  });

  it('getRevenueReport sums snapshot commission + premium (cents)', async () => {
    mockPurchaseFindMany.mockResolvedValue([
      purchase({ commissionAmount: 7.5, buyerPremiumAmount: 0 }), // PRO online $100 -> $7.50
      purchase({ id: 'q', amount: 210, commissionAmount: 15.75, buyerPremiumAmount: 10 }), // auction
    ]);
    mockOrganizerFindMany.mockResolvedValue([]);
    mockOrganizerCount.mockResolvedValue(0);
    const res = makeRes();
    await getRevenueReport({ query: { period: '7d' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.transactionRevenue).toBe(750 + 2575);
  });

  it('getRevenueReport restates a fresh snapshot-less SIMPLE row at 9.5%, not 10%', async () => {
    mockPurchaseFindMany.mockResolvedValue([
      purchase({ item: { sale: { organizer: { subscriptionTier: 'SIMPLE' } } } }),
    ]);
    mockOrganizerFindMany.mockResolvedValue([]);
    mockOrganizerCount.mockResolvedValue(0);
    const res = makeRes();
    await getRevenueReport({ query: { period: '7d' } } as any, res);
    expect(res.body.transactionRevenue).toBe(950);
  });

  it('getOrganizerPerformance combines snapshot revenue with era-restated unsnapshotted GMV', async () => {
    const dec = (n: number) => ({ toString: () => String(n), valueOf: () => n }) as any;
    mockQueryRaw.mockResolvedValue([
      {
        id: 'o1', businessName: 'A', subscriptionTier: 'SIMPLE', salesCount: BigInt(1), itemsCount: BigInt(2), soldItemsCount: BigInt(1),
        totalGmv: dec(400), snapshotRevenue: dec(20), legacyUnsnapshottedGmv: dec(100), inclusiveUnsnapshottedGmv: dec(200),
        lastSaleAt: null, joinedAt: new Date(),
      },
    ]);
    mockOrganizerCount.mockResolvedValue(1);
    const res = makeRes();
    await getOrganizerPerformance({ query: {} } as any, res);
    // 20 snapshot + 100 x 10% legacy + 200 x 9.5% inclusive online = 20 + 10 + 19 = 49
    expect(res.body.items[0].platformRevenue).toBe(49);
    expect(res.body.items[0].totalGmv).toBe(40000);
  });
});
