/**
 * Stripe is retired (owner decision 2026-11-04: "Nobody should be using Stripe anymore for anything,
 * period. The keys have been turned off."). The Stripe webhook, payment, Connect and subscription handlers
 * were deleted; every old Stripe endpoint must still answer old clients (and Stripe's own webhook retries)
 * with a clean 410 STRIPE_RETIRED instead of a 404 or a crash.
 *
 * WHAT THIS PROVES
 *   - index.ts mounts stripeUnavailableGuard in front of every retired Stripe path, BEFORE the routers that
 *     used to serve them are mounted
 *   - the non-Stripe routes that still live under /api/stripe (cash register, payouts view, refunds) are
 *     not guarded
 *   - the guard always answers 410 STRIPE_RETIRED and never calls next(), whatever the environment says
 *   - no backend source file imports the `stripe` SDK any more
 *
 * Source checks because importing index.ts boots the whole server. No network, no database.
 */
import * as fs from 'fs';
import * as path from 'path';
import { stripeUnavailableGuard, StripeRetiredError, isStripeRetiredError } from '../utils/stripe';

const SRC = path.join(__dirname, '..');
const indexSrc: string = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
const guardAt = (p: string) => indexSrc.indexOf(`app.use('${p}', stripeUnavailableGuard);`);

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('index.ts Stripe retirement gate', () => {
  it.each([
    '/api/stripe/webhook',
    '/api/billing/webhook',
    '/api/billing/portal',
    '/api/stripe/pending-payment',
    '/api/stripe/recover-payment-intent',
    '/api/stripe-connect',
    '/api/organizers/me/stripe/start-standard-migration',
    '/api/organizers/me/hub-owner/stripe/onboard',
    '/api/organizers/me/hub-owner/stripe/status',
  ])('guards %s before the routers are mounted', (p) => {
    const at = guardAt(p);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(indexSrc.indexOf("app.use('/api/stripe', stripeRoutes);"));
    expect(at).toBeLessThan(indexSrc.indexOf("app.use('/api/organizers',"));
    expect(at).toBeLessThan(indexSrc.indexOf("app.use('/api/billing', billingRoutes);"));
  });

  it('does not guard the non-Stripe routes that still live under /api/stripe', () => {
    expect(guardAt('/api/stripe/terminal/cash-payment')).toBe(-1);
    expect(guardAt('/api/stripe/refund')).toBe(-1);
    expect(guardAt('/api/stripe')).toBe(-1);
  });

  it('no longer mounts a Stripe Connect router', () => {
    expect(indexSrc).not.toMatch(/stripeConnectRoutes/);
  });
});

describe('stripeUnavailableGuard', () => {
  it.each([undefined, 'false', 'true'])('answers 410 STRIPE_RETIRED (STRIPE_PLATFORM_CLOSED=%s) and never calls next', (flag) => {
    const prevFlag = process.env.STRIPE_PLATFORM_CLOSED;
    const prevKey = process.env.STRIPE_SECRET_KEY;
    if (flag === undefined) delete process.env.STRIPE_PLATFORM_CLOSED; else process.env.STRIPE_PLATFORM_CLOSED = flag;
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_stale_key';
    try {
      const res = makeRes();
      const next = jest.fn();
      stripeUnavailableGuard({ path: '/webhook' } as any, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json.mock.calls[0][0].code).toBe('STRIPE_RETIRED');
    } finally {
      if (prevFlag === undefined) delete process.env.STRIPE_PLATFORM_CLOSED; else process.env.STRIPE_PLATFORM_CLOSED = prevFlag;
      if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = prevKey;
    }
  });

  it('StripeRetiredError carries status 410 and the STRIPE_RETIRED code', () => {
    const err = new StripeRetiredError();
    expect(err.status).toBe(410);
    expect(isStripeRetiredError(err)).toBe(true);
    expect(isStripeRetiredError(new Error('other'))).toBe(false);
  });
});

describe('no backend source imports the stripe SDK', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(full);
      return e.name.endsWith('.ts') ? [full] : [];
    });

  it('finds no import or require of `stripe`', () => {
    const offenders = walk(SRC).filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return /from\s+['"]stripe['"]|require\(\s*['"]stripe['"]\s*\)|import\(\s*['"]stripe['"]\s*\)/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
