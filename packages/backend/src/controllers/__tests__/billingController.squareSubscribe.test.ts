/**
 * POST /api/billing/square/subscribe payment-first behavior (2026-09-29, P0 free-tier-forever fix).
 * Square, Prisma and the billing ledger are all mocked: no real Square call or charge is possible.
 * The real SQUARE_TIER_PRICE_CENTS and computeUpgradeProrationCents are used so amounts are real.
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
const req = (body: any = {}) => ({ user: { id: 'user_1' }, body } as any);

/** Stateful fake organizer row, mutated by the update mock like the real table would be. */
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
  mockOrganizerUpdate.mockImplementation(async ({ where, data }: any) => {
    if (where.billingCurrentPeriodEnd !== undefined) {
      const a = where.billingCurrentPeriodEnd ? new Date(where.billingCurrentPeriodEnd).getTime() : null;
      const b = row.billingCurrentPeriodEnd ? new Date(row.billingCurrentPeriodEnd).getTime() : null;
      if (a !== b) { const e: any = new Error('not found'); e.code = 'P2025'; throw e; }
    }
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
  mockClearGracePeriod.mockResolvedValue({ itemsRestored: 0, membersRestored: 0 });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('validation', () => {
  it('401 without a user, 400 for a bad tier or missing sourceId, and nothing is charged', async () => {
    let res = makeRes();
    await createSquareBillingSubscription({ body: { tier: 'PRO', sourceId: 'x' } } as any, res);
    expect(res.statusCode).toBe(401);
    res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'SIMPLE', sourceId: 'x' }), res);
    expect(res.statusCode).toBe(400);
    res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO' }), res);
    expect(res.statusCode).toBe(400);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });
});

describe('new_period: a lapsed / returning Square organizer is charged before anything is granted', () => {
  it('charges the server-side PRO price, then grants tier and a 30 day period from the payment', async () => {
    const before = Date.now();
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:1' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    const charge = mockChargeStoredCard.mock.calls[0][0];
    expect(charge.amountCents).toBe(2900);
    expect(charge.requireCompleted).toBe(true);
    expect(charge.customerId).toBe('cust_1');
    expect(charge.cardId).toBe('card_1');
    // idempotency parts carry organizer + tier + period id + card discriminator
    expect(charge.idempotencyParts).toEqual(expect.arrayContaining(['org_1', 'PRO', 'cnon:1']));
    expect(charge.idempotencyParts.some((p: string) => p.startsWith('subscribe:PRO:none:'))).toBe(true);
    expect(mockCompleteCharge).toHaveBeenCalledWith('chg_1', 'pay_1');
    const data = mockOrganizerUpdate.mock.calls[0][0].data;
    expect(data.subscriptionTier).toBe('PRO');
    expect(data.billingProcessor).toBe('square');
    expect(data.subscriptionStatus).toBe('active');
    expect(data.trialEndsAt).toBeNull();
    expect(new Date(data.billingCurrentPeriodEnd).getTime()).toBeGreaterThanOrEqual(before + 30 * DAY - 5000);
    expect(mockClearGracePeriod).toHaveBeenCalledWith('org_1', 'PRO');
    expect(res.body).toMatchObject({ tier: 'PRO', status: 'active', chargedCents: 2900, mode: 'new_period', billingProcessor: 'square' });
  });

  it('charges TEAMS at the TEAMS price', async () => {
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'TEAMS', sourceId: 'cnon:1' }), res);
    expect(mockChargeStoredCard.mock.calls[0][0].amountCents).toBe(7900);
    expect(res.body.chargedCents).toBe(7900);
  });

  it('claims the ledger row BEFORE charging', async () => {
    const order: string[] = [];
    mockClaimCharge.mockImplementation(async () => { order.push('claim'); return { state: 'claimed', id: 'chg_1' }; });
    mockChargeStoredCard.mockImplementation(async () => { order.push('charge'); return { ok: true, paymentId: 'pay_1', status: 'COMPLETED' }; });
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:1' }), makeRes());
    expect(order).toEqual(['claim', 'charge']);
  });

  it('dunning recovery (past_due, period already ended) charges a fresh period and clears dunning fields', async () => {
    row = baseRow({ subscriptionTier: 'PRO', subscriptionStatus: 'past_due', billingCurrentPeriodEnd: new Date(Date.now() - 2 * DAY) });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:2' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    const data = mockOrganizerUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({ billingDunningFailCount: 0, billingNextRetryAt: null, billingGraceEndsAt: null, billingLastFailureReason: null, subscriptionStatus: 'active' });
    expect(data.tokenVersion).toBeUndefined(); // same tier, no JWT invalidation needed
  });
});

describe('declined card', () => {
  it('returns 402 CARD_DECLINED and leaves tier, period end and stored card untouched', async () => {
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:bad' }), res);
    expect(res.statusCode).toBe(402);
    expect(res.body.code).toBe('CARD_DECLINED');
    expect(res.body.message).toMatch(/declined/i);
    expect(res.body.message).not.toMatch(/\u2014/); // no em dash in user copy
    expect(mockFailCharge).toHaveBeenCalledWith('chg_1', 'Card declined');
    expect(mockCompleteCharge).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
    expect(mockRoleSubUpsert).not.toHaveBeenCalled();
    expect(mockClearGracePeriod).not.toHaveBeenCalled();
    expect(row.subscriptionTier).toBe('SIMPLE');
    expect(row.billingCurrentPeriodEnd).toBeNull();
  });

  it('a retry with a NEW card after a decline uses a different Square idempotency key and succeeds', async () => {
    mockChargeStoredCard.mockResolvedValueOnce({ ok: false, message: 'Card declined' });
    const r1 = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:bad' }), r1);
    expect(r1.statusCode).toBe(402);
    const r2 = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:good' }), r2);
    expect(r2.statusCode).toBe(200);
    const keys = mockChargeStoredCard.mock.calls.map((c: any[]) => c[0].idempotencyParts.join('|'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toEqual(keys[1]);
    // a payment that Square reports as anything other than COMPLETED is refused by the charge helper
    // (requireCompleted), which surfaces here as ok:false -- covered in the service test.
  });
});

describe('ALREADY_ACTIVE and repeated calls (the free-forever loop)', () => {
  it('409 ALREADY_ACTIVE for the same tier while a paid period is running: no card, no charge, no writes', async () => {
    row = baseRow({ subscriptionTier: 'PRO', subscriptionStatus: 'active', billingCurrentPeriodEnd: new Date(Date.now() + 10 * DAY) });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ALREADY_ACTIVE');
    expect(mockCreateCard).not.toHaveBeenCalled();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });

  it('a scheduled cancellation still counts as active and points to undo cancel', async () => {
    row = baseRow({ subscriptionTier: 'TEAMS', subscriptionStatus: 'scheduled_for_cancellation', billingCurrentPeriodEnd: new Date(Date.now() + 5 * DAY) });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'TEAMS', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'ALREADY_ACTIVE', cancelAtPeriodEnd: true });
    expect(res.body.message).toMatch(/undo/i);
  });

  it('calling subscribe repeatedly charges exactly once and never moves the period end again', async () => {
    const r1 = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:1' }), r1);
    expect(r1.statusCode).toBe(200);
    const periodAfterFirst = new Date(row.billingCurrentPeriodEnd).getTime();
    for (let i = 2; i <= 5; i++) {
      const r = makeRes();
      await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: `cnon:${i}` }), r);
      expect(r.statusCode).toBe(409);
      expect(r.body.code).toBe('ALREADY_ACTIVE');
    }
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    expect(mockOrganizerUpdate).toHaveBeenCalledTimes(1);
    expect(new Date(row.billingCurrentPeriodEnd).getTime()).toBe(periodAfterFirst);
  });

  it('two simultaneous requests for one organizer: the second is 409 PAYMENT_IN_PROGRESS and only one card is created', async () => {
    let release: (v: any) => void = () => undefined;
    mockCreateCard.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:1' }), makeRes());
    await new Promise(r => setImmediate(r));
    const res2 = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:2' }), res2);
    expect(res2.statusCode).toBe(409);
    expect(res2.body.code).toBe('PAYMENT_IN_PROGRESS');
    release({ customerId: 'cust_1', cardId: 'card_1' });
    await first;
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
    // lock is released afterwards
    row = baseRow();
    const res3 = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:3' }), res3);
    expect(res3.body.code).not.toBe('PAYMENT_IN_PROGRESS');
  });

  it('the in-process lock is released after a decline too', async () => {
    mockChargeStoredCard.mockResolvedValueOnce({ ok: false, message: 'Card declined' });
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:bad' }), makeRes());
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:ok' }), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('upgrade PRO -> TEAMS mid period (prorated difference, period end unchanged)', () => {
  it('charges (7900-2900) prorated by remaining days, sets TEAMS, and does not move the period end', async () => {
    const periodEnd = new Date(Date.now() + 15 * DAY - 60 * 1000); // 15 days left (ceil)
    row = baseRow({ subscriptionTier: 'PRO', subscriptionStatus: 'active', billingCurrentPeriodEnd: periodEnd });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'TEAMS', sourceId: 'cnon:up' }), res);
    expect(res.statusCode).toBe(200);
    const charge = mockChargeStoredCard.mock.calls[0][0];
    expect(charge.amountCents).toBe(2500); // 5000 * 15 / 30
    expect(charge.idempotencyParts.some((p: string) => p.startsWith('upgrade:PRO>TEAMS:'))).toBe(true);
    const upd = mockOrganizerUpdate.mock.calls[0][0];
    expect(upd.data.subscriptionTier).toBe('TEAMS');
    expect(upd.data.subscriptionStatus).toBe('active');
    expect(upd.data.billingCurrentPeriodEnd).toBeUndefined();
    expect(new Date(row.billingCurrentPeriodEnd).getTime()).toBe(periodEnd.getTime());
    expect(upd.data.tokenVersion).toEqual({ increment: 1 });
    expect(res.body).toMatchObject({ tier: 'TEAMS', chargedCents: 2500, mode: 'upgrade' });
    expect(mockClearGracePeriod).toHaveBeenCalledWith('org_1', 'TEAMS');
  });

  it('a declined upgrade leaves the organizer on PRO', async () => {
    row = baseRow({ subscriptionTier: 'PRO', subscriptionStatus: 'active', billingCurrentPeriodEnd: new Date(Date.now() + 15 * DAY) });
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'TEAMS', sourceId: 'cnon:up' }), res);
    expect(res.statusCode).toBe(402);
    expect(row.subscriptionTier).toBe('PRO');
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });

  it('TEAMS -> PRO while paid is refused (downgrades are scheduled for period end elsewhere)', async () => {
    row = baseRow({ subscriptionTier: 'TEAMS', subscriptionStatus: 'active', billingCurrentPeriodEnd: new Date(Date.now() + 15 * DAY) });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:dn' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('DOWNGRADE_NOT_ALLOWED');
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });
});

describe('trial handling (documented trial-to-paid flow)', () => {
  it('first-ever Square subscription: 7 day trial, card stored, NO charge, period end = trial end', async () => {
    row = baseRow({ billingProcessor: null, subscriptionTier: 'SIMPLE', subscriptionStatus: null });
    const before = Date.now();
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:t' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockClaimCharge).not.toHaveBeenCalled();
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    const data = mockOrganizerUpdate.mock.calls[0][0].data;
    expect(data.subscriptionStatus).toBe('trialing');
    expect(data.billingProcessor).toBe('square');
    expect(new Date(data.trialEndsAt).getTime()).toBeGreaterThanOrEqual(before + 7 * DAY - 5000);
    expect(data.billingCurrentPeriodEnd).toEqual(data.trialEndsAt);
    expect(res.body).toMatchObject({ status: 'trialing', chargedCents: 0, mode: 'trial_start' });
  });

  it('the trial happens once: a second call during the trial swaps the card but never extends the trial or period', async () => {
    row = baseRow({ billingProcessor: null, subscriptionTier: 'SIMPLE', subscriptionStatus: null });
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:t1' }), makeRes());
    const trialEnd = new Date(row.trialEndsAt).getTime();
    const periodEnd = new Date(row.billingCurrentPeriodEnd).getTime();
    for (let i = 2; i <= 4; i++) {
      const res = makeRes();
      await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: `cnon:t${i}` }), res);
      expect(res.statusCode).toBe(200);
      expect(res.body.mode).toBe('trial_update');
      expect(res.body.chargedCents).toBe(0);
    }
    expect(new Date(row.trialEndsAt).getTime()).toBe(trialEnd);
    expect(new Date(row.billingCurrentPeriodEnd).getTime()).toBe(periodEnd);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
  });

  it('after the trial (billingProcessor is now square) a fresh subscribe is charged, not a second trial', async () => {
    row = baseRow({ billingProcessor: 'square', subscriptionTier: 'SIMPLE', subscriptionStatus: 'canceled', trialEndsAt: new Date(Date.now() - 20 * DAY) });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.body.mode).toBe('new_period');
    expect(mockChargeStoredCard).toHaveBeenCalledTimes(1);
  });
});

describe('failure and recovery paths', () => {
  it('ledger already COMPLETED for this period: grants WITHOUT a second charge', async () => {
    mockClaimCharge.mockResolvedValue({ state: 'already_completed', id: 'chg_1', paymentId: 'pay_old' });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:retry' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).toHaveBeenCalledTimes(1);
  });

  it('ledger claim in progress (another attempt): 409 PAYMENT_IN_PROGRESS, no charge', async () => {
    mockClaimCharge.mockResolvedValue({ state: 'in_progress' });
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });

  it('ledger unavailable (claim throws): fails closed with 500, nothing charged or granted', async () => {
    mockClaimCharge.mockRejectedValue(new Error('relation "OrganizerBillingCharge" does not exist'));
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(500);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });

  it('card save failure is a 400 with nothing charged', async () => {
    mockCreateCard.mockRejectedValue(new Error('bad token'));
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(400);
    expect(mockChargeStoredCard).not.toHaveBeenCalled();
  });

  it('payment completed but the plan write fails: 500 ACTIVATION_PENDING (retry will not charge again)', async () => {
    mockOrganizerUpdate.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('ACTIVATION_PENDING');
    expect(mockCompleteCharge).toHaveBeenCalledWith('chg_1', 'pay_1'); // COMPLETED is recorded before the grant
  });

  it('organizer changed mid-request (optimistic guard misses): 409 SUBSCRIPTION_CHANGED', async () => {
    mockOrganizerUpdate.mockRejectedValue(Object.assign(new Error('no record'), { code: 'P2025' }));
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SUBSCRIPTION_CHANGED');
  });

  it('a ledger write failure after a successful payment never blocks the grant', async () => {
    mockCompleteCharge.mockRejectedValue(new Error('ledger down'));
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(200);
    expect(row.subscriptionTier).toBe('PRO');
  });

  it('a racing COMPLETED (failBillingCharge returns false) is not reported as a decline', async () => {
    mockChargeStoredCard.mockResolvedValue({ ok: false, message: 'Card declined' });
    mockFailCharge.mockResolvedValue(false);
    const res = makeRes();
    await createSquareBillingSubscription(req({ tier: 'PRO', sourceId: 'cnon:x' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect(mockOrganizerUpdate).not.toHaveBeenCalled();
  });
});
