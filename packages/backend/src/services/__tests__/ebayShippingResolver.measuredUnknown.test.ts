jest.mock('../../lib/prisma', () => ({ prisma: new Proxy({}, { get: () => new Proxy(() => null, { get: () => async () => null, apply: async () => null }) }), Prisma: {} }));
jest.mock('../../index', () => ({ prisma: new Proxy({}, { get: () => new Proxy(() => null, { get: () => async () => null, apply: async () => null }) }) }));
import { resolveItemShipping } from '../ebayShippingResolver';
import { computeCheapestForOrigin } from '../ebayRateEstimateService';
/**
 * A fully measured, organizer-confirmed package with classification UNKNOWN must NOT fall onto the
 * organizer's unknownPolicyId (e.g. Local Pickup ONLY) -- it resolves through the normal flat/calculated rate.
 */
for (const mode of ['FLAT_TIERS', 'CALCULATED']) {
  it(`measured UNKNOWN thick-envelope item under $20 resolves to a computed rate (${mode})`, async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const item: any = { packageWeightOz: 8, packageLengthIn: 11, packageWidthIn: 8, packageHeightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', packageConfirmedByOrganizer: true, ebayShippingClassification: 'UNKNOWN', price: 7.49, ebayCategoryId: null };
    const out = await resolveItemShipping({ organizer: { lat: 42.2, lng: -85.8 }, mapping: { shippingMode: mode, unknownPolicyId: 'U' }, item, fromZip: '49079', fetchFulfillmentPolicies: async () => [] });
    expect(out.source).not.toBe('custom-override');
    expect(out.buyerAmountCents).toBeGreaterThan(0);
  });
}
