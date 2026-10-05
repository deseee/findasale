/**
 * (S-VINTED-PICKUP-ONLY, 2026-10-05) Items the organizer marked local pickup only must not be offered to Vinted
 * (its sell form has no meet-up / no-shipping option: "The buyer always pays for shipping").
 *
 * Pins: (1) the backend payload flag `localPickupOnly` comes from the RAW ebayShippingOverride === 'LOCAL_PICKUP_ONLY'
 * and from nothing else -- an item with merely a missing weight (which the payload's `shippingOverride` forces to
 * 'LOCAL_PICKUP_ONLY' for Facebook) is NOT flagged and still goes to Vinted; (2) both per-item payload builders
 * (getExtensionItems and getAutolistQueue) carry it; (3) the extension's data-driven exclusion
 * (PICKUP_INCOMPATIBLE_PLATFORMS = ['VINTED']) blocks pickup-only items on Vinted only, never on Facebook,
 * Craigslist, Gumtree AU or any other platform; (4) popup.js, background.js (renewal) and fas-vinted.js are wired.
 *
 * Synthetic data only. The extension logic is read from the real popup.js source and evaluated, so the test cannot
 * drift from the shipped code. NOT EXECUTED by jest when written (jest cannot run on the authoring machine); the same
 * assertions were run with node --experimental-strip-types and a describe/it/expect shim. CI is the gate.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../lib/prisma', () => ({ prisma: {} }));
// extensionController dependencies that are irrelevant to this helper (same set as extensionMarketplaceCategoryFields.test.ts).
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

import { isLocalPickupOnlyItem } from '../controllers/extensionController';

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

describe('isLocalPickupOnlyItem (backend payload flag)', () => {
  it('is true only for the raw LOCAL_PICKUP_ONLY value', () => {
    expect(isLocalPickupOnlyItem({ ebayShippingOverride: 'LOCAL_PICKUP_ONLY' })).toBe(true);
  });

  it('is false for null, undefined and every other override value', () => {
    expect(isLocalPickupOnlyItem({ ebayShippingOverride: null })).toBe(false);
    expect(isLocalPickupOnlyItem({})).toBe(false);
    expect(isLocalPickupOnlyItem({ ebayShippingOverride: 'DONT_LIST' })).toBe(false);
    expect(isLocalPickupOnlyItem({ ebayShippingOverride: 'FREE_SHIPPING' })).toBe(false);
    expect(isLocalPickupOnlyItem({ ebayShippingOverride: 'local_pickup_only' })).toBe(false);
    expect(isLocalPickupOnlyItem({ ebayShippingOverride: '' })).toBe(false);
  });

  it('is false for a null-weight item (weight alone must never make an item pickup-only for Vinted)', () => {
    const nullWeightItem = { ebayShippingOverride: null, packageWeightOz: null };
    // The Facebook-facing shippingOverride expression forces pickup-only on a missing weight ...
    const payloadShippingOverride =
      nullWeightItem.ebayShippingOverride === 'LOCAL_PICKUP_ONLY' || nullWeightItem.packageWeightOz == null
        ? 'LOCAL_PICKUP_ONLY'
        : nullWeightItem.ebayShippingOverride;
    expect(payloadShippingOverride).toBe('LOCAL_PICKUP_ONLY');
    // ... but the new flag reads the raw field only, so Vinted still gets the item.
    expect(isLocalPickupOnlyItem(nullWeightItem)).toBe(false);
  });
});

describe('wiring (source check)', () => {
  it('getExtensionItems and getAutolistQueue each build localPickupOnly from the raw flag, and nothing else does', () => {
    const src = read('packages', 'backend', 'src', 'controllers', 'extensionController.ts');
    expect(src.split('localPickupOnly: isLocalPickupOnlyItem(it),').length - 1).toBe(2);
    // never derived from the weight-forced payload field
    expect(src).not.toMatch(/localPickupOnly:[^\n]*(packageWeightOz|shippingOverride)/);
    expect(src).toMatch(/return it\.ebayShippingOverride === 'LOCAL_PICKUP_ONLY';/);
  });
});

const popupPath = path.join(REPO_ROOT, 'extension', 'popup.js');
const extensionPresent = fs.existsSync(popupPath);
(extensionPresent ? describe : describe.skip)('extension exclusion (popup.js logic, evaluated from the real source)', () => {
  const popupSrc = extensionPresent ? fs.readFileSync(popupPath, 'utf8') : '';
  const start = popupSrc.indexOf('const PICKUP_INCOMPATIBLE_PLATFORMS');
  const end = popupSrc.indexOf('function isPickupOnlyBlockedOnCurrentChannel');
  let PICKUP_INCOMPATIBLE_PLATFORMS: string[] = [];
  let blocked: (it: any, channel: string) => boolean = () => false;

  beforeAll(() => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // eslint-disable-next-line no-new-func
    const api = new Function(popupSrc.slice(start, end) + '; return { PICKUP_INCOMPATIBLE_PLATFORMS, isPickupOnlyBlockedOnChannel };')();
    PICKUP_INCOMPATIBLE_PLATFORMS = api.PICKUP_INCOMPATIBLE_PLATFORMS;
    blocked = api.isPickupOnlyBlockedOnChannel;
  });

  it('lists only VINTED (other platforms are unverified and must not be added yet)', () => {
    expect(PICKUP_INCOMPATIBLE_PLATFORMS).toEqual(['VINTED']);
  });

  it('blocks a localPickupOnly item on the vinted channel', () => {
    expect(blocked({ id: 'a', localPickupOnly: true }, 'vinted')).toBe(true);
  });

  it('never blocks a localPickupOnly item on any other platform', () => {
    for (const ch of ['facebook', 'craigslist', 'gumtree_au', 'poshmark', 'mercari', 'grailed', '']) {
      expect(blocked({ id: 'a', localPickupOnly: true }, ch)).toBe(false);
    }
  });

  it('does not block items that are not flagged (including the null-weight shape) on vinted', () => {
    expect(blocked({ id: 'b', localPickupOnly: false, shippingOverride: 'LOCAL_PICKUP_ONLY' }, 'vinted')).toBe(false); // missing weight only
    expect(blocked({ id: 'c' }, 'vinted')).toBe(false);
    expect(blocked({ id: 'd', localPickupOnly: 'true' }, 'vinted')).toBe(false);
    expect(blocked(null, 'vinted')).toBe(false);
  });

  it('a platform added to the constant is blocked with no other code change', () => {
    // data-driven: the helper only consults PICKUP_INCOMPATIBLE_PLATFORMS
    const probe = new Function('PICKUP_INCOMPATIBLE_PLATFORMS', popupSrc.slice(popupSrc.indexOf('function isPickupOnlyBlockedOnChannel'), end) + '; return isPickupOnlyBlockedOnChannel;')(['VINTED', 'POSHMARK']);
    expect(probe({ localPickupOnly: true }, 'poshmark')).toBe(true);
    expect(probe({ localPickupOnly: true }, 'mercari')).toBe(false);
  });

  it('popup.js carries the flag through the queue map, filters the queue, and hides the items from the list', () => {
    expect(popupSrc).toContain('localPickupOnly: it.localPickupOnly === true,');
    expect(popupSrc).toContain('.filter((it) => !isPickupOnlyBlockedOnCurrentChannel(it))');
    expect(popupSrc).toContain('if (isPickupOnlyBlockedOnCurrentChannel(it)) {');
    expect(popupSrc).toContain('skipped for ');
  });

  it('background.js renewal queue items and fas-vinted.js are wired', () => {
    const bg = read('extension', 'background.js');
    expect(bg).toContain('localPickupOnly: it.localPickupOnly === true,');
    const vinted = read('extension', 'fas-vinted.js');
    expect(vinted).toContain('async function vintedSkipPickupOnlyItem(item)');
    expect(vinted).toContain('if (await vintedSkipPickupOnlyItem(queued.item)) return;');
  });
});
