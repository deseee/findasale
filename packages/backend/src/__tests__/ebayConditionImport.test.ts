/**
 * eBay-import condition rule (2026-10-04, approved by the product owner).
 *
 *   - An eBay-imported condition sets a GRADE only when eBay states a level (4000, 5000, 6000, 2990, 3010).
 *   - Blanks only: a non-blank condition or a non-null grade is never overwritten.
 *   - No data migration; the 4-hourly pull stops flipping or overwriting condition.
 *
 * Covers the pure mapper (utils/ebayConditionImport.ts), the blank-only fill (including the "no grade fills on items
 * we published" limit), a round trip against our own outbound mapping, the cron, and a source guard on the controller.
 *
 * No network and no database.
 */
import * as fs from 'fs';
import * as path from 'path';

const mockPrisma: any = {
  item: { findMany: jest.fn(), update: jest.fn() },
  ebayPolicyMapping: { findUnique: jest.fn() },
  ebayConnection: { findUnique: jest.fn(), findMany: jest.fn() },
  organizer: { findUnique: jest.fn() },
  notification: { findFirst: jest.fn(), create: jest.fn() },
};
const mockAccepted: { byCategory: Record<string, string[]>; throws: boolean } = { byCategory: {}, throws: false };

jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../services/ebayHttp', () => ({
  ebayProxyUrl: (p: string) => decodeURIComponent(p),
  ebayProxyHeaders: () => ({}),
  ebayUserHeaders: () => ({}),
  getEbayAccessToken: async () => 'test-token',
}));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../controllers/ebayController', () => ({ refreshEbayAccessToken: jest.fn(async () => 'tok') }));
jest.mock('../services/ebayPriceRevisionService', () => ({ reviseEbayOfferPrice: jest.fn(async () => ({ ok: true })) }));
jest.mock('../services/markdownPricePropagationService', () => ({
  classifyPropagationFailure: () => 'RETRYABLE',
  formatPropagationFailureReason: () => 'reason',
  resolveSyncStateAfterFailure: () => 'FAILED_RETRYABLE',
}));
jest.mock('../services/ebayStoreSubscriptionService', () => ({
  fetchAndCacheEbayStoreSubscription: jest.fn().mockResolvedValue(undefined),
  isEbayStoreSubscriptionStale: () => false,
}));
jest.mock('../lib/ebayInsertionsQuotaTracker', () => ({
  reconcileEbayInsertionsUsage: jest.fn().mockResolvedValue(undefined),
  isEbayInsertionsReconciliationStale: () => false,
}));
jest.mock('../lib/ebayRateLimiter', () => ({ isEbayRateLimited: () => false }));
// Real chain logic, but the per-category accepted set comes from the test instead of the Metadata API.
jest.mock('../services/ebayPublishService', () => {
  const actual = jest.requireActual('../services/ebayPublishService');
  return {
    ...actual,
    ensureConditionValidForCategory: async (desired: string, categoryId: string) => {
      if (mockAccepted.throws) throw new Error('metadata down');
      const list = mockAccepted.byCategory[categoryId];
      if (!list) return desired;
      const accepted = new Set(list);
      if (accepted.has(desired)) return desired;
      return actual.pickFallbackCondition(desired, accepted)?.condition ?? desired;
    },
  };
});

import {
  canonicalFromEbayCondition,
  ebayConditionIdOf,
  fillBlankCondition,
} from '../utils/ebayConditionImport';
import { desiredEbayCondition, normalizeCondition } from '../utils/conditionMapping';
import { pickFallbackCondition } from '../services/ebayPublishService';
import { pullSyncForOrganizer } from '../jobs/ebayListingSyncCron';

type Row = [string | number, string | null, string | null];

// Approved mapping table: id, condition, grade.
const TABLE: Row[] = [
  [4000, 'USED', 'B'],
  [5000, 'USED', 'C'],
  [6000, 'USED', 'D'],
  [2990, 'USED', 'A'],
  [3010, 'USED', 'C'],
  [3000, 'USED', null],
  [2750, 'USED', null],
  [1000, 'NEW', null],
  [1500, 'NEW', null],
  [1750, 'NEW', null],
  [2000, 'REFURBISHED', null],
  [2010, 'REFURBISHED', null],
  [2020, 'REFURBISHED', null],
  [2030, 'REFURBISHED', null],
  [2500, 'REFURBISHED', null],
  [7000, 'PARTS_OR_REPAIR', null],
];

describe('canonicalFromEbayCondition: approved table', () => {
  it.each(TABLE)('id %s -> %s / %s', (id, condition, grade) => {
    for (const input of [id, String(id)]) {
      const r = canonicalFromEbayCondition(input);
      expect(r.condition).toBe(condition);
      expect(r.grade).toBe(grade);
      expect(r.conditionId).toBe(String(id));
      expect(r.levelKnown).toBe(grade !== null);
      expect(r.ebaySourced).toBe(true);
    }
  });

  it('covers exactly the 16 approved ids', () => {
    expect(TABLE).toHaveLength(16);
  });

  it.each([
    ['NEW', 'NEW', null],
    ['NEW_OTHER', 'NEW', null],
    ['NEW_WITH_DEFECTS', 'NEW', null],
    ['CERTIFIED_REFURBISHED', 'REFURBISHED', null],
    ['EXCELLENT_REFURBISHED', 'REFURBISHED', null],
    ['VERY_GOOD_REFURBISHED', 'REFURBISHED', null],
    ['GOOD_REFURBISHED', 'REFURBISHED', null],
    ['SELLER_REFURBISHED', 'REFURBISHED', null],
    ['LIKE_NEW', 'USED', null],
    ['PRE_OWNED_EXCELLENT', 'USED', 'A'],
    ['USED_EXCELLENT', 'USED', null],
    ['PRE_OWNED_FAIR', 'USED', 'C'],
    ['USED_VERY_GOOD', 'USED', 'B'],
    ['USED_GOOD', 'USED', 'C'],
    ['USED_ACCEPTABLE', 'USED', 'D'],
    ['FOR_PARTS_OR_NOT_WORKING', 'PARTS_OR_REPAIR', null],
  ])('Inventory enum %s -> %s / %s', (name, condition, grade) => {
    const r = canonicalFromEbayCondition(name);
    expect(r.condition).toBe(condition);
    expect(r.grade).toBe(grade);
  });

  it('an enum name and its numeric id agree', () => {
    const pairs: Array<[string, number]> = [
      ['NEW', 1000], ['NEW_OTHER', 1500], ['NEW_WITH_DEFECTS', 1750], ['CERTIFIED_REFURBISHED', 2000],
      ['EXCELLENT_REFURBISHED', 2010], ['VERY_GOOD_REFURBISHED', 2020], ['GOOD_REFURBISHED', 2030],
      ['SELLER_REFURBISHED', 2500], ['LIKE_NEW', 2750], ['PRE_OWNED_EXCELLENT', 2990], ['USED_EXCELLENT', 3000],
      ['PRE_OWNED_FAIR', 3010], ['USED_VERY_GOOD', 4000], ['USED_GOOD', 5000], ['USED_ACCEPTABLE', 6000],
      ['FOR_PARTS_OR_NOT_WORKING', 7000],
    ];
    for (const [name, id] of pairs) {
      expect(canonicalFromEbayCondition(name)).toEqual(canonicalFromEbayCondition(id));
    }
  });
});

describe('canonicalFromEbayCondition: input edge cases', () => {
  const NONE = { condition: null, grade: null, ebaySourced: true, conditionId: null, levelKnown: false };

  it.each([
    [3000.5], [NaN], [Infinity], [-Infinity], [0], [-4000], [9999], [1001],
  ])('number %s is unknown', (n) => {
    expect(canonicalFromEbayCondition(n as number)).toEqual(NONE);
  });

  it('numeric strings are trimmed and parsed, junk after digits is not', () => {
    expect(canonicalFromEbayCondition(' 4000 ').grade).toBe('B');
    expect(canonicalFromEbayCondition('04000').grade).toBe('B');
    expect(canonicalFromEbayCondition('4000abc')).toEqual(NONE);
    expect(canonicalFromEbayCondition('4e3')).toEqual(NONE);
    expect(canonicalFromEbayCondition('40.00')).toEqual(NONE);
    expect(canonicalFromEbayCondition('-4000')).toEqual(NONE);
    expect(canonicalFromEbayCondition('9999')).toEqual(NONE);
  });

  it('enum names are case-insensitive and read spaces and hyphens as underscores', () => {
    expect(canonicalFromEbayCondition('used_very_good').grade).toBe('B');
    expect(canonicalFromEbayCondition('Used Very Good').grade).toBe('B');
    expect(canonicalFromEbayCondition('used-good').grade).toBe('C');
    expect(canonicalFromEbayCondition('  USED_ACCEPTABLE  ').grade).toBe('D');
    expect(canonicalFromEbayCondition('Pre-Owned Excellent').grade).toBe('A');
    expect(canonicalFromEbayCondition('pre owned fair').grade).toBe('C');
  });

  it('PRE_OWNED_EXCELLENT and PRE_OWNED_FAIR carry their apparel levels', () => {
    expect(canonicalFromEbayCondition('PRE_OWNED_EXCELLENT')).toMatchObject({ condition: 'USED', grade: 'A', conditionId: '2990' });
    expect(canonicalFromEbayCondition('PRE_OWNED_FAIR')).toMatchObject({ condition: 'USED', grade: 'C', conditionId: '3010' });
  });

  it('null, undefined, empty and garbage never throw and return null/null', () => {
    const throwing = { toString() { throw new Error('boom'); }, valueOf() { throw new Error('boom'); } };
    const garbage: unknown[] = [
      null, undefined, '', '   ', 'banana', 'GOOD', 'S', 'A', {}, [], [4000], true, false, () => 4000,
      Symbol('x'), BigInt(4000), throwing, new Date(), /4000/,
    ];
    for (const g of garbage) {
      expect(() => canonicalFromEbayCondition(g as any)).not.toThrow();
      expect(canonicalFromEbayCondition(g as any)).toEqual(NONE);
    }
    expect(canonicalFromEbayCondition(undefined, { categoryId: null })).toEqual(NONE);
  });

  it('ebayConditionIdOf normalizes ids and enum names and never throws', () => {
    expect(ebayConditionIdOf(3000)).toBe('3000');
    expect(ebayConditionIdOf('3000')).toBe('3000');
    expect(ebayConditionIdOf('USED_EXCELLENT')).toBe('3000');
    expect(ebayConditionIdOf('nonsense')).toBeNull();
    expect(ebayConditionIdOf(null)).toBeNull();
    expect(ebayConditionIdOf({})).toBeNull();
  });
});

describe('canonicalFromEbayCondition: grade invariants', () => {
  const ALL_INPUTS: Array<string | number> = [];
  for (let i = 0; i <= 8000; i += 10) ALL_INPUTS.push(i, String(i));
  ALL_INPUTS.push(...TABLE.map((r) => r[0]));
  ALL_INPUTS.push('NEW', 'LIKE_NEW', 'USED_EXCELLENT', 'USED_VERY_GOOD', 'PRE_OWNED_EXCELLENT', 'FOR_PARTS_OR_NOT_WORKING', 'junk');

  it('the grade is never S, and is only ever A, B, C, D or null', () => {
    for (const input of ALL_INPUTS) {
      const g = canonicalFromEbayCondition(input).grade;
      expect(g === null || ['A', 'B', 'C', 'D'].includes(g)).toBe(true);
      expect(g).not.toBe('S');
    }
  });

  it('the grade is null whenever the condition is not USED', () => {
    for (const input of ALL_INPUTS) {
      const r = canonicalFromEbayCondition(input);
      if (r.condition !== 'USED') expect(r.grade).toBeNull();
    }
  });

  it('"Used" (3000) and "Like New" (2750) never claim a level', () => {
    expect(canonicalFromEbayCondition(3000).grade).toBeNull();
    expect(canonicalFromEbayCondition(2750).grade).toBeNull();
    expect(canonicalFromEbayCondition('USED_EXCELLENT').grade).toBeNull();
  });

  it('levelKnown is true exactly when a grade is returned', () => {
    for (const input of ALL_INPUTS) {
      const r = canonicalFromEbayCondition(input);
      expect(r.levelKnown).toBe(r.grade !== null);
    }
  });
});

describe('canonicalFromEbayCondition: card and coin hint', () => {
  it('forces a null grade for 4000 in pinned card categories, keeping condition USED', () => {
    for (const categoryId of ['183454', '183050', '261328']) {
      expect(canonicalFromEbayCondition(4000, { categoryId })).toMatchObject({ condition: 'USED', grade: null, levelKnown: false });
    }
  });

  it('forces a null grade for 4000 in coin category ids, by category name, and by explicit flag', () => {
    expect(canonicalFromEbayCondition('4000', { categoryId: '11116' }).grade).toBeNull();
    expect(canonicalFromEbayCondition('4000', { categoryName: 'Coins & Paper Money' }).grade).toBeNull();
    expect(canonicalFromEbayCondition('4000', { categoryName: 'CCG Individual Cards' }).grade).toBeNull();
    expect(canonicalFromEbayCondition('4000', { categoryName: 'Trading Card Singles' }).grade).toBeNull();
    expect(canonicalFromEbayCondition('USED_VERY_GOOD', { isCardOrCoinCategory: true }).grade).toBeNull();
  });

  it('leaves 4000 graded B in an ordinary category, with or without a hint', () => {
    expect(canonicalFromEbayCondition(4000, { categoryId: '11450', categoryName: 'Clothing' }).grade).toBe('B');
    expect(canonicalFromEbayCondition(4000, {}).grade).toBe('B');
    expect(canonicalFromEbayCondition(4000, { categoryId: null, categoryName: null, isCardOrCoinCategory: false }).grade).toBe('B');
    expect(canonicalFromEbayCondition(4000, { categoryId: '  ' }).grade).toBe('B');
  });

  it('the hint never changes the condition family and never throws on odd opts', () => {
    expect(canonicalFromEbayCondition(1000, { isCardOrCoinCategory: true }).condition).toBe('NEW');
    expect(canonicalFromEbayCondition(7000, { categoryId: '183454' }).condition).toBe('PARTS_OR_REPAIR');
    expect(() => canonicalFromEbayCondition(4000, { categoryId: 5 as any, categoryName: {} as any })).not.toThrow();
  });
});

describe('fillBlankCondition', () => {
  const ebay = (v: string | number, opts?: Parameters<typeof canonicalFromEbayCondition>[1]) => canonicalFromEbayCondition(v, opts);
  const noOffer = { ebayOfferId: null };

  it('fills a blank condition and a blank grade when eBay states a level (item with no offer)', () => {
    expect(fillBlankCondition({ condition: null, conditionGrade: null, ...noOffer }, ebay(4000))).toEqual({ condition: 'USED', conditionGrade: 'B' });
    expect(fillBlankCondition({ condition: '', conditionGrade: '', ...noOffer }, ebay(5000))).toEqual({ condition: 'USED', conditionGrade: 'C' });
    expect(fillBlankCondition({ condition: '   ', conditionGrade: '  ', ...noOffer }, ebay(6000))).toEqual({ condition: 'USED', conditionGrade: 'D' });
  });

  it('fills the condition but no grade when eBay states no level ("Used" 3000)', () => {
    expect(fillBlankCondition({ condition: null, conditionGrade: null, ...noOffer }, ebay(3000))).toEqual({ condition: 'USED' });
  });

  it('fills a NEW condition and never a grade', () => {
    expect(fillBlankCondition({ condition: null, conditionGrade: null, ...noOffer }, ebay(1000))).toEqual({ condition: 'NEW' });
    expect(fillBlankCondition({ condition: undefined, conditionGrade: undefined, ...noOffer }, ebay('NEW_OTHER'))).toEqual({ condition: 'NEW' });
  });

  it('fills a blank grade when the stored condition is already USED', () => {
    expect(fillBlankCondition({ condition: 'USED', conditionGrade: null, ...noOffer }, ebay(4000))).toEqual({ conditionGrade: 'B' });
    expect(fillBlankCondition({ condition: 'used', conditionGrade: null, ...noOffer }, ebay(4000))).toEqual({ conditionGrade: 'B' });
    expect(fillBlankCondition({ condition: 'LIKE_NEW', conditionGrade: null, ...noOffer }, ebay(4000))).toEqual({ conditionGrade: 'B' });
  });

  it('never overwrites a non-blank condition', () => {
    for (const stored of ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR', 'new', 'Used']) {
      const out = fillBlankCondition({ condition: stored, conditionGrade: 'A', ...noOffer }, ebay(7000));
      expect(out.condition).toBeUndefined();
    }
  });

  it('never overwrites a non-null grade, even when eBay states a different level', () => {
    for (const grade of ['S', 'A', 'B', 'C', 'D', 'a', 'x']) {
      const out = fillBlankCondition({ condition: 'USED', conditionGrade: grade, ...noOffer }, ebay(6000));
      expect(out.conditionGrade).toBeUndefined();
    }
    expect(fillBlankCondition({ condition: null, conditionGrade: 'A', ...noOffer }, ebay(4000))).toEqual({ condition: 'USED' });
  });

  it('does not apply a level when the stored condition is a different family', () => {
    expect(fillBlankCondition({ condition: 'NEW', conditionGrade: null, ...noOffer }, ebay(4000))).toEqual({});
    expect(fillBlankCondition({ condition: 'REFURBISHED', conditionGrade: null, ...noOffer }, ebay(5000))).toEqual({});
    expect(fillBlankCondition({ condition: 'PARTS_OR_REPAIR', conditionGrade: null, ...noOffer }, ebay(6000))).toEqual({});
  });

  it('does not apply a level to an unrecognized stored condition string', () => {
    expect(fillBlankCondition({ condition: 'weird', conditionGrade: null, ...noOffer }, ebay(4000))).toEqual({});
  });

  it('writes nothing when eBay gives nothing usable', () => {
    for (const v of [null, undefined, '', 'junk', 9999]) {
      expect(fillBlankCondition({ condition: null, conditionGrade: null, ...noOffer }, ebay(v as any))).toEqual({});
    }
  });

  it('a card category hint keeps a 4000 grade out of the fill', () => {
    expect(fillBlankCondition({ condition: null, conditionGrade: null, ...noOffer }, ebay(4000, { categoryId: '183454' }))).toEqual({ condition: 'USED' });
  });

  it('never fills grade S', () => {
    for (const v of [1000, 1500, 2000, 3000, 4000, 'NEW', 'LIKE_NEW']) {
      expect(fillBlankCondition({ condition: null, conditionGrade: null, ...noOffer }, ebay(v)).conditionGrade).not.toBe('S');
    }
  });

  describe('items FindA.Sale published (non-blank ebayOfferId) never get a grade filled', () => {
    it('blank condition and blank grade: condition is filled, grade is not', () => {
      expect(fillBlankCondition({ condition: null, conditionGrade: null, ebayOfferId: 'O1' }, ebay(4000))).toEqual({ condition: 'USED' });
    });
    it('stored USED with blank grade: nothing is filled', () => {
      for (const id of [4000, 5000, 6000, 2990, 3010]) {
        expect(fillBlankCondition({ condition: 'USED', conditionGrade: null, ebayOfferId: 'O1' }, ebay(id))).toEqual({});
      }
    });
    it('an empty or whitespace offer id counts as no offer', () => {
      expect(fillBlankCondition({ condition: 'USED', conditionGrade: null, ebayOfferId: '' }, ebay(4000))).toEqual({ conditionGrade: 'B' });
      expect(fillBlankCondition({ condition: 'USED', conditionGrade: null, ebayOfferId: '  ' }, ebay(4000))).toEqual({ conditionGrade: 'B' });
      expect(fillBlankCondition({ condition: 'USED', conditionGrade: null, ebayOfferId: undefined }, ebay(4000))).toEqual({ conditionGrade: 'B' });
    });
  });
});

describe('round trip: our desired condition -> category remap -> eBay -> import back', () => {
  // Accepted sets seen in the wild: non-granular, mixed, granular, plus single-enum categories.
  const NON_GRANULAR = ['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'FOR_PARTS_OR_NOT_WORKING'];
  const MIXED = ['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING'];
  const GRANULAR = ['NEW', 'NEW_OTHER', 'USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING'];
  const SETS: Array<string[] | null> = [null, NON_GRANULAR, MIXED, GRANULAR, ['USED_EXCELLENT'], ['NEW'], ['NEW', 'USED_EXCELLENT']];

  const CONDITIONS: Array<string | null> = [null, '', 'NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR', 'LIKE_NEW', 'EXCELLENT', 'used'];
  const GRADES: Array<string | null> = [null, '', 'S', 'A', 'B', 'C', 'D'];

  function roundTrip(condition: string | null, grade: string | null, accepted: string[] | null) {
    const desired = desiredEbayCondition(condition, grade);
    let onEbay: string = desired;
    if (accepted && !accepted.includes(desired)) {
      onEbay = pickFallbackCondition(desired, new Set(accepted))?.condition ?? desired;
    }
    return { desired, onEbay, imported: canonicalFromEbayCondition(onEbay) };
  }

  it('on an item we published (has an offer id), the import never changes the organizer\'s grade or non-blank condition', () => {
    let combos = 0;
    for (const condition of CONDITIONS) {
      for (const grade of GRADES) {
        for (const accepted of SETS) {
          const { imported } = roundTrip(condition, grade, accepted);
          const stored = { condition, conditionGrade: grade, ebayOfferId: 'O1' };
          const fill = fillBlankCondition(stored, imported);
          // The grade is untouched: blank stays blank, a set grade stays as the organizer left it.
          expect(fill.conditionGrade).toBeUndefined();
          // A non-blank condition is never replaced.
          if (condition && condition.trim() !== '') expect(fill.condition).toBeUndefined();
          combos++;
        }
      }
    }
    expect(combos).toBe(CONDITIONS.length * GRADES.length * SETS.length);
  });

  it('on any item, a stored non-null grade or non-blank condition is never overwritten, offer id or not', () => {
    for (const condition of CONDITIONS) {
      for (const grade of GRADES) {
        for (const accepted of SETS) {
          for (const ebayOfferId of [null, 'O1']) {
            const { imported } = roundTrip(condition, grade, accepted);
            const fill = fillBlankCondition({ condition, conditionGrade: grade, ebayOfferId }, imported);
            if (grade && grade.trim() !== '') expect(fill.conditionGrade).toBeUndefined();
            if (condition && condition.trim() !== '') expect(fill.condition).toBeUndefined();
          }
        }
      }
    }
  });

  it('why the offer-id limit exists: our own USED_GOOD default echoes back as a C if the offer-id limit were absent', () => {
    // An organizer with no grade publishes as USED_GOOD (5000); a raw import would then invent grade C.
    const { desired, imported } = roundTrip('USED', null, null);
    expect(desired).toBe('USED_GOOD');
    expect(imported.grade).toBe('C');
    // With the limit, nothing is filled for the item we published.
    expect(fillBlankCondition({ condition: 'USED', conditionGrade: null, ebayOfferId: 'O1' }, imported)).toEqual({});
  });

  it('a category that only accepts "Used" (3000) turns a graded push into a no-level import, never a wrong grade', () => {
    for (const grade of ['A', 'B', 'C', 'D']) {
      const { imported } = roundTrip('USED', grade, NON_GRANULAR);
      expect(imported.condition).toBe('USED');
      expect(imported.grade).toBeNull();
    }
  });

  it('the import never produces NEW or REFURBISHED for an organizer USED item in any accepted set that has a USED enum', () => {
    for (const grade of GRADES) {
      for (const accepted of [NON_GRANULAR, MIXED, GRANULAR]) {
        expect(roundTrip('USED', grade, accepted).imported.condition).toBe('USED');
      }
    }
  });
});

describe('ebayListingSyncCron: condition rule', () => {
  const baseItem = (over: Record<string, unknown> = {}) => ({
    id: 'i1', title: 'Title', description: 'desc', price: 20, condition: 'USED', conditionGrade: null, ebayCategoryId: null,
    ebayListingId: 'L1', ebayOfferId: 'O1', priceUpdatedAt: null, ebayPriceSyncedAt: null,
    ebaySyncState: 'SYNCED', ebaySyncFailureReason: null, ebaySyncAttempts: 0,
    ebaySyncHeldAt: null, ebayContentDirtyAt: null,
    ...over,
  });

  let ebayCondition: string;
  let logSpy: jest.SpyInstance;
  const logs = () => logSpy.mock.calls.map((c) => String(c[0]));
  const updateData = () => mockPrisma.item.update.mock.calls.map((c: any[]) => c[0].data);

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccepted.byCategory = {};
    mockAccepted.throws = false;
    ebayCondition = 'USED_GOOD';
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.ebayPolicyMapping.findUnique.mockResolvedValue(null);
    mockPrisma.ebayConnection.findUnique.mockResolvedValue({ storeSubscriptionCheckedAt: new Date() });
    mockPrisma.organizer.findUnique.mockResolvedValue({ ebayInsertionsReconciledAt: new Date() });
    (global as any).fetch = jest.fn(async (url: string) => {
      const p = decodeURIComponent(url.split('path=')[1] ?? '');
      if (p.includes('/offer/')) return { ok: true, status: 200, json: async () => ({ sku: 'SKU1', pricingSummary: { price: { value: '20' } } }) };
      return { ok: true, status: 200, json: async () => ({ product: { title: 'Title', description: 'desc' }, condition: ebayCondition }) };
    });
  });
  afterEach(() => logSpy.mockRestore());

  it('selects condition, conditionGrade and ebayCategoryId', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    await pullSyncForOrganizer('org1');
    const select = mockPrisma.item.findMany.mock.calls[0][0].select;
    expect(select).toMatchObject({ condition: true, conditionGrade: true, ebayCategoryId: true, ebaySyncHeldAt: true, ebayContentDirtyAt: true });
  });

  it('never flips a stored condition: USED stays USED when eBay says NEW', async () => {
    ebayCondition = 'NEW';
    mockPrisma.item.findMany.mockResolvedValue([baseItem()]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([]);
  });

  it.each(['NEW', 'USED_VERY_GOOD', 'USED_ACCEPTABLE', 'SELLER_REFURBISHED', 'FOR_PARTS_OR_NOT_WORKING', 'USED_EXCELLENT'])(
    'never writes condition or grade for a stored USED item when eBay says %s',
    async (c) => {
      ebayCondition = c;
      mockPrisma.item.findMany.mockResolvedValue([baseItem({ conditionGrade: 'B' })]);
      await pullSyncForOrganizer('org1');
      for (const d of updateData()) {
        expect(d).not.toHaveProperty('condition');
        expect(d).not.toHaveProperty('conditionGrade');
      }
    },
  );

  it('fills a blank condition, and never a grade (items here were published by us)', async () => {
    ebayCondition = 'USED_VERY_GOOD';
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ condition: null })]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([{ condition: 'USED' }]);
  });

  it('fills a blank condition from a NEW listing without a grade', async () => {
    ebayCondition = 'NEW';
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ condition: '' })]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([{ condition: 'NEW' }]);
  });

  it('a blank condition with an existing grade keeps the grade', async () => {
    ebayCondition = 'USED_ACCEPTABLE';
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ condition: null, conditionGrade: 'A' })]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([{ condition: 'USED' }]);
  });

  it('does not flag drift that only the category remap explains', async () => {
    // Stored USED / C pushes as USED_GOOD; this category accepts only USED_EXCELLENT, so eBay shows USED_EXCELLENT.
    mockAccepted.byCategory['CAT1'] = ['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'FOR_PARTS_OR_NOT_WORKING'];
    ebayCondition = 'USED_EXCELLENT';
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ conditionGrade: 'C', ebayCategoryId: 'CAT1' })]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([]);
    expect(logs().some((l) => l.includes('differs from FindA.Sale'))).toBe(false);
    expect(logs().some((l) => l.includes('item(s) with an eBay condition'))).toBe(false);
  });

  it('flags drift the remap does not explain, counts it, and still writes nothing', async () => {
    mockAccepted.byCategory['CAT1'] = ['NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'FOR_PARTS_OR_NOT_WORKING'];
    ebayCondition = 'NEW'; // the remap would give USED_EXCELLENT, not NEW
    mockPrisma.item.findMany.mockResolvedValue([
      baseItem({ id: 'a', conditionGrade: 'C', ebayCategoryId: 'CAT1' }),
      baseItem({ id: 'b', conditionGrade: 'C', ebayCategoryId: 'CAT1' }),
    ]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([]);
    expect(logs().filter((l) => l.includes('would push'))).toHaveLength(2);
    expect(logs().some((l) => l.includes('2 item(s) with an eBay condition'))).toBe(true);
  });

  it('flags drift when the item has no eBay category to remap against', async () => {
    ebayCondition = 'USED_VERY_GOOD'; // would push USED_GOOD
    mockPrisma.item.findMany.mockResolvedValue([baseItem()]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([]);
    expect(logs().some((l) => l.includes('1 item(s) with an eBay condition'))).toBe(true);
  });

  it('an item in sync (eBay shows exactly what we would push) is silent', async () => {
    ebayCondition = 'USED_VERY_GOOD';
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ conditionGrade: 'B' })]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([]);
    expect(logs().some((l) => l.includes('differs from FindA.Sale'))).toBe(false);
  });

  it('recognizes eBay returning a numeric id instead of an enum name', async () => {
    ebayCondition = '4000';
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ conditionGrade: 'B' })]);
    await pullSyncForOrganizer('org1');
    expect(logs().some((l) => l.includes('differs from FindA.Sale'))).toBe(false);
  });

  it('a failing category lookup is non-fatal and the drift is still only logged', async () => {
    mockAccepted.byCategory['CAT1'] = ['USED_EXCELLENT'];
    mockAccepted.throws = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ebayCondition = 'USED_EXCELLENT';
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ conditionGrade: 'C', ebayCategoryId: 'CAT1' })]);
    await pullSyncForOrganizer('org1');
    warn.mockRestore();
    expect(updateData()).toEqual([]);
    expect(logs().some((l) => l.includes('1 item(s) with an eBay condition'))).toBe(true);
  });

  it('creates no notification for condition drift', async () => {
    ebayCondition = 'NEW';
    mockPrisma.item.findMany.mockResolvedValue([baseItem()]);
    await pullSyncForOrganizer('org1');
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('price, title and description still sync, unchanged', async () => {
    (global as any).fetch = jest.fn(async (url: string) => {
      const p = decodeURIComponent(url.split('path=')[1] ?? '');
      if (p.includes('/offer/')) return { ok: true, status: 200, json: async () => ({ sku: 'SKU1', pricingSummary: { price: { value: '35' } } }) };
      return { ok: true, status: 200, json: async () => ({ product: { title: 'New T', description: 'New D' }, condition: 'USED_GOOD' }) };
    });
    mockPrisma.item.findMany.mockResolvedValue([baseItem()]);
    await pullSyncForOrganizer('org1');
    expect(updateData()).toEqual([{ price: 35, title: 'New T', description: 'New D' }]);
  });

  it('hold: a held item is skipped entirely, even with a blank condition', async () => {
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ condition: null, ebaySyncHeldAt: new Date() })]);
    await pullSyncForOrganizer('org1');
    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('dirty: a content-dirty item does not fetch the inventory item, so no condition fill or drift check runs', async () => {
    ebayCondition = 'NEW';
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ condition: null, ebayContentDirtyAt: new Date() })]);
    await pullSyncForOrganizer('org1');
    const urls = ((global as any).fetch as jest.Mock).mock.calls.map((c) => decodeURIComponent(String(c[0])));
    expect(urls.some((u) => u.includes('/inventory_item/'))).toBe(false);
    expect(updateData().every((d: any) => !('condition' in d))).toBe(true);
  });
});

describe('source guards', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
  const controller = read('../controllers/ebayController.ts');
  const cron = read('../jobs/ebayListingSyncCron.ts');

  it('the old inbound grade maps are gone from the controller', () => {
    expect(controller).not.toMatch(/tradingConditionMap/);
    expect(controller).not.toMatch(/condMapEnrich/);
    expect(controller).not.toMatch(/'LIKE_NEW':\s*'A'/);
    expect(controller).not.toMatch(/'USED_EXCELLENT':\s*'B'/);
    expect(controller).not.toMatch(/'FOR_PARTS_OR_NOT_WORKING':\s*'D'/);
    expect(controller).not.toMatch(/'3000':\s*'A'/);
    expect(controller).not.toMatch(/'1000':\s*'S'/);
    expect(controller).not.toMatch(/'NEW':\s*'S'/);
    expect(controller).not.toMatch(/conditionMap\[ebayItem\.condition\]/);
    expect(controller).not.toMatch(/conditionGrade === 'S' \? 'NEW'/);
  });

  it('the controller uses the shared helper on the Inventory import, Trading import, backfill and enrich paths', () => {
    expect(controller).toMatch(/from '\.\.\/utils\/ebayConditionImport'/);
    expect((controller.match(/canonicalFromEbayCondition\(/g) || []).length).toBeGreaterThanOrEqual(3);
    // The Trading import calls fillBlankCondition directly; the enrich pass reaches it through planEnrichWrites (utils/ebayEnrichPlan.ts).
    expect((controller.match(/fillBlankCondition\(/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(controller).toMatch(/planEnrichWrites\(item,/);
    expect(read('../utils/ebayEnrichPlan.ts')).toMatch(/fillBlankCondition\(/);
    expect(controller).toMatch(/condition=\$\{condition \|\| 'none'\}, grade=\$\{conditionGrade \|\| 'none'\}/);
  });

  it('every fillBlankCondition caller selects ebayOfferId (enrich select and the Trading lookup)', () => {
    expect(controller).toMatch(/select: \{ id: true, ebayListingId: true,[^}]*condition: true, conditionGrade: true, ebayOfferId: true,/);
  });

  it('the cron no longer maps or writes condition from eBay', () => {
    expect(cron).not.toMatch(/mapEbayConditionToFas/);
    expect(cron).not.toMatch(/updates\.condition\s*=\s*fasCond/);
    expect(cron).not.toMatch(/updates\.conditionGrade\s*=(?!\s*blankFill)/);
    expect(cron).toMatch(/fillBlankCondition\(/);
    expect(cron).toMatch(/ensureConditionValidForCategory\(desired, item\.ebayCategoryId\)/);
  });

  it('the cron keeps its hold and dirty guards', () => {
    expect(cron).toMatch(/if \(item\.ebaySyncHeldAt\)/);
    expect(cron).toMatch(/if \(sku && !item\.ebayContentDirtyAt\)/);
  });

  it('the shared helper has no prisma or network dependency', () => {
    const helper = read('../utils/ebayConditionImport.ts');
    expect(helper).not.toMatch(/^import .*(prisma|axios|node-fetch|services\/)/m);
    expect(helper).not.toMatch(/\bfetch\(|\bawait\b/);
  });

  it('normalizeCondition still agrees with the canonical set the helper returns', () => {
    for (const r of TABLE) {
      expect(normalizeCondition(r[1]).condition).toBe(r[1]);
    }
  });
});
