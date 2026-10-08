/**
 * ADR-137 part C (roadmap #660): even if the rate engine wrongly reports a Standard Envelope win for a card priced at or
 * above $20, the shipping resolver must not hand the organizer's envelope policy to that card. It falls back to the
 * calculated (tracked) rate, the existing default. The rate engine is mocked here on purpose: the point is the second
 * line of defense inside matchStandardEnvelopePolicy.
 */
const mockComputeCheapestForOrigin = jest.fn();

jest.mock('../services/ebayRateEstimateService', () => ({
  computeCheapestForOrigin: (...args: any[]) => mockComputeCheapestForOrigin(...args),
  ShippingHardBlockError: class ShippingHardBlockError extends Error {},
}));

jest.mock('../services/ebayFlatRatePolicyService', () => ({
  computeFvfFlatRate: (rate: number) => rate,
  roundUpToBucket: (rate: number) => rate,
  applyCharmPricing: (rate: number) => rate,
  zone9TierForPackage: () => 'T4',
  priceBasisFromCheapest: () => null,
  buildFlatPolicyName: (_tier: string, rateStr: string) => `Lower 48 only | Flat $${rateStr}`,
}));

jest.mock('../services/ebayCalculatedPolicyService', () => ({
  computeCalculatedWithHandling: (rate: number) => ({ bucketedRate: rate, handlingCost: 1 }),
}));

import { resolveItemShipping } from '../services/ebayShippingResolver';

const POLICIES = [{ fulfillmentPolicyId: 'pol-env-1oz', name: '1oz Std Env $1.03' }];
const ORGANIZER = { lat: 42.96, lng: -85.66 };
const CARD = { packageWeightOz: 1, packageLengthIn: 6, packageWidthIn: 4, packageHeightIn: 0.2, ebayCategoryId: '183454' };

beforeEach(() => {
  mockComputeCheapestForOrigin.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each(['CALCULATED', 'FLAT_TIERS'])('resolveItemShipping, %s mode, card with a misreported envelope win', (shippingMode) => {
  it.each([20, 25, 29.99])('at $%s the envelope policy is NOT used', async (price) => {
    mockComputeCheapestForOrigin.mockResolvedValue({ carrier: 'USPS', rate: 0.78, basis: 'standard_envelope', zone: 'z5', fvfOnShipping: 0, netToSeller: 0.78 });
    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode },
      item: { ...CARD, price },
      fetchFulfillmentPolicies: async () => POLICIES,
    });
    expect(result.source).not.toBe('standard-envelope');
    expect(result.fulfillmentPolicyId).not.toBe('pol-env-1oz');
  });

  it('at $12 the envelope policy is used (the rule is a ceiling, not a ban)', async () => {
    mockComputeCheapestForOrigin.mockResolvedValue({ carrier: 'USPS', rate: 0.78, basis: 'standard_envelope', zone: 'z5', fvfOnShipping: 0, netToSeller: 0.78 });
    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode },
      item: { ...CARD, price: 12 },
      fetchFulfillmentPolicies: async () => POLICIES,
    });
    expect(result.source).toBe('standard-envelope');
    expect(result.fulfillmentPolicyId).toBe('pol-env-1oz');
  });
});
