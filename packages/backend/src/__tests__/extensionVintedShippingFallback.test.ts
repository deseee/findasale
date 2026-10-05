/**
 * (S-VINTED-SHIPPING-FALLBACK-PRICE, 2026-10-05) Vinted "Domestic shipping" for an item with NO organizer shippingPrice must be
 * the SAME buyer-facing number FindA.Sale itself suggests (suggestNativeShippingPrice: platform fee grossed up, bucket-rounded,
 * charm-priced), not the raw carrier rate. Live case (Road Runner guitar/bass hardshell case, 180 oz, 44x17x6 in): raw rate
 * 53.38 was filled into Vinted while FindA.Sale's own price is 59.99 (= ceil(53.38 / (1 - 0.11)) charm-priced).
 *
 * Pins: (1) the fallback uses the suggested price (59.99), never the raw rate (53.38), for vintedDomesticShippingUsd and the
 * $100-cap test, and feeds suggestNativeShippingPrice the same inputs itemController does; (2) the >$100 bump arithmetic and
 * the "FindA.Sale shipping price" note wording; (3) ShippingHardBlockError -> null domestic + manual-review note, any other
 * error -> null domestic + no note, no bump; (4) source checks: the raw `cheapest.rate` no longer feeds
 * vintedDomesticShippingUsd, the organizer-set shippingPrice branch is still first and unchanged, and the fallback is wired.
 *
 * Synthetic data only. NOT EXECUTED by jest when written (jest cannot run on the authoring machine); the same assertions were
 * run with node --experimental-strip-types and a describe/it/expect shim on scratch copies. CI is the gate.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../lib/prisma', () => ({ prisma: {} }));
// extensionController dependencies that are irrelevant to this helper (same set as extensionLocalPickupOnly.test.ts).
jest.mock('../utils/cloudinaryWatermark', () => ({
  getWatermarkedUrlWithQR: (u: string) => u,
  ensureQrCodeAsset: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/watermarkPolicy', () => ({ canRemoveWatermark: () => true }));
jest.mock('../controllers/ebayController', () => ({
  applyNeverShippableOverride: jest.fn().mockResolvedValue(null),
  computeEffectivePackageWeight: jest.fn().mockResolvedValue(null),
}));
jest.mock('../services/facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn() }));
jest.mock('../services/vintedSoldDetectionService', () => ({
  processVintedSoldReport: jest.fn(),
  sanitizeVintedSoldEntries: jest.fn(),
  VINTED_SOLD_MAX_ENTRIES: 100,
  normalizeListingTitle: (t: string) => t,
}));
jest.mock('../services/messageAutosendService', () => ({ decideMessageAutosend: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({
  ...jest.requireActual('../services/ebayRateEstimateService'), // the eligibility registry reads its category tables; also exports ShippingHardBlockError
  computeCheapestForOrigin: jest.fn(),
}));
jest.mock('../services/poshmarkCategoryResolver', () => ({ resolvePoshmarkCategory: jest.fn() }));
jest.mock('../services/mercariCategoryResolver', () => ({ resolveMercariCategory: jest.fn() }));
jest.mock('../services/grailedCategoryResolver', () => ({ resolveGrailedCategory: jest.fn() }));
jest.mock('../services/craigslistCategoryResolver', () => ({ resolveCraigslistCategory: jest.fn() }));

import { buildVintedShippingPricing, computeVintedFallbackShipping } from '../controllers/extensionController';
import { ShippingHardBlockError } from '../services/nativeShippingSuggestionService';

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

const CAP = 100;
const RAW_RATE = 53.38; // what the old fallback put into Vinted
const SUGGESTED = 59.99; // FindA.Sale's own price for the same item

// The Road Runner guitar/bass hardshell case (synthetic copy of the live shape).
const roadRunner = {
  id: 'item-road-runner',
  packageWeightOz: 180,
  packageLengthIn: 44,
  packageWidthIn: 17,
  packageHeightIn: 6,
  packageType: 'PACKAGE',
  category: 'Musical Instruments & Gear',
  ebayCategoryId: '41407',
};
const organizer = { lat: 42.2, lng: -85.9, subscriptionTier: 'SIMPLE' };
const ctx = (basePrice = 40) => ({ basePrice, zip: '49079', organizer, cap: CAP });

describe('buildVintedShippingPricing (pure)', () => {
  it('at or under the cap: price unchanged, no note, domestic shipping = the shipping price', () => {
    expect(buildVintedShippingPricing(40, 59.99, CAP, 'FindA.Sale shipping price')).toEqual({
      vintedPrice: 40,
      vintedShippingNote: null,
      vintedDomesticShippingUsd: 59.99,
    });
    // exactly the cap is not over the cap
    expect(buildVintedShippingPricing(40, 100, CAP, 'x').vintedShippingNote).toBeNull();
    expect(buildVintedShippingPricing(40, 100, CAP, 'x').vintedPrice).toBe(40);
  });

  it('over the cap: bumps the price by the overage and words the note with the label', () => {
    const r = buildVintedShippingPricing(40, 112.49, CAP, 'FindA.Sale shipping price');
    expect(r.vintedPrice).toBe(52.49);
    expect(r.vintedDomesticShippingUsd).toBe(112.49);
    expect(r.vintedShippingNote).toBe(
      "Price includes $12.49 to cover shipping over Vinted's $100 cap (FindA.Sale shipping price: $112.49)."
    );
    expect(r.vintedShippingNote).not.toContain('real shipping cost');
  });

  it('rounds to cents (no float residue in the bump)', () => {
    const r = buildVintedShippingPricing(19.99, 100.01, CAP, 'FindA.Sale shipping price');
    expect(r.vintedPrice).toBe(20);
    expect(r.vintedDomesticShippingUsd).toBe(100.01);
  });
});

describe('computeVintedFallbackShipping (no organizer shippingPrice)', () => {
  it('uses the suggested FindA.Sale price (59.99), not the raw carrier rate (53.38)', async () => {
    const suggest = jest.fn().mockResolvedValue({ suggestedPrice: SUGGESTED, rawRate: RAW_RATE });
    const r = await computeVintedFallbackShipping(roadRunner, ctx(), suggest);
    expect(r.vintedDomesticShippingUsd).toBe(59.99);
    expect(r.vintedDomesticShippingUsd).not.toBe(RAW_RATE);
    expect(r.vintedPrice).toBe(40);
    expect(r.vintedShippingNote).toBeNull();
  });

  it('feeds suggestNativeShippingPrice the same inputs itemController uses', async () => {
    const suggest = jest.fn().mockResolvedValue({ suggestedPrice: SUGGESTED });
    await computeVintedFallbackShipping(roadRunner, ctx(40), suggest);
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith({
      weightOz: 180,
      dims: { length: 44, width: 17, height: 6 },
      packageType: 'PACKAGE',
      origin: { zip: '49079', lat: 42.2, lng: -85.9 },
      subscriptionTier: 'SIMPLE',
      categoryId: '41407',
      category: 'Musical Instruments & Gear',
      priceUsd: 40,
    });
  });

  it('tests the SUGGESTED price against the $100 cap: raw 95 / suggested 112.49 bumps, with FindA.Sale wording', async () => {
    const suggest = jest.fn().mockResolvedValue({ suggestedPrice: 112.49, rawRate: 95 });
    const r = await computeVintedFallbackShipping(roadRunner, ctx(40), suggest);
    expect(r.vintedPrice).toBe(52.49);
    expect(r.vintedDomesticShippingUsd).toBe(112.49);
    expect(r.vintedShippingNote).toBe(
      "Price includes $12.49 to cover shipping over Vinted's $100 cap (FindA.Sale shipping price: $112.49)."
    );
  });

  it('a hard block gives null domestic shipping, the manual-review note, and no bump', async () => {
    const suggest = jest.fn().mockImplementation(async () => {
      throw new ShippingHardBlockError('exceeds every carrier max');
    });
    const r = await computeVintedFallbackShipping(roadRunner, ctx(40), suggest);
    expect(r.vintedDomesticShippingUsd).toBeNull();
    expect(r.vintedPrice).toBe(40);
    expect(r.vintedShippingNote).toContain('could not be estimated for Vinted');
  });

  it('any other error gives null domestic shipping, no note, no bump', async () => {
    const suggest = jest.fn().mockImplementation(async () => {
      throw new Error('rate table unavailable');
    });
    const r = await computeVintedFallbackShipping(roadRunner, ctx(40), suggest);
    expect(r).toEqual({ vintedPrice: 40, vintedShippingNote: null, vintedDomesticShippingUsd: null });
  });

  it('missing organizer lat/lng and tier degrade to nulls instead of throwing', async () => {
    const suggest = jest.fn().mockResolvedValue({ suggestedPrice: SUGGESTED });
    const r = await computeVintedFallbackShipping(
      { ...roadRunner, packageType: null, category: null, ebayCategoryId: null, packageLengthIn: null },
      { basePrice: 40, zip: null, organizer: {}, cap: CAP },
      suggest
    );
    expect(r.vintedDomesticShippingUsd).toBe(59.99);
    expect(suggest).toHaveBeenCalledWith({
      weightOz: 180,
      dims: { length: null, width: 17, height: 6 },
      packageType: null,
      origin: { zip: null, lat: null, lng: null },
      subscriptionTier: null,
      categoryId: null,
      category: null,
      priceUsd: 40,
    });
  });
});

describe('wiring (source check)', () => {
  const src = read('packages', 'backend', 'src', 'controllers', 'extensionController.ts');
  const blockStart = src.indexOf('const vintedPricingByItemId = new Map');
  const blockEnd = src.indexOf('const shaped = items.map((it) => ({');

  it('locates the Vinted pricing block', () => {
    expect(blockStart).toBeGreaterThan(-1);
    expect(blockEnd).toBeGreaterThan(blockStart);
  });

  it('the raw carrier rate no longer feeds vintedDomesticShippingUsd or the cap test', () => {
    const block = src.slice(blockStart, blockEnd).replace(/^\s*\/\/.*$/gm, ''); // code only: the explanatory comments name the old rate
    expect(block).not.toContain('cheapest.rate');
    expect(block).not.toContain('computeCheapestForOrigin(');
    expect(block).not.toMatch(/vintedDomesticShippingUsd:\s*realRate/);
    expect(src).not.toContain('real shipping cost:');
    expect(src).not.toMatch(/computeCheapestForOrigin\s*\(/);
    expect(src).toContain("import { suggestNativeShippingPrice, ShippingHardBlockError } from '../services/nativeShippingSuggestionService';");
  });

  it('the organizer-set shippingPrice branch is first, unchanged, and skips the fallback', () => {
    const block = src.slice(blockStart, blockEnd);
    const organizerIdx = block.indexOf('if (it.shippingPrice != null && Number(it.shippingPrice) > 0) {');
    const ownRateIdx = block.indexOf('const ownRate = Math.round(Number(it.shippingPrice) * 100) / 100;');
    const confirmedNoteIdx = block.indexOf('(your confirmed shipping cost: $${ownRate.toFixed(2)}).');
    const continueIdx = block.indexOf('continue;', organizerIdx);
    const untrustedIdx = block.indexOf('if (!hasTrustedPackage(it) || it.packageWeightOz == null || Number(it.packageWeightOz) <= 0) {');
    const fallbackIdx = block.indexOf('await computeVintedFallbackShipping(it, { basePrice, zip, organizer, cap: VINTED_SHIPPING_CAP })');
    expect(organizerIdx).toBeGreaterThan(-1);
    expect(ownRateIdx).toBeGreaterThan(organizerIdx);
    expect(confirmedNoteIdx).toBeGreaterThan(ownRateIdx);
    expect(continueIdx).toBeGreaterThan(confirmedNoteIdx);
    expect(untrustedIdx).toBeGreaterThan(continueIdx);
    expect(fallbackIdx).toBeGreaterThan(untrustedIdx);
    // organizer branch hands vintedDomesticShippingUsd the item's own rate
    expect(block).toContain('vintedDomesticShippingUsd: ownRate,');
  });

  it('the fallback calls suggestNativeShippingPrice by default and uses the FindA.Sale wording', () => {
    expect(src).toContain('suggest: (input: any) => Promise<{ suggestedPrice: number }> = suggestNativeShippingPrice');
    expect(src).toContain("'FindA.Sale shipping price'");
  });
});
