/**
 * GET /api/loot-log/public/:userId (2026-10-13 privacy): honors User.purchasesVisible. Hidden lists are
 * a 404 for everyone but the shopper themself and admins; page size is capped at 50.
 */
const mockUserFindUnique = jest.fn();
const mockPurchaseFindMany = jest.fn();
const mockPurchaseCount = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    purchase: {
      findMany: (...a: any[]) => mockPurchaseFindMany(...a),
      count: (...a: any[]) => mockPurchaseCount(...a),
    },
  },
}));

import { getPublicLootLog } from '../controllers/lootLogController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPurchaseFindMany.mockResolvedValue([]);
  mockPurchaseCount.mockResolvedValue(0);
});

async function call(visible: boolean, user?: any, query: any = {}) {
  mockUserFindUnique.mockResolvedValue({ id: 's1', name: 'Sam', purchasesVisible: visible });
  const res = mockRes();
  await getPublicLootLog({ params: { userId: 's1' }, query, user } as any, res);
  return res;
}

describe('public loot log visibility', () => {
  it('visible list is public', async () => {
    const res = await call(true);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockPurchaseFindMany).toHaveBeenCalled();
  });

  it('hidden list is a 404 for anonymous and other users, without reading purchases', async () => {
    expect((await call(false)).status).toHaveBeenCalledWith(404);
    expect((await call(false, { id: 'other', roles: ['USER'] })).status).toHaveBeenCalledWith(404);
    expect(mockPurchaseFindMany).not.toHaveBeenCalled();
  });

  it('hidden list is still shown to the shopper themself and to admins', async () => {
    expect((await call(false, { id: 's1', roles: ['USER'] })).status).not.toHaveBeenCalled();
    expect((await call(false, { id: 'a', roles: ['ADMIN'] })).status).not.toHaveBeenCalled();
  });

  it('caps the page size at 50', async () => {
    await call(true, undefined, { limit: '100000' });
    expect(mockPurchaseFindMany.mock.calls[0][0].take).toBe(50);
  });
});
