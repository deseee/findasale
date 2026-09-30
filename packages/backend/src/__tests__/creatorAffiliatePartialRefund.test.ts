/**
 * Creator commission after a PARTIAL refund (2026-09-30, fix agent F).
 * Commission is prorated by (1 - refundedAmount / amount) in integer cents (floored, never negative);
 * a paid commission whose purchase was later partly refunded has its excess reported as clawback due and
 * can have that excess recorded. Prisma is mocked; nothing touches a database or a payment provider.
 * Run: pnpm --filter backend test -- creatorAffiliatePartialRefund
 */
const m = {
  affiliateConversion: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: m }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

import {
  clawbackExcessCents,
  commissionStateOf,
  listAdminCommissions,
  proratedCommissionCents,
  settleCommission,
} from '../services/creatorAffiliateService';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-20T00:00:00Z');

describe('proratedCommissionCents', () => {
  const c = (refundedAmount: number | null, over: any = {}) => ({
    commissionCents: 500,
    purchaseAmountCents: 10000,
    purchase: { status: 'PAID', amount: 100, refundedAmount },
    ...over,
  });
  it('an unrefunded purchase keeps the stored commission', () => {
    expect(proratedCommissionCents(c(null))).toBe(500);
    expect(proratedCommissionCents(c(0))).toBe(500);
  });
  it('prorates by the share NOT refunded, in integer cents', () => {
    expect(proratedCommissionCents(c(25))).toBe(375); // 75% of 500
    expect(proratedCommissionCents(c(50))).toBe(250);
    expect(proratedCommissionCents(c(33.33))).toBe(333); // 500 * 6667 / 10000 = 333.35 floors
  });
  it('is never negative and never exceeds the stored commission', () => {
    expect(proratedCommissionCents(c(100))).toBe(0);
    expect(proratedCommissionCents(c(250))).toBe(0); // over-refund clamps to zero
    expect(proratedCommissionCents(c(0.001))).toBe(500);
  });
  it('falls back to the snapshot amount when the purchase amount is missing', () => {
    expect(proratedCommissionCents({ commissionCents: 500, purchaseAmountCents: 10000, purchase: { status: 'PAID', refundedAmount: 50 } })).toBe(250);
  });
});

describe('commissionStateOf with a partial refund', () => {
  const base = { payoutStatus: 'UNPAID', eligibleAt: new Date(now.getTime() - DAY), commissionCents: 500, purchaseAmountCents: 10000 };
  it('stays live after a partial refund (PAID purchase, prorated commission)', () => {
    expect(commissionStateOf({ ...base, purchase: { status: 'PAID', amount: 100, refundedAmount: 40 } }, now)).toBe('APPROVED');
  });
  it('is REVERSED when the refund leaves nothing of the commission', () => {
    expect(commissionStateOf({ ...base, purchase: { status: 'PAID', amount: 100, refundedAmount: 100 } }, now)).toBe('REVERSED');
    expect(commissionStateOf({ ...base, purchase: { status: 'REFUNDED', amount: 100, refundedAmount: 100 } }, now)).toBe('REVERSED');
  });
});

describe('clawbackExcessCents', () => {
  const paid = (over: any = {}) => ({
    payoutStatus: 'PAID',
    payoutNote: null,
    commissionCents: 500,
    purchaseAmountCents: 10000,
    purchase: { status: 'PAID', amount: 100, refundedAmount: 40 },
    ...over,
  });
  it('is the paid amount minus what still stands', () => {
    expect(clawbackExcessCents(paid())).toBe(200); // paid 500, now worth 300
  });
  it('subtracts clawbacks already recorded and uses the recorded paid amount', () => {
    expect(clawbackExcessCents(paid({ payoutNote: 'Venmo 1 [clawback-cents:150]' }))).toBe(50);
    expect(clawbackExcessCents(paid({ payoutNote: 'Venmo 1 [paid-cents:300]' }))).toBe(0); // paid the prorated amount already
  });
  it('is 0 for an unrefunded or unpaid commission and full for a reversed purchase', () => {
    expect(clawbackExcessCents(paid({ purchase: { status: 'PAID', amount: 100, refundedAmount: null } }))).toBe(0);
    expect(clawbackExcessCents(paid({ payoutStatus: 'UNPAID' }))).toBe(0);
    expect(clawbackExcessCents(paid({ purchase: { status: 'REFUNDED', amount: 100, refundedAmount: 100 } }))).toBe(500);
  });
});

describe('admin ledger and settlement with a partial refund', () => {
  const row = (over: Record<string, any> = {}) => ({
    id: 'c1',
    creatorUserId: 'creator1',
    createdAt: new Date(now.getTime() - 40 * DAY),
    eligibleAt: new Date(now.getTime() - 10 * DAY),
    commissionCents: 500,
    commissionRateBps: 1000,
    purchaseAmountCents: 10000,
    platformFeeCents: 5000,
    payoutStatus: 'UNPAID',
    paidAt: null,
    payoutNote: null,
    purchase: { status: 'PAID', amount: 100, refundedAmount: 40 },
    affiliateLink: { sale: { title: 'Big Sale' } },
    creator: { id: 'creator1', name: 'Cee', email: 'cee@example.com', creatorProfile: { code: 'CRT_AAAAAA' } },
    ...over,
  });
  beforeEach(() => jest.clearAllMocks());

  it('totals count the prorated commission and report the refunded share as reversed', async () => {
    m.affiliateConversion.findMany.mockResolvedValue([row({ id: 'a' })]);
    const res = await listAdminCommissions({}, now);
    expect(res.totalsCents).toMatchObject({ approved: 300, reversed: 200, clawbackDue: 0 });
    expect(res.commissions[0]).toMatchObject({ commissionCents: 300, originalCommissionCents: 500 });
  });

  it('a PAID commission with a partial refund shows the excess as clawback due', async () => {
    m.affiliateConversion.findMany.mockResolvedValue([row({ id: 'a', payoutStatus: 'PAID' })]);
    const res = await listAdminCommissions({}, now);
    expect(res.commissions[0]).toMatchObject({ state: 'PAID', clawbackDue: true, clawbackDueCents: 200 });
    expect(res.totalsCents.clawbackDue).toBe(200);
  });

  it('mark-paid pays the prorated commission and records the cents payable in the note', async () => {
    m.affiliateConversion.findUnique.mockResolvedValue(row());
    m.affiliateConversion.updateMany.mockResolvedValue({ count: 1 });
    await settleCommission('c1', 'PAID', 'Venmo 9', now);
    const call = m.affiliateConversion.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ payoutStatus: 'PAID', payoutNote: 'Venmo 9 [paid-cents:300]', paidAt: now });
  });

  it('records a partial-refund clawback: the row stays PAID, the excess is in the note, the write is pinned to the note it read', async () => {
    m.affiliateConversion.findUnique.mockResolvedValue(row({ payoutStatus: 'PAID', payoutNote: 'Venmo 9' }));
    m.affiliateConversion.updateMany.mockResolvedValue({ count: 1 });
    await expect(settleCommission('c1', 'CLAWBACK', 'creator repaid $2', now)).resolves.toEqual({ id: 'c1', payoutStatus: 'PAID' });
    const call = m.affiliateConversion.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'c1', payoutStatus: 'PAID', payoutNote: 'Venmo 9' });
    expect(call.data.payoutStatus).toBe('PAID');
    expect(call.data.payoutNote).toBe('Venmo 9 | Partial-refund clawback recorded: creator repaid $2 [clawback-cents:200]');
  });

  it('refuses a clawback when a partial refund leaves no excess', async () => {
    m.affiliateConversion.findUnique.mockResolvedValue(row({ payoutStatus: 'PAID', payoutNote: 'Venmo 9 [paid-cents:300]' }));
    await expect(settleCommission('c1', 'CLAWBACK', 'x', now)).rejects.toMatchObject({ code: 'NOT_REVERSED' });
    expect(m.affiliateConversion.updateMany).not.toHaveBeenCalled();
  });
});
