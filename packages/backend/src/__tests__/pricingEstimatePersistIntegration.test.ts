/**
 * Controller + real orchestrator (item editor unification, Wave 1D, B3): persist:false writes no ItemCompLookup,
 * persist omitted still does, and a non-owner never reaches the write. NOT EXECUTED when written (jest cannot run
 * on the authoring device); CI is the first real run. Only Prisma, signals, depreciation and the adapter registry
 * are mocked.
 */
const mockPrisma: any = {
  item: { findUnique: jest.fn() },
  organizer: { findFirst: jest.fn() },
  itemCompLookup: { upsert: jest.fn() },
  pricingSourceConfig: { findMany: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/auth', () => ({ authenticate: jest.fn() }));
jest.mock('../services/pricingEngine/signals', () => ({
  analyzeItem: async () => ({
    isTrending: false,
    trendMultiplier: 1,
    isBrandPremium: false,
    isSleeperDetected: false,
    isAppreciating: false,
  }),
}));
jest.mock('../services/pricingEngine/depreciation', () => ({
  getDepreciationCurve: async () => null,
  applyDepreciation: (r: any) => r,
}));
jest.mock('../services/pricingEngine/adapters/registry', () => ({
  adapterRegistry: {
    getAdapter: (id: string) =>
      id === 'mock'
        ? {
            isConfigured: () => true,
            fetch: async () => [
              {
                sourceId: 'mock',
                price: 10000,
                isSoldPrice: true,
                saleDate: new Date(),
                confidence: 0.9,
                comparabilityScore: 1,
                sampleSize: 1,
              },
            ],
          }
        : undefined,
    getSourceName: () => 'Mock Source',
  },
}));

import { estimatePriceController } from '../controllers/pricingController';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const ownedSaleItem = {
  id: 'item-1',
  saleId: 'sale-1',
  organizerId: 'org-1',
  sale: { organizer: { id: 'org-1', userId: 'user-1', subscriptionTier: 'PRO', lat: null, lng: null } },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.pricingSourceConfig.findMany.mockImplementation(async (args: any) =>
    args.where.tier === 1 ? [{ sourceId: 'mock' }] : []
  );
  mockPrisma.itemCompLookup.upsert.mockResolvedValue({});
});

const body = (extra: any) => ({ itemId: 'item-1', title: 'Lamp', category: 'Decor', condition: 'USED', conditionGrade: 'C', ...extra });

describe('estimate end to end', () => {
  it('persist:false returns the graded estimate and writes no ItemCompLookup', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ownedSaleItem);
    const res = makeRes();
    await estimatePriceController({ body: body({ persist: false }), user: { id: 'user-1' } } as any, res);
    expect(res.status).not.toHaveBeenCalled();
    const out = res.json.mock.calls[0][0];
    expect(out.estimatedPrice).toBe(8499);
    expect(out.priceRange.low).toBeLessThanOrEqual(out.estimatedPrice);
    expect(out.priceRange.high).toBeGreaterThanOrEqual(out.estimatedPrice);
    expect(out.flags.gradeFactorApplied).toBe(true);
    expect(out.flags.gradeFactor).toBe(0.85);
    expect(mockPrisma.itemCompLookup.upsert).not.toHaveBeenCalled();
  });

  it('persist omitted keeps the historical write (one upsert keyed by the owned item)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ownedSaleItem);
    const res = makeRes();
    await estimatePriceController({ body: body({}), user: { id: 'user-1' } } as any, res);
    expect(mockPrisma.itemCompLookup.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.itemCompLookup.upsert.mock.calls[0][0].where).toEqual({ itemId: 'item-1' });
  });

  it('a non-owner never reaches the write, with or without persist', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ownedSaleItem);
    for (const extra of [{}, { persist: true }, { persist: false }]) {
      const res = makeRes();
      await estimatePriceController({ body: body(extra), user: { id: 'attacker' } } as any, res);
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(mockPrisma.itemCompLookup.upsert).not.toHaveBeenCalled();
  });
});
