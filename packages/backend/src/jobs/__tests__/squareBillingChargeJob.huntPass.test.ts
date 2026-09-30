/**
 * squareBillingChargeJob Hunt Pass renewal (2026-09-29 hardening): the renewal period is claimed in
 * the billing ledger before charging, one period is billed per run and the expiry advances from the
 * ORIGINAL expiry (never from now) through a conditional updateMany, COMPLETED is never overwritten
 * by FAILED, stale failures are ignored, and the Square idempotency key is per attempt and card.
 * Square, Prisma and the ledger are mocked: no real charge, DB or network call is possible.
 */
const mockUserFindMany = jest.fn();
const mockUserUpdateMany = jest.fn();
const mockUserUpdate = jest.fn();
const mockChargeStoredCard = jest.fn();
const mockClaim = jest.fn();
const mockComplete = jest.fn();
const mockFail = jest.fn();
const mockNotify = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findMany: (...a: any[]) => mockUserFindMany(...a),
      updateMany: (...a: any[]) => mockUserUpdateMany(...a),
      update: (...a: any[]) => mockUserUpdate(...a),
    },
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
  huntPassPeriodKey: (userId: string, periodStart: Date) => `huntpass:${userId}:${periodStart.toISOString()}`,
}));

import { processHuntPassBilling } from '../squareBillingChargeJob';

const DAY = 24 * 60 * 60 * 1000;

const dueUser = (expiry: Date, over: any = {}) => ({
  id: 'user_1',
  email: 'a@b.c',
  name: 'A',
  huntPassSquareCustomerId: 'cust_1',
  huntPassSquareCardId: 'card_1',
  huntPassExpiry: expiry,
  huntPassDunningFailCount: 0,
  huntPassGraceEndsAt: null,
  huntPassCancelAtPeriodEnd: false,
  ...over,
});

// exact UTC milliseconds (2026-09-30): the job no longer uses local-time setDate
const plus30 = (d: Date) => d.getTime() + 30 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  mockUserUpdateMany.mockResolvedValue({ count: 1 });
  mockUserUpdate.mockResolvedValue({});
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

describe('Hunt Pass renewal success', () => {
  it('claims the period, charges once with requireCompleted, and advances from the ORIGINAL expiry by one period', async () => {
    const expiry = new Date(Date.now() - 1 * DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry)]);
    await processHuntPassBilling();

    expect(mockClaim).toHaveBeenCalledWith({
      organizerId: 'user_1',
      periodKey: `huntpass:user_1:${expiry.toISOString()}`,
      kind: 'HUNT_PASS_RENEWAL',
      tier: 'HUNT_PASS',
      amountCents: 499,
    });
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    const charge = mockChargeStoredCard.mock.calls[0][0];
    expect(charge.requireCompleted).toBe(true);
    expect(charge.amountCents).toBe(499);
    expect(charge.idempotencyParts).toEqual(['huntpass-billing', 'user_1', expiry.toISOString(), 'card_1', 'try0']);
    expect(mockComplete).toHaveBeenCalledWith('chg_1', 'pay_1');

    const upd = mockUserUpdateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'user_1', huntPassExpiry: expiry }); // conditional: only if still that period
    expect(new Date(upd.data.huntPassExpiry).getTime()).toBe(plus30(expiry));
    expect(upd.data.huntPassDunningFailCount).toBe(0);
    expect(upd.data.huntPassNextRetryAt).toBeNull();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('catch-up after downtime', () => {
  it('a job that was down for 3 periods bills ONE period per run and advances from the original expiry, not from now', async () => {
    const expiry = new Date(Date.now() - 95 * DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry)]);
    await processHuntPassBilling();
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    const next = new Date(mockUserUpdateMany.mock.calls[0][0].data.huntPassExpiry).getTime();
    expect(next).toBe(plus30(expiry));
    expect(next).toBeLessThan(Date.now()); // still due: the next daily run bills the next period
  });

  it('spread across runs: each run claims a different period key and a different Square idempotency key', async () => {
    const e1 = new Date(Date.now() - 95 * DAY);
    const e2 = new Date(plus30(e1));
    const e3 = new Date(plus30(e2));
    mockUserFindMany
      .mockResolvedValueOnce([dueUser(e1)])
      .mockResolvedValueOnce([dueUser(e2)])
      .mockResolvedValueOnce([dueUser(e3)]);
    await processHuntPassBilling();
    await processHuntPassBilling();
    await processHuntPassBilling();
    const keys = mockClaim.mock.calls.map((c: any[]) => c[0].periodKey);
    expect(keys).toEqual([
      `huntpass:user_1:${e1.toISOString()}`,
      `huntpass:user_1:${e2.toISOString()}`,
      `huntpass:user_1:${e3.toISOString()}`,
    ]);
    const idem = mockChargeStoredCard.mock.calls.map((c: any[]) => c[0].idempotencyParts.join('|'));
    expect(new Set(idem).size).toBe(3);
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(3);
  });
});

describe('never charge the same period twice', () => {
  it('no double charge on a concurrent run: the second claim is in_progress, so it neither charges nor writes', async () => {
    const expiry = new Date(Date.now() - DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry)]).mockResolvedValueOnce([dueUser(expiry)]);
    mockClaim
      .mockResolvedValueOnce({ state: 'claimed', id: 'chg_1' })
      .mockResolvedValueOnce({ state: 'in_progress' });
    await processHuntPassBilling();
    await processHuntPassBilling();
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('a period already COMPLETED in the ledger is not charged again, but the user row is healed', async () => {
    const expiry = new Date(Date.now() - DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry)]);
    mockClaim.mockResolvedValue({ state: 'already_completed', id: 'chg_1', paymentId: 'pay_old' });
    await processHuntPassBilling();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUserUpdateMany.mock.calls[0][0].where).toEqual({ id: 'user_1', huntPassExpiry: expiry });
  });

  it('if the expiry already moved (double advance), the second advance is refused and nothing else is written', async () => {
    mockUserFindMany.mockResolvedValueOnce([dueUser(new Date(Date.now() - DAY))]);
    mockUserUpdateMany.mockResolvedValue({ count: 0 });
    await processHuntPassBilling();
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('ledger unavailable: the shopper is NOT charged (fails closed)', async () => {
    mockUserFindMany.mockResolvedValueOnce([dueUser(new Date(Date.now() - DAY))]);
    mockClaim.mockRejectedValue(new Error('relation does not exist'));
    await processHuntPassBilling();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
  });
});

describe('COMPLETED is never overwritten by a failure', () => {
  it('a failed result whose ledger row is already COMPLETED is treated as paid: advanced, no dunning, no notice', async () => {
    const expiry = new Date(Date.now() - DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry)]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    mockFail.mockResolvedValue(false); // failBillingCharge refuses to touch a COMPLETED row
    await processHuntPassBilling();
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    const data = mockUserUpdateMany.mock.calls[0][0].data;
    expect(new Date(data.huntPassExpiry).getTime()).toBe(plus30(expiry));
    expect(data.huntPassLastFailureReason).toBeNull();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('a successful payment is recorded through completeBillingCharge, never failBillingCharge', async () => {
    mockUserFindMany.mockResolvedValueOnce([dueUser(new Date(Date.now() - DAY))]);
    await processHuntPassBilling();
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockFail).not.toHaveBeenCalled();
  });

  it('a ledger write failure after a successful payment never blocks the renewal', async () => {
    const expiry = new Date(Date.now() - DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry)]);
    mockComplete.mockRejectedValue(new Error('db down'));
    await processHuntPassBilling();
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    expect(new Date(mockUserUpdateMany.mock.calls[0][0].data.huntPassExpiry).getTime()).toBe(plus30(expiry));
  });
});

describe('stale failure is ignored', () => {
  it('a decline after the shopper resubscribed (expiry moved) writes nothing and sends no notice', async () => {
    const expiry = new Date(Date.now() - DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry)]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    mockUserUpdateMany.mockResolvedValue({ count: 0 }); // conditional write no longer matches the period
    await processHuntPassBilling();
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUserUpdateMany.mock.calls[0][0].where).toEqual({ id: 'user_1', huntPassExpiry: expiry });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});

describe('decline path (dunning)', () => {
  it('first decline: ledger FAILED, dunning recorded once, one notice, access retained, expiry not advanced', async () => {
    const expiry = new Date(Date.now() - DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry)]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    await processHuntPassBilling();
    expect(mockFail).toHaveBeenCalledWith('chg_1', 'Card declined');
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1); // exactly one state change, no advance
    const { where, data } = mockUserUpdateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'user_1', huntPassExpiry: expiry });
    expect(data.huntPassDunningFailCount).toBe(1);
    expect(data.huntPassNextRetryAt).toBeInstanceOf(Date);
    expect(data.huntPassGraceEndsAt).toBeInstanceOf(Date);
    expect(data.huntPassLastFailureReason).toBe('Card declined');
    expect(data.huntPassActive).toBeUndefined(); // not deactivated on the first failure
    expect(data.huntPassExpiry).toBeUndefined();
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0].type).toBe('huntpass_billing_first_failure');
  });

  it('a dunning retry uses a new idempotency key (attempt number) but the SAME period key', async () => {
    const expiry = new Date(Date.now() - 3 * DAY);
    mockUserFindMany
      .mockResolvedValueOnce([dueUser(expiry, { huntPassDunningFailCount: 0 })])
      .mockResolvedValueOnce([dueUser(expiry, { huntPassDunningFailCount: 1, huntPassGraceEndsAt: new Date(Date.now() + 5 * DAY) })]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    await processHuntPassBilling();
    await processHuntPassBilling();
    const k = mockChargeStoredCard.mock.calls.map((c: any[]) => c[0].idempotencyParts.join('|'));
    expect(k[0]).not.toEqual(k[1]);
    const pk = mockClaim.mock.calls.map((c: any[]) => c[0].periodKey);
    expect(pk[0]).toEqual(pk[1]);
    expect(mockNotify.mock.calls[1][0].type).toBe('huntpass_billing_retry_failure');
  });

  it('a retry with a different card gets a different idempotency key', async () => {
    const expiry = new Date(Date.now() - 3 * DAY);
    mockUserFindMany
      .mockResolvedValueOnce([dueUser(expiry, { huntPassDunningFailCount: 1, huntPassSquareCardId: 'card_1' })])
      .mockResolvedValueOnce([dueUser(expiry, { huntPassDunningFailCount: 1, huntPassSquareCardId: 'card_2' })]);
    await processHuntPassBilling();
    await processHuntPassBilling();
    const k = mockChargeStoredCard.mock.calls.map((c: any[]) => c[0].idempotencyParts.join('|'));
    expect(k[0]).not.toEqual(k[1]);
  });

  it('grace exhausted: one conditional deactivation and one notice, no expiry advance', async () => {
    const expiry = new Date(Date.now() - 10 * DAY);
    mockUserFindMany.mockResolvedValueOnce([
      dueUser(expiry, { huntPassDunningFailCount: 3, huntPassGraceEndsAt: new Date(Date.now() - 1 * DAY) }),
    ]);
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    await processHuntPassBilling();
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    const { where, data } = mockUserUpdateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'user_1', huntPassExpiry: expiry });
    expect(data.huntPassActive).toBe(false);
    expect(data.huntPassExpiry).toBeUndefined();
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0].type).toBe('huntpass_billing_dunning_exhausted');
  });
});

describe('cancel at period end', () => {
  it('deactivates through a conditional write and never claims or charges', async () => {
    const expiry = new Date(Date.now() - DAY);
    mockUserFindMany.mockResolvedValueOnce([dueUser(expiry, { huntPassCancelAtPeriodEnd: true })]);
    await processHuntPassBilling();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    const { where, data } = mockUserUpdateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'user_1', huntPassCancelAtPeriodEnd: true, huntPassExpiry: expiry });
    expect(data.huntPassActive).toBe(false);
  });

  it('a shopper who undid the cancellation after the scan is not deactivated', async () => {
    mockUserFindMany.mockResolvedValueOnce([dueUser(new Date(Date.now() - DAY), { huntPassCancelAtPeriodEnd: true })]);
    mockUserUpdateMany.mockResolvedValue({ count: 0 });
    await processHuntPassBilling();
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
  });
});
