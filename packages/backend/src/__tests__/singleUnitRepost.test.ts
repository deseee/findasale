/**
 * (2026-10-27) Repost on single-quantity marketplaces. An item with stock left whose ONE-unit listing sold on Mercari, Grailed
 * or Facebook is offered again by GET /extension/autolist-queue (one fresh listing, marked repostAfterSale); a Poshmark Multi
 * Item listing that still shows units after a sale there is never reposted (Poshmark keeps its own quantity); nothing is
 * reposted with no stock left, while the Resync hold stands, or while the listing is still live. Synthetic data only.
 */
import * as fs from 'fs';
import * as path from 'path';

const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  item: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  itemKitComponent: { findMany: jest.fn() },
  sale: { findMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(), findFirst: jest.fn() },
  organizerAutoQueueLimit: { findUnique: jest.fn() },
  extensionRuntimeLog: { findFirst: jest.fn() },
  pendingListingRemoval: { count: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
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
  normalizeListingTitle: (t: string) => String(t || '').toLowerCase().trim(),
}));
jest.mock('../services/vintedBundleOrderService', () => ({ reportVintedBundleOrder: jest.fn() }));
jest.mock('../services/messageAutosendService', () => ({ decideMessageAutosend: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({
  ...jest.requireActual('../services/ebayRateEstimateService'),
  computeCheapestForOrigin: jest.fn(),
}));
jest.mock('../services/poshmarkCategoryResolver', () => ({ resolvePoshmarkCategory: jest.fn() }));
jest.mock('../services/mercariCategoryResolver', () => ({ resolveMercariCategory: jest.fn() }));
jest.mock('../services/grailedCategoryResolver', () => ({ resolveGrailedCategory: jest.fn() }));
jest.mock('../services/craigslistCategoryResolver', () => ({ resolveCraigslistCategory: jest.fn() }));

import {
  listingStateForAutoQueue,
  blocksAutoQueue,
  unitsLeftOnQuantityListing,
  isSoldOnPlatformRow,
  SINGLE_UNIT_REPOST_PLATFORMS,
  QUANTITY_LISTING_PLATFORMS,
  type ListingJobRow,
} from '../services/singleUnitRepost';
import { listedExtensionPlatformsByItemId, buildItemMarketplaceStatus } from '../services/itemMarketplaceStatusService';
import { getAutolistQueue } from '../controllers/extensionController';
import {
  parseMercariListingCap,
  countLiveListings,
  mercariCapacity,
  applyMercariCap,
  loadReportedMercariCap,
  DEFAULT_MERCARI_LISTING_CAP,
} from '../services/mercariListingCap';

const t = (n: number) => new Date(Date.UTC(2026, 9, 1 + n));
const post = (n: number, syncedQuantity: number | null = null): ListingJobRow => ({ action: 'POST', status: 'POSTED', createdAt: t(n), syncedQuantity });
const removed = (n: number, msg: string | null): ListingJobRow => ({ action: 'REMOVE', status: 'REMOVED', createdAt: t(n), lastErrorMessage: msg });
const skipped = (n: number): ListingJobRow => ({ action: 'REMOVE', status: 'SKIPPED', createdAt: t(n), lastErrorMessage: 'listing_not_found' });

describe('platform sets (research 2026-10-27)', () => {
  it('reposts only on one-unit marketplaces with sale detection; Poshmark keeps its own quantity; no Vinted, Craigslist or Gumtree', () => {
    expect([...SINGLE_UNIT_REPOST_PLATFORMS].sort()).toEqual(['FACEBOOK', 'GRAILED', 'MERCARI']);
    expect([...QUANTITY_LISTING_PLATFORMS]).toEqual(['POSHMARK']);
    for (const p of ['VINTED', 'CRAIGSLIST', 'GUMTREE_AU', 'EBAY']) expect(SINGLE_UNIT_REPOST_PLATFORMS).not.toContain(p);
  });
});

describe('listingStateForAutoQueue', () => {
  it('a one-unit listing that sold there with stock left is reposted, on each repost platform', () => {
    for (const p of ['MERCARI', 'GRAILED', 'FACEBOOK']) {
      const s = listingStateForAutoQueue([post(1, 3), removed(2, `sold_on_${p.toLowerCase()}`)], p, 2);
      expect(s).toBe('repost_after_sale');
      expect(blocksAutoQueue(s)).toBe(false);
    }
  });

  it('the sold row may carry the e-mail source / sent suffix', () => {
    expect(listingStateForAutoQueue([post(1), removed(2, 'sold_on_mercari|src:abc|sent:2026-10-02T00:00:00Z')], 'MERCARI', 1)).toBe('repost_after_sale');
  });

  it('never reposts with no stock left', () => {
    const s = listingStateForAutoQueue([post(1), removed(2, 'sold_on_mercari')], 'MERCARI', 0);
    expect(s).toBe('sold_no_stock');
    expect(blocksAutoQueue(s)).toBe(true);
  });

  it('never double-posts: a live listing, or one whose removal only failed, stays listed', () => {
    expect(listingStateForAutoQueue([post(1)], 'MERCARI', 5)).toBe('listed');
    expect(listingStateForAutoQueue([post(1), skipped(2)], 'MERCARI', 5)).toBe('listed');
    // a fresh repost (newer POST) after the sale is live again
    expect(listingStateForAutoQueue([post(1), removed(2, 'sold_on_mercari'), post(3)], 'MERCARI', 4)).toBe('listed');
    expect(blocksAutoQueue('listed')).toBe(true);
  });

  it('keeps the Resync hold (organizer decision 2026-09-30)', () => {
    const s = listingStateForAutoQueue([post(1), removed(2, 'resync:listing_not_found')], 'GRAILED', 3);
    expect(s).toBe('resync_hold');
    expect(blocksAutoQueue(s)).toBe(true);
  });

  it('a sale on ANOTHER platform does not count as a sale here', () => {
    expect(listingStateForAutoQueue([post(1), removed(2, 'sold_on_vinted')], 'MERCARI', 3)).toBe('not_listed');
  });

  it('Poshmark Multi Item: still listed while it shows units, reposted once it sold out on Poshmark with stock left', () => {
    // posted with 3, one sold there: 2 still showing
    expect(listingStateForAutoQueue([post(1, 3), removed(2, 'sold_on_poshmark')], 'POSHMARK', 5)).toBe('multi_unit_listing_live');
    expect(blocksAutoQueue('multi_unit_listing_live')).toBe(true);
    // posted with 2, both sold there, stock left elsewhere: the listing is gone, offer one fresh Multi Item listing
    expect(listingStateForAutoQueue([post(1, 2), removed(2, 'sold_on_poshmark'), removed(3, 'sold_on_poshmark|sent:x')], 'POSHMARK', 4)).toBe('repost_after_sale');
    // posted as a single item (or quantity never recorded): its sale ended it
    expect(listingStateForAutoQueue([post(1, 1), removed(2, 'sold_on_poshmark')], 'POSHMARK', 2)).toBe('repost_after_sale');
    expect(listingStateForAutoQueue([post(1, null), removed(2, 'sold_on_poshmark')], 'POSHMARK', 2)).toBe('repost_after_sale');
  });

  it('other removals keep the existing behavior (not listed, offered like a never-posted item)', () => {
    expect(listingStateForAutoQueue([post(1), removed(2, null)], 'MERCARI', 3)).toBe('not_listed');
    expect(listingStateForAutoQueue([], 'MERCARI', 3)).toBe('not_listed');
  });

  it('unitsLeftOnQuantityListing / isSoldOnPlatformRow', () => {
    expect(unitsLeftOnQuantityListing([post(1, 4), removed(2, 'sold_on_poshmark'), removed(3, 'sold_on_poshmark')], 'POSHMARK')).toBe(2);
    expect(unitsLeftOnQuantityListing([removed(0, 'sold_on_poshmark'), post(1, 2)], 'POSHMARK')).toBe(2); // older sale belongs to an older listing
    expect(unitsLeftOnQuantityListing([post(1, 1)], 'POSHMARK')).toBe(0);
    expect(isSoldOnPlatformRow(removed(1, 'sold_on_grailed'), 'GRAILED')).toBe(true);
    expect(isSoldOnPlatformRow(removed(1, 'sold_on_grailed'), 'MERCARI')).toBe(false);
    expect(isSoldOnPlatformRow({ ...post(1), lastErrorMessage: 'sold_on_grailed' }, 'GRAILED')).toBe(false);
  });
});

describe('listedExtensionPlatformsByItemId (Add Items dots, item status)', () => {
  const row = (platform: string, r: ListingJobRow) => ({ itemId: 'i1', platform, ...r, createdAt: r.createdAt as Date });
  it('a Poshmark Multi Item listing that sold one unit is still listed; a sold Mercari listing is not', () => {
    const m = listedExtensionPlatformsByItemId([
      row('POSHMARK', post(1, 3)), row('POSHMARK', removed(2, 'sold_on_poshmark')),
      row('MERCARI', post(1, 3)), row('MERCARI', removed(2, 'sold_on_mercari')),
    ]);
    expect(Array.from(m.get('i1') ?? [])).toEqual(['POSHMARK']);
  });
  it('rows without the new fields keep the old newest-row rule', () => {
    const m = listedExtensionPlatformsByItemId([{ itemId: 'i1', platform: 'POSHMARK', action: 'REMOVE', status: 'REMOVED', createdAt: t(2) }, { itemId: 'i1', platform: 'POSHMARK', action: 'POST', status: 'POSTED', createdAt: t(1) }]);
    expect(m.get('i1')).toBeUndefined();
  });
});

// ---- GET /extension/autolist-queue end to end (prisma mocked) ----------------------------------------------------------
function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const req = () => ({ user: { id: 'u1', emailVerified: true }, query: {}, params: {}, body: {} }) as any;

const baseItem = (id: string) => ({
  // Apparel, so every auto queue platform (Grailed is fashion only) accepts the same item shape.
  id, saleId: 's1', title: "Men's Denim Jacket " + id, description: 'Classic denim jacket', price: 25,
  category: "Clothing, Shoes & Accessories > Men > Men's Clothing > Coats & Jackets", ebayCategoryName: null, tags: [], ebayCategoryId: null, condition: 'USED', conditionGrade: null,
  photoUrls: ['https://example.com/a.jpg'], qrEmbedEnabled: false, qrAssetReady: true,
  brand: null, size: null, color: null, material: null, isbn: null,
  packageWeightOz: 32, aiPackageWeightOz: null, packageLengthIn: 12, packageWidthIn: 8, packageHeightIn: 6, aiPackageDimsJson: null,
  packageConfirmedByOrganizer: true, packageEstimateSource: 'ORGANIZER',
  ebayShippingOverride: null, crosslisterFreeShipping: false,
  allowBestOffer: false, bestOfferMinimumAmt: null, bestOfferAutoAcceptAmt: null,
});

let mainItems: any[] = [];
let stockRows: any[] = [];
let jobRows: any[] = [];
let mercariAccountRows: any[] | null = null; // null = the Mercari rows of jobRows

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockPrisma.organizer.findUnique.mockResolvedValue({
    id: 'org1', subscriptionTier: 'PRO', removeWatermarkEnabled: true, pausedMarketplaces: [],
    craigslistAutoListEnabled: true, facebookAutoListEnabled: true, gumtreeAuAutoListEnabled: false,
    grailedAutoListEnabled: true, poshmarkAutoListEnabled: true, mercariAutoListEnabled: true,
  });
  mockPrisma.item.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (w.AND) return mainItems;
    if (w.id && w.id.in) return stockRows.filter((r) => w.id.in.includes(r.id));
    return [];
  });
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([]);
  mockPrisma.sale.findMany.mockResolvedValue([{ id: 's1', title: 'Sale', city: 'Paw Paw', zip: '49079', address: '1 Main St' }]);
  mercariAccountRows = null;
  mockPrisma.marketplaceListingJob.findMany.mockImplementation(async (args: any) =>
    args?.where?.platform === 'MERCARI' ? (mercariAccountRows ?? jobRows.filter((r) => r.platform === 'MERCARI')) : jobRows);
  mockPrisma.organizerAutoQueueLimit.findUnique.mockResolvedValue(null);
  mockPrisma.extensionRuntimeLog.findFirst.mockResolvedValue(null);
  mockPrisma.pendingListingRemoval.count.mockResolvedValue(0);
});
afterEach(() => jest.restoreAllMocks());

const job = (itemId: string, platform: string, r: ListingJobRow) => ({ itemId, platform, ...r });

describe('GET /extension/autolist-queue', () => {
  it('reposts a sold one-unit listing with stock left, keeps every other listing single, and never touches a live one', async () => {
    mainItems = ['fresh', 'mer', 'posh3', 'posh1', 'empty', 'resync', 'skip', 'fb'].map(baseItem);
    stockRows = [
      { id: 'fresh', listingType: 'FIXED', stockTotal: 5, stockSold: 0, description: 'd' },
      { id: 'mer', listingType: 'FIXED', stockTotal: 5, stockSold: 2, description: 'd' },
      { id: 'posh3', listingType: 'FIXED', stockTotal: 5, stockSold: 1, description: 'd' },
      { id: 'posh1', listingType: 'FIXED', stockTotal: 3, stockSold: 1, description: 'd' },
      { id: 'empty', listingType: 'FIXED', stockTotal: 2, stockSold: 2, description: 'd' },
      { id: 'resync', listingType: 'FIXED', stockTotal: 4, stockSold: 0, description: 'd' },
      { id: 'skip', listingType: 'FIXED', stockTotal: 4, stockSold: 0, description: 'd' },
      { id: 'fb', listingType: 'FIXED', stockTotal: 2, stockSold: 1, description: 'd' },
    ];
    const allPlatformsPosted = (id: string, except: string[]) =>
      ['CRAIGSLIST', 'FACEBOOK', 'GRAILED', 'POSHMARK', 'MERCARI'].filter((p) => !except.includes(p)).map((p) => job(id, p, post(1, 3)));
    jobRows = [
      ...allPlatformsPosted('mer', ['MERCARI']), job('mer', 'MERCARI', post(1, 5)), job('mer', 'MERCARI', removed(2, 'sold_on_mercari')),
      ...allPlatformsPosted('posh3', ['POSHMARK']), job('posh3', 'POSHMARK', post(1, 3)), job('posh3', 'POSHMARK', removed(2, 'sold_on_poshmark')),
      ...allPlatformsPosted('posh1', ['POSHMARK']), job('posh1', 'POSHMARK', post(1, 1)), job('posh1', 'POSHMARK', removed(2, 'sold_on_poshmark')),
      ...allPlatformsPosted('empty', ['MERCARI']), job('empty', 'MERCARI', post(1, 2)), job('empty', 'MERCARI', removed(2, 'sold_on_mercari')),
      ...allPlatformsPosted('resync', ['GRAILED']), job('resync', 'GRAILED', post(1)), job('resync', 'GRAILED', removed(2, 'resync:listing_not_found')),
      ...allPlatformsPosted('skip', ['MERCARI']), job('skip', 'MERCARI', post(1)), job('skip', 'MERCARI', skipped(2)),
      ...allPlatformsPosted('fb', ['FACEBOOK']), job('fb', 'FACEBOOK', post(1)), job('fb', 'FACEBOOK', removed(2, 'sold_on_facebook')),
    ];
    const res = mockRes();
    await getAutolistQueue(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.ok).toBe(true);
    const ids = (p: string) => (body.queues[p] as any[]).map((e) => e.id).sort();
    const entry = (p: string, id: string) => (body.queues[p] as any[]).find((e) => e.id === id);

    // The never-listed baseline proves each platform's eligibility passes for this item shape.
    for (const p of ['CRAIGSLIST', 'FACEBOOK', 'GRAILED', 'POSHMARK', 'MERCARI']) expect(ids(p)).toContain('fresh');
    expect(entry('MERCARI', 'fresh').repostAfterSale).toBeUndefined();

    expect(ids('MERCARI')).toEqual(['fresh', 'mer']); // sold on Mercari, 3 left: one fresh listing; 'empty' has no stock; 'skip' still live
    expect(entry('MERCARI', 'mer')).toMatchObject({ repostAfterSale: true, stockRemaining: 3 });
    expect(ids('POSHMARK')).toEqual(['fresh', 'posh1']); // posh3's Multi Item listing still shows 2 units; posh1's single listing sold
    expect(entry('POSHMARK', 'posh1').repostAfterSale).toBe(true);
    expect(ids('GRAILED')).toEqual(['fresh']); // Resync hold respected
    expect(ids('FACEBOOK')).toEqual(['fb', 'fresh']);
    expect(entry('FACEBOOK', 'fb')).toMatchObject({ repostAfterSale: true, stockRemaining: 1 });
    expect(ids('CRAIGSLIST')).toEqual(['fresh']); // classifieds: the one live ad covers every unit
    // Exactly one entry per item per platform: never N copies.
    for (const p of Object.keys(body.queues)) expect(new Set(ids(p)).size).toBe(ids(p).length);
  });

  it('a platform whose auto queue switch is off gets nothing, reposts included', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({
      id: 'org1', subscriptionTier: 'PRO', removeWatermarkEnabled: true, pausedMarketplaces: [],
      craigslistAutoListEnabled: false, facebookAutoListEnabled: false, gumtreeAuAutoListEnabled: false,
      grailedAutoListEnabled: false, poshmarkAutoListEnabled: false, mercariAutoListEnabled: false,
    });
    mainItems = [baseItem('mer')];
    stockRows = [{ id: 'mer', listingType: 'FIXED', stockTotal: 5, stockSold: 2, description: 'd' }];
    jobRows = [job('mer', 'MERCARI', post(1, 5)), job('mer', 'MERCARI', removed(2, 'sold_on_mercari'))];
    const res = mockRes();
    await getAutolistQueue(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(Object.values(body.queues).every((q: any) => q.length === 0)).toBe(true);
    expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
  });

  it('a paused platform gets nothing either', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({
      id: 'org1', subscriptionTier: 'PRO', removeWatermarkEnabled: true, pausedMarketplaces: ['MERCARI'],
      craigslistAutoListEnabled: false, facebookAutoListEnabled: false, gumtreeAuAutoListEnabled: false,
      grailedAutoListEnabled: false, poshmarkAutoListEnabled: false, mercariAutoListEnabled: true,
    });
    mainItems = [baseItem('mer')];
    stockRows = [{ id: 'mer', listingType: 'FIXED', stockTotal: 5, stockSold: 2, description: 'd' }];
    jobRows = [job('mer', 'MERCARI', post(1, 5)), job('mer', 'MERCARI', removed(2, 'sold_on_mercari'))];
    const res = mockRes();
    await getAutolistQueue(req(), res);
    expect(res.json.mock.calls[0][0].queues.MERCARI).toEqual([]);
  });

  it('unpublished / sold items never reach the loop (query filters stay in place)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'extensionController.ts'), 'utf8');
    const start = src.indexOf('export const getAutolistQueue');
    const b = src.slice(start, src.indexOf('\nexport const ', start + 10));
    expect(b).toContain("draftStatus: 'PUBLISHED',");
    expect(b).toContain("status: 'AVAILABLE',");
    expect(b).toContain('if (blocksAutoQueue(state)) continue;');
    expect(b).toContain('isPickupOnlyBlockedForAutoQueue(platform, isLocalPickupOnlyItem(it))');
  });
});

describe('item status: autoRepostAfterSale drives the note under In stock', () => {
  const inputs = (over: Record<string, unknown> = {}): any => ({
    item: {
      id: 'i1', title: 'Lamp', category: 'Home', ebayCategoryId: null, ebayListingId: null, ebayOfferId: null,
      discogsListingId: null, reverbListingId: null, shopifyListing: null, ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null,
    },
    hasEbayConnection: false, shopifyEnabled: false, subscriptionTier: 'PRO',
    hasActiveDiscogsAccount: false, hasActiveReverbAccount: false, hasActiveEtsyAccount: false,
    extensionPlatformsUsed: { facebook: true, craigslist: true, gumtreeAu: false, grailed: true, poshmark: true, mercari: true, vinted: true },
    jobs: [], pausedMarketplaces: [], recentPushRows: [], failedUnacknowledgedPushCount: 0,
    ...over,
  });
  it('true only on Mercari, Grailed and Facebook with their auto queue on and not paused', () => {
    const all = { CRAIGSLIST: true, FACEBOOK: true, GUMTREE_AU: true, GRAILED: true, POSHMARK: true, MERCARI: true };
    const out = buildItemMarketplaceStatus(inputs({ autoQueueEnabled: all, pausedMarketplaces: ['GRAILED'] }));
    const p = out.platforms as Record<string, { autoRepostAfterSale?: boolean }>;
    expect(p.mercari.autoRepostAfterSale).toBe(true);
    expect(p.facebook.autoRepostAfterSale).toBe(true);
    expect(p.grailed.autoRepostAfterSale).toBeUndefined(); // paused
    for (const key of ['poshmark', 'craigslist', 'gumtreeAu', 'vinted', 'ebay', 'etsy']) expect(p[key].autoRepostAfterSale).toBeUndefined();
    const off = buildItemMarketplaceStatus(inputs());
    expect((off.platforms as any).mercari.autoRepostAfterSale).toBeUndefined();
  });
});

describe('getExtensionItems wiring (source check): the Poshmark duplicate guard sees a Multi Item listing as still listed', () => {
  it('uses the shared helper and loads the fields it needs', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'extensionController.ts'), 'utf8');
    const start = src.indexOf('export const getExtensionItems');
    const b = src.slice(start, src.indexOf('\nexport const ', start + 10));
    expect(b).toContain('lastErrorMessage: true, syncedQuantity: true');
    expect(b).toContain("if ((latest.action === 'POST' && latest.status === 'POSTED') || multiUnitListingLive(key, latest)) {");
    expect(b).toContain('unitsLeftOnQuantityListing(rows, platform) > 0');
  });
});

// ---- Mercari active-listing cap (2026-10-27, Patrick: "well mercari has a 100 listing threshhold") ------------------------
describe('Mercari cap math', () => {
  it('learns N from the reported limit (context first, else the message), ignores junk', () => {
    expect(parseMercariListingCap('[mercari_listing_limit] Mercari listing limit reached | Mercari says: "Currently you are limited to 100 listings. This will be increased"')).toBe(100);
    expect(parseMercariListingCap('limited to 250 listings', { ctx: { cap: 150 } })).toBe(150);
    expect(parseMercariListingCap('limited to 1 listing')).toBe(1);
    expect(parseMercariListingCap('no number here')).toBeNull();
    expect(parseMercariListingCap('limited to 0 listings')).toBeNull();
    expect(parseMercariListingCap(null, { ctx: { cap: 'x' } })).toBeNull();
  });

  it('counts live listings as the newest non-SKIPPED row being POST/POSTED (a sold or deactivated listing frees its slot)', () => {
    const r = (itemId: string, n: number, action: string, status: string) => ({ itemId, action, status, createdAt: t(n) });
    expect(countLiveListings([
      r('a', 1, 'POST', 'POSTED'),
      r('b', 1, 'POST', 'POSTED'), r('b', 2, 'REMOVE', 'SKIPPED'), // failed removal: still live
      r('c', 1, 'POST', 'POSTED'), r('c', 2, 'REMOVE', 'REMOVED'), // sold / deactivated / removed
      r('d', 1, 'POST', 'POSTED'), r('d', 2, 'REMOVE', 'REMOVED'), r('d', 3, 'POST', 'POSTED'), // reposted: one listing, not two
    ])).toBe(3);
  });

  it('free = cap - live, never negative; default cap 100; note only at the limit', () => {
    expect(mercariCapacity(null, 98)).toMatchObject({ cap: DEFAULT_MERCARI_LISTING_CAP, capSource: 'default', live: 98, free: 2, atLimit: false, note: null });
    const full = mercariCapacity(null, 100);
    expect(full).toMatchObject({ free: 0, atLimit: true });
    expect(full.note).toBe('Mercari is at its 100-listing limit for your account. New Mercari listings wait until one sells or is removed.');
    expect(mercariCapacity(100, 104)).toMatchObject({ free: 0, atLimit: true });
    expect(mercariCapacity(150, 98)).toMatchObject({ cap: 150, capSource: 'reported', free: 52 });
  });

  it('reposts take the free slots before new items; zero slots = nothing', () => {
    const e = [{ id: 'n1' }, { id: 'r1', repostAfterSale: true }, { id: 'n2' }, { id: 'r2', repostAfterSale: true }];
    expect(applyMercariCap(e, 3).kept.map((x) => x.id)).toEqual(['r1', 'r2', 'n1']);
    expect(applyMercariCap(e, 1).kept.map((x) => x.id)).toEqual(['r1']);
    expect(applyMercariCap(e, 0)).toEqual({ kept: [], heldBack: 4 });
    expect(applyMercariCap(e, 10).heldBack).toBe(0);
  });

  it('loadReportedMercariCap reads the newest mercari_listing_limit trace of this organizer only; a read error falls back to null', async () => {
    mockPrisma.extensionRuntimeLog.findFirst.mockResolvedValueOnce({ message: '[mercari_listing_limit] Mercari listing limit reached | Mercari says: "Currently you are limited to 120 listings."', context: null });
    expect(await loadReportedMercariCap('org1', mockPrisma)).toBe(120);
    const where = mockPrisma.extensionRuntimeLog.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizerId: 'org1', message: { startsWith: '[mercari_listing_limit]' } });
    expect(mockPrisma.extensionRuntimeLog.findFirst.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    mockPrisma.extensionRuntimeLog.findFirst.mockRejectedValueOnce(new Error('db down'));
    expect(await loadReportedMercariCap('org1', mockPrisma)).toBeNull();
  });

  it('a listing deactivated on Mercari to free slots is held, like Resync', () => {
    const s = listingStateForAutoQueue([post(1), removed(2, 'Deactivated on Mercari 2026-10-21 at the seller request, to free listing slots (not deleted)')], 'MERCARI', 9);
    expect(s).toBe('deactivated_hold');
    expect(blocksAutoQueue(s)).toBe(true);
  });
});

describe('GET /extension/autolist-queue with the Mercari cap', () => {
  const onlyMercari = () => mockPrisma.organizer.findUnique.mockResolvedValue({
    id: 'org1', subscriptionTier: 'PRO', removeWatermarkEnabled: true, pausedMarketplaces: [],
    craigslistAutoListEnabled: false, facebookAutoListEnabled: false, gumtreeAuAutoListEnabled: false,
    grailedAutoListEnabled: false, poshmarkAutoListEnabled: false, mercariAutoListEnabled: true,
  });
  const liveRows = (n: number) => Array.from({ length: n }, (_, i) => ({ itemId: 'live' + i, platform: 'MERCARI', action: 'POST', status: 'POSTED', createdAt: t(1) }));
  const setup = () => {
    onlyMercari();
    mainItems = ['new1', 'new2', 'new3', 'sold1', 'deact'].map(baseItem);
    stockRows = mainItems.map((i) => ({ id: i.id, listingType: 'FIXED', stockTotal: 5, stockSold: 1, description: 'd' }));
    jobRows = [
      job('sold1', 'MERCARI', post(1, 4)), job('sold1', 'MERCARI', removed(2, 'sold_on_mercari')),
      job('deact', 'MERCARI', post(1)), job('deact', 'MERCARI', removed(2, 'Deactivated on Mercari 2026-10-21 at the seller request, to free listing slots (not deleted)')),
    ];
  };

  it('98 live of the default 100: two items, the repost first; the deactivated item never', async () => {
    setup();
    mercariAccountRows = [...liveRows(98), ...jobRows]; // sold1 and deact are not live (newest row REMOVE)
    const res = mockRes();
    await getAutolistQueue(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.queues.MERCARI.map((e: any) => e.id)).toEqual(['sold1', 'new1']);
    expect(body.queues.MERCARI[0].repostAfterSale).toBe(true);
    expect(body.mercari).toMatchObject({ cap: 100, live: 98, free: 2, atLimit: false });
    expect(body.notes).toBeUndefined();
  });

  it('at the limit: no Mercari items and the plain note', async () => {
    setup();
    mercariAccountRows = liveRows(100);
    const res = mockRes();
    await getAutolistQueue(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.queues.MERCARI).toEqual([]);
    expect(body.notes.MERCARI).toBe('Mercari is at its 100-listing limit for your account. New Mercari listings wait until one sells or is removed.');
  });

  it('a deleted item whose Mercari listing is still up (pending removal) takes a slot too', async () => {
    setup();
    mercariAccountRows = liveRows(99);
    mockPrisma.pendingListingRemoval.count.mockResolvedValue(1);
    const res = mockRes();
    await getAutolistQueue(req(), res);
    expect(res.json.mock.calls[0][0].queues.MERCARI).toEqual([]);
  });

  it('learns a different cap from the extension report', async () => {
    setup();
    mercariAccountRows = liveRows(0);
    mockPrisma.extensionRuntimeLog.findFirst.mockResolvedValue({ message: '[mercari_listing_limit] Mercari listing limit reached | Mercari says: "Currently you are limited to 3 listings."', context: { ctx: { cap: 3 } } });
    const res = mockRes();
    await getAutolistQueue(req(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.mercari).toMatchObject({ cap: 3, capSource: 'reported', live: 0, free: 3 });
    expect(body.queues.MERCARI.map((e: any) => e.id)).toEqual(['sold1', 'new1', 'new2']);
  });

  it('a counting failure fails closed for Mercari only', async () => {
    setup();
    mockPrisma.pendingListingRemoval.count.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await getAutolistQueue(req(), res);
    expect(res.json.mock.calls[0][0].queues.MERCARI).toEqual([]);
  });
});
