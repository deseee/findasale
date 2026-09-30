/**
 * createSquareBillingSubscription UTC-midnight edge (2026-09-29). A first-paid-period subscribe keys its
 * ledger row by UTC day. If an attempt was charged (COMPLETED) but activating the plan failed, a retry
 * after UTC midnight used to build a new key and charge again. The retry path now looks up a recent
 * COMPLETED-but-unactivated row for the same organizer + tier and re-applies the grant instead.
 * Square, Prisma and the ledger are mocked: no real charge is possible.
 */
const mockOrganizerFindUnique = jest.fn();
const mockOrganizerUpdate = jest.fn();
const mockRoleSubUpsert = jest.fn();
const mockClearGracePeriod = jest.fn();
const mockCreateCard = jest.fn();
const mockChargeStoredCard = jest.fn();
const mockClaimCharge = jest.fn();
const mockCompleteCharge = jest.fn();
const mockFailCharge = jest.fn();
const mockFindRecentCompleted = jest.fn();

jest.mock('square', () => ({ SquareError: class SquareError extends Error {} }));
jest.mock('../../utils/square', () => ({ getSquarePlatformClient: jest.fn() }));
jest.mock('../../services/squarePaymentService', () => ({
  toSquareMoney: (n: number) => ({ amount: BigInt(n), currency: 'USD' }),
  buildSquareIdempotencyKey: (parts: string[]) => parts.join('|').slice(0, 45),
}));
jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizer: {
      findUnique: (...a: any[]) => mockOrganizerFindUnique(...a),
      update: (...a: any[]) => mockOrganizerUpdate(...a),
    },
    userRoleSubscription: { upsert: (...a: any[]) => mockRoleSubUpsert(...a) },
  },
}));
jest.mock('../../utils/stripe', () => ({ getStripe: () => ({}) }));
jest.mock('../../lib/syncTier', () => ({ syncTier: jest.fn() }));
jest.mock('../../services/tierGraceService', () => ({
  calculateDowngradeDelta: jest.fn(),
  triggerGracePeriod: jest.fn(),
  clearGracePeriod: (...a: any[]) => mockClearGracePeriod(...a),
}));
jest.mock('../../services/squareBillingService', () => ({
  ...jest.requireActual('../../services/squareBillingService'),
  createPlatformBillingCard: (...a: any[]) => mockCreateCard(...a),
  chargeStoredCard: (...a: any[]) => mockChargeStoredCard(...a),
}));
jest.mock('../../services/organizerBillingLedger', () => ({
  claimBillingCharge: (...a: any[]) => mockClaimCharge(...a),
  completeBillingCharge: (...a: any[]) => mockCompleteCharge(...a),
  failBillingCharge: (...a: any[]) => mockFailCharge(...a),
  findRecentCompletedSubscribeCharge: (...a: any[]) => mockFindRecentCompleted(...a),
}));

import { createSquareBillingSubscription } from '../billingController';

const DAY = 24 * 60 * 60 * 1000;

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(b: any) { this.body = b; return this; },
  };
  return res;
}
const req = (body: any = {}) => ({ user: { id: 'user_1' }, body }) as any;

let row: any;
const baseRow = (over: any = {}) => ({
  id: 'org_1',
  businessName: 'Biz',
  billingProcessor: 'square',
  subscriptionTier: 'SIMPLE',
  subscriptionStatus: 'canceled',
  billingCurrentPeriodEnd: null,
  trialEndsAt: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  row = baseRow();
  mockOrganizerFindUnique.mockImplementation(async () => ({ ...row }));
  mockOrganizerUpdate.mockImplementation(async ({ data }: any) => {
    const { tokenVersion, ...plain } = data;
    row = { ...row, ...plain };
    return { subscriptionTier: row.subscriptionTier, subscriptionStatus: row.subscriptionStatus, billingCurrentPeriodEnd: row.billingCurrentPeriodEnd, billingInterval: 'monthly' };
  });
  mockRoleSubUpsert.mockResolvedValue({});
  mockCreateCard.mockResolvedValue({ customerId: 'cust_1', cardId: 'card_1' });
  mockClaimCharge.mockResolvedValue({ state: 'claimed', id: 'chg_1' });
  mockChargeStoredCard.mockResolvedValue({ ok: true, paymentId: 'pay_1', status: 'COMPLETED' });
  mockCompleteCharge.mockResolvedValue(undefined);
  mockFailCharge.mockResolvedValue(true);
  mockFindRecentCompleted.mockResolvedValue(null);
  mockClearGracePeriod.mockResolvedValue({ itemsRestored: 0, membersRestored: 0 });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('subscribe retried across UTC midnight after a post-payment activation failure', () => {
  it('grants from the earlier COMPLETED row and does NOT charge again', async () => {
    // Yesterday's attempt: charged and COMPLETED, activation failed (organizer still lapsed, no period end).
    const yesterdayKey = 'subscribe:none:20260928';
    mockFindRecentCompleted.mockResolvedValue({ id: 'chg_old', periodKey: yesterdayKey, paymentId: 'pay_old', tier: 'PRO', amountCents: 2900 });
    mockClaimCharge.mockResolvedValue({ state: 'already_completed', id: 'chg_old', paymentId: 'pay_old', tier: 'PRO', amountCents: 2900, kind: 'SUBSCRIBE' });

    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:retry' }), res);

    expect(res.statusCode).toBe(200);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    // the lookup is scoped to organizer + the current period end, and is tier-blind (2026-09-30)
    expect(mockFindRecentCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ organizerId: 'org_1', periodEndKey: 'none' })
    );
    expect(mockFindRecentCompleted.mock.calls[0][0].tier).toBeUndefined();
    // the claim reuses YESTERDAY's exact key, not a new one for today's UTC day
    expect(mockClaimCharge).toHaveBeenCalledTimes(1);
    expect(mockClaimCharge.mock.calls[0][0].periodKey).toBe(yesterdayKey);
    // the plan is granted
    expect(row.subscriptionTier).toBe('PRO');
    expect(row.subscriptionStatus).toBe('active');
    expect(res.body.tier).toBe('PRO');
    expect(mockCompleteCharge).not.toHaveBeenCalled();
  });

  it('with a stored period end the lookup carries that period end (dunning recovery)', async () => {
    const end = new Date(Date.now() - 2 * DAY);
    row = baseRow({ subscriptionTier: 'PRO', subscriptionStatus: 'past_due', billingCurrentPeriodEnd: end });
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:d' }), makeRes());
    expect(mockFindRecentCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ organizerId: 'org_1', periodEndKey: end.toISOString() })
    );
    // the ended period is claimed under the renewal job's own key (same ledger row => never charged twice)
    expect(mockClaimCharge.mock.calls[0][0].periodKey).toBe(`renewal:${end.toISOString()}`);
  });

  it('no earlier COMPLETED row: a normal new charge is made with today\'s UTC-day key', async () => {
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:fresh' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // no tier in the key: a PRO and a TEAMS attempt for the same period share one ledger row
    expect(mockClaimCharge.mock.calls[0][0].periodKey).toBe(`subscribe:none:${today}`);
  });

  it('the lookup is tier-blind (a TEAMS request looks up any tier already paid for the period)', async () => {
    await createSquareBillingSubscription(req({ tier: 'TEAMS', sourceId: 'cnon:t' }), makeRes());
    expect(mockFindRecentCompleted.mock.calls[0][0]).not.toHaveProperty('tier');
    expect(mockClaimCharge.mock.calls[0][0].periodKey).toBe(`subscribe:none:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
  });

  it('paid PRO with a failed grant, then a TEAMS request the same day: grants the PAID PRO, no second charge', async () => {
    mockFindRecentCompleted.mockResolvedValue({ id: 'chg_pro', periodKey: 'subscribe:none:20260929', paymentId: 'pay_pro', tier: 'PRO', amountCents: 2900 });
    mockClaimCharge.mockResolvedValue({ state: 'already_completed', id: 'chg_pro', paymentId: 'pay_pro', tier: 'PRO', amountCents: 2900, kind: 'SUBSCRIBE' });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'TEAMS', sourceId: 'cnon:t2' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockClaimCharge.mock.calls[0][0].periodKey).toBe('subscribe:none:20260929');
    expect(row.subscriptionTier).toBe('PRO'); // the tier that was PAID, not the one asked for
    expect(res.body).toMatchObject({ tier: 'PRO', tierAdjusted: true, requestedTier: 'TEAMS', chargedCents: 2900 });
    expect(mockClearGracePeriod).toHaveBeenCalledWith('org_1', 'PRO');
    expect(mockRoleSubUpsert.mock.calls[0][0].update.subscriptionTier).toBe('PRO');
  });

  it('lookup failure fails closed: 500, nothing charged, nothing granted', async () => {
    mockFindRecentCompleted.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(500);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });

  it('an upgrade never uses the lookup (its key is period-end based, not UTC-day based)', async () => {
    row = baseRow({ subscriptionTier: 'PRO', subscriptionStatus: 'active', billingCurrentPeriodEnd: new Date(Date.now() + 10 * DAY) });
    await createSquareBillingSubscription(req({ tier: 'TEAMS', sourceId: 'cnon:u' }), makeRes());
    expect(mockFindRecentCompleted).not.toHaveBeenCalled();
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
  });

  it('the trial path never uses the lookup and never charges', async () => {
    row = baseRow({ billingProcessor: null });
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:tr' }), makeRes());
    expect(mockFindRecentCompleted).not.toHaveBeenCalled();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
  });
});
