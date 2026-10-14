/**
 * 2026-10-13 public gates on the anonymous search surfaces:
 *  - GET /api/search, GET /api/search/categories/:category, POST /api/search/visual: item lists AND counts
 *    exclude items still inside an early-access window (evaluated against sample rows with the real where),
 *    and no sale select carries a street address, exact coordinates or entrance pin.
 *  - GET /api/search/random: SQL carries the embargo gates, and the radius filter runs on coarse coordinates.
 *  - itemSearchService (GET /api/items/search): every raw query carries the embargo gates, facets/categories too.
 * Express Router is a recording stub; handlers are invoked directly. Prisma is a jest stand-in.
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

const mockPrisma: any = {
  item: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), aggregate: jest.fn() },
  sale: { findMany: jest.fn() },
  organizer: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ __esModule: true, prisma: mockPrisma }));
jest.mock('../index', () => ({ __esModule: true, prisma: mockPrisma }));
jest.mock('../services/cloudAIService', () => ({
  __esModule: true,
  getVisionLabels: jest.fn().mockResolvedValue({ detectedText: [], objectLabels: ['lamp'] }),
}));
jest.mock('../controllers/uploadController', () => ({ __esModule: true, upload: { single: () => (_q: unknown, _r: unknown, n: () => void) => n() } }));
jest.mock('../controllers/searchNotificationController', () => ({ __esModule: true, notifyOnSearch: jest.fn() }));
jest.mock('../services/unmetDemandService', () => ({ __esModule: true, captureUnmetDemand: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/rateLimiter', () => ({
  __esModule: true,
  searchLimiter: (_q: unknown, _r: unknown, n: () => void) => n(),
}));

import searchRouter from '../routes/search';
import { searchItems, getItemCategories } from '../services/itemSearchService';
import { matchesWhere } from './helpers/prismaWhereMatcher';

void searchRouter;

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

const handler = (method: string, path: string) => {
  const route = mockRoutes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`${method.toUpperCase()} ${path} not registered`);
  return route.handlers[route.handlers.length - 1] as (req: any, res: any) => Promise<unknown>;
};

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3600000);
// Public, AVAILABLE fields: since 2026-10-13 status / PUBLIC_ITEM_FILTER are AND-ed (not spread) into the where.
const row = (id: string, over: Record<string, any> = {}) => ({
  id,
  isActive: true,
  status: 'AVAILABLE',
  draftStatus: 'PUBLISHED',
  listingType: 'FIXED',
  rarity: 'COMMON',
  createdAt: hoursAgo(48),
  earlyAccessUntil: null,
  isLegendary: false,
  legendaryVisibleAt: null,
  ...over,
});
const sampleRows = [
  row('visible'),
  row('embargoed', { earlyAccessUntil: new Date(NOW + 3600000) }),
  row('freshRare', { rarity: 'RARE', createdAt: hoursAgo(1) }),
  row('freshLegendary', { rarity: 'LEGENDARY', createdAt: hoursAgo(3) }),
  row('legendaryNotYet', { isLegendary: true, legendaryVisibleAt: new Date(NOW + 3600000) }),
  row('oldRare', { rarity: 'RARE', createdAt: hoursAgo(10) }),
];
/** Applies only the AND gates of a where (relation filters / insensitive search are not evaluated here). */
const visibleIds = (where: any) => sampleRows.filter((r) => matchesWhere(r, { AND: where.AND })).map((r) => r.id).sort();

const LOCATION_KEYS = ['address', 'lat', 'lng', 'entranceLat', 'entranceLng', 'entranceNote'];
const expectNoLocation = (select: any) => {
  for (const k of LOCATION_KEYS) expect(select[k]).toBeUndefined();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.item.findMany.mockResolvedValue([]);
  mockPrisma.item.count.mockResolvedValue(0);
  mockPrisma.item.groupBy.mockResolvedValue([]);
  mockPrisma.item.aggregate.mockResolvedValue({ _min: { price: null }, _max: { price: null } });
  mockPrisma.sale.findMany.mockResolvedValue([]);
  mockPrisma.organizer.findMany.mockResolvedValue([]);
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.$queryRawUnsafe.mockResolvedValue([{ count: 0 }]);
});

describe('GET /api/search (anonymous)', () => {
  it('item list excludes embargoed items and the sale selects carry no street-level location', async () => {
    const res = makeRes();
    await handler('get', '/')({ query: { q: 'chair' } }, res);
    expect(res.statusCode).toBe(200);
    const itemArgs = mockPrisma.item.findMany.mock.calls[0][0];
    expect(visibleIds(itemArgs.where)).toEqual(['oldRare', 'visible']);
    expectNoLocation(itemArgs.select.sale.select);
    expectNoLocation(mockPrisma.sale.findMany.mock.calls[0][0].select);
  });

  it('category browse excludes embargoed items from both the list and the total', async () => {
    const res = makeRes();
    await handler('get', '/categories/:category')({ params: { category: 'Furniture' }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    const listWhere = mockPrisma.item.findMany.mock.calls[0][0].where;
    const countWhere = mockPrisma.item.count.mock.calls[0][0].where;
    expect(visibleIds(listWhere)).toEqual(['oldRare', 'visible']);
    expect(visibleIds(countWhere)).toEqual(['oldRare', 'visible']);
    expectNoLocation(mockPrisma.item.findMany.mock.calls[0][0].select.sale.select);
  });

  it('visual search excludes embargoed items', async () => {
    const res = makeRes();
    await handler('post', '/visual')({ file: { buffer: Buffer.from('x') } }, res);
    expect(res.statusCode).toBe(200);
    const args = mockPrisma.item.findMany.mock.calls[0][0];
    expect(visibleIds(args.where)).toEqual(['oldRare', 'visible']);
    expectNoLocation(args.select.sale.select);
  });

  it('random search SQL gates embargoed items and filters radius on coarse coordinates', async () => {
    const res = makeRes();
    await handler('get', '/random')({ query: { lat: '42.9634', lng: '-85.6681', radiusMiles: '5' } }, res);
    expect(res.statusCode).toBe(200);
    const sql: string = mockPrisma.$queryRaw.mock.calls[0][0].sql;
    expect(sql).toContain('"earlyAccessUntil" IS NULL OR i."earlyAccessUntil" <= NOW()');
    expect(sql).toContain("i.rarity = 'LEGENDARY'");
    expect(sql).toContain("i.rarity = 'RARE'");
    expect(sql).toContain('"legendaryVisibleAt" > NOW()');
    expect(sql).toContain('ROUND(s.lat::numeric, 2)');
    expect(sql).toContain('ROUND(s.lng::numeric, 2)');
    expect(sql).not.toMatch(/radians\(s\.lat\)/);
    // Response shape never includes a street address
    expect(sql).not.toMatch(/s\.address/);
  });
});

describe('itemSearchService (GET /api/items/search)', () => {
  const embargoBits = [
    '"earlyAccessUntil" IS NULL OR i."earlyAccessUntil" <= NOW()',
    "i.rarity = 'LEGENDARY'",
    "i.rarity = 'RARE'",
    '"legendaryVisibleAt" > NOW()',
  ];

  it.each([
    ['full-text search', { q: 'lamp' }],
    ['filter-only listing', {}],
  ])('%s: the list query and the count query both carry the embargo gates', async (_label, query) => {
    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('COUNT(*)') ? [{ count: 0 }] : [])
    );
    await searchItems(query as any);
    const sqls = mockPrisma.$queryRawUnsafe.mock.calls.map((c: any[]) => c[0] as string);
    expect(sqls.length).toBeGreaterThanOrEqual(2);
    for (const sql of sqls) for (const bit of embargoBits) expect(sql).toContain(bit);
  });

  it('facets and the category list count only non-embargoed items', async () => {
    await searchItems({});
    await getItemCategories();
    const wheres = [
      ...mockPrisma.item.groupBy.mock.calls.map((c: any[]) => c[0].where),
      ...mockPrisma.item.aggregate.mock.calls.map((c: any[]) => c[0].where),
    ];
    expect(wheres.length).toBe(4);
    for (const w of wheres) expect(visibleIds(w)).toEqual(['oldRare', 'visible']);
  });
});
