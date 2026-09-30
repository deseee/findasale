/**
 * utils/stripe with no STRIPE_SECRET_KEY (2026-09-29): importing the module never throws, the client
 * is only built on first use, and a legacy Stripe path that really calls getStripe() gets a typed
 * 503 STRIPE_NOT_CONFIGURED error. The stripe SDK is mocked, so no client or network call is made.
 */
const mockStripeCtor = jest.fn();
jest.mock('stripe', () => ({
  __esModule: true,
  default: function StripeMock(this: any, ...args: any[]) {
    mockStripeCtor(...args);
    this.marker = 'stripe-instance';
  },
}));

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_TEST_KEY = process.env.STRIPE_TEST_SECRET_KEY;

function load() {
  let mod: typeof import('../stripe');
  jest.isolateModules(() => {
    mod = require('../stripe');
  });
  return mod!;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_TEST_SECRET_KEY;
});
afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  if (ORIGINAL_TEST_KEY === undefined) delete process.env.STRIPE_TEST_SECRET_KEY; else process.env.STRIPE_TEST_SECRET_KEY = ORIGINAL_TEST_KEY;
});

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
};

describe('importing utils/stripe without a key', () => {
  it('does not throw and does not construct a client', () => {
    expect(() => load()).not.toThrow();
    expect(mockStripeCtor).not.toHaveBeenCalled();
  });
});

describe('getStripe without a key', () => {
  it('throws a typed 503 STRIPE_NOT_CONFIGURED error', () => {
    const { getStripe, StripeNotConfiguredError, isStripeNotConfiguredError } = load();
    let caught: any;
    try { getStripe(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(StripeNotConfiguredError);
    expect(caught.status).toBe(503);
    expect(caught.statusCode).toBe(503);
    expect(caught.code).toBe('STRIPE_NOT_CONFIGURED');
    expect(caught.message).toContain('STRIPE_SECRET_KEY is not defined');
    expect(isStripeNotConfiguredError(caught)).toBe(true);
    expect(isStripeNotConfiguredError(new Error('other'))).toBe(false);
    expect(isStripeNotConfiguredError(null)).toBe(false);
    expect(mockStripeCtor).not.toHaveBeenCalled();
  });

  it('getTestStripe without either key also fails with the same typed error', () => {
    const { getTestStripe } = load();
    expect(() => getTestStripe()).toThrow(expect.objectContaining({ code: 'STRIPE_NOT_CONFIGURED' }));
  });

  it('with a key it builds the client once and reuses it', () => {
    process.env.STRIPE_SECRET_KEY = 'test-key-not-real';
    const { getStripe } = load();
    const a = getStripe();
    const b = getStripe();
    expect(a).toBe(b);
    expect(mockStripeCtor).toHaveBeenCalledTimes(1);
    expect(mockStripeCtor.mock.calls[0][0]).toBe('test-key-not-real');
  });
});

describe('stripeUnavailableGuard', () => {
  it('answers 503 STRIPE_NOT_CONFIGURED without a key and does not call next', () => {
    const { stripeUnavailableGuard } = load();
    const res = makeRes();
    const next = jest.fn();
    stripeUnavailableGuard({} as any, res, next);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('STRIPE_NOT_CONFIGURED');
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through when a key is set', () => {
    process.env.STRIPE_SECRET_KEY = 'test-key-not-real';
    const { stripeUnavailableGuard, isStripeConfigured } = load();
    const res = makeRes();
    const next = jest.fn();
    stripeUnavailableGuard({} as any, res, next);
    expect(isStripeConfigured()).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.body).toBeUndefined();
  });
});

// Makes this file a module so its top-level names do not collide with other test files in the project-wide type check.
export {};
