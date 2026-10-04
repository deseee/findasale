/**
 * Bulk item routes (POST /api/items/bulk and POST /api/items/bulk/photos), item editor unification Wave 1 (W1-1C).
 *
 * Covers:
 *   - lastEditedAt is stamped on every organizer bulk write (price, price_adjust, category, eBay category, tags,
 *     isActive, photos);
 *   - bulk price writes set priceUpdatedAt only for items whose price really changes, and ebaySyncState PENDING
 *     only for the eBay-listed subset of those (via a second updateMany scoped to the authorized ids);
 *   - the per-item ownership check is default-deny: another organizer's items are rejected, saleless inventory
 *     items owned by the caller succeed, saleless inventory items owned by someone else (or with no owner) are
 *     denied, and a database error during the check is a 500, never an implicit allow.
 *
 * Express Router is a recording stub; the route handler is invoked directly with a fake request and response.
 * Prisma is an in-memory jest stand-in (the route loads it through both '../index' and '../lib/prisma').
 */
const mockRoutes: Array<{ method: string; path: string; handlers: any[] }> = [];
jest.mock('express', () => {
  const Router = () => {
    const r: any = {};
    for (const m of ['get', 'post', 'put', 'delete', 'patch', 'use']) {
      r[m] = (path: unknown, ...handlers: any[]) => {
        mockRoutes.push({ method: m, path: String(path), handlers });
        return r;
      };
    }
    return r;
  };
  return { __esModule: true, default: { Router }, Router };
});

jest.mock('multer', () => {
  const passthrough = () => (_req: unknown, _res: unknown, next: () => void) => next();
  const multerFn: any = () => ({ single: passthrough, array: passthrough, fields: passthrough, any: passthrough, none: passthrough });
  multerFn.memoryStorage = () => ({});
  return { __esModule: true, default: multerFn };
});

const mockPrisma: any = {
  item: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  organizer: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
};
jest.mock('../index', () => ({ __esModule: true, prisma: mockPrisma }));
jest.mock('../lib/prisma', () => ({ __esModule: true, prisma: mockPrisma }));

jest.mock('../middleware/auth', () => ({
  __esModule: true,
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalAuthenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/requireTier', () => ({
  __esModule: true,
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/rateLimiter', () => ({
  __esModule: true,
  itemEndpointLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  bulkItemsLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Modules the route file imports but these tests never exercise: every export is an auto-created jest.fn.
const mockProxyFactory = () => {
  const target: any = { __esModule: true };
  return new Proxy(target, {
    get: (obj, prop) => {
      if (typeof prop === 'symbol') return undefined;
      if (!(prop in obj)) obj[prop] = jest.fn();
      return obj[prop];
    },
  });
};
jest.mock('../controllers/itemController', () => mockProxyFactory());
jest.mock('../controllers/ebayController', () => mockProxyFactory());
jest.mock('../controllers/labelController', () => mockProxyFactory());
jest.mock('../controllers/reanalyzeController', () => mockProxyFactory());
jest.mock('../controllers/searchController', () => mockProxyFactory());
jest.mock('../controllers/valuationController', () => mockProxyFactory());
jest.mock('../services/shopifyService', () => mockProxyFactory());
jest.mock('../services/marketplace/discogsListingConnector', () => mockProxyFactory());
jest.mock('../services/marketplace/reverbConnector', () => mockProxyFactory());
jest.mock('../services/itemDeletionService', () => mockProxyFactory());
jest.mock('../services/facebookNudgeService', () => mockProxyFactory());
jest.mock('../utils/actingOrganizer', () => mockProxyFactory());
jest.mock('../middleware/accountAgeGate', () => mockProxyFactory());
jest.mock('../middleware/bidRateLimiter', () => mockProxyFactory());

import itemsRouter from '../routes/items';

void itemsRouter; // referenced so the import (and the route registration it performs) is not elided

const findHandler = (method: string, path: string) => {
  const route = mockRoutes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`route not registered: ${method} ${path}`);
  return route.handlers[route.handlers.length - 1] as (req: any, res: any) => Promise<unknown>;
};

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
};

const CALLER = 'user-1';
const makeReq = (body: unknown, userId: string = CALLER, roles: string[] = ['ORGANIZER']) => ({
  user: { id: userId, roles, role: roles[0] },
  body,
});

const organizerRow = (id: string, userId: string) => ({ id, userId, subscriptionTier: 'SIMPLE', lat: null, lng: null });

const saleItem = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'AVAILABLE',
  price: 10,
  category: 'furniture',
  tags: [] as string[],
  photoUrls: [] as string[],
  ebayOfferId: null,
  ebayListingId: null,
  saleId: 'sale-1',
  consignorId: null,
  vendorBoothId: null,
  organizerId: 'org-1',
  sale: { organizer: organizerRow('org-1', CALLER) },
  ...over,
});

const foreignSaleItem = (id: string, over: Record<string, unknown> = {}) =>
  saleItem(id, { saleId: 'sale-9', organizerId: 'org-9', sale: { organizer: organizerRow('org-9', 'user-9') }, ...over });

const inventoryItem = (id: string, organizerId: string | null, over: Record<string, unknown> = {}) =>
  saleItem(id, { saleId: null, sale: null, organizerId, ...over });

const updateManyCalls = () => mockPrisma.item.updateMany.mock.calls.map((c: any[]) => c[0]);
const updateCalls = () => mockPrisma.item.update.mock.calls.map((c: any[]) => c[0]);
const noWrites = () => {
  expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.item.update).not.toHaveBeenCalled();
  expect(mockPrisma.item.deleteMany).not.toHaveBeenCalled();
};

let bulk: (req: any, res: any) => Promise<unknown>;
let bulkPhotos: (req: any, res: any) => Promise<unknown>;

beforeAll(() => {
  bulk = findHandler('post', '/bulk');
  bulkPhotos = findHandler('post', '/bulk/photos');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.item.findMany.mockReset();
  mockPrisma.item.updateMany.mockReset().mockResolvedValue({ count: 0 });
  mockPrisma.item.update.mockReset().mockResolvedValue({});
  mockPrisma.item.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  mockPrisma.organizer.findFirst.mockReset();
  mockPrisma.organizer.findUnique.mockReset();
});

describe('POST /bulk: lastEditedAt stamping', () => {
  it('stamps lastEditedAt on a category write and does not touch price fields', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a'), saleItem('b')]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['a', 'b'], operation: 'category', value: 'Furniture' }), res);
    expect(res.statusCode).toBe(200);
    const calls = updateManyCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({ id: { in: ['a', 'b'] } });
    expect(calls[0].data).toEqual({ category: 'furniture', lastEditedAt: expect.any(Date) });
    expect(calls[0].data).not.toHaveProperty('priceUpdatedAt');
  });

  it('stamps lastEditedAt on an isActive write', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a')]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['a'], operation: 'isActive', value: false }), res);
    expect(res.statusCode).toBe(200);
    expect(updateManyCalls()[0].data).toEqual({ isActive: false, lastEditedAt: expect.any(Date) });
  });

  it('stamps lastEditedAt on a tags write', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a', { tags: ['walnut'] })]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['a'], operation: 'tags', value: { action: 'add', tags: ['oak'] } }), res);
    expect(res.statusCode).toBe(200);
    const calls = updateCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({ id: 'a' });
    expect(calls[0].data.tags).toEqual(['walnut', 'oak']);
    expect(calls[0].data.lastEditedAt).toEqual(expect.any(Date));
  });

  it('stamps lastEditedAt on a status write', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a')]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['a'], operation: 'status', value: 'RESERVED' }), res);
    expect(res.statusCode).toBe(200);
    expect(updateManyCalls()[0].data).toEqual({ status: 'RESERVED', lastEditedAt: expect.any(Date) });
  });

  it('stamps lastEditedAt on backgroundRemoved and draftStatus writes', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a')]);
    await bulk(makeReq({ itemIds: ['a'], operation: 'backgroundRemoved', value: true }), makeRes());
    await bulk(makeReq({ itemIds: ['a'], operation: 'draftStatus', value: 'PENDING_REVIEW' }), makeRes());
    const calls = updateManyCalls();
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.data.lastEditedAt).toEqual(expect.any(Date));
    }
  });

  it('a dry run writes nothing', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a')]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['a'], operation: 'price', value: 12, dryRun: true }), res);
    expect(res.statusCode).toBe(200);
    noWrites();
  });
});

describe('POST /bulk: eBay category operations', () => {
  it('writes ebayCategoryId and ebayCategoryName, trimmed and stamped, for authorized ids only', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a'), saleItem('b')]);
    const resId = makeRes();
    await bulk(makeReq({ itemIds: ['a', 'b'], operation: 'ebayCategoryId', value: ' 3858 ' }), resId);
    const resName = makeRes();
    await bulk(makeReq({ itemIds: ['a', 'b'], operation: 'ebayCategoryName', value: '  Guitar Amplifiers ' }), resName);
    expect(resId.statusCode).toBe(200);
    expect(resName.statusCode).toBe(200);
    expect(resId.body).toEqual(expect.objectContaining({ operation: 'ebayCategoryId', succeeded: ['a', 'b'] }));
    expect(resName.body).toEqual(expect.objectContaining({ operation: 'ebayCategoryName', succeeded: ['a', 'b'] }));
    const calls = updateManyCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].where).toEqual({ id: { in: ['a', 'b'] } });
    expect(calls[0].data).toEqual({ ebayCategoryId: '3858', lastEditedAt: expect.any(Date) });
    expect(calls[1].data).toEqual({ ebayCategoryName: 'Guitar Amplifiers', lastEditedAt: expect.any(Date) });
  });

  it('rejects bad eBay category values with 400 and writes nothing', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a')]);
    const cases: Array<[string, unknown]> = [
      ['ebayCategoryId', 3858],
      ['ebayCategoryId', '   '],
      ['ebayCategoryId', 'not a valid id!'],
      ['ebayCategoryId', '1'.repeat(33)],
      ['ebayCategoryId', '1'.repeat(11)], // eBay leaf category ids are 1 to 10 digits
      ['ebayCategoryId', 'A123'], // letters rejected
      ['ebayCategoryId', '12-34'], // dashes rejected
      ['ebayCategoryId', '12_34'], // underscores rejected
      ['ebayCategoryId', '-5'],
      ['ebayCategoryId', '3858.5'],
      ['ebayCategoryName', ''],
      ['ebayCategoryName', 'x'.repeat(201)],
      ['ebayCategoryName', 'bad\u0007name'],
    ];
    for (const [operation, value] of cases) {
      const res = makeRes();
      await bulk(makeReq({ itemIds: ['a'], operation, value }), res);
      expect(res.statusCode).toBe(400);
    }
    noWrites();
  });

  it('accepts a 1 to 10 digit ebayCategoryId, including leading zeros, and rejects a dry run with a bad id', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('a')]);
    for (const good of ['1', '0123', '9'.repeat(10)]) {
      mockPrisma.item.updateMany.mockClear();
      const res = makeRes();
      await bulk(makeReq({ itemIds: ['a'], operation: 'ebayCategoryId', value: good }), res);
      expect(res.statusCode).toBe(200);
      expect(updateManyCalls()[0].data.ebayCategoryId).toBe(good);
    }
    mockPrisma.item.updateMany.mockClear();
    const dry = makeRes();
    await bulk(makeReq({ itemIds: ['a'], operation: 'ebayCategoryId', value: 'abc', dryRun: true }), dry);
    expect(dry.statusCode).toBe(400);
    noWrites();
  });

  it('does not write eBay category for another organizer\'s item', async () => {
    mockPrisma.item.findMany.mockResolvedValue([foreignSaleItem('x')]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['x'], operation: 'ebayCategoryId', value: '3858' }), res);
    expect(res.statusCode).toBe(404);
    noWrites();
  });
});

describe('POST /bulk: price writes (priceUpdatedAt and eBay PENDING)', () => {
  it('price: priceUpdatedAt for changed items only, PENDING for the changed eBay-listed subset only', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      saleItem('plain', { price: 10 }), // changes, not on eBay
      saleItem('listing', { price: 10, ebayListingId: 'L1' }), // changes, eBay listing
      saleItem('offer', { price: 10, ebayOfferId: 'O1' }), // changes, eBay offer
      saleItem('same', { price: 25.5, ebayListingId: 'L2' }), // already 25.5: not a price change
    ]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['plain', 'listing', 'offer', 'same'], operation: 'price', value: 25.5 }), res);
    expect(res.statusCode).toBe(200);

    const calls = updateManyCalls();
    const changedWrite = calls.find((c: any) => c.data.priceUpdatedAt);
    expect(changedWrite).toBeDefined();
    expect(changedWrite.where).toEqual({ id: { in: ['plain', 'listing', 'offer'] } });
    expect(changedWrite.data).toEqual({
      price: 25.5,
      priceUpdatedAt: expect.any(Date),
      lastEditedAt: expect.any(Date),
    });

    const unchangedWrite = calls.find((c: any) => c.data.price === 25.5 && !c.data.priceUpdatedAt);
    expect(unchangedWrite).toBeDefined();
    expect(unchangedWrite.where).toEqual({ id: { in: ['same'] } });
    expect(unchangedWrite.data.lastEditedAt).toEqual(expect.any(Date));

    const pendingWrites = calls.filter((c: any) => c.data.ebaySyncState === 'PENDING');
    expect(pendingWrites).toHaveLength(1);
    expect(pendingWrites[0].where).toEqual({ id: { in: ['listing', 'offer'] } });
    expect(pendingWrites[0].data).toEqual({ ebaySyncState: 'PENDING', ebaySyncAttempts: 0, ebaySyncFailureReason: null });
  });

  it('price: no PENDING write when no changed item is on eBay', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('plain', { price: 10 })]);
    await bulk(makeReq({ itemIds: ['plain'], operation: 'price', value: 12 }), makeRes());
    const calls = updateManyCalls();
    expect(calls.filter((c: any) => c.data.ebaySyncState)).toHaveLength(0);
    expect(calls[0].data.priceUpdatedAt).toEqual(expect.any(Date));
    expect(calls[0].data.lastEditedAt).toEqual(expect.any(Date));
  });

  it('price_adjust: stamps priceUpdatedAt and lastEditedAt, PENDING only for the eBay-listed item', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      saleItem('plain', { price: 10 }),
      saleItem('listing', { price: 20, ebayListingId: 'L1' }),
    ]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['plain', 'listing'], operation: 'price_adjust', value: 10 }), res);
    expect(res.statusCode).toBe(200);

    const updates = updateCalls();
    expect(updates).toHaveLength(2);
    const plain = updates.find((u: any) => u.where.id === 'plain');
    const listing = updates.find((u: any) => u.where.id === 'listing');
    expect(plain.data).toEqual({ price: 11, priceUpdatedAt: expect.any(Date), lastEditedAt: expect.any(Date) });
    expect(listing.data).toEqual({ price: 22, priceUpdatedAt: expect.any(Date), lastEditedAt: expect.any(Date) });

    const pendingWrites = updateManyCalls();
    expect(pendingWrites).toHaveLength(1);
    expect(pendingWrites[0].where).toEqual({ id: { in: ['listing'] } });
    expect(pendingWrites[0].data).toEqual({ ebaySyncState: 'PENDING', ebaySyncAttempts: 0, ebaySyncFailureReason: null });
  });

  it('price_adjust: an unchanged result (price 0) does not stamp priceUpdatedAt or set PENDING', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('zero', { price: 0 })]);
    await bulk(makeReq({ itemIds: ['zero'], operation: 'price_adjust', value: 10 }), makeRes());
    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(updates[0].data).not.toHaveProperty('priceUpdatedAt');
    expect(updates[0].data.lastEditedAt).toEqual(expect.any(Date));
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /bulk: eBay minimum price floor ($0.99)', () => {
  const FLOOR_REASON = 'eBay minimum price is $0.99';

  it('price: eBay-listed items below 0.99 are skipped (not written), non-eBay items still written', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      saleItem('plain', { price: 10 }),
      saleItem('listing', { price: 10, ebayListingId: 'L1' }),
      saleItem('offer', { price: 10, ebayOfferId: 'O1' }),
    ]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['plain', 'listing', 'offer'], operation: 'price', value: 0.5 }), res);
    expect(res.statusCode).toBe(207);
    expect(res.body.succeeded).toEqual(['plain']);
    expect(res.body.skipped).toEqual([
      { itemId: 'listing', reason: FLOOR_REASON },
      { itemId: 'offer', reason: FLOOR_REASON },
    ]);
    const calls = updateManyCalls();
    const priceWrites = calls.filter((c: any) => c.data.price !== undefined);
    expect(priceWrites).toHaveLength(1);
    expect(priceWrites[0].where).toEqual({ id: { in: ['plain'] } });
    // no eBay item was written or marked PENDING
    expect(calls.filter((c: any) => c.data.ebaySyncState)).toHaveLength(0);
  });

  it('price: exactly 0.99 is allowed for an eBay-listed item', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('listing', { price: 10, ebayListingId: 'L1' })]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['listing'], operation: 'price', value: 0.99 }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBeUndefined();
    expect(res.body.succeeded).toEqual(['listing']);
    expect(updateManyCalls()[0].data.price).toBe(0.99);
  });

  it('price: price 0 is skipped for eBay-listed items but allowed for non-eBay items', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      saleItem('plain', { price: 10 }),
      saleItem('listing', { price: 10, ebayListingId: 'L1' }),
    ]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['plain', 'listing'], operation: 'price', value: 0 }), res);
    expect(res.body.succeeded).toEqual(['plain']);
    expect(res.body.skipped).toEqual([{ itemId: 'listing', reason: FLOOR_REASON }]);
  });

  it('price: when every item is eBay-listed and below the floor nothing is written', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('listing', { price: 10, ebayListingId: 'L1' })]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['listing'], operation: 'price', value: 0.5 }), res);
    expect(res.body.succeeded).toEqual([]);
    expect(res.body.skipped).toEqual([{ itemId: 'listing', reason: FLOOR_REASON }]);
    noWrites();
  });

  it('price dry run: reports the eBay-floor skips and leaves them out of affectedIds, and writes nothing', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      saleItem('plain', { price: 10 }),
      saleItem('listing', { price: 10, ebayListingId: 'L1' }),
    ]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['plain', 'listing'], operation: 'price', value: 0.5, dryRun: true }), res);
    expect(res.body.affectedIds).toEqual(['plain']);
    expect(res.body.count).toBe(1);
    expect(res.body.newValues).toEqual({ plain: 0.5 });
    expect(res.body.skipped).toEqual([{ itemId: 'listing', reason: FLOOR_REASON }]);
    noWrites();
  });

  it('price_adjust: an eBay-listed item pushed below 0.99 is skipped, the others are adjusted', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      saleItem('plain', { price: 1 }), // 1 -> 0.5, not on eBay: allowed
      saleItem('listing', { price: 1, ebayListingId: 'L1' }), // 1 -> 0.5: below floor
      saleItem('offer', { price: 100, ebayOfferId: 'O1' }), // 100 -> 50: fine
    ]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['plain', 'listing', 'offer'], operation: 'price_adjust', value: -50 }), res);
    expect(res.statusCode).toBe(207);
    expect(res.body.succeeded).toEqual(['plain', 'offer']);
    expect(res.body.skipped).toEqual([{ itemId: 'listing', reason: FLOOR_REASON }]);
    const updates = updateCalls();
    expect(updates.map((u: any) => u.where.id).sort()).toEqual(['offer', 'plain']);
    expect(updates.find((u: any) => u.where.id === 'plain').data.price).toBe(0.5);
    const pending = updateManyCalls().filter((c: any) => c.data.ebaySyncState === 'PENDING');
    expect(pending).toHaveLength(1);
    expect(pending[0].where).toEqual({ id: { in: ['offer'] } });
  });

  it('price_adjust: an eBay-listed item landing exactly on 0.99 is allowed', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('listing', { price: 1.98, ebayListingId: 'L1' })]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['listing'], operation: 'price_adjust', value: -50 }), res);
    expect(res.statusCode).toBe(200);
    expect(updateCalls()[0].data.price).toBe(0.99);
  });

  it('price_adjust dry run: reports the eBay-floor skips, excludes them from affectedIds and newValues, writes nothing', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      saleItem('plain', { price: 1 }),
      saleItem('listing', { price: 1, ebayOfferId: 'O1' }),
    ]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['plain', 'listing'], operation: 'price_adjust', value: -50, dryRun: true }), res);
    expect(res.body.affectedIds).toEqual(['plain']);
    expect(res.body.newValues).toEqual({ plain: 0.5 });
    expect(res.body.oldValues).toEqual({ plain: 1 });
    expect(res.body.skipped).toEqual([{ itemId: 'listing', reason: FLOOR_REASON }]);
    noWrites();
  });

  it('price_adjust: a non-eBay item is unaffected by the floor', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('plain', { price: 1 })]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['plain'], operation: 'price_adjust', value: -90 }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBeUndefined();
    expect(updateCalls()[0].data.price).toBe(0.1);
  });
});

describe('POST /bulk: ownership is default-deny', () => {
  it('rejects another organizer\'s item with 404 and writes nothing', async () => {
    mockPrisma.item.findMany.mockResolvedValue([foreignSaleItem('x')]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['x'], operation: 'price', value: 5 }), res);
    expect(res.statusCode).toBe(404);
    noWrites();
  });

  it('rejects the whole request when one of several items belongs to someone else', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('mine'), foreignSaleItem('theirs')]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['mine', 'theirs'], operation: 'category', value: 'furniture' }), res);
    expect(res.statusCode).toBe(404);
    noWrites();
  });

  it('a non-organizer account is refused before any lookup', async () => {
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['a'], operation: 'price', value: 5 }, CALLER, ['SHOPPER']), res);
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
    noWrites();
  });

  it('saleless inventory item owned by the caller succeeds (looked up by organizerId AND userId)', async () => {
    mockPrisma.item.findMany.mockResolvedValue([inventoryItem('inv', 'org-1')]);
    mockPrisma.organizer.findFirst.mockResolvedValue(organizerRow('org-1', CALLER));
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['inv'], operation: 'category', value: 'decor' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organizer.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.organizer.findFirst.mock.calls[0][0].where).toEqual({ id: 'org-1', userId: CALLER });
    const calls = updateManyCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({ id: { in: ['inv'] } });
    expect(calls[0].data).toEqual({ category: 'decor', lastEditedAt: expect.any(Date) });
  });

  it('saleless inventory item owned by someone else is denied with 404 and writes nothing', async () => {
    mockPrisma.item.findMany.mockResolvedValue([inventoryItem('inv', 'org-9')]);
    mockPrisma.organizer.findFirst.mockResolvedValue(null); // no organizer with id org-9 AND userId = caller
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['inv'], operation: 'category', value: 'decor' }), res);
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.organizer.findFirst.mock.calls[0][0].where).toEqual({ id: 'org-9', userId: CALLER });
    noWrites();
  });

  it('saleless item with no organizerId is denied', async () => {
    mockPrisma.item.findMany.mockResolvedValue([inventoryItem('orphan', null)]);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['orphan'], operation: 'category', value: 'decor' }), res);
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.organizer.findFirst).not.toHaveBeenCalled();
    noWrites();
  });

  it('a mixed request (own sale item plus a denied inventory item) writes nothing', async () => {
    mockPrisma.item.findMany.mockResolvedValue([saleItem('mine'), inventoryItem('inv', 'org-9')]);
    mockPrisma.organizer.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['mine', 'inv'], operation: 'price', value: 9 }), res);
    expect(res.statusCode).toBe(404);
    noWrites();
  });

  it('looks an inventory owner up once per distinct organizerId', async () => {
    mockPrisma.item.findMany.mockResolvedValue([inventoryItem('i1', 'org-1'), inventoryItem('i2', 'org-1'), inventoryItem('i3', 'org-1')]);
    mockPrisma.organizer.findFirst.mockResolvedValue(organizerRow('org-1', CALLER));
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['i1', 'i2', 'i3'], operation: 'isActive', value: true }), res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organizer.findFirst).toHaveBeenCalledTimes(1);
    expect(updateManyCalls()[0].where).toEqual({ id: { in: ['i1', 'i2', 'i3'] } });
  });

  it('a database error during the ownership check is a 500 and never an implicit allow', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPrisma.item.findMany.mockResolvedValue([inventoryItem('inv', 'org-1')]);
    mockPrisma.organizer.findFirst.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['inv'], operation: 'category', value: 'decor' }), res);
    expect(res.statusCode).toBe(500);
    noWrites();
    errSpy.mockRestore();
  });

  it('saleless inventory price write carries the stamps and PENDING for an eBay-listed inventory item', async () => {
    mockPrisma.item.findMany.mockResolvedValue([inventoryItem('inv', 'org-1', { price: 10, ebayListingId: 'L9' })]);
    mockPrisma.organizer.findFirst.mockResolvedValue(organizerRow('org-1', CALLER));
    const res = makeRes();
    await bulk(makeReq({ itemIds: ['inv'], operation: 'price', value: 15 }), res);
    expect(res.statusCode).toBe(200);
    const calls = updateManyCalls();
    expect(calls[0].data).toEqual({ price: 15, priceUpdatedAt: expect.any(Date), lastEditedAt: expect.any(Date) });
    expect(calls[1].where).toEqual({ id: { in: ['inv'] } });
    expect(calls[1].data.ebaySyncState).toBe('PENDING');
  });
});

describe('POST /bulk/photos', () => {
  it('stamps lastEditedAt when photos are added', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ ...saleItem('a'), photoUrls: ['p1'] }]);
    const res = makeRes();
    await bulkPhotos(makeReq({ itemIds: ['a'], operation: 'add', photoUrls: ['p2'] }), res);
    expect(res.statusCode).toBe(200);
    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toEqual({ photoUrls: ['p1', 'p2'], lastEditedAt: expect.any(Date) });
  });

  it('stamps lastEditedAt when photos are removed', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ ...saleItem('a'), photoUrls: ['p1', 'p2'] }]);
    const res = makeRes();
    await bulkPhotos(makeReq({ itemIds: ['a'], operation: 'remove', photoUrls: ['p1'] }), res);
    expect(res.statusCode).toBe(200);
    expect(updateCalls()[0].data).toEqual({ photoUrls: ['p2'], lastEditedAt: expect.any(Date) });
  });

  it('rejects another organizer\'s item with 404 and writes nothing', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ ...foreignSaleItem('x'), photoUrls: [] }]);
    const res = makeRes();
    await bulkPhotos(makeReq({ itemIds: ['x'], operation: 'add', photoUrls: ['p'] }), res);
    expect(res.statusCode).toBe(404);
    noWrites();
  });

  it('saleless inventory item owned by the caller succeeds, owned by someone else is denied', async () => {
    mockPrisma.item.findMany.mockResolvedValue([{ ...inventoryItem('inv', 'org-1'), photoUrls: [] }]);
    mockPrisma.organizer.findFirst.mockResolvedValue(organizerRow('org-1', CALLER));
    const ok = makeRes();
    await bulkPhotos(makeReq({ itemIds: ['inv'], operation: 'add', photoUrls: ['p'] }), ok);
    expect(ok.statusCode).toBe(200);
    expect(updateCalls()).toHaveLength(1);

    jest.clearAllMocks();
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.item.findMany.mockResolvedValue([{ ...inventoryItem('inv2', 'org-9'), photoUrls: [] }]);
    mockPrisma.organizer.findFirst.mockResolvedValue(null);
    const denied = makeRes();
    await bulkPhotos(makeReq({ itemIds: ['inv2'], operation: 'add', photoUrls: ['p'] }), denied);
    expect(denied.statusCode).toBe(404);
    noWrites();
  });
});
