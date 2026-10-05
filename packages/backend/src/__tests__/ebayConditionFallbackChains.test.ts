/**
 * Condition fallback chains used when an eBay category does not accept the desired condition enum.
 *
 * Pins two fixes: a worn item (USED_ACCEPTABLE) must reach USED_EXCELLENT before NEW_OTHER in
 * non-granular categories, and SELLER_REFURBISHED must never be published as NEW or NEW_OTHER.
 * Every other desired enum must keep the result the original chain table gave.
 *
 * No network and no database: the pure helper is tested directly, and one end-to-end block mocks
 * fetch and the leaf modules (same approach as ebayCoinConditionSnapshot.test.ts).
 */

jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../services/ebayHttp', () => ({
  ebayProxyUrl: (p: string) => decodeURIComponent(p),
  ebayProxyHeaders: () => ({}),
  ebayUserHeaders: () => ({}),
  getEbayAccessToken: async () => 'test-token',
}));

import { ensureConditionValidForCategory, pickFallbackCondition } from '../services/ebayPublishService';

const NON_GRANULAR = ['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'FOR_PARTS_OR_NOT_WORKING'];
const MIXED = [
  'NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE',
  'FOR_PARTS_OR_NOT_WORKING',
];
const GRANULAR = ['NEW', 'NEW_OTHER', 'USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING'];
const SETS: Record<string, string[]> = { nonGranular: NON_GRANULAR, mixed: MIXED, granular: GRANULAR };

const ALL_DESIRED = [
  'NEW', 'NEW_OTHER', 'NEW_WITH_DEFECTS', 'LIKE_NEW', 'USED_EXCELLENT', 'USED_VERY_GOOD', 'USED_GOOD',
  'USED_ACCEPTABLE', 'SELLER_REFURBISHED', 'CERTIFIED_REFURBISHED', 'EXCELLENT_REFURBISHED',
  'VERY_GOOD_REFURBISHED', 'GOOD_REFURBISHED', 'FOR_PARTS_OR_NOT_WORKING',
];

// Copy of the ORIGINAL (pre-change) chain table and last resort, read from git HEAD.
const ORIGINAL_CHAINS: Record<string, string[]> = {
  'NEW':                      ['NEW_OTHER', 'NEW_WITH_DEFECTS', 'USED_VERY_GOOD', 'USED_GOOD'],
  'LIKE_NEW':                 ['USED_VERY_GOOD', 'USED_EXCELLENT', 'USED_GOOD', 'NEW_OTHER'],
  'USED_VERY_GOOD':           ['USED_EXCELLENT', 'USED_GOOD', 'USED_ACCEPTABLE', 'NEW_OTHER'],
  'USED_EXCELLENT':           ['USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE'],
  'USED_GOOD':                ['USED_VERY_GOOD', 'USED_ACCEPTABLE', 'USED_EXCELLENT', 'NEW_OTHER'],
  'USED_ACCEPTABLE':          ['USED_GOOD', 'USED_VERY_GOOD', 'NEW_OTHER'],
  'FOR_PARTS_OR_NOT_WORKING': ['USED_ACCEPTABLE', 'USED_GOOD'],
};
function originalResult(desired: string, accepted: string[]): string {
  const set = new Set(accepted);
  if (set.has(desired)) return desired;
  const chain = ORIGINAL_CHAINS[desired] || ['USED_GOOD', 'USED_VERY_GOOD', 'NEW'];
  for (const c of chain) if (set.has(c)) return c;
  return accepted[0];
}

// What the helper yields for a desired enum, treating "already accepted" as itself (as the caller does).
function resolve(desired: string, accepted: string[]): string {
  const set = new Set(accepted);
  if (set.has(desired)) return desired;
  return pickFallbackCondition(desired, set)!.condition;
}

describe('USED_ACCEPTABLE', () => {
  it('reaches USED_EXCELLENT (not NEW_OTHER) in a non-granular category', () => {
    expect(resolve('USED_ACCEPTABLE', NON_GRANULAR)).toBe('USED_EXCELLENT');
  });
  it('stays USED_ACCEPTABLE where accepted', () => {
    expect(resolve('USED_ACCEPTABLE', MIXED)).toBe('USED_ACCEPTABLE');
    expect(resolve('USED_ACCEPTABLE', GRANULAR)).toBe('USED_ACCEPTABLE');
  });
  it('still prefers USED_GOOD, then USED_VERY_GOOD, over USED_EXCELLENT when it is not accepted', () => {
    expect(resolve('USED_ACCEPTABLE', ['NEW', 'USED_GOOD', 'USED_EXCELLENT'])).toBe('USED_GOOD');
    expect(resolve('USED_ACCEPTABLE', ['NEW', 'USED_VERY_GOOD', 'USED_EXCELLENT'])).toBe('USED_VERY_GOOD');
  });
});

describe('SELLER_REFURBISHED', () => {
  it.each(Object.keys(SETS))('never resolves to NEW or NEW_OTHER (%s)', (name) => {
    const result = resolve('SELLER_REFURBISHED', SETS[name]);
    expect(result).not.toBe('NEW');
    expect(result).not.toBe('NEW_OTHER');
  });
  it('resolves to USED_EXCELLENT in the non-granular set', () => {
    expect(resolve('SELLER_REFURBISHED', NON_GRANULAR)).toBe('USED_EXCELLENT');
  });
  it('resolves to a used-type enum in the mixed and granular sets', () => {
    expect(resolve('SELLER_REFURBISHED', MIXED)).toBe('USED_EXCELLENT');
    expect(resolve('SELLER_REFURBISHED', GRANULAR)).toBe('USED_VERY_GOOD');
  });
  it('returns SELLER_REFURBISHED itself when the category accepts it', () => {
    for (const base of Object.values(SETS)) {
      expect(resolve('SELLER_REFURBISHED', [...base, 'SELLER_REFURBISHED'])).toBe('SELLER_REFURBISHED');
    }
  });
  it('never uses the seller-qualification refurbished enums (2000-2030) as a substitute', () => {
    const accepted = new Set(['NEW', 'CERTIFIED_REFURBISHED', 'EXCELLENT_REFURBISHED', 'USED_GOOD']);
    expect(pickFallbackCondition('SELLER_REFURBISHED', accepted)).toEqual({ condition: 'USED_GOOD', source: 'chain' });
  });
});

describe('unchanged desired enums', () => {
  const unchanged = ALL_DESIRED.filter((d) => d !== 'USED_ACCEPTABLE' && d !== 'SELLER_REFURBISHED');
  for (const [setName, accepted] of Object.entries(SETS)) {
    it.each(unchanged)(`${setName}: %s matches the original chain table`, (desired) => {
      expect(resolve(desired, accepted)).toBe(originalResult(desired, accepted));
    });
  }
});

describe('last resort', () => {
  it('prefers an accepted USED_* enum over NEW for a used or refurbished desired enum', () => {
    const accepted = new Set(['NEW', 'USED_ACCEPTABLE']);
    expect(pickFallbackCondition('SELLER_REFURBISHED', accepted)).toEqual({
      condition: 'USED_ACCEPTABLE',
      source: 'last-resort',
    });
    expect(pickFallbackCondition('LIKE_NEW', new Set(['NEW', 'USED_ACCEPTABLE']))!.condition).toBe('USED_ACCEPTABLE');
  });
  it('keeps the first accepted enum as last resort for a non-used desired enum', () => {
    // NEW_WITH_DEFECTS has no chain entry: default chain applies and finds USED_GOOD before NEW.
    expect(pickFallbackCondition('NEW_WITH_DEFECTS', new Set(['NEW', 'USED_GOOD']))).toEqual({
      condition: 'USED_GOOD',
      source: 'chain',
    });
    expect(pickFallbackCondition('NEW_OTHER', new Set(['FOR_PARTS_OR_NOT_WORKING', 'NEW_WITH_DEFECTS']))).toEqual({
      condition: 'FOR_PARTS_OR_NOT_WORKING',
      source: 'last-resort',
    });
  });
  it('returns null for an empty accepted set', () => {
    expect(pickFallbackCondition('USED_GOOD', new Set())).toBeNull();
  });
});

describe('ensureConditionValidForCategory (mocked Metadata API)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function mockPolicy(conditionIds: string[]) {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        itemConditionPolicies: [{ categoryId: 'x', itemConditions: conditionIds.map((conditionId) => ({ conditionId })) }],
      }),
      text: async () => '',
    })) as unknown as typeof fetch;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  }

  it('maps a grade D item (USED_ACCEPTABLE) to USED_EXCELLENT in a non-granular category', async () => {
    mockPolicy(['1000', '1500', '3000', '7000']);
    await expect(ensureConditionValidForCategory('USED_ACCEPTABLE', 'cat-nongranular-1')).resolves.toBe('USED_EXCELLENT');
  });

  it('never maps SELLER_REFURBISHED to NEW or NEW_OTHER in a non-granular category', async () => {
    mockPolicy(['1000', '1500', '3000', '7000']);
    await expect(ensureConditionValidForCategory('SELLER_REFURBISHED', 'cat-nongranular-2')).resolves.toBe('USED_EXCELLENT');
  });

  it('returns desired unchanged when it is accepted', async () => {
    mockPolicy(['1000', '1500', '5000', '6000', '7000']);
    await expect(ensureConditionValidForCategory('USED_ACCEPTABLE', 'cat-granular-1')).resolves.toBe('USED_ACCEPTABLE');
  });
});
