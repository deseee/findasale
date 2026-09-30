/**
 * billingController DB-only cancel / undo / downgrade-preview / Square re-subscribe grace restore
 * (2026-09-29, Patrick D1/D2). NOT EXECUTED when written (jest cannot run on the authoring
 * device); CI is the first real run. No real Stripe or Square call is made: both are mocked, and
 * the tests assert that Stripe is never called on the closed-platform path.
 */
const mockOrganizerFindUnique = jest.fn();
const mockOrganizerUpdate = jest.fn();
const mockRoleSubUpsert = jest.fn();
const mockMarkdownCount = jest.fn();
const mockStripeUpdate = jest.fn();
const mockClearGracePeriod = jest.fn();
const mockCalculateDelta = jest.fn();
const mockCreateCard = jest.fn();
const mockChargeStoredCard = jest.fn();
const mockClaimCharge = jest.fn();
const mockCompleteCharge = jest.fn();
const mockFailCharge = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizer: {
      findUnique: (...a: any[]) => mockOrganizerFindUnique(...a),
      update: (...a: any[]) => mockOrganizerUpdate(...a),
    },
    userRoleSubscription: { upsert: (...a: any[]) => mockRoleSubUpsert(...a) },
    markdownCycle: { count: (...a: any[]) => mockMarkdownCount(...a) },
  },
}));
jest.mock('../../utils/stripe', () => ({
  getStripe: () => ({
    subscriptions: { update: (...a: any[]) => mockStripeUpdate(...a), retrieve: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
    billingPortal: { sessions: { create: jest.fn() } },
  }),
}));
jest.mock('../../lib/syncTier', () => ({ syncTier: jest.fn() }));
jest.mock('../../services/tierGraceService', () => ({
  calculateDowngradeDelta: (...a: any[]) => mockCalculateDelta(...a),
  triggerGracePeriod: jest.fn(),
  clearGracePeriod: (...a: any[]) => mockClearGracePeriod(...a),
}));
jest.mock('../../services/squareBillingService', () => ({
  ORGANIZER_TRIAL_DAYS: 7,
  BILLING_INTERVAL_DAYS: 30,
  SQUARE_TIER_PRICE_CENTS: { PRO: 2900, TEAMS: 7900 },
  createPlatformBillingCard: (...a: any[]) => mockCreateCard(...a),
  chargeStoredCard: (...a: any[]) => mockChargeStoredCard(...a),
  computeUpgradeProrationCents: () => 2500,
}));
jest.mock('../../services/organizerBillingLedger', () => ({
  claimBillingCharge: (...a: any[]) => mockClaimCharge(...a),
  completeBillingCharge: (...a: any[]) => mockCompleteCharge(...a),
  failBillingCharge: (...a: any[]) => mockFailCharge(...a),
}));

import {
  cancelSubscription,
  undoCancelSubscription,
  getDowngradePreview,
  confirmDowngrade,
  getSubscription,
  createSquareBillingSubscription,
} from '../billingController';

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
const authReq = (body: any = {}) => ({ user: { id: 'user_1' }, body }) as any;

const frozenOrganizer = (over: any = {}) => ({
  id: 'org_1',
  userId: 'user_1',
  subscriptionTier: 'PRO',
  subscriptionStatus: 'active',
  stripeSubscriptionId: 'sub_dead',
  billingProcessor: null,
  billingCurrentPeriodEnd: null,
  billingGraceEndsAt: null,
  billingInterval: null,
  trialEndsAt: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockOrganizerUpdate.mockResolvedValue({});
  mockMarkdownCount.mockResolvedValue(0);
  mockCalculateDelta.mockResolvedValue({ itemsHidden: 0, photosAffected: 0, teamMembersLosing: 0, totalItems: 12 });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('cancelSubscription (DB-only path)', () => {
  it('frozen Stripe organizer: schedules cancellation without calling Stripe, period end falls back to one interval from now', async () => {
    mockOrganizerFindUnique.mockResolvedValue(frozenOrganizer());
    const res = makeRes();
    const before = Date.now();
    await cancelSubscription(authReq(), res);
    expect(mockStripeUpdate).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      tier: 'PRO',
      status: 'scheduled_for_cancellation',
      cancelAtPeriodEnd: true,
      billingProcessor: null,
    });
    const end = new Date(res.body.currentPeriodEnd).getTime();
    expect(end).toBeGreaterThanOrEqual(before + 30 * DAY - 5000);
    const data = mockOrganizerUpdate.mock.calls[0][0].data;
    expect(data.subscriptionStatus).toBe('scheduled_for_cancellation');
    expect(data.billingCurrentPeriodEnd).toBeInstanceOf(Date);
    // tier is NOT touched by a cancel (D2: access runs until the period ends)
    expect(data.subscriptionTier).toBeUndefined();
  });

  it('uses the migration deadline as the end date when one was set', async () => {
    const deadline = new Date(Date.now() + 3 * DAY);
    mockOrganizerFindUnique.mockResolvedValue(frozenOrganizer({ billingGraceEndsAt: deadline }));
    const res = makeRes();
    await cancelSubscription(authReq(), res);
    expect(new Date(res.body.currentPeriodEnd).getTime()).toBe(deadline.getTime());
  });

  it('Square-billed organizer keeps its existing billingCurrentPeriodEnd (not overwritten)', async () => {
    const end = new Date(Date.now() + 10 * DAY);
    mockOrganizerFindUnique.mockResolvedValue(
      frozenOrganizer({ billingProcessor: 'square', billingCurrentPeriodEnd: end, billingInterval: 'monthly' })
    );
    const res = makeRes();
    await cancelSubscription(authReq(), res);
    expect(mockStripeUpdate).not.toHaveBeenCalled();
    expect(res.body.billingProcessor).toBe('square');
    expect(new Date(res.body.currentPeriodEnd).getTime()).toBe(end.getTime());
    expect(mockOrganizerUpdate.mock.calls[0][0].data.billingCurrentPeriodEnd).toBeUndefined();
  });

  it('is idempotent: an already scheduled cancellation is returned as is, with no write', async () => {
    const end = new Date(Date.now() + 5 * DAY);
    mockOrganizerFindUnique.mockResolvedValue(
      frozenOrganizer({ subscriptionStatus: 'scheduled_for_cancellation', billingCurrentPeriodEnd: end })
    );
    const res = makeRes();
    await cancelSubscription(authReq(), res);
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
    expect(new Date(res.body.currentPeriodEnd).getTime()).toBe(end.getTime());
  });

  it('SIMPLE organizer has nothing to cancel', async () => {
    mockOrganizerFindUnique.mockResolvedValue(frozenOrganizer({ subscriptionTier: 'SIMPLE' }));
    const res = makeRes();
    await cancelSubscription(authReq(), res);
    expect(res.statusCode).toBe(400);
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });

  it('requires authentication and an organizer profile', async () => {
    const res1 = makeRes();
    await cancelSubscription({ user: undefined } as any, res1);
    expect(res1.statusCode).toBe(401);
    mockOrganizerFindUnique.mockResolvedValue(null);
    const res2 = makeRes();
    await cancelSubscription(authReq(), res2);
    expect(res2.statusCode).toBe(404);
  });
});

describe('undoCancelSubscription', () => {
  it('puts a frozen organizer back to active and clears the synthetic period end', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      frozenOrganizer({ subscriptionStatus: 'scheduled_for_cancellation', billingCurrentPeriodEnd: new Date(Date.now() + 5 * DAY) })
    );
    mockOrganizerUpdate.mockResolvedValue({ subscriptionTier: 'PRO', billingCurrentPeriodEnd: null, billingInterval: null });
    const res = makeRes();
    await undoCancelSubscription(authReq(), res);
    expect(mockStripeUpdate).not.toHaveBeenCalled();
    const data = mockOrganizerUpdate.mock.calls[0][0].data;
    expect(data).toEqual({ subscriptionStatus: 'active', billingCurrentPeriodEnd: null });
    expect(res.body).toMatchObject({ status: 'active', cancelAtPeriodEnd: false, billingProcessor: null });
  });

  it('Square organizer: keeps billingCurrentPeriodEnd, restores trialing while a trial is still running', async () => {
    const end = new Date(Date.now() + 3 * DAY);
    mockOrganizerFindUnique.mockResolvedValue(
      frozenOrganizer({ billingProcessor: 'square', subscriptionStatus: 'scheduled_for_cancellation', billingCurrentPeriodEnd: end, trialEndsAt: end })
    );
    mockOrganizerUpdate.mockResolvedValue({ subscriptionTier: 'PRO', billingCurrentPeriodEnd: end, billingInterval: 'monthly' });
    const res = makeRes();
    await undoCancelSubscription(authReq(), res);
    const data = mockOrganizerUpdate.mock.calls[0][0].data;
    expect(data).toEqual({ subscriptionStatus: 'trialing' });
    expect(res.body.billingProcessor).toBe('square');
  });

  it('refuses when nothing is scheduled', async () => {
    mockOrganizerFindUnique.mockResolvedValue(frozenOrganizer());
    const res = makeRes();
    await undoCancelSubscription(authReq(), res);
    expect(res.statusCode).toBe(400);
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });

  it('refuses once the period has already ended', async () => {
    mockOrganizerFindUnique.mockResolvedValue(
      frozenOrganizer({ subscriptionStatus: 'scheduled_for_cancellation', billingCurrentPeriodEnd: new Date(Date.now() - DAY) })
    );
    const res = makeRes();
    await undoCancelSubscription(authReq(), res);
    expect(res.statusCode).toBe(400);
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });
});

describe('getDowngradePreview', () => {
  it('reports the real period end and the D1/D2 behavior, with no invented grace date', async () => {
    const end = new Date(Date.now() + 9 * DAY);
    mockOrganizerFindUnique.mockResolvedValue(
      frozenOrganizer({ billingProcessor: 'square', billingCurrentPeriodEnd: end, subscriptionTier: 'TEAMS' })
    );
    mockCalculateDelta.mockResolvedValue({ itemsHidden: 0, photosAffected: 2, teamMembersLosing: 3, totalItems: 40 });
    mockMarkdownCount.mockResolvedValue(2);
    const res = makeRes();
    await getDowngradePreview(authReq(), res);
    expect(res.body.planEndsAt).toBe(end.toISOString());
    expect(res.body.planEndsAtIsEstimate).toBe(false);
    expect(res.body.activeMarkdownCycles).toBe(2);
    expect(res.body.teamMembersLosing).toBe(3);
    expect(res.body.restoresAutomatically).toBe(false);
    expect(res.body).not.toHaveProperty('graceEndDate');
    expect(res.body).not.toHaveProperty('graceStartDate');
    expect(res.body).not.toHaveProperty('canRestoreWithin30Days');
  });

  it('PRO organizers have no staff access to lose, and a missing period end is flagged as an estimate', async () => {
    mockOrganizerFindUnique.mockResolvedValue(frozenOrganizer({ subscriptionTier: 'PRO' }));
    mockCalculateDelta.mockResolvedValue({ itemsHidden: 0, photosAffected: 0, teamMembersLosing: 4, totalItems: 5 });
    const res = makeRes();
    await getDowngradePreview(authReq(), res);
    expect(res.body.teamMembersLosing).toBe(0);
    expect(res.body.planEndsAtIsEstimate).toBe(true);
    expect(res.body.alreadyScheduled).toBe(false);
  });
});

describe('confirmDowngrade (DB-only path)', () => {
  it('schedules the cancellation, starts no grace period and never calls Stripe', async () => {
    mockOrganizerFindUnique.mockResolvedValue(frozenOrganizer());
    const res = makeRes();
    await confirmDowngrade(authReq(), res);
    expect(mockStripeUpdate).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.planEndsAt).toBeDefined();
    expect(res.body).not.toHaveProperty('graceEndAt');
  });
});

describe('getSubscription (closed Stripe platform)', () => {
  it('reports a scheduled DB-only cancellation with its end date and entitlement fields, without calling Stripe', async () => {
    const end = new Date(Date.now() + 6 * DAY);
    mockOrganizerFindUnique.mockResolvedValue(
      frozenOrganizer({ subscriptionStatus: 'scheduled_for_cancellation', billingCurrentPeriodEnd: end })
    );
    const res = makeRes();
    await getSubscription(authReq(), res);
    expect(res.body).toMatchObject({ status: 'scheduled_for_cancellation', cancelAtPeriodEnd: true, billingProcessor: null, inDunning: false });
    expect(new Date(res.body.currentPeriodEnd).getTime()).toBe(end.getTime());
    expect(res.body.entitlementEndsAt).toBe(end.toISOString());
  });

  it('Square organizer in dunning reports inDunning with the grace deadline as entitlementEndsAt', async () => {
    const grace = new Date(Date.now() + 4 * DAY);
    mockOrganizerFindUnique.mockResolvedValue(
      frozenOrganizer({
        billingProcessor: 'square',
        subscriptionStatus: 'past_due',
        billingCurrentPeriodEnd: new Date(Date.now() - 3 * DAY),
        billingGraceEndsAt: grace,
        squareCardId: 'card_1',
      })
    );
    const res = makeRes();
    await getSubscription(authReq(), res);
    expect(res.body.inDunning).toBe(true);
    expect(res.body.entitlementEndsAt).toBe(grace.toISOString());
  });
});

describe('createSquareBillingSubscription restores grace-locked items and staff', () => {
  const setup = (tier: 'PRO' | 'TEAMS') => {
    // 2026-09-29: a Square organizer with no running period (lapsed / re-subscribing) is charged
    // synchronously for a fresh period before anything is granted.
    mockOrganizerFindUnique.mockResolvedValue({
      id: 'org_1', businessName: 'Biz', billingProcessor: 'square', subscriptionTier: 'SIMPLE',
      subscriptionStatus: 'canceled', billingCurrentPeriodEnd: null, trialEndsAt: null,
    });
    mockCreateCard.mockResolvedValue({ customerId: 'cust_1', cardId: 'card_1' });
    mockClaimCharge.mockResolvedValue({ state: 'claimed', id: 'chg_1' });
    mockChargeStoredCard.mockResolvedValue({ ok: true, paymentId: 'pay_1', status: 'COMPLETED' });
    mockCompleteCharge.mockResolvedValue(undefined);
    mockOrganizerUpdate.mockResolvedValue({
      subscriptionTier: tier,
      subscriptionStatus: 'active',
      billingCurrentPeriodEnd: new Date(Date.now() + 30 * DAY),
      billingInterval: 'monthly',
    });
    mockRoleSubUpsert.mockResolvedValue({});
  };

  it('calls clearGracePeriod with the new tier (TEAMS)', async () => {
    setup('TEAMS');
    mockClearGracePeriod.mockResolvedValue({ itemsRestored: 3, membersRestored: 2 });
    const res = makeRes();
    await createSquareBillingSubscription(authReq({ tier: 'TEAMS', sourceId: 'cnon:abc' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockClearGracePeriod).toHaveBeenCalledWith('org_1', 'TEAMS');
  });

  it('calls clearGracePeriod with PRO so staff are not restored on a PRO plan', async () => {
    setup('PRO');
    mockClearGracePeriod.mockResolvedValue({ itemsRestored: 0, membersRestored: 0 });
    const res = makeRes();
    await createSquareBillingSubscription(authReq({ tier: 'PRO', sourceId: 'cnon:abc' }), res);
    expect(mockClearGracePeriod).toHaveBeenCalledWith('org_1', 'PRO');
  });

  it('a failure while restoring never fails the paid subscription', async () => {
    setup('PRO');
    mockClearGracePeriod.mockRejectedValue(new Error('restore failed'));
    const res = makeRes();
    await createSquareBillingSubscription(authReq({ tier: 'PRO', sourceId: 'cnon:abc' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ tier: 'PRO', billingProcessor: 'square' });
  });
});
