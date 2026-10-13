/**
 * inventoryStockSync (2026-10-13, single inventory number): syncItemStock gating logic.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * In-memory fakes only: no network, no database, no eBay / Etsy / Shopify call. eBay is a routed ebayFetch mock (offer GET,
 * inventory item GET and PUT, publish POST), every other market is a mocked connector.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), updateMany: jest.fn() },
  sale: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn() },
  itemBulkLot: { findMany: jest.fn() },
  etsyListing: { findUnique: jest.fn() },
  shopifyListing: { findUnique: jest.fn(), updateMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn() },
  itemKitComponent: { findMany: jest.fn() },
};
const mockEbayFetch = jest.fn();
const mockRefresh = jest.fn();
const mockRateLimited = jest.fn();
const mockEndEbay = jest.fn();
const mockRecompute = jest.fn();
const mockReconcile = jest.fn();
const mockAbsorb = jest.fn();
const mockShopifySold = jest.fn();
const mockShopifyUpdate = jest.fn();
const mockShopifyClient = jest.fn();
const mockEtsyUpdate = jest.fn();
const mockEtsyWithdraw = jest.fn();
const mockEtsyEnabled = jest.fn();
const mockDiscogsWithdraw = jest.fn();
const mockReverbWithdraw = jest.fn();
const mockFbNudge = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../services/ebayPublishService', () => ({ ebayFetch: (...a: unknown[]) => mockEbayFetch(...a) }));
jest.mock('../services/ebayHttp', () => ({ refreshEbayAccessToken: (...a: unknown[]) => mockRefresh(...a) }));
jest.mock('../lib/ebayRateLimiter', () => ({ isEbayRateLimited: () => mockRateLimited(), trackEbayCall: () => undefined }));
jest.mock('../controllers/ebayController', () => ({
  buildCustomLabel: (id: string) => `FAS-${id}`,
  endEbayListingIfExists: (...a: unknown[]) => mockEndEbay(...a),
}));
jest.mock('../services/itemKitStock', () => ({ recomputeKitsForComponents: (...a: unknown[]) => mockRecompute(...a) }));
jest.mock('../services/bulkLot/bulkLotEbayWiring', () => ({ reconcileBulkLotEbayInBackgroundIfEnabled: (...a: unknown[]) => mockReconcile(...a) }));
jest.mock('../jobs/ebaySoldSyncCron', () => ({ syncSoldItemsForOrganizer: (...a: unknown[]) => mockAbsorb(...a) }));
jest.mock('../services/shopifyService', () => ({
  markShopifyItemSold: (...a: unknown[]) => mockShopifySold(...a),
  updateShopifyProductFields: (...a: unknown[]) => mockShopifyUpdate(...a),
  getShopifyClient: (...a: unknown[]) => mockShopifyClient(...a),
}));
jest.mock('../services/marketplace/etsyConnector', () => ({
  updateEtsyListingInventory: (...a: unknown[]) => mockEtsyUpdate(...a),
  withdrawEtsyListingIfExists: (...a: unknown[]) => mockEtsyWithdraw(...a),
}));
jest.mock('../services/marketplace/etsyHttp', () => ({ isEtsyConnectorEnabled: () => mockEtsyEnabled() }));
jest.mock('../services/marketplace/etsyMapping', () => ({
  computeEtsyQuantity: (i: { stockTotal?: number | null; stockSold?: number | null }) => Math.max((i.stockTotal ?? 1) - (i.stockSold ?? 0), 1),
}));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: (...a: unknown[]) => mockDiscogsWithdraw(...a) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: (...a: unknown[]) => mockReverbWithdraw(...a) }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: (...a: unknown[]) => mockFbNudge(...a) }));

import { syncItemStock, inStockOf } from '../services/inventoryStockSync';

type Row = Record<string, any>;
const state: { row: Row | null } = { row: null };

/** The row syncItemStock reads. Ordinary item with an eBay offer, 4 of 5 units in stock. */
const row = (over: Row = {}): Row => ({
  id: 'item_1', status: 'AVAILABLE', listingType: 'STANDARD', stockTotal: 5, stockSold: 1, saleId: 'sale_1', organizerId: 'org_1',
  createdAt: new Date('2026-01-01'), costBasis: null, roomTag: null, deletedAt: null, draftStatus: 'PUBLISHED', isKitComponent: false,
  ebayOfferId: 'offer_1', ebayListingId: '1234567890', ebayQuantityAvailable: 4, ebayQueuedAt: null, ebaySyncHeldAt: null, ebayHeldFields: [],
  ebaySyncState: 'SYNCED', ebaySyncFailureReason: null, discogsListingId: null, reverbListingId: null, fbExportedAt: null, card: null,
  ...over,
});

const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });

interface EbayWorld {
  offer?: Row;
  offerStatus?: number;
  liveQty?: number;
  putStatus?: number;
  publishStatus?: number;
}
function routeEbay(w: EbayWorld = {}): void {
  mockEbayFetch.mockImplementation(async (path: string, _token: string, init?: { method?: string; body?: unknown }) => {
    const method = init?.method ?? 'GET';
    if (path.startsWith('/sell/inventory/v1/offer/') && path.endsWith('/publish')) return res(w.publishStatus ?? 200, { listingId: '999000111' });
    if (path.startsWith('/sell/inventory/v1/offer/')) return res(w.offerStatus ?? 200, w.offer ?? { status: 'PUBLISHED', sku: 'FAS-item_1', availableQuantity: w.liveQty ?? 4 });
    if (path.startsWith('/sell/inventory/v1/inventory_item/') && method === 'PUT') return res(w.putStatus ?? 204, {});
    if (path.startsWith('/sell/inventory/v1/inventory_item/')) {
      return res(200, { sku: 'FAS-item_1', product: { title: 'Lamp' }, availability: { shipToLocationAvailability: { quantity: w.liveQty ?? 4 } } });
    }
    return res(404);
  });
}
const ebayCalls = () => mockEbayFetch.mock.calls.map((c) => ({ path: c[0] as string, method: ((c[2] as any)?.method ?? 'GET') as string, body: (c[2] as any)?.body }));
const puts = () => ebayCalls().filter((c) => c.method === 'PUT');
const mirrorWrites = () => mockPrisma.item.updateMany.mock.calls.map((c: any[]) => c[0].data).filter((d: any) => d && 'ebayQuantityAvailable' in d);

let spies: any[] = [];

beforeEach(() => {
  for (const m of Object.values(mockPrisma) as any[]) for (const fn of Object.values(m) as any[]) fn.mockReset();
  [mockEbayFetch, mockRefresh, mockRateLimited, mockEndEbay, mockRecompute, mockReconcile, mockAbsorb, mockShopifySold, mockShopifyUpdate, mockShopifyClient,
    mockEtsyUpdate, mockEtsyWithdraw, mockEtsyEnabled, mockDiscogsWithdraw, mockReverbWithdraw, mockFbNudge].forEach((f) => f.mockReset());
  delete process.env.CARD_BULK_LOTS_ENABLED;
  delete process.env.CARD_BULK_EBAY_ENABLED;
  state.row = row();
  mockPrisma.item.findUnique.mockImplementation(async () => state.row);
  mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.sale.findUnique.mockResolvedValue({ organizerId: 'org_1' });
  mockPrisma.organizer.findUnique.mockImplementation(async ({ where }: any) => ({
    id: where.id, skuAppendDate: false, skuAppendCost: false, skuAppendLocation: false, ebayConnection: { lastEbaySoldSyncAt: new Date() },
  }));
  mockPrisma.itemBulkLot.findMany.mockResolvedValue([]);
  mockPrisma.etsyListing.findUnique.mockResolvedValue(null);
  mockPrisma.shopifyListing.findUnique.mockResolvedValue(null);
  mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([]);
  mockRefresh.mockResolvedValue('tok');
  mockRateLimited.mockReturnValue(false);
  mockEndEbay.mockResolvedValue(true);
  mockRecompute.mockResolvedValue(undefined);
  mockAbsorb.mockResolvedValue(undefined);
  mockEtsyEnabled.mockReturnValue(false);
  mockEtsyWithdraw.mockResolvedValue('withdrawn');
  mockReverbWithdraw.mockResolvedValue('withdrawn');
  mockDiscogsWithdraw.mockResolvedValue(undefined);
  mockShopifySold.mockResolvedValue(undefined);
  mockFbNudge.mockResolvedValue(undefined);
  routeEbay();
  spies = (['error', 'log', 'warn'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

const ebayOutcome = (r: { outcomes: Array<{ market: string }> }) => r.outcomes.find((o) => o.market === 'ebay') as any;

describe('syncItemStock: reading and never throwing', () => {
  it('re-exports inStockOf', () => {
    expect(inStockOf({ stockTotal: 5, stockSold: 1 })).toBe(4);
  });

  it('a missing item returns inStock -1 and touches no market', async () => {
    state.row = null;
    const r = await syncItemStock('item_1', 'test');
    expect(r).toEqual({ itemId: 'item_1', inStock: -1, outcomes: [] });
    expect(mockEbayFetch).not.toHaveBeenCalled();
  });

  it('a soft-deleted item is treated as missing', async () => {
    state.row = row({ deletedAt: new Date() });
    const r = await syncItemStock('item_1', 'test');
    expect(r.inStock).toBe(-1);
    expect(mockEbayFetch).not.toHaveBeenCalled();
  });

  it('never throws, even when the database read fails', async () => {
    mockPrisma.item.findUnique.mockRejectedValue(new Error('db down'));
    const r = await syncItemStock('item_1', 'test');
    expect(r).toEqual({ itemId: 'item_1', inStock: -1, outcomes: [] });
  });

  it('never throws when an eBay call fails; the outcome is failed', async () => {
    mockEbayFetch.mockRejectedValue(new Error('network'));
    const r = await syncItemStock('item_1', 'test');
    expect(r.inStock).toBe(4);
    expect(ebayOutcome(r).status).toBe('failed');
  });

  it('a consignor price tag has no unit to count: no outcomes, no market call', async () => {
    state.row = row({ listingType: 'CONSIGNOR_TAG' });
    const r = await syncItemStock('item_1', 'test');
    expect(r.outcomes).toEqual([]);
    expect(mockEbayFetch).not.toHaveBeenCalled();
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it('a kit syncs like any item: its own derived stock number is pushed to eBay (no early exit)', async () => {
    state.row = row({ listingType: 'KIT', stockTotal: 3, stockSold: 0, ebayQuantityAvailable: 3 });
    routeEbay({ liveQty: 9 });
    const r = await syncItemStock('item_1', 'component sold');
    expect(r.inStock).toBe(3);
    expect(ebayOutcome(r)).toMatchObject({ status: 'synced', expected: 3 });
    expect((puts()[0].body as any).availability.shipToLocationAvailability.quantity).toBe(3);
  });

  it('a kit whose derived stock is 0 has its eBay listing ended (zero stock flows to removal)', async () => {
    state.row = row({ listingType: 'KIT', stockTotal: 2, stockSold: 2 });
    const r = await syncItemStock('item_1', 'component sold out');
    expect(r.inStock).toBe(0);
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({ where: { id: 'item_1', status: 'AVAILABLE' }, data: { status: 'SOLD' } });
    expect(mockEndEbay).toHaveBeenCalledWith('item_1');
    expect(puts()).toHaveLength(0);
  });

  it('kits that CONTAIN the item are recomputed on every real run, never on checkOnly', async () => {
    state.row = row({ isKitComponent: true });
    const r = await syncItemStock('item_1', 'test');
    expect(mockRecompute).toHaveBeenCalledWith(expect.anything(), ['item_1']);
    expect(r.outcomes.some((o) => o.market === 'kits' && o.status === 'synced')).toBe(true);
    mockRecompute.mockClear();
    await syncItemStock('item_1', 'test', { checkOnly: true });
    expect(mockRecompute).not.toHaveBeenCalled();
  });
});

describe('syncItemStock: eBay, stock above zero', () => {
  it('live quantity already equals the in-stock number: nothing is sent, the mirror is recorded', async () => {
    routeEbay({ liveQty: 4 });
    const r = await syncItemStock('item_1', 'test');
    expect(ebayOutcome(r)).toMatchObject({ status: 'unchanged', expected: 4, live: 4 });
    expect(puts()).toHaveLength(0);
    expect(mirrorWrites()).toEqual([{ ebayQuantityAvailable: 4 }]);
  });

  it('eBay shows more than the platform: the platform number is pushed, merged into the existing inventory item', async () => {
    routeEbay({ liveQty: 9 });
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r)).toMatchObject({ status: 'synced', expected: 4 });
    expect(puts()).toHaveLength(1);
    const body = puts()[0].body as any;
    expect(body.availability.shipToLocationAvailability.quantity).toBe(4);
    expect(body.product).toEqual({ title: 'Lamp' }); // the PUT replaces the whole item, so the GET fields are kept
    expect(mirrorWrites()).toEqual([{ ebayQuantityAvailable: 4 }]);
  });

  it('uses the real SKU from the offer GET, not a guess', async () => {
    routeEbay({ liveQty: 9, offer: { status: 'PUBLISHED', sku: 'FAS-item_1 2026-10-01 $5.00', availableQuantity: 9 } });
    await syncItemStock('item_1', 'edit');
    const invCalls = ebayCalls().filter((c) => c.path.startsWith('/sell/inventory/v1/inventory_item/'));
    expect(invCalls.length).toBeGreaterThan(0);
    for (const c of invCalls) expect(c.path).toBe(`/sell/inventory/v1/inventory_item/${encodeURIComponent('FAS-item_1 2026-10-01 $5.00')}`);
  });

  it('an inventory item with no sale resolves its organizer through the item, not the sale', async () => {
    state.row = row({ saleId: null, organizerId: 'org_inv' });
    routeEbay({ liveQty: 9 });
    const r = await syncItemStock('item_1', 'edit');
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.organizer.findUnique.mock.calls[0][0].where).toEqual({ id: 'org_inv' });
    expect(ebayOutcome(r).status).toBe('synced');
  });

  it('checkOnly reports drift and changes nothing', async () => {
    routeEbay({ liveQty: 9 });
    const r = await syncItemStock('item_1', 'sweep', { checkOnly: true });
    expect(ebayOutcome(r)).toMatchObject({ status: 'drift', expected: 4, live: 9 });
    expect(puts()).toHaveLength(0);
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    expect(mockAbsorb).not.toHaveBeenCalled();
  });

  it('checkOnly refreshes a stale mirror when eBay already matches, writes only the mirror, and reports unchanged', async () => {
    state.row = row({ ebayQuantityAvailable: 6 });
    routeEbay({ liveQty: 4 });
    const r = await syncItemStock('item_1', 'sweep', { checkOnly: true });
    expect(ebayOutcome(r)).toMatchObject({ status: 'unchanged', expected: 4, live: 4 });
    expect(puts()).toHaveLength(0);
    expect(mockPrisma.item.updateMany.mock.calls.map((c: any[]) => c[0].data)).toEqual([{ ebayQuantityAvailable: 4 }]);
  });

  it('checkOnly leaves a correct mirror alone', async () => {
    state.row = row({ ebayQuantityAvailable: 4 });
    routeEbay({ liveQty: 4 });
    await syncItemStock('item_1', 'sweep', { checkOnly: true });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('a normal sync also refreshes a stale mirror when eBay already matches', async () => {
    state.row = row({ ebayQuantityAvailable: 6 });
    routeEbay({ liveQty: 4 });
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('unchanged');
    expect(mirrorWrites()).toEqual([{ ebayQuantityAvailable: 4 }]);
  });

  it('a held item is not pushed; the quantity is recorded as held for "Update eBay now"', async () => {
    state.row = row({ ebaySyncHeldAt: new Date() });
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('skipped');
    expect(mockEbayFetch).not.toHaveBeenCalled();
    const heldWrite = mockPrisma.item.updateMany.mock.calls.map((c: any[]) => c[0].data).find((d: any) => d.ebayHeldFields);
    expect(heldWrite).toEqual({ ebayHeldFields: { push: 'quantity' } });
  });

  it('a sold, donated or ended item with units left is not pushed', async () => {
    for (const status of ['SOLD', 'DONATED', 'AUCTION_ENDED']) {
      state.row = row({ status });
      mockEbayFetch.mockClear();
      const r = await syncItemStock('item_1', 'edit');
      expect(ebayOutcome(r).status).toBe('skipped');
      expect(mockEbayFetch).not.toHaveBeenCalled();
    }
  });

  it('respects the eBay rate limiter: nothing is sent', async () => {
    mockRateLimited.mockReturnValue(true);
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('skipped');
    expect(mockEbayFetch).not.toHaveBeenCalled();
  });

  it('a listing eBay has but FindA.Sale did not create (no offer id) is reported as manual', async () => {
    state.row = row({ ebayOfferId: null });
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('manual');
    expect(mockEbayFetch).not.toHaveBeenCalled();
  });

  it('an item never listed on eBay has no eBay outcome', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null });
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r)).toBeUndefined();
    expect(mockEbayFetch).not.toHaveBeenCalled();
  });

  it('eBay refusing the quantity is a failed outcome, never a thrown error', async () => {
    routeEbay({ liveQty: 9, putStatus: 400 });
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('failed');
    expect(mirrorWrites()).toHaveLength(0);
  });
});

describe('syncItemStock: stale-overwrite guard', () => {
  it('eBay shows LESS than the platform: the eBay sold sync runs first, the item is re-read, and the lower number is NOT overwritten with a stale higher one', async () => {
    state.row = row({ saleId: null, organizerId: 'org_stale' });
    routeEbay({ liveQty: 2 });
    mockAbsorb.mockImplementation(async () => {
      state.row = { ...(state.row as Row), stockSold: 3 }; // the sold sync absorbed two eBay units: in stock is now 2
    });
    const r = await syncItemStock('item_1', 'sweep');
    expect(mockAbsorb).toHaveBeenCalledTimes(1);
    expect(mockAbsorb).toHaveBeenCalledWith('org_stale');
    expect(r.inStock).toBe(2);
    expect(ebayOutcome(r)).toMatchObject({ status: 'unchanged', expected: 2, live: 2 });
    expect(puts()).toHaveLength(0);
  });

  it('when the eBay sold sync cannot run, nothing is pushed', async () => {
    state.row = row({ saleId: null, organizerId: 'org_stale_fail' });
    routeEbay({ liveQty: 2 });
    mockAbsorb.mockRejectedValue(new Error('fulfillment api down'));
    const r = await syncItemStock('item_1', 'sweep');
    expect(ebayOutcome(r).status).toBe('skipped');
    expect(puts()).toHaveLength(0);
  });
});

describe('syncItemStock: eBay, zero stock', () => {
  beforeEach(() => {
    state.row = row({ stockTotal: 2, stockSold: 2 });
  });

  it('zero stock ends the listing, flips AVAILABLE to SOLD, and never sends quantity 0', async () => {
    const r = await syncItemStock('item_1', 'sale');
    expect(r.inStock).toBe(0);
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({ where: { id: 'item_1', status: 'AVAILABLE' }, data: { status: 'SOLD' } });
    expect(mockEndEbay).toHaveBeenCalledWith('item_1');
    expect(ebayOutcome(r).status).toBe('ended');
    expect(puts()).toHaveLength(0);
  });

  it('an offer that is already ended is not ended again by a later sweep', async () => {
    state.row = row({ stockTotal: 2, stockSold: 2, status: 'SOLD' });
    routeEbay({ offer: { status: 'UNPUBLISHED', sku: 'FAS-item_1' } });
    const r = await syncItemStock('item_1', 'sweep');
    expect(mockEndEbay).not.toHaveBeenCalled();
    expect(ebayOutcome(r).status).toBe('unchanged');
  });

  it('checkOnly reports a live listing with nothing in stock as drift and ends nothing', async () => {
    const r = await syncItemStock('item_1', 'sweep', { checkOnly: true });
    expect(ebayOutcome(r).status).toBe('drift');
    expect(mockEndEbay).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('checkOnly with nothing in stock reports an unreadable offer (HTTP 400) as failed with eBay\'s message, and changes nothing', async () => {
    mockEbayFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/sell/inventory/v1/offer/')) return res(400, { errors: [{ errorId: 25709, message: 'Invalid value for offerId.' }] });
      return res(404);
    });
    const r = await syncItemStock('item_1', 'sweep', { checkOnly: true });
    expect(r.inStock).toBe(0);
    const o = ebayOutcome(r);
    expect(o.status).toBe('failed');
    expect(o.detail).toContain('HTTP 400');
    expect(o.detail).toContain('Invalid value for offerId');
    expect(ebayCalls().every((c) => c.method === 'GET')).toBe(true); // no PUT, POST (publish) or DELETE
    expect(mockEndEbay).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('a failed end is reported as failed so the next sync retries', async () => {
    mockEndEbay.mockResolvedValue(false);
    const r = await syncItemStock('item_1', 'sale');
    expect(ebayOutcome(r).status).toBe('failed');
  });
});

describe('syncItemStock: eBay, restock after the listing was ended', () => {
  const ended = { offer: { status: 'UNPUBLISHED', sku: 'FAS-item_1' } };

  it('an AVAILABLE, published item whose offer is ended is republished with the new quantity', async () => {
    routeEbay({ ...ended, liveQty: 0 });
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r)).toMatchObject({ status: 'relisted', expected: 4 });
    const calls = ebayCalls();
    expect(calls.find((c) => c.method === 'PUT')).toBeDefined();
    expect((calls.find((c) => c.method === 'PUT')!.body as any).availability.shipToLocationAvailability.quantity).toBe(4);
    expect(calls.some((c) => c.method === 'POST' && c.path === '/sell/inventory/v1/offer/offer_1/publish')).toBe(true);
    const writes = mockPrisma.item.updateMany.mock.calls.map((c: any[]) => c[0].data);
    expect(writes.some((d: any) => d.ebayQuantityAvailable === 4 && d.ebayListingId === '999000111')).toBe(true);
  });

  it('an item still in the queue is not relisted behind the organizer, and the outcome says why', async () => {
    state.row = row({ ebayQueuedAt: new Date() });
    routeEbay(ended);
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('skipped');
    expect(ebayCalls().some((c) => c.method === 'POST')).toBe(false);
  });

  it('an unpublished item (draft) is not relisted', async () => {
    state.row = row({ draftStatus: 'DRAFT' });
    routeEbay(ended);
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('skipped');
    expect(ebayCalls().some((c) => c.method === 'POST')).toBe(false);
  });

  it('a SOLD item is never relisted by the sync alone', async () => {
    state.row = row({ status: 'SOLD' });
    routeEbay(ended);
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('skipped');
    expect(mockEbayFetch).not.toHaveBeenCalled();
  });

  it('a failed republish leaves a persistent flag on the item and reports failed', async () => {
    routeEbay({ ...ended, publishStatus: 500 });
    const r = await syncItemStock('item_1', 'edit');
    expect(ebayOutcome(r).status).toBe('failed');
    const flag = mockPrisma.item.updateMany.mock.calls.map((c: any[]) => c[0].data).find((d: any) => d.ebaySyncState === 'FAILED_RETRYABLE');
    expect(flag).toBeDefined();
    expect(String(flag.ebaySyncFailureReason).startsWith('Stock sync:')).toBe(true);
  });
});

describe('syncItemStock: bulk lots', () => {
  beforeEach(() => {
    mockPrisma.itemBulkLot.findMany.mockResolvedValue([{ itemId: 'item_1' }]);
  });

  it('a lot with the bundle flag off sends nothing to eBay (cards are never unit quantities)', async () => {
    const r = await syncItemStock('item_1', 'partial sale on another channel');
    expect(mockEbayFetch).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(ebayOutcome(r).status).toBe('skipped');
  });

  it('a lot with the bundle flag on is reconciled by the bundle service with the sync reason', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
    process.env.CARD_BULK_EBAY_ENABLED = 'true';
    await syncItemStock('item_1', 'partial sale on another channel');
    expect(mockEbayFetch).not.toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalledWith('item_1', 'partial sale on another channel');
  });

  it('a lot is never flipped SOLD at zero by the unit sync', async () => {
    state.row = row({ stockTotal: 100, stockSold: 100 });
    await syncItemStock('item_1', 'sweep');
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('with the lot flag on, a failed lot lookup fails closed: nothing is sent', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
    mockPrisma.itemBulkLot.findMany.mockRejectedValue(new Error('db down'));
    await syncItemStock('item_1', 'sweep');
    expect(mockEbayFetch).not.toHaveBeenCalled();
  });
});

describe('syncItemStock: other markets', () => {
  it('Etsy: a different synced quantity is updated through the connector', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null });
    mockEtsyEnabled.mockReturnValue(true);
    mockPrisma.etsyListing.findUnique.mockResolvedValue({ itemId: 'item_1', etsyListingId: 'e1', state: 'ACTIVE', syncedQuantity: 5 });
    mockEtsyUpdate.mockResolvedValue({ ok: true, outcome: 'updated' });
    const r = await syncItemStock('item_1', 'edit');
    expect(mockEtsyUpdate).toHaveBeenCalledWith('item_1');
    expect(r.outcomes.find((o) => o.market === 'etsy')).toMatchObject({ status: 'synced', expected: 4 });
  });

  it('Etsy: a matching synced quantity makes no call', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null });
    mockEtsyEnabled.mockReturnValue(true);
    mockPrisma.etsyListing.findUnique.mockResolvedValue({ itemId: 'item_1', etsyListingId: 'e1', state: 'ACTIVE', syncedQuantity: 4 });
    const r = await syncItemStock('item_1', 'edit');
    expect(mockEtsyUpdate).not.toHaveBeenCalled();
    expect(r.outcomes.find((o) => o.market === 'etsy')!.status).toBe('unchanged');
  });

  it('Etsy: zero stock withdraws the listing', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null, stockTotal: 1, stockSold: 1 });
    mockEtsyEnabled.mockReturnValue(true);
    mockPrisma.etsyListing.findUnique.mockResolvedValue({ itemId: 'item_1', etsyListingId: 'e1', state: 'ACTIVE', syncedQuantity: 1 });
    const r = await syncItemStock('item_1', 'sale');
    expect(mockEtsyWithdraw).toHaveBeenCalledWith('item_1');
    expect(r.outcomes.find((o) => o.market === 'etsy')!.status).toBe('ended');
  });

  it('Shopify: the inventory level is set to the in-stock number and confirmed by a re-read', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null });
    let live = 9;
    mockPrisma.shopifyListing.findUnique.mockResolvedValue({ itemId: 'item_1', status: 'ACTIVE', shopifyVariantId: 'v1', organizer: {} });
    mockShopifyClient.mockReturnValue({ get: async () => ({ data: { variant: { inventory_quantity: live } } }) });
    mockShopifyUpdate.mockImplementation(async (_id: string, f: { quantity?: number }) => { live = f.quantity ?? live; });
    const r = await syncItemStock('item_1', 'edit');
    expect(mockShopifyUpdate).toHaveBeenCalledWith('item_1', { quantity: 4 });
    expect(r.outcomes.find((o) => o.market === 'shopify')).toMatchObject({ status: 'synced', expected: 4, live: 4 });
  });

  it('Shopify: zero stock marks the product sold', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null, stockTotal: 1, stockSold: 1 });
    mockPrisma.shopifyListing.findUnique.mockResolvedValue({ itemId: 'item_1', status: 'ACTIVE', shopifyVariantId: 'v1', organizer: {} });
    const r = await syncItemStock('item_1', 'sale');
    expect(mockShopifySold).toHaveBeenCalledWith('item_1');
    expect(r.outcomes.find((o) => o.market === 'shopify')!.status).toBe('ended');
  });

  it('a market with no quantity API is manual while more than one unit is in stock', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null, reverbListingId: 'rv1' });
    const r = await syncItemStock('item_1', 'edit');
    expect(r.outcomes.find((o) => o.market === 'reverb')!.status).toBe('manual');
    expect(mockReverbWithdraw).not.toHaveBeenCalled();
  });

  it('a market with no quantity API is fine at one unit, and is withdrawn at zero', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null, discogsListingId: 'dg1', stockTotal: 1, stockSold: 0 });
    let r = await syncItemStock('item_1', 'edit');
    expect(r.outcomes.find((o) => o.market === 'discogs')!.status).toBe('unchanged');
    state.row = row({ ebayOfferId: null, ebayListingId: null, discogsListingId: 'dg1', stockTotal: 1, stockSold: 1 });
    r = await syncItemStock('item_1', 'sale');
    expect(mockDiscogsWithdraw).toHaveBeenCalledWith('item_1');
    expect(r.outcomes.find((o) => o.market === 'discogs')!.status).toBe('ended');
  });

  it('the Facebook nudge fires only on the real SOLD transition, not on every sweep', async () => {
    state.row = row({ ebayOfferId: null, ebayListingId: null, fbExportedAt: new Date(), stockTotal: 1, stockSold: 1 });
    await syncItemStock('item_1', 'sale'); // AVAILABLE -> SOLD happens here
    expect(mockFbNudge).toHaveBeenCalledTimes(1);
    mockFbNudge.mockClear();
    state.row = row({ ebayOfferId: null, ebayListingId: null, fbExportedAt: new Date(), stockTotal: 1, stockSold: 1, status: 'SOLD' });
    await syncItemStock('item_1', 'sweep');
    expect(mockFbNudge).not.toHaveBeenCalled();
  });
});

describe('syncItemStock: one run per item at a time', () => {
  it('overlapping calls collapse to the running one plus exactly one queued re-run that reads the latest state', async () => {
    routeEbay({ liveQty: 4 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const base = mockEbayFetch.getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
    mockEbayFetch.mockImplementation(async (...args: unknown[]) => { await gate; return base(...args); });
    const a = syncItemStock('item_1', 'a');
    await new Promise((resolve) => setImmediate(resolve)); // run "a" has started and is waiting on eBay
    const b = syncItemStock('item_1', 'b');
    const c = syncItemStock('item_1', 'c'); // joins the queued re-run of "b"
    release();
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect([ra.inStock, rb.inStock, rc.inStock]).toEqual([4, 4, 4]);
    const offerGets = ebayCalls().filter((x) => x.method === 'GET' && x.path === '/sell/inventory/v1/offer/offer_1');
    expect(offerGets).toHaveLength(2);
  });
});


describe('syncItemStock: kit cascade (kit <-> components, both directions, always terminates)', () => {
  const flush = async () => { for (let i = 0; i < 12; i += 1) await new Promise((r) => setImmediate(r)); };
  const rows: Record<string, Row> = {};
  const lookedUp = () => mockPrisma.item.findUnique.mock.calls.map((c: any[]) => c[0].where.id as string);

  beforeEach(() => {
    for (const k of Object.keys(rows)) delete rows[k];
    rows.k1 = row({ id: 'k1', listingType: 'KIT', stockTotal: 3, stockSold: 0, ebayOfferId: null, ebayListingId: null });
    rows.c1 = row({ id: 'c1', isKitComponent: true, ebayOfferId: null, ebayListingId: null });
    rows.c2 = row({ id: 'c2', isKitComponent: true, ebayOfferId: null, ebayListingId: null });
    mockPrisma.item.findUnique.mockImplementation(async ({ where }: any) => rows[where.id] ?? null);
    mockPrisma.itemKitComponent.findMany.mockImplementation(async ({ where }: any) => {
      if (where.kitItemId === 'k1') return [{ componentItemId: 'c1' }, { componentItemId: 'c2' }];
      if (where.componentItemId) return [{ kitItemId: 'k1' }];
      return [];
    });
  });

  it('a kit sale re-syncs each component, and the components do not bounce back to the same kit', async () => {
    await syncItemStock('k1', 'kit sold');
    await flush();
    const ids = lookedUp();
    expect(ids.filter((i) => i === 'c1')).toHaveLength(1);
    expect(ids.filter((i) => i === 'c2')).toHaveLength(1);
    expect(ids.filter((i) => i === 'k1')).toHaveLength(1); // exceptKitIds stops the chain
  });

  it('a component sale re-syncs each kit containing it, without cascading back down', async () => {
    await syncItemStock('c1', 'component sold');
    await flush();
    const ids = lookedUp();
    expect(ids.filter((i) => i === 'k1')).toHaveLength(1);
    expect(ids.filter((i) => i === 'c1')).toHaveLength(1);
    expect(ids).not.toContain('c2'); // the kit run is a leaf (noCascade)
  });

  it('noCascade and checkOnly never cascade', async () => {
    await syncItemStock('k1', 'leaf', { noCascade: true });
    await syncItemStock('c1', 'audit', { checkOnly: true });
    await flush();
    expect(lookedUp().sort()).toEqual(['c1', 'k1']);
    expect(mockPrisma.itemKitComponent.findMany).not.toHaveBeenCalled();
  });

  it('exceptKitIds skips the named kit', async () => {
    await syncItemStock('c1', 'component sold', { exceptKitIds: ['k1'] });
    await flush();
    expect(lookedUp()).toEqual(['c1']);
  });

  it('an ordinary item (not a kit, not a component) fires no cascade query', async () => {
    rows.i1 = row({ id: 'i1', ebayOfferId: null, ebayListingId: null });
    await syncItemStock('i1', 'sold');
    await flush();
    expect(mockPrisma.itemKitComponent.findMany).not.toHaveBeenCalled();
  });

  it('a failing cascade lookup never breaks the sync result', async () => {
    mockPrisma.itemKitComponent.findMany.mockRejectedValue(new Error('db'));
    const r = await syncItemStock('k1', 'kit sold');
    await flush();
    expect(r.inStock).toBe(3);
  });
});
