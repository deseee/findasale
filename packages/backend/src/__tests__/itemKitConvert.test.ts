/**
 * Kits: POST /api/kits/convert/:itemId (turn an ordinary item into a kit in place). No network, no real database.
 */
const mockTx: Record<string, any> = {};
// 2026-10-23: createKit reads the account's verify-to-publish state (lib/publishGate.ts userCanPublish).
const mockUserFindUnique = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
}));

import * as fs from 'fs';
import * as path from 'path';
import { KitError, convertIneligibleReason, convertItemToKit, createKit, fixLegacyKitDontList } from '../services/itemKitService';

const target = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  organizerId: 'o1',
  deletedAt: null,
  listingType: 'FIXED',
  status: 'AVAILABLE',
  stockSold: 0,
  isKitComponent: false,
  consignorId: null,
  vendorBoothId: null,
  bulkLot: null,
  ebayListingId: null,
  ebayOfferId: null,
  discogsListingId: null,
  reverbListingId: null,
  ...over,
});
const comp = (id: string, left = 1) => ({
  id,
  title: id,
  price: 1,
  photoUrls: [],
  category: null,
  condition: null,
  organizerId: 'o1',
  status: 'AVAILABLE',
  listingType: 'FIXED',
  deletedAt: null,
  consignorId: null,
  vendorBoothId: null,
  vendorBooth: null,
  stockTotal: left,
  stockSold: 0,
  bulkLot: null,
});
const parts = [{ itemId: 'a', quantity: 1 }, { itemId: 'b', quantity: 1 }];

function setup(opts: { item?: unknown; asComponent?: number; jobs?: number; shopify?: number; etsy?: number; comps?: unknown[] } = {}) {
  mockTx.item = {
    findUnique: jest.fn().mockResolvedValue(opts.item === undefined ? target() : opts.item),
    findMany: jest.fn().mockResolvedValue(opts.comps ?? [comp('a'), comp('b')]),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  };
  mockTx.organizer = { findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }) };
  mockTx.itemKitComponent = { count: jest.fn().mockResolvedValue(opts.asComponent ?? 0), createMany: jest.fn().mockResolvedValue({}) };
  mockTx.marketplaceListingJob = { count: jest.fn().mockResolvedValue(opts.jobs ?? 0) };
  mockTx.shopifyListing = { count: jest.fn().mockResolvedValue(opts.shopify ?? 0) };
  mockTx.etsyListing = { count: jest.fn().mockResolvedValue(opts.etsy ?? 0) };
}

describe('convertIneligibleReason', () => {
  it('accepts a plain item and rejects wrong owner, kit, auction, component, sold', () => {
    const t = target();
    expect(convertIneligibleReason(t, 'o1')).toBeNull();
    expect(convertIneligibleReason(t, 'other')?.code).toBe('ITEM_NOT_FOUND');
    expect(convertIneligibleReason(target({ listingType: 'KIT' }), 'o1')?.code).toBe('KIT_ALREADY_KIT');
    expect(convertIneligibleReason(target({ listingType: 'AUCTION' }), 'o1')?.code).toBe('KIT_CONVERT_TYPE');
    expect(convertIneligibleReason(target({ isKitComponent: true }), 'o1')?.code).toBe('KIT_CONVERT_IS_COMPONENT');
    expect(convertIneligibleReason(target({ status: 'SOLD' }), 'o1')?.code).toBe('KIT_CONVERT_STATUS');
    expect(convertIneligibleReason(target({ status: 'RESERVED' }), 'o1')?.code).toBe('KIT_CONVERT_STATUS');
    expect(convertIneligibleReason(target({ stockSold: 1 }), 'o1')?.code).toBe('KIT_CONVERT_HAS_SALES');
  });
});

describe('convertItemToKit', () => {
  it('converts in place: recipe rows, KIT type, derived stock, flags, and leaves title/price/photos alone', async () => {
    setup();
    // toView re-reads the kit; return a minimal row for it
    mockTx.item.findUnique
      .mockResolvedValueOnce(target())
      .mockResolvedValueOnce({
        id: 'k1', title: 'T', description: 'D', price: 4.99, saleId: 's1', status: 'AVAILABLE', stockSold: 0, stockTotal: 1,
        kitComponents: [
          { quantity: 1, componentItem: { id: 'a', title: 'a', price: 1, photoUrls: [], status: 'AVAILABLE', stockTotal: 1, stockSold: 0, deletedAt: null } },
        ],
      });
    const view = await convertItemToKit('o1', 'k1', parts);
    expect(mockTx.itemKitComponent.createMany).toHaveBeenCalledWith({
      data: [{ kitItemId: 'k1', componentItemId: 'a', quantity: 1 }, { kitItemId: 'k1', componentItemId: 'b', quantity: 1 }],
    });
    const upd = mockTx.item.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'k1' });
    expect(upd.data).toMatchObject({ listingType: 'KIT', stockTotal: 1, stockSold: 0, isKitComponent: false, excludeFromMarkdown: true });
    // Kits are listable on every marketplace now: no DONT_LIST stamp.
    expect(upd.data).not.toHaveProperty('ebayShippingOverride');
    expect(upd.data.lastEditedAt).toBeInstanceOf(Date);
    for (const k of ['title', 'description', 'price', 'photoUrls', 'originalPrice']) expect(upd.data).not.toHaveProperty(k);
    expect(mockTx.item.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } }, data: { isKitComponent: true } });
    expect(view.id).toBe('k1');
  });

  it('derives stock from the smallest component (3 and 5 left makes 3)', async () => {
    setup({ comps: [comp('a', 3), comp('b', 5)] });
    mockTx.item.findUnique.mockResolvedValueOnce(target()).mockResolvedValueOnce({
      id: 'k1', title: 'T', description: null, price: 1, saleId: null, status: 'AVAILABLE', stockSold: 0, stockTotal: 3, kitComponents: [],
    });
    await convertItemToKit('o1', 'k1', parts);
    expect(mockTx.item.update.mock.calls[0][0].data.stockTotal).toBe(3);
  });

  const refuses = async (code: string, status: number, opts: Parameters<typeof setup>[0], components: unknown = parts) => {
    setup(opts);
    await expect(convertItemToKit('o1', 'k1', components)).rejects.toMatchObject({ code, status });
    expect(mockTx.item.update).not.toHaveBeenCalled();
    expect(mockTx.itemKitComponent.createMany).not.toHaveBeenCalled();
  };

  it('refuses a sold item', () => refuses('KIT_CONVERT_STATUS', 409, { item: target({ status: 'SOLD' }) }));
  it('refuses an item with sales', () => refuses('KIT_CONVERT_HAS_SALES', 409, { item: target({ stockSold: 1 }) }));
  it('refuses an item that is a component of another kit', () => refuses('KIT_CONVERT_IS_COMPONENT', 409, { asComponent: 1 }));
  it('refuses an item that is live on eBay', () => refuses('KIT_CONVERT_HAS_LISTINGS', 409, { item: target({ ebayListingId: '123' }) }));
  it('explains the listings refusal: take them down first, the kit can then list anywhere', async () => {
    setup({ item: target({ ebayListingId: '123' }) });
    const err: any = await convertItemToKit('o1', 'k1', parts).catch((e) => e);
    expect(err).toBeInstanceOf(KitError);
    expect(err.code).toBe('KIT_CONVERT_HAS_LISTINGS');
    expect(err.message).toMatch(/already listed on a marketplace/i);
    expect(err.message).toMatch(/Take those listings down first/);
    expect(err.message).toMatch(/any marketplace/);
    expect(err.message).not.toMatch(/never|cannot be listed|not listed/i);
  });
  it('refuses an item with a marketplace job or Shopify or Etsy listing', async () => {
    await refuses('KIT_CONVERT_HAS_LISTINGS', 409, { jobs: 1 });
    await refuses('KIT_CONVERT_HAS_LISTINGS', 409, { shopify: 1 });
    await refuses('KIT_CONVERT_HAS_LISTINGS', 409, { etsy: 1 });
  });
  it('refuses zero stock', () => refuses('KIT_NO_STOCK', 409, { comps: [comp('a', 1), comp('b', 0)] }));
  it('treats another organizer or a missing item as 404', async () => {
    await refuses('ITEM_NOT_FOUND', 404, { item: target({ organizerId: 'other' }) });
    await refuses('ITEM_NOT_FOUND', 404, { item: null });
  });
  it('refuses the item as its own component and empty components', async () => {
    await refuses('KIT_COMPONENT_SELF', 400, {}, [{ itemId: 'k1', quantity: 1 }]);
    setup();
    await expect(convertItemToKit('o1', 'k1', [])).rejects.toBeInstanceOf(KitError);
  });
});

describe('createKit', () => {
  it('creates a kit with no DONT_LIST stamp so it can be listed on every marketplace', async () => {
    setup();
    mockTx.sale = { findUnique: jest.fn() };
    mockTx.item.create = jest.fn().mockResolvedValue({ id: 'k9' });
    mockTx.item.findUnique.mockResolvedValue({
      id: 'k9', title: 'T', description: null, price: 5, saleId: null, status: 'AVAILABLE', stockSold: 0, stockTotal: 1, kitComponents: [],
    });
    await createKit('o1', { title: 'Kit', price: 5, components: parts });
    const data = mockTx.item.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ listingType: 'KIT', stockTotal: 1, excludeFromMarkdown: true });
    expect(data).not.toHaveProperty('ebayShippingOverride');
  });
});

describe('createKit publish state (2026-10-23, verify to publish)', () => {
  const run = async (userId?: string) => {
    setup();
    mockTx.sale = { findUnique: jest.fn() };
    mockTx.item.create = jest.fn().mockResolvedValue({ id: 'k9' });
    mockTx.item.findUnique.mockResolvedValue({
      id: 'k9', title: 'T', description: null, price: 5, saleId: null, status: 'AVAILABLE', stockSold: 0, stockTotal: 1, kitComponents: [],
    });
    await createKit('o1', { title: 'Kit', price: 5, components: parts }, userId);
    return mockTx.item.create.mock.calls[0][0].data.draftStatus;
  };
  beforeEach(() => mockUserFindUnique.mockReset());
  it('a verified account gets a PUBLISHED kit', async () => {
    mockUserFindUnique.mockResolvedValue({ emailVerified: true, role: 'ORGANIZER', roles: ['ORGANIZER'] });
    expect(await run('u1')).toBe('PUBLISHED');
    expect(mockUserFindUnique.mock.calls[0][0].where).toEqual({ id: 'u1' });
  });
  it('an unverified account gets a DRAFT kit (kept out of the marketplace queues)', async () => {
    mockUserFindUnique.mockResolvedValue({ emailVerified: false, role: 'ORGANIZER', roles: ['ORGANIZER'] });
    expect(await run('u1')).toBe('DRAFT');
  });
  it('an unverified admin may publish', async () => {
    mockUserFindUnique.mockResolvedValue({ emailVerified: false, role: 'ADMIN', roles: ['ADMIN'] });
    expect(await run('u1')).toBe('PUBLISHED');
  });
  it('no account given: DRAFT, nothing looked up (fail closed)', async () => {
    expect(await run(undefined)).toBe('DRAFT');
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
  it('the controller passes the signed-in account to createKit', () => {
    const src = fs.readFileSync(path.join(__dirname, '../controllers/itemKitController.ts'), 'utf-8');
    expect(src).toContain('createKit(organizerId, req.body, req.user?.id)');
  });
});

describe('fixLegacyKitDontList (one-time, idempotent)', () => {
  const setupFix = (claimedCount: number, fixed = 3) => {
    mockTx.processedWebhookEvent = { createMany: jest.fn().mockResolvedValue({ count: claimedCount }) };
    mockTx.item = { updateMany: jest.fn().mockResolvedValue({ count: fixed }) };
  };
  it('first run claims the marker and clears DONT_LIST on kits only', async () => {
    setupFix(1, 3);
    await expect(fixLegacyKitDontList()).resolves.toEqual({ ran: true, fixed: 3 });
    const claim = mockTx.processedWebhookEvent.createMany.mock.calls[0][0];
    expect(claim.skipDuplicates).toBe(true);
    expect(claim.data[0].eventId).toBe('one-time:kit-dont-list-fix:v1');
    expect(mockTx.item.updateMany).toHaveBeenCalledWith({
      where: { listingType: 'KIT', ebayShippingOverride: 'DONT_LIST' },
      data: { ebayShippingOverride: null },
    });
  });
  it('second run finds the marker and touches nothing', async () => {
    setupFix(0);
    await expect(fixLegacyKitDontList()).resolves.toEqual({ ran: false, fixed: 0 });
    expect(mockTx.item.updateMany).not.toHaveBeenCalled();
  });
});

describe('route', () => {
  it('registers /convert/:itemId as a POST ahead of the kit id routes', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/itemKits.ts'), 'utf-8');
    const convert = src.indexOf("router.post('/convert/:itemId'");
    expect(convert).toBeGreaterThan(-1);
    expect(src).toContain('kitWriteLimiter, itemKitHandlers.convert');
    expect(convert).toBeLessThan(src.indexOf("'/:kitId'"));
  });
});
