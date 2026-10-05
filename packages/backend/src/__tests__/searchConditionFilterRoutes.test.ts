/**
 * Shopper condition filter on the two Prisma-based paths: GET /api/search (items) and the saved-search
 * new-match check. A condition filter must match the canonical value AND legacy stored words (LIKE_NEW, GOOD,
 * FAIR, POOR, ...), case-insensitively, so old rows and old bookmarked links still resolve.
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
  item: { findMany: jest.fn() },
  sale: { findMany: jest.fn() },
  organizer: { findMany: jest.fn() },
  savedSearch: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ __esModule: true, prisma: mockPrisma }));
jest.mock('../index', () => ({ __esModule: true, prisma: mockPrisma }));
jest.mock('../services/itemSearchService', () => ({ __esModule: true, searchItems: jest.fn().mockResolvedValue({ data: [] }) }));
jest.mock('../services/cloudAIService', () => ({ __esModule: true, getVisionLabels: jest.fn() }));
jest.mock('../controllers/uploadController', () => ({ __esModule: true, upload: { single: () => (_q: unknown, _r: unknown, n: () => void) => n() } }));
jest.mock('../controllers/searchNotificationController', () => ({ __esModule: true, notifyOnSearch: jest.fn() }));
jest.mock('../services/unmetDemandService', () => ({ __esModule: true, captureUnmetDemand: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/rateLimiter', () => ({
  __esModule: true,
  searchLimiter: (_q: unknown, _r: unknown, n: () => void) => n(),
}));

import searchRouter from '../routes/search';
import { checkNewMatches } from '../controllers/savedSearchController';

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

const searchHandler = () => {
  const route = mockRoutes.find((r) => r.method === 'get' && r.path === '/');
  if (!route) throw new Error('GET / not registered');
  return route.handlers[route.handlers.length - 1] as (req: any, res: any) => Promise<unknown>;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.item.findMany.mockResolvedValue([]);
  mockPrisma.sale.findMany.mockResolvedValue([]);
  mockPrisma.organizer.findMany.mockResolvedValue([]);
});

describe('GET /api/search condition filter', () => {
  const run = async (condition?: string) => {
    const res = makeRes();
    await searchHandler()({ query: { q: 'chair', type: 'items', ...(condition !== undefined ? { condition } : {}) } }, res);
    expect(res.statusCode).toBe(200);
    return mockPrisma.item.findMany.mock.calls[0][0].where;
  };

  it('USED matches USED and the legacy used words, case-insensitively', async () => {
    const where = await run('USED');
    expect(where.condition.mode).toBe('insensitive');
    expect(where.condition.in).toEqual(expect.arrayContaining(['USED', 'LIKE_NEW', 'GOOD', 'FAIR', 'EXCELLENT']));
    expect(where.condition.in).not.toContain('NEW');
    expect(where.condition.equals).toBeUndefined();
  });

  it('old bookmarked values still work: Excellent and Very Good read as Used, Poor reads as Parts / Repair', async () => {
    expect((await run('Excellent')).condition.in).toContain('USED');
    mockPrisma.item.findMany.mockClear();
    expect((await run('Very Good')).condition.in).toContain('USED');
    mockPrisma.item.findMany.mockClear();
    const poor = (await run('Poor')).condition.in;
    expect(poor).toEqual(expect.arrayContaining(['PARTS_OR_REPAIR', 'POOR']));
    expect(poor).not.toContain('USED');
  });

  it('NEW does not pick up LIKE_NEW rows', async () => {
    expect((await run('NEW')).condition.in).toEqual(['NEW']);
  });

  it('no condition adds no condition filter', async () => {
    expect((await run()).condition).toBeUndefined();
  });
});

describe('saved-search new-match check condition filter', () => {
  it('applies the same canonical-plus-legacy match', async () => {
    mockPrisma.savedSearch.findMany.mockResolvedValue([
      { id: 'ss1', name: 'Chairs', userId: 'u1', createdAt: new Date('2026-01-01'), lastNotifiedAt: null, filters: { q: 'chair', condition: 'Excellent' } },
    ]);
    mockPrisma.item.findMany.mockResolvedValue([]);
    mockPrisma.savedSearch.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.savedSearch.update.mockResolvedValue({});
    const res = makeRes();
    await checkNewMatches({ user: { id: 'u1' } } as any, res);
    expect(mockPrisma.item.findMany).toHaveBeenCalledTimes(1);
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    expect(where.condition.mode).toBe('insensitive');
    expect(where.condition.in).toEqual(expect.arrayContaining(['USED', 'LIKE_NEW']));
  });
});
