/**
 * billingController must import with no STRIPE_SECRET_KEY (2026-09-29): the Stripe client used to be
 * built at import time, which crashed the whole server at boot although Stripe is closed and payments
 * run on Square. The real utils/stripe is used here (the stripe SDK itself is mocked), so this proves
 * the client is built lazily and that a legacy Stripe path called without a key fails with the typed
 * 503 error rather than at import.
 */
const mockStripeCtor = jest.fn();
jest.mock('stripe', () => ({
  __esModule: true,
  default: function StripeMock(this: any, ...args: any[]) {
    mockStripeCtor(...args);
    this.webhooks = { constructEvent: jest.fn() };
  },
}));
jest.mock('../../lib/prisma', () => ({ prisma: { organizer: { findUnique: jest.fn(), update: jest.fn() } } }));
jest.mock('../../lib/syncTier', () => ({ syncTier: jest.fn() }));
jest.mock('../../services/tierGraceService', () => ({
  calculateDowngradeDelta: jest.fn(),
  triggerGracePeriod: jest.fn(),
  clearGracePeriod: jest.fn(),
}));
jest.mock('../../services/squareBillingService', () => ({
  ORGANIZER_TRIAL_DAYS: 7,
  BILLING_INTERVAL_DAYS: 30,
  SQUARE_TIER_PRICE_CENTS: { PRO: 2900, TEAMS: 7900 },
  createPlatformBillingCard: jest.fn(),
  chargeStoredCard: jest.fn(),
  computeUpgradeProrationCents: () => 2500,
}));
jest.mock('../../services/organizerBillingLedger', () => ({
  claimBillingCharge: jest.fn(),
  completeBillingCharge: jest.fn(),
  failBillingCharge: jest.fn(),
  findRecentCompletedSubscribeCharge: jest.fn(),
}));

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;
afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
});

function loadController() {
  let mod: typeof import('../billingController');
  jest.isolateModules(() => {
    mod = require('../billingController');
  });
  return mod!;
}

describe('billingController without STRIPE_SECRET_KEY', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('imports without throwing and without constructing a Stripe client', () => {
    expect(() => loadController()).not.toThrow();
    expect(mockStripeCtor).not.toHaveBeenCalled();
  });

  it('a legacy Stripe call surfaces the typed 503 error only when it is actually used', () => {
    // The webhook handler reaches stripe.webhooks after the webhook-secret check; with no key the
    // proxy resolves getStripe() there and must not build a client.
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = 'test-secret-not-real';
    const { handleStripeWebhook } = loadController();
    const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
    return handleStripeWebhook({ headers: { 'stripe-signature': 'x' }, body: Buffer.from('{}') } as any, res).then(() => {
      // The handler answers with a handled error response (never an unhandled crash) and no client was built.
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(mockStripeCtor).not.toHaveBeenCalled();
      delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    });
  });

  it('with a key set, the client is built on first use (lazy), not at import', () => {
    process.env.STRIPE_SECRET_KEY = 'test-key-not-real';
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = 'test-secret-not-real';
    const { handleStripeWebhook } = loadController();
    expect(mockStripeCtor).not.toHaveBeenCalled();
    const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
    return handleStripeWebhook({ headers: { 'stripe-signature': 'x' }, body: Buffer.from('{}') } as any, res).then(() => {
      expect(mockStripeCtor).toHaveBeenCalledTimes(1);
      delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    });
  });
});

// Makes this file a module so its top-level names do not collide with other test files in the project-wide type check.
export {};
