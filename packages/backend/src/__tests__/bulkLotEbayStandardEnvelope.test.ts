/**
 * ADR-136 Addendum C (roadmap #659): an eBay bundle of bulk lot cards never ships by eBay Standard Envelope. Four
 * independent reasons, each pinned here: the lot category is not an envelope category, a packed bundle always weighs
 * more than the 3 oz ceiling, the rate engine (the real one, not a mock) never picks the envelope for a bundle package at
 * any bundle size or price, and the push path carries an explicit neverStandardEnvelope switch. A single card, by
 * contrast, still gets the envelope (control case), so the test is not passing because the envelope is simply broken.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import {
  EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS,
  EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ,
  EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS,
  estimateCheapestRate,
} from '../services/ebayRateEstimateService';
import {
  BULK_EBAY_CATEGORY,
  BUNDLE_NEVER_STANDARD_ENVELOPE,
  BUNDLE_SIZE_PRESETS,
  MIN_BUNDLE_WEIGHT_OZ,
  buildBundleOverlay,
  computeBundlePriceCents,
  suggestBundlePackage,
} from '../services/bulkLot/bulkLotEbayBundle';

describe('Standard Envelope never applies to a bundle', () => {
  it('the lot category is not an envelope category or a descendant of one', () => {
    expect(EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS).not.toContain(BULK_EBAY_CATEGORY.id);
    for (const kids of Object.values(EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS)) expect(kids).not.toContain(BULK_EBAY_CATEGORY.id);
    // the single card leaf is, which is the control for the tests below
    expect(EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS).toContain('183454');
  });

  it('the smallest allowed packed bundle weighs more than the envelope ceiling', () => {
    expect(MIN_BUNDLE_WEIGHT_OZ).toBeGreaterThan(EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ);
    for (const size of BUNDLE_SIZE_PRESETS) expect(suggestBundlePackage(size).weightOz).toBeGreaterThan(EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ);
    expect(BUNDLE_NEVER_STANDARD_ENVELOPE).toBe(true);
  });

  it('the real rate engine never chooses the envelope for a bundle package, whatever the size, price, zone or category', () => {
    for (const size of BUNDLE_SIZE_PRESETS) {
      const pkg = suggestBundlePackage(size);
      for (const perThousandCents of [100, 800, 2500]) {
        const price = computeBundlePriceCents(size, perThousandCents);
        if (!price.ok) continue;
        for (const categoryId of [BULK_EBAY_CATEGORY.id, '183454']) {
          for (const zone of ['z1', 'z4', 'z8'] as const) {
            const rate = estimateCheapestRate({
              weightOz: pkg.weightOz,
              dims: { length: pkg.lengthIn, width: pkg.widthIn, height: pkg.heightIn } as any,
              zone,
              category: 'Collectibles',
              categoryId,
              priceUsd: price.cents / 100,
            });
            expect(rate.basis).not.toBe('standard_envelope');
          }
        }
      }
    }
  });

  it('control: one ordinary single card in the envelope category still gets the envelope', () => {
    const rate = estimateCheapestRate({ weightOz: 1, dims: { length: 6.5, width: 4.5, height: 0.1 } as any, zone: 'z5', category: 'Collectibles', categoryId: '183454', priceUsd: 5 });
    expect(rate.basis).toBe('standard_envelope');
  });

  it('the overlay the push reads carries the explicit switch and a package that would fail the weight gate anyway', () => {
    const r = buildBundleOverlay({
      stockTotal: 5000,
      stockSold: 0,
      pricePerThousandCents: 800,
      lot: { game: 'MTG', lotKind: 'BULK_COMMON' },
      bundle: { enabled: true, bundleSize: 1000, adjustmentBps: 0, ebayTitle: null, condition: 'USED', language: 'English', weightOz: 80, lengthIn: 16, widthIn: 4, heightIn: 5, dimsConfirmed: true },
    });
    if (!r.ok) throw new Error('expected ok');
    expect(r.overlay.neverStandardEnvelope).toBe(true);
    expect(r.overlay.packageWeightOz).toBeGreaterThan(EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ);
    expect(r.overlay.ebayCategoryId).toBe('183455');
  });

  it('the push path honors the switch before any envelope policy lookup', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src: string = require('fs').readFileSync(require('path').join(process.cwd(), 'src/controllers/ebayController.ts'), 'utf8');
    const at = src.indexOf('const pickStandardEnvelopePolicy');
    expect(at).toBeGreaterThan(-1);
    const guard = src.indexOf('if (item.neverStandardEnvelope === true) return null;', at);
    const firstUse = src.indexOf('resolveItemShipping(', at);
    expect(guard).toBeGreaterThan(at);
    expect(guard).toBeLessThan(firstUse);
  });
});
