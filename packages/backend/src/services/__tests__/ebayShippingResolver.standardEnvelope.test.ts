/**
 * (roadmap #624) eBay Standard Envelope resolution must behave IDENTICALLY in both
 * shipping modes.
 *
 * The original fix only covered FLAT_TIERS organizers; a CALCULATED organizer's
 * envelope-eligible item still resolved to calculated-with-handling, quoting the buyer a
 * real parcel rate (several dollars) for a service the organizer had already configured at
 * ~$1.03-$1.65. These tests pin the parity so the two branches can't drift again.
 *
 * Everything below the resolver is mocked: the rate engine, the flat-rate service and the
 * calculated service all import prisma, and this is a pure routing/precedence test.
 * matchStandardEnvelopePolicy (utils/ebayPolicyParser) is deliberately NOT mocked -- the
 * real parser runs against real-shaped policy names.
 */

const mockComputeCheapestForOrigin = jest.fn();

jest.mock('../ebayRateEstimateService', () => ({
  computeCheapestForOrigin: (...args: any[]) => mockComputeCheapestForOrigin(...args),
  // instanceof is used by the resolver's catch blocks, so this must be a real class.
  ShippingHardBlockError: class ShippingHardBlockError extends Error {},
}));

jest.mock('../ebayFlatRatePolicyService', () => ({
  computeFvfFlatRate: (rate: number) => rate,
  roundUpToBucket: (rate: number) => rate,
  applyCharmPricing: (rate: number) => rate,
}));

jest.mock('../ebayCalculatedPolicyService', () => ({
  computeCalculatedWithHandling: (rate: number) => ({ bucketedRate: rate, handlingCost: 1 }),
}));

import { resolveItemShipping } from '../ebayShippingResolver';

const ENVELOPE_POLICIES = [
  { fulfillmentPolicyId: 'pol-env-1oz', name: '1oz under $20 Ebay Std Env $1.03' },
  { fulfillmentPolicyId: 'pol-env-3oz', name: '3oz under $20 Ebay Std Env $1.65' },
];

const ORGANIZER = { lat: 42.96, lng: -85.66 };

/** 2oz, $12 item with envelope-safe dims -- the real gating happens in the rate engine,
 *  which is mocked here, so these values only need to be internally consistent. */
const ENVELOPE_ITEM = {
  packageWeightOz: 2,
  packageLengthIn: 9,
  packageWidthIn: 6,
  packageHeightIn: 0.25,
  ebayCategoryId: '11116',
  price: 12,
};

function cheapest(basis: string, rate: number) {
  return { carrier: 'USPS', rate, basis, zone: 'ZONE_1_4', fvfOnShipping: 0, netToSeller: rate };
}

beforeEach(() => {
  mockComputeCheapestForOrigin.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('resolveItemShipping — CALCULATED mode Standard Envelope parity', () => {
  it('returns the organizer\'s REAL envelope policy instead of calculated-with-handling', async () => {
    mockComputeCheapestForOrigin.mockResolvedValue(cheapest('standard_envelope', 1.65));

    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode: 'CALCULATED' },
      item: ENVELOPE_ITEM,
      fetchFulfillmentPolicies: async () => ENVELOPE_POLICIES,
    });

    expect(result.source).toBe('standard-envelope');
    expect(result.fulfillmentPolicyId).toBe('pol-env-3oz');
    expect(result.buyerAmountCents).toBe(165);
    expect(result.standardEnvelopeUnmatched).toBeUndefined();
  });

  it('falls back to calculated-with-handling + standardEnvelopeUnmatched when no fetcher is supplied (drift cron path)', async () => {
    mockComputeCheapestForOrigin.mockResolvedValue(cheapest('standard_envelope', 1.65));

    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode: 'CALCULATED' },
      item: ENVELOPE_ITEM,
    });

    expect(result.source).toBe('calculated');
    expect(result.standardEnvelopeUnmatched).toBe(true);
  });

  it('falls back to calculated-with-handling + standardEnvelopeUnmatched when the organizer has no envelope policy', async () => {
    mockComputeCheapestForOrigin.mockResolvedValue(cheapest('standard_envelope', 1.65));

    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode: 'CALCULATED' },
      item: ENVELOPE_ITEM,
      fetchFulfillmentPolicies: async () => [
        { fulfillmentPolicyId: 'pol-flat', name: 'FindA.Sale Flat $5.00' },
      ],
    });

    expect(result.source).toBe('calculated');
    expect(result.standardEnvelopeUnmatched).toBe(true);
  });

  it('never calls the policy fetcher for a non-envelope item (no extra eBay call on ordinary items)', async () => {
    mockComputeCheapestForOrigin.mockResolvedValue(cheapest('actual', 6.5));
    const fetcher = jest.fn(async () => ENVELOPE_POLICIES);

    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode: 'CALCULATED' },
      item: { ...ENVELOPE_ITEM, packageWeightOz: 32, price: 60 },
      fetchFulfillmentPolicies: fetcher,
    });

    expect(result.source).toBe('calculated');
    expect(result.standardEnvelopeUnmatched).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not break pricing when the policy fetch throws', async () => {
    mockComputeCheapestForOrigin.mockResolvedValue(cheapest('standard_envelope', 1.65));

    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode: 'CALCULATED' },
      item: ENVELOPE_ITEM,
      fetchFulfillmentPolicies: async () => {
        throw new Error('eBay 500');
      },
    });

    expect(result.source).toBe('calculated');
    expect(result.standardEnvelopeUnmatched).toBe(true);
  });
});

describe('resolveItemShipping — FLAT_TIERS Standard Envelope (regression guard)', () => {
  it('still returns the real envelope policy', async () => {
    mockComputeCheapestForOrigin.mockResolvedValue(cheapest('standard_envelope', 1.65));

    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode: 'FLAT_TIERS' },
      item: ENVELOPE_ITEM,
      fetchFulfillmentPolicies: async () => ENVELOPE_POLICIES,
    });

    expect(result.source).toBe('standard-envelope');
    expect(result.fulfillmentPolicyId).toBe('pol-env-3oz');
    expect(result.buyerAmountCents).toBe(165);
  });

  it('still falls back to the FindA.Sale flat fee + standardEnvelopeUnmatched with no fetcher', async () => {
    mockComputeCheapestForOrigin.mockResolvedValue(cheapest('standard_envelope', 1.65));

    const result = await resolveItemShipping({
      organizer: ORGANIZER,
      mapping: { shippingMode: 'FLAT_TIERS' },
      item: ENVELOPE_ITEM,
    });

    expect(result.source).toBe('fvf-flat');
    expect(result.standardEnvelopeUnmatched).toBe(true);
  });
});
