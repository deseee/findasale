/**
 * Boot-time STRIPE_SECRET_KEY decision (2026-09-29): a missing key is fatal only when Stripe is NOT
 * closed (STRIPE_PLATFORM_CLOSED explicitly 'false'); while Stripe is closed (the default) the server
 * warns once and keeps booting because payments run on Square.
 */
import { evaluateStripeBootConfig, isStripePlatformClosed } from '../stripeBootConfig';

describe('isStripePlatformClosed', () => {
  it('is closed by default and for any value except the literal string false', () => {
    expect(isStripePlatformClosed({})).toBe(true);
    expect(isStripePlatformClosed({ STRIPE_PLATFORM_CLOSED: 'true' })).toBe(true);
    expect(isStripePlatformClosed({ STRIPE_PLATFORM_CLOSED: '' })).toBe(true);
    expect(isStripePlatformClosed({ STRIPE_PLATFORM_CLOSED: 'FALSE' })).toBe(true);
    expect(isStripePlatformClosed({ STRIPE_PLATFORM_CLOSED: '0' })).toBe(true);
  });
  it('is open only when explicitly false', () => {
    expect(isStripePlatformClosed({ STRIPE_PLATFORM_CLOSED: 'false' })).toBe(false);
  });
});

describe('evaluateStripeBootConfig', () => {
  it('key present: ok, whatever the closed flag says', () => {
    expect(evaluateStripeBootConfig({ STRIPE_SECRET_KEY: 'test-key-not-real' })).toEqual({ action: 'ok', stripeClosed: true, message: null });
    expect(evaluateStripeBootConfig({ STRIPE_SECRET_KEY: 'test-key-not-real', STRIPE_PLATFORM_CLOSED: 'false' })).toEqual({
      action: 'ok',
      stripeClosed: false,
      message: null,
    });
  });

  it('key missing and Stripe closed (default): warn once with a clear message, do not exit', () => {
    const d = evaluateStripeBootConfig({});
    expect(d.action).toBe('warn');
    expect(d.stripeClosed).toBe(true);
    expect(d.message).toContain('STRIPE_SECRET_KEY is not set');
    expect(d.message).toContain('Square');
    expect(d.message).toContain('503 STRIPE_NOT_CONFIGURED');
    expect(evaluateStripeBootConfig({ STRIPE_PLATFORM_CLOSED: 'true' }).action).toBe('warn');
  });

  it('a blank or whitespace key counts as missing', () => {
    expect(evaluateStripeBootConfig({ STRIPE_SECRET_KEY: '' }).action).toBe('warn');
    expect(evaluateStripeBootConfig({ STRIPE_SECRET_KEY: '   ' }).action).toBe('warn');
    expect(evaluateStripeBootConfig({ STRIPE_SECRET_KEY: '', STRIPE_PLATFORM_CLOSED: 'false' }).action).toBe('exit');
  });

  it('key missing and Stripe explicitly NOT closed: hard exit', () => {
    const d = evaluateStripeBootConfig({ STRIPE_PLATFORM_CLOSED: 'false' });
    expect(d.action).toBe('exit');
    expect(d.stripeClosed).toBe(false);
    expect(d.message).toContain('FATAL');
    expect(d.message).toContain('STRIPE_SECRET_KEY');
  });
});
