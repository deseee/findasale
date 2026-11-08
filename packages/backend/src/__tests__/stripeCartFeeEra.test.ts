/**
 * Legacy Stripe cart-checkout webhook fee restatement (2026-09-30): the cart_checkout branch resolves the fee with
 * resolveReportingFeeRate (era taken from the Checkout Session's created time), not the legacy flat
 * getPlatformFeeRate. Pure function checks (the Stripe webhook itself was removed with Stripe on 2026-11-04;
 * resolveReportingFeeRate still restates historical rows in reports).
 */
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
