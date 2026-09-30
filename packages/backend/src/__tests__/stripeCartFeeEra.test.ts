/**
 * Legacy Stripe cart-checkout webhook fee restatement (2026-09-30): the cart_checkout branch resolves the fee with
 * resolveReportingFeeRate (era taken from the Checkout Session's created time), not the legacy flat
 * getPlatformFeeRate. Pure function checks plus a source check that the branch is wired that way.
 */
import fs from 'fs';
import path from 'path';
import { resolveReportingFeeRate, getPlatformFeeRate, getInclusivePlatformFeeRate, INCLUSIVE_FEE_MODEL_EFFECTIVE_AT } from '../utils/feeCalculator';

const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const beforeEra = new Date(INCLUSIVE_FEE_MODEL_EFFECTIVE_AT.getTime() - 24 * 3600 * 1000);
const afterEra = new Date(INCLUSIVE_FEE_MODEL_EFFECTIVE_AT.getTime() + 24 * 3600 * 1000);
const fromSession = (created: number) => new Date(created * 1000);

describe('cart checkout fee: era from session.created', () => {
  it('a session opened before the inclusive model keeps the legacy 10% / 8%', () => {
    const d = fromSession(unix(beforeEra));
    expect(resolveReportingFeeRate('SIMPLE', d, 'ONLINE')).toBe(0.1);
    expect(resolveReportingFeeRate('PRO', d, 'ONLINE')).toBe(0.08);
    expect(resolveReportingFeeRate('TEAMS', d, 'ONLINE')).toBe(getPlatformFeeRate('TEAMS'));
  });

  it('a session opened under the inclusive model gets the inclusive ONLINE rate for the tier', () => {
    const d = fromSession(unix(afterEra));
    for (const tier of ['SIMPLE', 'PRO', 'TEAMS'] as const) {
      expect(resolveReportingFeeRate(tier, d, 'ONLINE')).toBe(getInclusivePlatformFeeRate(tier, 'ONLINE'));
    }
  });
});

describe('stripeController cart_checkout wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'stripeController.ts'), 'utf8');
  const start = src.indexOf('const cartFeeRate = resolveReportingFeeRate(');

  it('computes cartFeeRate with resolveReportingFeeRate from session.created', () => {
    expect(start).toBeGreaterThan(0);
    const call = src.slice(start, start + 400);
    expect(call).toContain('session.created');
    expect(call).toContain("'ONLINE'");
  });

  it('no longer feeds the legacy getPlatformFeeRate into the cart rows', () => {
    const branch = src.slice(start, start + 6000);
    expect(branch).not.toMatch(/getPlatformFeeRate\(/);
  });
});
