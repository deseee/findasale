/**
 * squareBillingChargeJob organizer renewal (2026-09-29 P2 review): idempotent per period, COMPLETED is
 * never overwritten by FAILED, catch-up bills exactly one period and advances from the ORIGINAL period
 * end, and a period is never charged twice. Square, Prisma and the ledger are mocked.
 */
const mockOrgFindMany = jest.fn();
const mockOrgFindUnique = jest.fn();
const mockOrgUpdate = jest.fn();
const mockOrgUpdateMany = jest.fn();
const mockRoleSubUpdateMany = jest.fn();
const mockChargeStoredCard = jest.fn();
const mockClaim = jest.fn();
const mockComplete = jest.fn();
const mockFail = jest.fn();
const mockNotify = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizer: {
      findMany: (...a: any[]) => mockOrgFindMany(...a),
      findUnique: (...a: any[]) => mockOrgFindUnique(...a),
      update: (...a: any[]) => mockOrgUpdate(...a),
      updateMany: (...a: any[]) => mockOrgUpdateMany(...a),
    },
    userRoleSubscription: { updateMany: (...a: any[]) => mockRoleSubUpdateMany(...a) },
  },
}));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../lib/notificationService', () => ({ createNotification: (...a: any[]) => mockNotify(...a) }));
jest.mock('../../lib/syncTier', () => ({ notifyAutoMarkdownsPaused: jest.fn() }));
jest.mock('../../services/squareBillingService', () => ({
  SQUARE_TIER_PRICE_CENTS: { PRO: 2900, TEAMS: 7900 },
  HUNT_PASS_PRICE_CENTS: 499,
  BILLING_INTERVAL_DAYS: 30,
  computeNextRetryAt: (d: Date) => new Date(d.getTime() + 2 * 86400000),
  computeGraceEndsAt: (d: Date) => new Date(d.getTime() + 7 * 86400000),
  chargeStoredCard: (...a: any[]) => mockChargeStoredCard(...a),
}));
jest.mock('../../services/organizerBillingLedger', () => ({
  claimBillingCharge: (...a: any[]) => mockClaim(...a),
  completeBillingCharge: (...a: any[]) => mockComplete(...a),
  failBillingCharge: (...a: any[]) => mockFail(...a),
}));

import { processOrganizerBilling } from '../squareBillingChargeJob';

const DAY = 24 * 60 * 60 * 1000;

const dueOrg = (periodEnd: Date, over: any = {}) => ({
  id: 'org_1',
  userId: 'user_1',
  subscriptionTier: 'PRO',
  subscriptionStatus: 'active',
  squareCustomerId: 'cust_1',
  squareCardId: 'card_1',
  billingCurrentPeriodEnd: periodEnd,
  billingDunningFailCount: 0,
  billingGraceEndsAt: null,
  businessName: 'Biz',
  user: { email: 'a@b.c', name: 'A' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgUpdateMany.mockResolvedValue({ count: 1 });
  mockOrgUpdate.mockResolvedValue({ userId: 'user_1' });
  mockRoleSubUpdateMany.mockResolvedValue({ count: 1 });
  mockClaim.mockResolvedValue({ state: 'claimed', id: 'chg_1' });
  mockComplete.mockResolvedValue(undefined);
  mockFail.mockResolvedValue(true);
  mockChargeStoredCard.mockResolvedValue({ ok: true, paymentId: 'pay_1', status: 'COMPLETED' });
  mockNotify.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('renewal success', () => {
  it('claims the period, charges once with requireCompleted, and advances from the ORIGINAL end by one period', async () => {
    const end = new Date(Date.now() - 1 * DAY);
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(end)]);
    await processOrganizerBilling();

    expect(mockClaim).toHaveBeenCalledWith({ organizerId: 'org_1', periodKey: `renewal:${end.toISOString()}`, kind: 'RENEWAL', tier: 'PRO', amountCents: 2900 });
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    const charge = mockChargeStoredCard.mock.calls[0][0];
    expect(charge.requireCompleted).toBe(true);
    expect(charge.amountCents).toBe(2900);
    // key carries period id, tier and card discriminator
    expect(charge.idempotencyParts).toEqual(expect.arrayContaining(['org-billing', 'org_1', 'PRO', end.toISOString(), 'card_1']));
    expect(mockComplete).toHaveBeenCalledWith('chg_1', 'pay_1');

    const upd = mockOrgUpdateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'org_1', billingCurrentPeriodEnd: end }); // conditional: only if still that period
    const next = new Date(upd.data.billingCurrentPeriodEnd).getTime();
    const expected = new Date(end.getTime()); expected.setDate(expected.getDate() + 30);
    expect(next).toBe(expected.getTime());
    expect(upd.data.subscriptionStatus).toBe('active');
  });
});

describe('catch-up after downtime', () => {
  it('a job that was down for 3 periods bills ONE period per run and advances from the original end, not from now', async () => {
    const end = new Date(Date.now() - 95 * DAY);
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(end)]);
    await processOrganizerBilling();
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    const next = new Date(mockOrgUpdateMany.mock.calls[0][0].data.billingCurrentPeriodEnd).getTime();
    const expected = new Date(end.getTime()); expected.setDate(expected.getDate() + 30);
    expect(next).toBe(expected.getTime());
    expect(next).toBeLessThan(Date.now()); // still in the past: the next daily run bills the next period, one per run
  });

  it('the next run bills the NEXT period with a different period key', async () => {
    const end = new Date(Date.now() - 95 * DAY);
    const nextEnd = new Date(end.getTime()); nextEnd.setDate(nextEnd.getDate() + 30);
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(end)]).mockResolvedValueOnce([dueOrg(nextEnd)]);
    await processOrganizerBilling();
    await processOrganizerBilling();
    const keys = mockClaim.mock.calls.map((c: any[]) => c[0].periodKey);
    expect(keys).toEqual([`renewal:${end.toISOString()}`, `renewal:${nextEnd.toISOString()}`]);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('never charge the same period twice', () => {
  it('a period already COMPLETED in the ledger is not charged again, but the organizer row is healed', async () => {
    const end = new Date(Date.now() - 1 * DAY);
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(end)]);
    mockClaim.mockResolvedValue({ state: 'already_completed', id: 'chg_1', paymentId: 'pay_old' });
    await processOrganizerBilling();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrgUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockOrgUpdateMany.mock.calls[0][0].where).toEqual({ id: 'org_1', billingCurrentPeriodEnd: end });
  });

  it('a period being charged by another attempt is skipped entirely', async () => {
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(new Date(Date.now() - DAY))]);
    mockClaim.mockResolvedValue({ state: 'in_progress' });
    await processOrganizerBilling();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrgUpdateMany).not.toHaveBeenCalled();
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it('if the period end already moved (double advance), the second advance is refused', async () => {
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(new Date(Date.now() - DAY))]);
    mockOrgUpdateMany.mockResolvedValue({ count: 0 });
    await processOrganizerBilling();
    expect(mockRoleSubUpdateMany).not.toHaveBeenCalled();
  });

  it('ledger unavailable: the organizer is NOT charged (fails closed)', async () => {
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(new Date(Date.now() - DAY))]);
    mockClaim.mockRejectedValue(new Error('relation does not exist'));
    await processOrganizerBilling();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrgUpdateMany).not.toHaveBeenCalled();
  });
});

describe('failure handling never overwrites COMPLETED', () => {
  it('a decline is recorded FAILED and runs dunning (past_due, retry scheduled), access retained', async () => {
    const end = new Date(Date.now() - 1 * DAY);
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(end)]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    mockOrgFindUnique.mockResolvedValue({ billingCurrentPeriodEnd: end });
    await processOrganizerBilling();
    expect(mockFail).toHaveBeenCalledWith('chg_1', 'Card declined');
    expect(mockComplete).not.toHaveBeenCalled();
    const data = mockOrgUpdate.mock.calls[0][0].data;
    expect(data.subscriptionStatus).toBe('past_due');
    expect(data.billingDunningFailCount).toBe(1);
    expect(data.subscriptionTier).toBeUndefined(); // not downgraded on the first failure
    expect(mockOrgUpdateMany).not.toHaveBeenCalled(); // period end not advanced
  });

  it('a failure whose ledger row is already COMPLETED is treated as paid, with no dunning', async () => {
    const end = new Date(Date.now() - 1 * DAY);
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(end)]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    mockFail.mockResolvedValue(false);
    await processOrganizerBilling();
    expect(mockOrgUpdate).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockOrgUpdateMany).toHaveBeenCalledTimes(1); // advanced instead
  });

  it('a stale failure (the organizer paid and moved the period end meanwhile) is ignored', async () => {
    const end = new Date(Date.now() - 1 * DAY);
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(end)]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    mockOrgFindUnique.mockResolvedValue({ billingCurrentPeriodEnd: new Date(Date.now() + 30 * DAY) });
    await processOrganizerBilling();
    expect(mockOrgUpdate).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('a dunning retry uses a new idempotency key (attempt number) but the same period key', async () => {
    const end = new Date(Date.now() - 3 * DAY);
    mockOrgFindMany.mockResolvedValueOnce([dueOrg(end, { billingDunningFailCount: 0 })]).mockResolvedValueOnce([dueOrg(end, { billingDunningFailCount: 1 })]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    mockOrgFindUnique.mockResolvedValue({ billingCurrentPeriodEnd: end });
    await processOrganizerBilling();
    await processOrganizerBilling();
    const k = mockChargeStoredCard.mock.calls.map((c: any[]) => c[0].idempotencyParts.join('|'));
    expect(k[0]).not.toEqual(k[1]);
    const pk = mockClaim.mock.calls.map((c: any[]) => c[0].periodKey);
    expect(pk[0]).toEqual(pk[1]);
  });
});
