/**
 * GET /api/items/:id/pricing-signals owner resolution (item editor unification, Wave 1, B1).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * Contract: organizer-only AND owner-only, for sale items and inventory items alike. Default deny: a caller who
 * does not own the item gets 403 and no signal data. Inventory owners succeed (they used to hit a sale-only wall).
 */
const mockItemFindUnique = jest.fn();
const mockOrganizerFindFirst = jest.fn();
const mockSleeperFindMany = jest.fn();
const mockBrandFindFirst = jest.fn();

const mockPrisma = {
  item: { findUnique: (...a: any[]) => mockItemFindUnique(...a) },
  organizer: { findFirst: (...a: any[]) => mockOrganizerFindFirst(...a) },
  sleeperPattern: { findMany: (...a: any[]) => mockSleeperFindMany(...a) },
  brandException: { findFirst: (...a: any[]) => mockBrandFindFirst(...a) },
};

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/auth', () => ({
  authenticate: jest.fn(),
  requireOrganizer: jest.fn(),
}));
jest.mock('../config/ebayCategories', () => ({ extractL1: (c: string | null) => c }));

import { getPricingSignals } from '../controllers/pricingSignalsController';

// The export is [authenticate, requireOrganizer, handler]; the handler is the last element.
const handler = (getPricingSignals as any[])[(getPricingSignals as any[]).length - 1] as (req: any, res: any) => Promise<any>;

const OWNER = 'user_owner';
const OTHER_ORGANIZER = 'user_other_org';
const SHOPPER = 'user_shopper';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mkReq = (user?: { id: string; role?: string; roles?: string[] }) =>
  ({ params: { id: 'item_1' }, user } as any);

const base = { id: 'item_1', title: 'Walnut dresser', brand: null, category: 'Furniture', price: 100 };

const saleItem = () => ({
  ...base,
  saleId: 'sale_1',
  organizerId: 'org_owner',
  sale: { organizer: { id: 'org_owner', userId: OWNER, subscriptionTier: 'PRO', lat: null, lng: null } },
});

const inventoryItem = () => ({ ...base, saleId: null, organizerId: 'org_inv', sale: null });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockSleeperFindMany.mockResolvedValue([]);
  mockBrandFindFirst.mockResolvedValue(null);
  mockOrganizerFindFirst.mockImplementation(async (args: any) =>
    args?.where?.id === 'org_inv' && args?.where?.userId === OWNER
      ? { id: 'org_inv', userId: OWNER, subscriptionTier: 'SIMPLE', lat: null, lng: null }
      : null,
  );
});
afterEach(() => jest.restoreAllMocks());

describe('getPricingSignals on a sale item', () => {
  it('owner gets the signals', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await handler(mkReq({ id: OWNER, roles: ['ORGANIZER'] }), res);
    expect(res.json).toHaveBeenCalledWith({ sleeper: null, brandPremium: null });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('another organizer gets 403 and no data', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await handler(mkReq({ id: OTHER_ORGANIZER, roles: ['ORGANIZER'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSleeperFindMany).not.toHaveBeenCalled();
    expect(mockOrganizerFindFirst).not.toHaveBeenCalled();
  });

  it('shopper gets 403', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await handler(mkReq({ id: SHOPPER, roles: ['USER'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('a request with no user gets 403', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSleeperFindMany).not.toHaveBeenCalled();
  });

  it('missing item is a 404', async () => {
    mockItemFindUnique.mockResolvedValue(null);
    const res = mkRes();
    await handler(mkReq({ id: OWNER }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('getPricingSignals on an inventory item (saleId null)', () => {
  it('owner succeeds, resolved by organizer id AND userId', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await handler(mkReq({ id: OWNER, roles: ['ORGANIZER'] }), res);
    expect(res.json).toHaveBeenCalledWith({ sleeper: null, brandPremium: null });
    expect(res.status).not.toHaveBeenCalled();
    expect(mockOrganizerFindFirst.mock.calls[0][0].where).toEqual({ id: 'org_inv', userId: OWNER });
  });

  it('owner still receives a sleeper alert computed from the item', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    mockSleeperFindMany.mockResolvedValue([
      { patternName: 'Walnut', indicatorTokens: ['walnut'], priceMultiplier: 2 },
    ]);
    const res = mkRes();
    await handler(mkReq({ id: OWNER, roles: ['ORGANIZER'] }), res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.sleeper).toMatchObject({ patternName: 'Walnut', currentPrice: 100 });
  });

  it('another organizer gets 403 and no data', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await handler(mkReq({ id: OTHER_ORGANIZER, roles: ['ORGANIZER'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSleeperFindMany).not.toHaveBeenCalled();
  });

  it('shopper gets 403', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await handler(mkReq({ id: SHOPPER, roles: ['USER'] }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('a request with no user gets 403 and no organizer lookup is made', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockOrganizerFindFirst).not.toHaveBeenCalled();
  });

  it('a database error during owner resolution answers 500 and never leaks data', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    mockOrganizerFindFirst.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    await handler(mkReq({ id: OWNER, roles: ['ORGANIZER'] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockSleeperFindMany).not.toHaveBeenCalled();
  });
});
