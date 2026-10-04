/**
 * POST /api/pricing/estimate controller (item editor unification, Wave 1D, B3): ownership gate on itemId,
 * persist validation, grade/condition cleaning, response shape. NOT EXECUTED when written (jest cannot run on the
 * authoring device); CI is the first real run. The pricing engine is mocked here; the real owner helper runs
 * against a mocked Prisma client (default deny is exercised for real).
 */
const mockPrisma: any = {
  item: { findUnique: jest.fn() },
  organizer: { findFirst: jest.fn() },
  itemCompLookup: { upsert: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/auth', () => ({ authenticate: jest.fn() }));
const mockEstimate = jest.fn();
jest.mock('../services/pricingEngine', () => ({ estimatePrice: (...a: any[]) => mockEstimate(...a) }));

import { estimatePriceController } from '../controllers/pricingController';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function engineResult(overrides: any = {}) {
  return {
    estimatedPrice: 4999,
    priceRange: { low: 3999, high: 5999 },
    confidence: 'MEDIUM',
    tier: 1,
    sourcesConsulted: [],
    flags: {
      isTrending: false,
      trendMultiplierApplied: 1,
      isBrandPremium: false,
      isSleeperDetected: false,
      isAppreciating: false,
      gradeFactorApplied: true,
      gradeFactor: 0.85,
      gradeFactorGrade: 'C',
    },
    compsFound: 3,
    dataFreshness: new Date('2026-10-04T00:00:00Z'),
    ...overrides,
  };
}

const organizer = (id: string, userId: string) => ({ id, userId, subscriptionTier: 'PRO', lat: null, lng: null });

const saleItem = (ownerUserId: string) => ({
  id: 'item-1',
  saleId: 'sale-1',
  organizerId: 'org-1',
  sale: { organizer: organizer('org-1', ownerUserId) },
});

const inventoryItem = { id: 'item-2', saleId: null, organizerId: 'org-2', sale: null };

const userReq = (body: any, userId: string | undefined = 'user-1') =>
  ({ body, user: userId === undefined ? undefined : { id: userId } } as any);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockEstimate.mockResolvedValue(engineResult());
});

describe('itemId ownership gate', () => {
  it('403 for another organizer\'s sale item, and the engine never runs', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(saleItem('someone-else'));
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'item-1', title: 'Lamp', category: 'Decor' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockEstimate).not.toHaveBeenCalled();
    expect(mockPrisma.itemCompLookup.upsert).not.toHaveBeenCalled();
  });

  it('404 when the item does not exist, and the engine never runs', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'nope', title: 'Lamp', category: 'Decor' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('succeeds for the owner of a sale item and passes the itemId to the engine', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(saleItem('user-1'));
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'item-1', title: 'Lamp', category: 'Decor' }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockEstimate).toHaveBeenCalledTimes(1);
    expect(mockEstimate.mock.calls[0][0].itemId).toBe('item-1');
    expect(res.json).toHaveBeenCalledTimes(1);
  });

  it('loads the item with its sale organizer (the owner helper needs it)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(saleItem('user-1'));
    await estimatePriceController(userReq({ itemId: 'item-1', title: 'Lamp', category: 'Decor' }), makeRes());
    const args = mockPrisma.item.findUnique.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'item-1' });
    expect(args.select.sale.select.organizer.select.userId).toBe(true);
    expect(args.select.organizerId).toBe(true);
  });

  it('succeeds for the owner of an inventory item (no sale), looked up by organizer id AND user id', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(inventoryItem);
    mockPrisma.organizer.findFirst.mockResolvedValue(organizer('org-2', 'user-1'));
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'item-2', title: 'Lamp', category: 'Decor' }), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockPrisma.organizer.findFirst.mock.calls[0][0].where).toEqual({ id: 'org-2', userId: 'user-1' });
    expect(mockEstimate).toHaveBeenCalledTimes(1);
  });

  it('403 for an inventory item the caller does not own (fails closed, not open)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(inventoryItem);
    mockPrisma.organizer.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'item-2', title: 'Lamp', category: 'Decor' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('401 when an itemId is sent without an authenticated user id', async () => {
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'item-1', title: 'Lamp', category: 'Decor' }, undefined), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('500 (and no estimate) when the item lookup fails', async () => {
    mockPrisma.item.findUnique.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'item-1', title: 'Lamp', category: 'Decor' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('db down');
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('rejects an itemId that is not a string with 400 before any lookup', async () => {
    for (const bad of [123, {}, ['item-1'], true]) {
      const res = makeRes();
      await estimatePriceController(userReq({ itemId: bad, title: 'Lamp', category: 'Decor' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('without an itemId (absent, null or empty) there is no lookup and the engine gets no itemId', async () => {
    for (const body of [
      { title: 'Lamp', category: 'Decor' },
      { itemId: null, title: 'Lamp', category: 'Decor' },
      { itemId: '', title: 'Lamp', category: 'Decor' },
    ]) {
      mockEstimate.mockClear();
      const res = makeRes();
      await estimatePriceController(userReq(body), res);
      expect(res.status).not.toHaveBeenCalled();
      expect(mockEstimate.mock.calls[0][0].itemId).toBeUndefined();
    }
    expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
  });
});

describe('persist flag', () => {
  it('rejects a non-boolean persist with 400 and touches nothing', async () => {
    for (const bad of ['false', 'true', 0, 1, null, {}, []]) {
      const res = makeRes();
      await estimatePriceController(userReq({ itemId: 'item-1', persist: bad, title: 'Lamp', category: 'Decor' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('forwards persist:false to the engine (after the ownership check) and writes no ItemCompLookup itself', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(saleItem('user-1'));
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'item-1', persist: false, title: 'Lamp', category: 'Decor' }), res);
    expect(mockEstimate.mock.calls[0][0].persist).toBe(false);
    expect(mockPrisma.itemCompLookup.upsert).not.toHaveBeenCalled();
  });

  it('persist:false still requires ownership', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(saleItem('someone-else'));
    const res = makeRes();
    await estimatePriceController(userReq({ itemId: 'item-1', persist: false, title: 'Lamp', category: 'Decor' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('forwards persist:true, and leaves persist out of the request when omitted (engine default persists)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(saleItem('user-1'));
    await estimatePriceController(userReq({ itemId: 'item-1', persist: true, title: 'Lamp', category: 'Decor' }), makeRes());
    expect(mockEstimate.mock.calls[0][0].persist).toBe(true);

    mockEstimate.mockClear();
    await estimatePriceController(userReq({ itemId: 'item-1', title: 'Lamp', category: 'Decor' }), makeRes());
    expect('persist' in mockEstimate.mock.calls[0][0]).toBe(false);
  });
});

describe('condition and grade cleaning', () => {
  it('trims strings and upper-cases a valid grade', async () => {
    await estimatePriceController(
      userReq({ title: 'Lamp', category: 'Decor', condition: '  USED  ', conditionGrade: ' c ' }),
      makeRes()
    );
    const sent = mockEstimate.mock.calls[0][0];
    expect(sent.condition).toBe('USED');
    expect(sent.conditionGrade).toBe('C');
  });

  it('ignores an unknown grade, an empty condition and non-string values', async () => {
    for (const body of [
      { conditionGrade: 'Z', condition: '' },
      { conditionGrade: 'AA', condition: '   ' },
      { conditionGrade: 3, condition: 7 },
      { conditionGrade: { a: 1 }, condition: ['USED'] },
      { conditionGrade: null, condition: null },
    ]) {
      mockEstimate.mockClear();
      await estimatePriceController(userReq({ title: 'Lamp', category: 'Decor', ...body }), makeRes());
      const sent = mockEstimate.mock.calls[0][0];
      expect(sent.conditionGrade).toBeUndefined();
      expect(sent.condition).toBeUndefined();
    }
  });

  it('accepts every grade letter S, A, B, C, D', async () => {
    for (const g of ['S', 'A', 'B', 'C', 'D']) {
      mockEstimate.mockClear();
      await estimatePriceController(userReq({ title: 'Lamp', category: 'Decor', conditionGrade: g }), makeRes());
      expect(mockEstimate.mock.calls[0][0].conditionGrade).toBe(g);
    }
  });
});

describe('response shape', () => {
  it('returns the engine result with the grade flags and a reasoning line', async () => {
    const res = makeRes();
    await estimatePriceController(userReq({ title: 'Lamp', category: 'Decor', condition: 'USED', conditionGrade: 'C' }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.flags.gradeFactorApplied).toBe(true);
    expect(body.flags.gradeFactor).toBe(0.85);
    expect(body.flags.gradeFactorGrade).toBe('C');
    expect(body.estimatedPrice).toBe(4999);
    expect(body.reasoning).toBe('Based on 3 comparable listings from live market sources.');
  });

  it('FLOOR results carry no reasoning (unchanged)', async () => {
    mockEstimate.mockResolvedValue(engineResult({ confidence: 'FLOOR', compsFound: 0 }));
    const res = makeRes();
    await estimatePriceController(userReq({ title: 'Lamp', category: 'Decor' }), res);
    expect(res.json.mock.calls[0][0].reasoning).toBe('');
  });

  it('an engine failure is a 500 that never echoes the error message', async () => {
    mockEstimate.mockRejectedValue(new Error('upstream key sk-secret leaked'));
    const res = makeRes();
    await estimatePriceController(userReq({ title: 'Lamp', category: 'Decor' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('sk-secret');
  });
});
