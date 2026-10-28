/**
 * 2026-10-27: a Poshmark Multi Item listing stays live after one unit sells there. commitPlatformUnitSale records that unit sale
 * as a REMOVE/REMOVED sold_on_poshmark row (the newest row), and every "newest row is POST/POSTED" reader used to stop seeing the
 * listing. These pin the readers that now use services/liveListingState.ts:
 *  - pending-removals: the sold-out fan-out and the pickup-only / policy / unpublished sweep still pull it
 *  - price-sync-queue: price and QUANTITY still sync (a sale elsewhere pushes the new remaining stock to Poshmark)
 *  - pending-updates (Facebook): a Poshmark unit sale no longer stops Facebook's own price/quantity sync
 *  - /removed, /removal-skipped, /listed, /remote-listing-id, /price-synced-for-platform record against the live listing
 *  - itemMarketplaceStatusService reads the same listings as listed
 * Mocked Prisma, synthetic data, no network.
 */
const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  item: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  itemKitComponent: { findMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), count: jest.fn() },
  pendingListingRemoval: { findMany: jest.fn() },
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
  getPendingRemovals, getPriceSyncQueue, getPendingUpdates, markItemRemoved, markItemRemovalSkipped, markItemListed,
  setItemRemoteListingId, markItemPriceSyncedForPlatform,
} from '../controllers/extensionController';
import { listedExtensionPlatformsByItemId } from '../services/itemMarketplaceStatusService';
import { liveListingsByItemPlatform, livePlatformsByItem } from '../services/liveListingState';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const req = (extra: Record<string, unknown> = {}) => ({ user: { id: 'u1', emailVerified: true }, query: {}, params: {}, body: {}, ...extra }) as any;

const ITEM = 'cmultiunit000000000000001';
const POSH_ID = '6a982ae87789ea7d11785248';
const T = (m: number) => new Date(Date.UTC(2026, 9, 20, 0, m));
const poshPost = (q: number | null = 3, over: Record<string, unknown> = {}) => ({
  id: 'p1', itemId: ITEM, platform: 'POSHMARK', action: 'POST', status: 'POSTED', createdAt: T(1), syncedQuantity: q,
  remoteListingId: POSH_ID, lastErrorMessage: null, lastAttemptAt: null, priceSyncedAt: T(1), ...over,
});
const poshSold = (m = 2) => ({
  id: 's' + m, itemId: ITEM, platform: 'POSHMARK', action: 'REMOVE', status: 'REMOVED', createdAt: T(m), syncedQuantity: null,
  remoteListingId: null, lastErrorMessage: 'sold_on_poshmark', lastAttemptAt: T(m), priceSyncedAt: null,
});
const fbPost = (over: Record<string, unknown> = {}) => ({
  id: 'f1', itemId: ITEM, platform: 'FACEBOOK', action: 'POST', status: 'POSTED', createdAt: T(0), syncedQuantity: 2,
  remoteListingId: '1234567890', lastErrorMessage: null, lastAttemptAt: null, priceSyncedAt: null, ...over,
});

let soldItems: any[] = [];
let candidateRows: any[] = [];
let mainItems: any[] = [];
let extraRows: any[] = [];
let jobRows: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  soldItems = []; candidateRows = []; mainItems = []; extraRows = []; jobRows = [];
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', pausedMarketplaces: [] });
  mockPrisma.item.findFirst.mockResolvedValue({ id: ITEM });
  mockPrisma.item.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (w.id && w.id.in) return [...candidateRows, ...extraRows].filter((r) => w.id.in.includes(r.id));
    if (w.status === 'SOLD') return soldItems;
    if (w.AND) return mainItems;
    return [];
  });
  mockPrisma.marketplaceListingJob.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    return jobRows.filter((j) => (!w.platform || typeof w.platform !== 'string' || j.platform === w.platform) && (typeof w.itemId !== 'string' || j.itemId === w.itemId));
  });
  mockPrisma.marketplaceListingJob.count.mockResolvedValue(0);
  mockPrisma.marketplaceListingJob.create.mockResolvedValue({});
  mockPrisma.marketplaceListingJob.update.mockResolvedValue({});
  mockPrisma.marketplaceListingJob.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([]);
  mockPrisma.pendingListingRemoval.findMany.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('pending-removals: a Multi Item listing still showing units is pulled', () => {
  it('item sold out elsewhere after one unit sold on Poshmark: the Poshmark listing is served as SOLD_ELSEWHERE with its id', async () => {
    soldItems = [{ id: ITEM, title: 'Nickel Coin Tube' }];
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    const entry = res.json.mock.calls[0][0].items.find((i: any) => i.id === ITEM);
    expect(entry).toMatchObject({ reason: 'SOLD_ELSEWHERE', platforms: ['POSHMARK'], listingRefs: { POSHMARK: POSH_ID } });
  });

  it('every posted unit sold on Poshmark itself: nothing left to pull', async () => {
    soldItems = [{ id: ITEM, title: 'Nickel Coin Tube' }];
    jobRows = [poshPost(2), poshSold(2), poshSold(3)];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    expect(res.json.mock.calls[0][0].items.find((i: any) => i.id === ITEM)).toBeUndefined();
  });

  it('marked pickup only after a Poshmark unit sale: served as POLICY_INELIGIBLE', async () => {
    candidateRows = [{
      id: ITEM, title: 'Nickel Coin Tube', category: 'Coins', ebayCategoryName: null, ebayCategoryId: null, draftStatus: 'PUBLISHED',
      packageWeightOz: null, aiPackageWeightOz: null, packageLengthIn: null, packageWidthIn: null, packageHeightIn: null,
      ebayShippingOverride: 'LOCAL_PICKUP_ONLY',
    }];
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    const entry = res.json.mock.calls[0][0].items.find((i: any) => i.id === ITEM);
    expect(entry).toMatchObject({ reason: 'POLICY_INELIGIBLE', platforms: ['POSHMARK'], listingRefs: { POSHMARK: POSH_ID } });
  });

  it('unpublished after a Poshmark unit sale: served as UNPUBLISHED', async () => {
    candidateRows = [{
      id: ITEM, title: 'Nickel Coin Tube', category: 'Coins', ebayCategoryName: null, ebayCategoryId: null, draftStatus: 'DRAFT',
      packageWeightOz: null, aiPackageWeightOz: null, packageLengthIn: null, packageWidthIn: null, packageHeightIn: null,
      ebayShippingOverride: null,
    }];
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    expect(res.json.mock.calls[0][0].items.find((i: any) => i.id === ITEM)).toMatchObject({ reason: 'UNPUBLISHED', platforms: ['POSHMARK'] });
  });
});

describe('price-sync-queue: quantity and price keep syncing after a Poshmark unit sale', () => {
  const itemRow = (stockSold: number, priceUpdatedAt: Date | null = null) =>
    ({ id: ITEM, title: 'Nickel Coin Tube', price: 5, priceUpdatedAt, stockTotal: 3, stockSold });
  beforeEach(() => { extraRows = [{ id: ITEM, listingType: 'FIXED', stockTotal: 3, stockSold: 0, description: '' }]; });

  it('a unit sold elsewhere after the Poshmark sale: Poshmark shows 2, stock is 1, the new stock is pushed', async () => {
    mainItems = [itemRow(2)];
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    const q = res.json.mock.calls[0][0].queues.POSHMARK;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: ITEM, quantityDrift: true, quantity: 1, remoteListingId: POSH_ID, priceDrift: false });
  });

  it('only the Poshmark sale happened: Poshmark already shows the remaining 2, nothing to push', async () => {
    mainItems = [itemRow(1)];
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    expect(res.json.mock.calls[0][0].queues.POSHMARK).toEqual([]);
  });

  it('a markdown after the Poshmark sale still reaches the live Multi Item listing', async () => {
    mainItems = [itemRow(1, T(5))];
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    expect(res.json.mock.calls[0][0].queues.POSHMARK[0]).toMatchObject({ priceDrift: true, quantityDrift: false });
  });
});

describe('pending-updates (Facebook): a Poshmark unit sale no longer stops Facebook sync', () => {
  it('the live Facebook listing is still queued, with its own id and quantity', async () => {
    mainItems = [{ id: ITEM, title: 'Nickel Coin Tube', price: 10, marketplaceListedPrice: 8, stockTotal: 3, stockSold: 1 }];
    jobRows = [fbPost(), poshPost(3), poshSold(2)];
    const res = mockRes();
    await getPendingUpdates(req(), res);
    const items = res.json.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: ITEM, remoteListingId: '1234567890', priceDrift: true, quantityDrift: false, quantity: 2 });
  });

  it('an item live only on Poshmark is not offered to the Facebook editor', async () => {
    mainItems = [{ id: ITEM, title: 'Nickel Coin Tube', price: 10, marketplaceListedPrice: 8, stockTotal: 3, stockSold: 1 }];
    jobRows = [poshPost(3)];
    const res = mockRes();
    await getPendingUpdates(req(), res);
    expect(res.json.mock.calls[0][0].items).toEqual([]);
  });
});

describe('extension reports against the live Multi Item listing', () => {
  const ownReq = (body: Record<string, unknown>) => req({ params: { id: ITEM }, body });

  it('/removed after a unit sale records the removal (it used to be deduped as already removed, so it was served forever)', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue(poshSold(2));
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await markItemRemoved(ownReq({ platform: 'POSHMARK' }), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockPrisma.marketplaceListingJob.create.mock.calls[0][0].data).toMatchObject({ itemId: ITEM, action: 'REMOVE', status: 'REMOVED', platform: 'POSHMARK' });
  });

  it('/removed is still deduped when the Multi Item listing is sold out', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue(poshSold(3));
    jobRows = [poshPost(2), poshSold(2), poshSold(3)];
    const res = mockRes();
    await markItemRemoved(ownReq({ platform: 'POSHMARK' }), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, deduped: true });
    expect(mockPrisma.marketplaceListingJob.create).not.toHaveBeenCalled();
  });

  it('/removal-skipped after a unit sale records the skip (not alreadyRemoved)', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue(poshSold(2));
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await markItemRemovalSkipped(ownReq({ platform: 'POSHMARK', reason: 'no_confident_title_match' }), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockPrisma.marketplaceListingJob.create.mock.calls[0][0].data).toMatchObject({ action: 'REMOVE', status: 'SKIPPED', platform: 'POSHMARK' });
  });

  it('/listed replayed after a unit sale is deduped onto the live listing (no new POST row resetting its units)', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue(poshSold(2));
    jobRows = [poshPost(3, { remoteListingId: null }), poshSold(2)];
    const res = mockRes();
    await markItemListed(ownReq({ platform: 'POSHMARK', remoteListingId: POSH_ID }), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, deduped: true });
    expect(mockPrisma.marketplaceListingJob.create).not.toHaveBeenCalled();
    expect(mockPrisma.marketplaceListingJob.updateMany.mock.calls[0][0].where).toEqual({ id: 'p1', remoteListingId: null });
  });

  it('/remote-listing-id after a unit sale attaches the id to the live POST row', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockImplementation(async (args: any) => (args?.where?.remoteListingId ? null : poshSold(2)));
    jobRows = [poshPost(3, { remoteListingId: null }), poshSold(2)];
    const res = mockRes();
    await setItemRemoteListingId(ownReq({ platform: 'POSHMARK', remoteListingId: POSH_ID }), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockPrisma.marketplaceListingJob.updateMany.mock.calls[0][0].where).toEqual({ id: 'p1', remoteListingId: null });
  });

  it('/price-synced-for-platform stores the baseline (shown + unit sales there since the POST)', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue({ id: 'p1' });
    mockPrisma.item.findUnique.mockResolvedValue({ stockTotal: 3, stockSold: 2 });
    jobRows = [poshPost(3), poshSold(2)];
    const res = mockRes();
    await markItemPriceSyncedForPlatform(ownReq({ platform: 'POSHMARK' }), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    // 1 in stock now shown on the listing + 1 unit sold on Poshmark since the POST = 2; the queue then reads 2 - 1 = 1 showing.
    expect(mockPrisma.marketplaceListingJob.update.mock.calls[0][0].data.syncedQuantity).toBe(2);
  });

  it('/price-synced-for-platform records a read-back quantity when the extension sends one (listing shows fewer than stock)', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue({ id: 'p1' });
    mockPrisma.item.findUnique.mockResolvedValue({ stockTotal: 3, stockSold: 0 });
    jobRows = [poshPost(3)];
    const res = mockRes();
    await markItemPriceSyncedForPlatform(ownReq({ platform: 'POSHMARK', quantity: 1 }), res);
    expect(mockPrisma.marketplaceListingJob.update.mock.calls[0][0].data.syncedQuantity).toBe(1);
  });

  it('/price-synced-for-platform ignores a malformed read-back quantity', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValue({ id: 'p1' });
    mockPrisma.item.findUnique.mockResolvedValue({ stockTotal: 3, stockSold: 0 });
    jobRows = [poshPost(3)];
    await markItemPriceSyncedForPlatform(ownReq({ platform: 'POSHMARK', quantity: '1' }), mockRes());
    expect(mockPrisma.marketplaceListingJob.update.mock.calls[0][0].data.syncedQuantity).toBe(3);
  });
});

describe('item marketplace status reads the same listings as live', () => {
  it('listedExtensionPlatformsByItemId agrees with liveListingState for unit-sale, sold-out and plain cases', () => {
    const rows: any[] = [
      poshPost(3), poshSold(2), // Multi Item, 2 showing: listed
      { ...poshPost(2), itemId: 'soldout' }, { ...poshSold(2), itemId: 'soldout' }, { ...poshSold(3), itemId: 'soldout' },
      { ...fbPost(), itemId: 'fb' },
    ];
    const status = listedExtensionPlatformsByItemId(rows);
    const live = livePlatformsByItem(liveListingsByItemPlatform(rows));
    expect([...(status.get(ITEM) ?? [])]).toEqual(['POSHMARK']);
    expect([...(status.get('soldout') ?? [])]).toEqual([]);
    for (const id of [ITEM, 'soldout', 'fb']) expect([...(status.get(id) ?? [])].map(String).sort()).toEqual([...(live.get(id) ?? [])].sort());
  });
});
