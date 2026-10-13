/**
 * (2026-10-13) Kits listable on every marketplace, extension API surface. Synthetic data only; no network, no real database.
 *  - pending-updates and price-sync-queue surface QUANTITY drift (stock changed since last synced to that listing), not just price
 *  - every entry carries stockRemaining (+ isKit, kitComponents, Includes-appended description for kits)
 *  - a SOLD (zero stock) kit, saleless or not, flows through pending-removals
 *  - kits are never hidden by a legacy DONT_LIST, and saleless kits are in scope
 *  - markItemListed / confirm endpoints record the synced quantity
 * getExtensionItems / getAutolistQueue are too wide to mock; like extensionLocalPickupOnly.test.ts they are pinned by their source
 * (comments stripped first so a comment can never satisfy a pin).
 */
import * as fs from 'fs';
import * as path from 'path';

const mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  item: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  itemKitComponent: { findMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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

import { getPendingRemovals, getPendingUpdates, getPriceSyncQueue } from '../controllers/extensionController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const req = (extra: Record<string, unknown> = {}) => ({ user: { id: 'u1' }, query: {}, params: {}, body: {}, ...extra }) as any;

// What each item.findMany call returns, by the shape of its where clause.
let mainItems: any[] = [];
let extraRows: any[] = [];
let soldItems: any[] = [];
let jobRows: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mainItems = [];
  extraRows = [];
  soldItems = [];
  jobRows = [];
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', pausedMarketplaces: [] });
  mockPrisma.item.findMany.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (w.id && w.id.in) return extraRows.filter((r) => w.id.in.includes(r.id));
    if (w.status === 'SOLD') return soldItems;
    if (w.AND) return mainItems;
    return [];
  });
  mockPrisma.marketplaceListingJob.findMany.mockImplementation(async (args: any) => (args?.where?.itemId ? jobRows : []));
  mockPrisma.itemKitComponent.findMany.mockResolvedValue([
    { kitItemId: 'kit1', quantity: 2, componentItem: { title: 'Charger' } },
    { kitItemId: 'kit1', quantity: 1, componentItem: { title: 'Cable' } },
  ]);
  mockPrisma.pendingListingRemoval.findMany.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

const kitRow = { id: 'kit1', listingType: 'KIT', stockTotal: 3, stockSold: 0, description: 'A bundle' };
const plainRow = { id: 'item1', listingType: 'FIXED', stockTotal: 5, stockSold: 1, description: 'Plain' };

describe('GET pending-updates: quantity drift (Facebook)', () => {
  const post = (itemId: string, syncedQuantity: number | null, remoteListingId: string | null = 'fb123') =>
    ({ itemId, action: 'POST', status: 'POSTED', remoteListingId, createdAt: new Date('2026-10-12T00:00:00Z'), platform: 'FACEBOOK', syncedQuantity });

  it('a component sale that only shrank a kit queues a quantity update, with the kit fields and Includes description', async () => {
    mainItems = [{ id: 'kit1', title: 'Kit', price: 20, marketplaceListedPrice: 20, stockTotal: 3, stockSold: 0 }];
    extraRows = [kitRow];
    jobRows = [post('kit1', 5)]; // Facebook last showed 5, the derived stock is now 3
    const res = mockRes();
    await getPendingUpdates(req(), res);
    const items = res.json.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'kit1', newPrice: 20, remoteListingId: 'fb123', priceDrift: false, quantityDrift: true, quantity: 3,
      stockRemaining: 3, isKit: true, kitComponents: [{ title: 'Charger', quantity: 2 }, { title: 'Cable', quantity: 1 }],
    });
    expect(items[0].description).toBe('A bundle\n\nIncludes:\n- 2 x Charger\n- 1 x Cable');
  });

  it('a multi-unit ordinary item sold elsewhere also queues, without kit fields', async () => {
    mainItems = [{ id: 'item1', title: 'Tube', price: 5, marketplaceListedPrice: 5, stockTotal: 5, stockSold: 1 }];
    extraRows = [plainRow];
    jobRows = [post('item1', 5)]; // listing shows 5, 4 remain
    const res = mockRes();
    await getPendingUpdates(req(), res);
    const items = res.json.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantityDrift: true, quantity: 4, stockRemaining: 4 });
    expect(items[0]).not.toHaveProperty('isKit');
    expect(items[0]).not.toHaveProperty('kitComponents');
  });

  it('nothing is queued when the listing already shows the current stock and price', async () => {
    mainItems = [{ id: 'kit1', title: 'Kit', price: 20, marketplaceListedPrice: 20, stockTotal: 3, stockSold: 0 }];
    jobRows = [post('kit1', 3)];
    const res = mockRes();
    await getPendingUpdates(req(), res);
    expect(res.json.mock.calls[0][0].items).toEqual([]);
  });

  it('a single-unit item with no recorded quantity never drifts; price drift still works', async () => {
    mainItems = [
      { id: 'one', title: 'One', price: 9, marketplaceListedPrice: 9, stockTotal: null, stockSold: 0 },
      { id: 'two', title: 'Two', price: 10, marketplaceListedPrice: 8, stockTotal: null, stockSold: 0 },
    ];
    extraRows = [{ id: 'two', listingType: 'FIXED', stockTotal: null, stockSold: 0, description: '' }];
    jobRows = [post('one', null), post('two', null)];
    const res = mockRes();
    await getPendingUpdates(req(), res);
    const items = res.json.mock.calls[0][0].items;
    expect(items.map((i: any) => i.id)).toEqual(['two']);
    expect(items[0]).toMatchObject({ priceDrift: true, quantityDrift: false });
  });

  it('fail-closed: an entry without a confirmed remoteListingId is never returned', async () => {
    mainItems = [{ id: 'kit1', title: 'Kit', price: 20, marketplaceListedPrice: 20, stockTotal: 3, stockSold: 0 }];
    jobRows = [post('kit1', 5, null)];
    const res = mockRes();
    await getPendingUpdates(req(), res);
    expect(res.json.mock.calls[0][0].items).toEqual([]);
  });

  it('scope includes the organizer\'s saleless kits, and a legacy DONT_LIST never hides a kit', async () => {
    await getPendingUpdates(req(), mockRes());
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where.AND)).toContain('"listingType":"KIT"');
    expect(where.AND[0].OR).toEqual(expect.arrayContaining([{ saleId: null, organizerId: 'org1', listingType: 'KIT' }]));
    expect(where.OR).toEqual(expect.arrayContaining([{ listingType: 'KIT' }]));
  });
});

describe('GET price-sync-queue: quantity drift on the extension-tier platforms', () => {
  const live = (itemId: string, platform: string, syncedQuantity: number | null, over: Record<string, unknown> = {}) =>
    ({ itemId, action: 'POST', status: 'POSTED', platform, createdAt: new Date('2026-10-12T00:00:00Z'), priceSyncedAt: null, remoteListingId: 'r1', syncedQuantity, ...over });

  it('surfaces a kit on each platform whose listing shows a stale quantity, with the stock number and kit fields', async () => {
    mainItems = [{ id: 'kit1', title: 'Kit', price: 20, priceUpdatedAt: null, stockTotal: 3, stockSold: 0 }];
    extraRows = [kitRow];
    jobRows = [live('kit1', 'POSHMARK', 5), live('kit1', 'CRAIGSLIST', 3), live('kit1', 'MERCARI', 5)];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    const q = res.json.mock.calls[0][0].queues;
    expect(q.POSHMARK).toHaveLength(1);
    expect(q.POSHMARK[0]).toMatchObject({ id: 'kit1', priceDrift: false, quantityDrift: true, quantity: 3, stockRemaining: 3, isKit: true });
    expect(q.POSHMARK[0].description).toContain('Includes:\n- 2 x Charger');
    expect(q.CRAIGSLIST).toEqual([]); // already shows 3
    expect(q.MERCARI[0]).toMatchObject({ remoteListingId: 'r1', quantityDrift: true });
  });

  it('price drift is unchanged, and a single-unit item never has quantity drift', async () => {
    mainItems = [{ id: 'one', title: 'One', price: 7, priceUpdatedAt: new Date('2026-10-13T00:00:00Z'), stockTotal: null, stockSold: 0 }];
    extraRows = [{ id: 'one', listingType: 'FIXED', stockTotal: null, stockSold: 0, description: '' }];
    jobRows = [live('one', 'GRAILED', null, { priceSyncedAt: new Date('2026-10-11T00:00:00Z') })];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    const q = res.json.mock.calls[0][0].queues;
    expect(q.GRAILED).toHaveLength(1);
    expect(q.GRAILED[0]).toMatchObject({ priceDrift: true, quantityDrift: false, quantity: 1, stockRemaining: 1 });
  });

  it('a removed listing is not queued even if the stock differs', async () => {
    mainItems = [{ id: 'kit1', title: 'Kit', price: 20, priceUpdatedAt: null, stockTotal: 3, stockSold: 0 }];
    jobRows = [live('kit1', 'POSHMARK', 5), { ...live('kit1', 'POSHMARK', 5), action: 'REMOVE', status: 'REMOVED', createdAt: new Date('2026-10-13T00:00:00Z') }];
    const res = mockRes();
    await getPriceSyncQueue(req(), res);
    expect(res.json.mock.calls[0][0].queues.POSHMARK).toEqual([]);
  });

  it('candidates are price-changed items, multi-unit items and kits, in the organizer scope with saleless kits', async () => {
    await getPriceSyncQueue(req(), mockRes());
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual(expect.arrayContaining([{ saleId: null, organizerId: 'org1', listingType: 'KIT' }]));
    expect(where.AND[1].OR).toEqual([{ priceUpdatedAt: { not: null } }, { stockTotal: { gt: 1 } }, { listingType: 'KIT' }]);
    expect(where.status).toBe('AVAILABLE');
  });
});

describe('GET pending-removals: zero stock flows to removal', () => {
  it('a kit whose derived stock hit 0 (status SOLD) with live listings is offered for removal on every platform it is live on', async () => {
    soldItems = [{ id: 'kit1', title: 'Kit' }];
    jobRows = [
      { itemId: 'kit1', action: 'POST', status: 'POSTED', lastErrorMessage: null, lastAttemptAt: null, platform: 'POSHMARK', createdAt: new Date('2026-10-10T00:00:00Z'), remoteListingId: 'p1' },
      { itemId: 'kit1', action: 'POST', status: 'POSTED', lastErrorMessage: null, lastAttemptAt: null, platform: 'CRAIGSLIST', createdAt: new Date('2026-10-10T00:00:00Z'), remoteListingId: null },
    ];
    const res = mockRes();
    await getPendingRemovals(req(), res);
    const out = res.json.mock.calls[0][0];
    const entry = out.items.find((i: any) => i.id === 'kit1');
    expect(entry).toBeDefined();
    expect(entry.platforms.sort()).toEqual(['CRAIGSLIST', 'POSHMARK']);
    expect(entry.listingRefs).toEqual({ POSHMARK: 'p1' });
  });

  it('the SOLD query is scoped to sale items plus the organizer\'s saleless kits', async () => {
    await getPendingRemovals(req(), mockRes());
    const soldCall = mockPrisma.item.findMany.mock.calls.find((c: any[]) => c[0]?.where?.status === 'SOLD');
    expect(soldCall).toBeDefined();
    expect(soldCall![0].where.OR).toEqual([
      { sale: { organizerId: 'org1', deletedAt: null } },
      { saleId: null, organizerId: 'org1', listingType: 'KIT' },
    ]);
  });
});

describe('source pins for the wide builders (comments stripped)', () => {
  const src = fs
    .readFileSync(path.join(__dirname, '../controllers/extensionController.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  const body = (name: string) => {
    const start = src.indexOf(`export const ${name} =`);
    expect(start).toBeGreaterThan(-1);
    const next = src.indexOf('\nexport const ', start + 10);
    return src.slice(start, next === -1 ? undefined : next);
  };

  it('getExtensionItems and getAutolistQueue load the extras, use the Includes description, and spread the stock fields', () => {
    for (const name of ['getExtensionItems', 'getAutolistQueue']) {
      const b = body(name);
      expect(b).toContain('loadListingExtras(items.map');
      expect(b).toContain('buildDescription(descriptionOf(it), it.saleId)');
      expect(b).toContain('buildDescriptionWithBacklink(descriptionOf(it), it.saleId)');
      expect(b).toContain('...listingExtraFields(listingExtras.get(it.id), { keepDescription: false })');
      expect(b).toContain('organizerListableScope(organizer.id)');
      expect(b).toContain("{ listingType: 'KIT' }");
    }
  });

  it('getPendingSoldChecks decorates its live items with the stock fields', () => {
    expect(body('getPendingSoldChecks')).toContain('...listingExtraFields(soldCheckExtras.get(i.id))');
  });

  it('markItemListed records the quantity shown on the new listing', () => {
    const b = body('markItemListed');
    expect(b).toContain('syncedQuantity: postedQuantity');
  });

  it('the confirm endpoints record the synced quantity', () => {
    expect(body('markItemPriceSynced')).toContain("stampSyncedQuantity(itemId, 'FACEBOOK'");
    expect(body('markItemPriceSyncedForPlatform')).toContain('syncedQuantity: stockRemainingOf(stockRow as any)');
  });
});
