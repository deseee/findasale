/**
 * Pricing orchestrator: grade factor, range invariant, weighted-median pairing, persist flag
 * (item editor unification, Wave 1D, B3). NOT EXECUTED when written (jest cannot run on the authoring device);
 * CI is the first real run. Prisma, signals, depreciation and the adapter registry are mocked; weighting,
 * gradeFactor, conditionMapping and charm pricing are the real modules.
 */
const mockPrisma: any = {
  pricingSourceConfig: { findMany: jest.fn() },
  itemCompLookup: { upsert: jest.fn() },
};
jest.mock('../../../lib/prisma', () => ({ prisma: mockPrisma }));

const mockAnalyze = jest.fn();
jest.mock('../signals', () => ({ analyzeItem: (...a: any[]) => mockAnalyze(...a) }));

jest.mock('../depreciation', () => ({
  getDepreciationCurve: async () => null,
  applyDepreciation: (r: any) => r,
}));

const mockGetAdapter = jest.fn();
jest.mock('../adapters/registry', () => ({
  adapterRegistry: {
    getAdapter: (...a: any[]) => mockGetAdapter(...a),
    getSourceName: () => 'Mock Source',
  },
}));

import { estimatePrice } from '../orchestrator';

type Comp = { price: number; confidence?: number };

let comps: Comp[] = [];
let tier1Enabled = true;

function buildComps() {
  return comps.map((c) => ({
    sourceId: 'mock',
    price: c.price,
    isSoldPrice: true,
    saleDate: new Date(),
    confidence: c.confidence ?? 0.9,
    comparabilityScore: 1,
    sampleSize: 1,
  }));
}

function signalsWithTrend(trend: number) {
  return {
    isTrending: trend > 1.1 || trend < 0.9,
    trendMultiplier: trend,
    isBrandPremium: false,
    isSleeperDetected: false,
    isAppreciating: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  comps = [{ price: 10000 }];
  tier1Enabled = true;
  mockAnalyze.mockResolvedValue(signalsWithTrend(1));
  mockPrisma.pricingSourceConfig.findMany.mockImplementation(async (args: any) =>
    args.where.tier === 1 && tier1Enabled ? [{ sourceId: 'mock' }] : []
  );
  mockPrisma.itemCompLookup.upsert.mockResolvedValue({});
  mockGetAdapter.mockImplementation((id: string) =>
    id === 'mock' ? { isConfigured: () => true, fetch: async () => buildComps() } : undefined
  );
});

const baseRequest = { title: 'Brass lamp', category: 'Home Decor' };

describe('estimate stays inside its own range (invariant)', () => {
  const trends = [0.85, 1.0, 1.35];
  const conditionCases: Array<{ name: string; condition?: string; conditionGrade?: string }> = [
    { name: 'USED A', condition: 'USED', conditionGrade: 'A' },
    { name: 'USED B', condition: 'USED', conditionGrade: 'B' },
    { name: 'USED C', condition: 'USED', conditionGrade: 'C' },
    { name: 'USED D', condition: 'USED', conditionGrade: 'D' },
    { name: 'USED S', condition: 'USED', conditionGrade: 'S' },
    { name: 'NEW with a grade', condition: 'NEW', conditionGrade: 'A' },
    { name: 'USED without a grade', condition: 'USED' },
    { name: 'no condition, no grade' },
  ];
  const compSets: Array<{ name: string; set: Comp[] }> = [
    { name: 'single comp 3999', set: [{ price: 3999 }] },
    { name: 'spread comps', set: [{ price: 1000 }, { price: 5000 }, { price: 9000 }] },
    { name: 'tight comps', set: [{ price: 2500 }, { price: 2510 }] },
  ];

  for (const trend of trends) {
    for (const cc of conditionCases) {
      for (const cs of compSets) {
        it(`trend ${trend}, ${cc.name}, ${cs.name}`, async () => {
          comps = cs.set;
          mockAnalyze.mockResolvedValue(signalsWithTrend(trend));
          const result = await estimatePrice({
            ...baseRequest,
            condition: cc.condition,
            conditionGrade: cc.conditionGrade,
          });
          expect(result.priceRange.low).toBeLessThanOrEqual(result.estimatedPrice);
          expect(result.estimatedPrice).toBeLessThanOrEqual(result.priceRange.high);
          expect(result.priceRange.low).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result.estimatedPrice)).toBe(true);
          expect([49, 99]).toContain(result.estimatedPrice % 100);
        });
      }
    }
  }

  it('the reported case: a 3999 comp with a 0.85 trend lands on 3399 and the range now contains it', async () => {
    comps = [{ price: 3999 }];
    mockAnalyze.mockResolvedValue(signalsWithTrend(0.85));
    const result = await estimatePrice({ ...baseRequest });
    expect(result.estimatedPrice).toBe(3399);
    expect(result.priceRange.low).toBeLessThanOrEqual(3399);
    expect(result.priceRange.high).toBeGreaterThanOrEqual(3999);
    expect(result.flags.trendMultiplierApplied).toBe(0.85);
  });
});

describe('grade factor', () => {
  it.each([
    ['A', 1.1, 10999],
    ['B', 1.0, 9999],
    ['C', 0.85, 8499],
    ['D', 0.65, 6499],
  ] as Array<[string, number, number]>)('USED grade %s scales a 10000 comp by %p', async (grade: string, factor: number, expected: number) => {
    comps = [{ price: 10000 }];
    const result = await estimatePrice({ ...baseRequest, condition: 'USED', conditionGrade: grade });
    expect(result.estimatedPrice).toBe(expected);
    expect(result.flags.gradeFactorApplied).toBe(true);
    expect(result.flags.gradeFactor).toBe(factor);
    expect(result.flags.gradeFactorGrade).toBe(grade);
  });

  it('the range is scaled by the same factor (grade D: both bounds near 6500)', async () => {
    comps = [{ price: 10000 }];
    const result = await estimatePrice({ ...baseRequest, condition: 'USED', conditionGrade: 'D' });
    expect(result.priceRange.high).toBe(6500);
    expect(result.priceRange.low).toBe(6499);
  });

  it('grade S is treated as A', async () => {
    const result = await estimatePrice({ ...baseRequest, condition: 'USED', conditionGrade: 'S' });
    expect(result.flags.gradeFactor).toBe(1.1);
    expect(result.flags.gradeFactorGrade).toBe('A');
  });

  it('NEW takes no grade factor even with a grade', async () => {
    const result = await estimatePrice({ ...baseRequest, condition: 'NEW', conditionGrade: 'D' });
    expect(result.estimatedPrice).toBe(9999);
    expect(result.flags.gradeFactorApplied).toBe(false);
    expect(result.flags.gradeFactor).toBe(1);
    expect(result.flags.gradeFactorGrade).toBeUndefined();
  });

  it('no grade: factor 1, not applied', async () => {
    const result = await estimatePrice({ ...baseRequest, condition: 'USED' });
    expect(result.estimatedPrice).toBe(9999);
    expect(result.flags.gradeFactorApplied).toBe(false);
    expect(result.flags.gradeFactor).toBe(1);
  });

  it('is applied AFTER the trend multiplier (trend 0.85 then grade C on a 10000 comp: 10000 x 0.85 x 0.85 = 7225)', async () => {
    mockAnalyze.mockResolvedValue(signalsWithTrend(0.85));
    const result = await estimatePrice({ ...baseRequest, condition: 'USED', conditionGrade: 'C' });
    // 7225 -> charm 72.25 -> nearest half 72.5 -> 72.49
    expect(result.estimatedPrice).toBe(7249);
    expect(result.priceRange.low).toBeLessThanOrEqual(7249);
    expect(result.priceRange.high).toBeGreaterThanOrEqual(7249);
  });
});

describe('weighted median keeps weights paired with prices', () => {
  it('uses the paired weights (comps arrive unsorted, weight carried by confidence)', async () => {
    // Relative weights 0.02 / 1 / 0.2 for prices 1000 / 10000 / 2000. Paired answer 5120 -> charm 5099.
    // The old bug (prices sorted, weights not) produced 1590 -> 1599.
    comps = [
      { price: 1000, confidence: 0.02 },
      { price: 10000, confidence: 1 },
      { price: 2000, confidence: 0.2 },
    ];
    const result = await estimatePrice({ ...baseRequest, condition: 'NEW' });
    expect(result.estimatedPrice).toBe(5099);
    expect(result.priceRange.low).toBe(1000);
    expect(result.priceRange.high).toBe(10000);
  });
});

describe('persist flag', () => {
  it('writes ItemCompLookup when itemId is set and persist is omitted (historical behavior)', async () => {
    await estimatePrice({ ...baseRequest, itemId: 'item-1' });
    expect(mockPrisma.itemCompLookup.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.itemCompLookup.upsert.mock.calls[0][0].where).toEqual({ itemId: 'item-1' });
  });

  it('writes when persist is true', async () => {
    await estimatePrice({ ...baseRequest, itemId: 'item-1', persist: true });
    expect(mockPrisma.itemCompLookup.upsert).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when persist is false', async () => {
    await estimatePrice({ ...baseRequest, itemId: 'item-1', persist: false });
    expect(mockPrisma.itemCompLookup.upsert).not.toHaveBeenCalled();
  });

  it('writes nothing without an itemId', async () => {
    await estimatePrice({ ...baseRequest });
    expect(mockPrisma.itemCompLookup.upsert).not.toHaveBeenCalled();
  });

  it('stores the grade flags in the cached result', async () => {
    await estimatePrice({ ...baseRequest, itemId: 'item-1', condition: 'USED', conditionGrade: 'C' });
    const saved = mockPrisma.itemCompLookup.upsert.mock.calls[0][0].update.pricingResultJson;
    expect(saved.flags.gradeFactorApplied).toBe(true);
    expect(saved.flags.gradeFactor).toBe(0.85);
  });
});

describe('FLOOR handling is unchanged', () => {
  it('no comps anywhere: FLOOR, charm-priced floor, nothing cached, no grade flags, estimate inside its range', async () => {
    tier1Enabled = false;
    const result = await estimatePrice({
      ...baseRequest,
      itemId: 'item-1',
      condition: 'USED',
      conditionGrade: 'A',
    });
    expect(result.confidence).toBe('FLOOR');
    expect(result.estimatedPrice).toBe(49);
    expect(result.priceRange.low).toBeLessThanOrEqual(result.estimatedPrice);
    expect(result.priceRange.high).toBeGreaterThanOrEqual(result.estimatedPrice);
    expect(result.compsFound).toBe(0);
    expect(result.flags.gradeFactorApplied).toBeUndefined();
    expect(mockPrisma.itemCompLookup.upsert).not.toHaveBeenCalled();
  });
});
