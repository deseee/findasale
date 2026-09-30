/**
 * GET /api/crews/invasion/active (crewController.getMyInvasionDiscount), 2026-09-29. Prisma and
 * the redemption lookup are mocked; NOT EXECUTED when written (CI is the first real run).
 */

var mockPrisma: any = { crewInvasionCode: { findUnique: jest.fn() } };
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../services/xpService', () => ({
  spendXp: jest.fn(),
  getSpendableXp: jest.fn(),
  XP_SINKS: { CREW_CREATION: 500 },
}));
var mockFind = jest.fn();
jest.mock('../services/crewInvasionRedemptionService', () => ({
  findRedeemableCrewInvasionCode: (...args: any[]) => mockFind(...args),
}));

import { getMyInvasionDiscount } from '../controllers/crewController';

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFind.mockReset();
  mockPrisma.crewInvasionCode.findUnique.mockReset();
});

describe('getMyInvasionDiscount', () => {
  it('401 when signed out', async () => {
    const res = makeRes();
    await getMyInvasionDiscount({ query: { saleId: 's1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('400 without a saleId', async () => {
    const res = makeRes();
    await getMyInvasionDiscount({ user: { id: 'u1' }, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('reports no discount when the shopper has no redeemable code', async () => {
    mockFind.mockResolvedValue(null);
    const res = makeRes();
    await getMyInvasionDiscount({ user: { id: 'u1' }, query: { saleId: 's1' } } as any, res);
    expect(mockFind).toHaveBeenCalledWith({ saleId: 's1', shopperUserId: 'u1' });
    expect(res.json).toHaveBeenCalledWith({ active: false });
  });

  it('returns the code, percent, expiry and scope for a member with a live code', async () => {
    const expiresAt = new Date('2026-09-29T13:00:00Z');
    mockFind.mockResolvedValue({ id: 'code-1', code: 'CREW10-AAAA', discountPct: 10 });
    mockPrisma.crewInvasionCode.findUnique.mockResolvedValue({ expiresAt });
    const res = makeRes();
    await getMyInvasionDiscount({ user: { id: 'u1' }, query: { saleId: 's1' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      active: true,
      code: 'CREW10-AAAA',
      discountPct: 10,
      expiresAt,
      appliesTo: 'HELD_ITEMS_AT_THIS_SALE',
      oneUse: true,
    });
  });
});
