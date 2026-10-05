/**
 * (S-EXT-CATEGORY-MAPS, 2026-10-05) extensionController.marketplaceCategoryFields: the helper that adds the
 * exact Poshmark / Mercari / Grailed / Craigslist category leaf (id + path + source) to every extension item
 * payload, next to vintedCategoryFields. Pins: the 12 field names and mapping, all-null when a resolver finds
 * nothing, per-platform isolation when one resolver throws (a resolver error must never break the payload),
 * the resolver input shape, and that both payload sites (getExtensionItems and getAutolistQueue) spread it.
 *
 * The four resolvers are mocked so this test does not depend on the category map data (covered by each
 * resolver's own test). Synthetic data only. NOT EXECUTED when written (jest cannot run on the authoring
 * machine); CI is the gate.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../lib/prisma', () => ({ prisma: {} }));
// extensionController dependencies that are irrelevant to this helper (same set as itemMarketplaceStatusService.test.ts).
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
  ...jest.requireActual('../services/ebayRateEstimateService'), // the eligibility registry reads its category tables
  computeCheapestForOrigin: jest.fn(),
}));
jest.mock('../services/poshmarkCategoryResolver', () => ({ resolvePoshmarkCategory: jest.fn() }));
jest.mock('../services/mercariCategoryResolver', () => ({ resolveMercariCategory: jest.fn() }));
jest.mock('../services/grailedCategoryResolver', () => ({ resolveGrailedCategory: jest.fn() }));
jest.mock('../services/craigslistCategoryResolver', () => ({ resolveCraigslistCategory: jest.fn() }));

import { marketplaceCategoryFields } from '../controllers/extensionController';
import { resolvePoshmarkCategory } from '../services/poshmarkCategoryResolver';
import { resolveMercariCategory } from '../services/mercariCategoryResolver';
import { resolveGrailedCategory } from '../services/grailedCategoryResolver';
import { resolveCraigslistCategory } from '../services/craigslistCategoryResolver';

const posh = resolvePoshmarkCategory as jest.Mock;
const merc = resolveMercariCategory as jest.Mock;
const grail = resolveGrailedCategory as jest.Mock;
const craig = resolveCraigslistCategory as jest.Mock;

const ITEM = {
  title: 'Synthetic widget',
  description: 'A synthetic description',
  brand: 'Synthbrand',
  category: 'Sporting Goods:Team Sports:Baseball',
  ebayCategoryId: '12345',
  ebayCategoryName: 'Baseball Gloves',
};

const ALL_FIELDS = [
  'poshmarkCategoryId', 'poshmarkCategoryPath', 'poshmarkCategorySource',
  'mercariCategoryId', 'mercariCategoryPath', 'mercariCategorySource',
  'grailedCategoryId', 'grailedCategoryPath', 'grailedCategorySource',
  'craigslistCategoryId', 'craigslistCategoryPath', 'craigslistCategorySource',
];

beforeEach(() => {
  for (const m of [posh, merc, grail, craig]) m.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('marketplaceCategoryFields', () => {
  it('maps each resolver result to its three payload fields', () => {
    posh.mockReturnValue({ id: 'Men-Accessories-Belts', path: ['Men', 'Accessories', 'Belts'], pathText: 'Men > Accessories > Belts', source: 'CURATED_ID' });
    merc.mockReturnValue({ id: 1234, path: ['A', 'B'], pathText: 'A > B', source: 'RULE' });
    grail.mockReturnValue({ id: 'menswear:tops.sweatshirts_hoodies', path: ['Menswear', 'Tops', 'Sweatshirts & Hoodies'], pathText: 'Menswear > Tops > Sweatshirts & Hoodies', source: 'SCORED' });
    craig.mockReturnValue({ id: 'sga', path: ['for sale', 'sporting'], pathText: 'for sale > sporting', source: 'CURATED_ID' });

    expect(marketplaceCategoryFields(ITEM)).toEqual({
      poshmarkCategoryId: 'Men-Accessories-Belts', poshmarkCategoryPath: 'Men > Accessories > Belts', poshmarkCategorySource: 'CURATED_ID',
      mercariCategoryId: 1234, mercariCategoryPath: 'A > B', mercariCategorySource: 'RULE',
      grailedCategoryId: 'menswear:tops.sweatshirts_hoodies', grailedCategoryPath: 'Menswear > Tops > Sweatshirts & Hoodies', grailedCategorySource: 'SCORED',
      craigslistCategoryId: 'sga', craigslistCategoryPath: 'for sale > sporting', craigslistCategorySource: 'CURATED_ID',
    });
  });

  it('returns all 12 fields as null (never undefined) when no resolver finds a mapping', () => {
    for (const m of [posh, merc, grail, craig]) m.mockReturnValue(null);
    const out: any = marketplaceCategoryFields(ITEM);
    expect(Object.keys(out).sort()).toEqual([...ALL_FIELDS].sort());
    for (const k of ALL_FIELDS) expect(out[k]).toBeNull();
  });

  it('a resolver that throws nulls only its own platform and never throws out of the helper', () => {
    posh.mockReturnValue({ id: 'Men-Accessories-Belts', path: [], pathText: 'Men > Accessories > Belts', source: 'RULE' });
    merc.mockImplementation(() => { throw new Error('boom'); });
    grail.mockReturnValue(null);
    craig.mockReturnValue({ id: 'sga', path: [], pathText: 'for sale > sporting', source: 'RULE' });

    let out: any;
    expect(() => { out = marketplaceCategoryFields(ITEM); }).not.toThrow();
    expect(out.mercariCategoryId).toBeNull();
    expect(out.mercariCategoryPath).toBeNull();
    expect(out.mercariCategorySource).toBeNull();
    expect(out.poshmarkCategoryId).toBe('Men-Accessories-Belts');
    expect(out.craigslistCategoryId).toBe('sga');
    expect(out.grailedCategoryId).toBeNull();
  });

  it('survives every resolver throwing', () => {
    for (const m of [posh, merc, grail, craig]) m.mockImplementation(() => { throw new Error('boom'); });
    const out: any = marketplaceCategoryFields(ITEM);
    for (const k of ALL_FIELDS) expect(out[k]).toBeNull();
  });

  it('passes the item to every resolver as the shared input shape (category becomes categoryBreadcrumb)', () => {
    for (const m of [posh, merc, grail, craig]) m.mockReturnValue(null);
    marketplaceCategoryFields(ITEM);
    const expected = {
      ebayCategoryId: '12345',
      ebayCategoryName: 'Baseball Gloves',
      categoryBreadcrumb: 'Sporting Goods:Team Sports:Baseball',
      title: 'Synthetic widget',
      description: 'A synthetic description',
      brand: 'Synthbrand',
    };
    for (const m of [posh, merc, grail, craig]) expect(m).toHaveBeenCalledWith(expected);
  });

  it('keeps a numeric Craigslist id as a string and a null id as null', () => {
    posh.mockReturnValue(null); merc.mockReturnValue(null); grail.mockReturnValue(null);
    craig.mockReturnValue({ id: 123, path: [], pathText: 'x', source: 'RULE' });
    expect(marketplaceCategoryFields(ITEM).craigslistCategoryId).toBe('123');
    craig.mockReturnValue({ id: null, path: [], pathText: 'x', source: 'RULE' });
    expect(marketplaceCategoryFields(ITEM).craigslistCategoryId).toBeNull();
  });
});

describe('wiring (source check: both extension item payload sites spread the helper)', () => {
  it('getExtensionItems and getAutolistQueue each spread vintedCategoryFields and marketplaceCategoryFields', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'extensionController.ts'), 'utf8');
    expect(src.split('...vintedCategoryFields(it),').length - 1).toBe(2);
    expect(src.split('...marketplaceCategoryFields(it),').length - 1).toBe(2);
  });
});
