/**
 * ADR-134 batch B5, acceptance (4): a COIN item must produce byte-identical output to today.
 *
 * This file was written BEFORE resolveCoinConditionOverride gained its card branch, from a
 * line-by-line read of the pre-change resolver. It pins the pre-change coin results with
 * toStrictEqual (a stray extra key, even one set to undefined, fails the test). If this file
 * fails after the card work, the coin path changed and the change must be reverted.
 *
 * Fixtures are SYNTHETIC: the descriptor and value ids below are made up and only follow the shape
 * of eBay's getItemConditionPolicies response (names mirror the live-verified category 11981
 * comments in ebayPublishService.ts). No network and no database: fetch and the two leaf modules
 * the service imports are mocked.
 *
 * Pre-existing behavior pinned on purpose, NOT endorsed: the ungraded keyword rules run against the
 * un-lowercased item text, so capitalized wording ("Extremely Fine") misses the keyword and takes the
 * default value. Case F below pins that. Changing it is a separate, deliberate decision.
 */

jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../services/ebayHttp', () => ({
  ebayProxyUrl: (p: string) => decodeURIComponent(p),
  ebayProxyHeaders: () => ({}),
  ebayUserHeaders: () => ({}),
  getEbayAccessToken: async () => 'test-token',
}));

import { resolveCoinConditionOverride } from '../services/ebayPublishService';

type Desc = {
  conditionDescriptorId: string;
  conditionDescriptorName: string;
  conditionDescriptorConstraint: { usage: string };
  conditionDescriptorValues: Array<{
    conditionDescriptorValueId: string;
    conditionDescriptorValueName: string;
    conditionDescriptorValueConstraints?: Array<{ applicableToConditionDescriptorValueIds: string[] }>;
  }>;
};

const val = (id: string, name: string, applicable?: string[]) => ({
  conditionDescriptorValueId: id,
  conditionDescriptorValueName: name,
  ...(applicable ? { conditionDescriptorValueConstraints: [{ applicableToConditionDescriptorValueIds: applicable }] } : {}),
});

const desc = (id: string, name: string, usage: string, values: Desc['conditionDescriptorValues']): Desc => ({
  conditionDescriptorId: id,
  conditionDescriptorName: name,
  conditionDescriptorConstraint: { usage },
  conditionDescriptorValues: values,
});

const COIN_GRADED: Desc[] = [
  desc('1', 'Professional Grader', 'REQUIRED', [
    val('1', 'Professional Coin Grading Service (PCGS)'),
    val('2', 'Numismatic Guaranty Corporation (NGC)'),
  ]),
  desc('3', 'Letter Grade', 'REQUIRED', [val('30', 'MS/PR'), val('31', 'AU')]),
  desc('4', 'Numerical Grade', 'REQUIRED', [
    val('40', '65', ['30']),
    val('41', 'None', ['30', '31']),
    val('42', '58', ['31']),
  ]),
];

const COIN_UNGRADED: Desc[] = [
  desc('2', 'Coin Condition', 'REQUIRED', [
    val('7', 'Uncirculated'),
    val('8', 'Extremely Fine to About Uncirculated'),
    val('9', 'Fine to Very Fine'),
    val('10', 'Below Fine'),
  ]),
  desc('5', 'Certification Number', 'OPTIONAL', []),
];

const policyFor = (categoryId: string) => {
  if (categoryId === '11981') {
    return {
      itemConditionPolicies: [
        {
          categoryId,
          itemConditions: [
            { conditionId: '2750', conditionDescriptors: COIN_GRADED },
            { conditionId: '4000', conditionDescriptors: COIN_UNGRADED },
          ],
        },
      ],
    };
  }
  // A category with conditions but no descriptor requirement at all.
  return { itemConditionPolicies: [{ categoryId, itemConditions: [{ conditionId: '3000' }, { conditionId: '5000' }] }] };
};

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (global as any).fetch = jest.fn(async (url: string) => {
    const m = /%7B(\d+)%7D/.exec(String(url));
    const categoryId = m ? m[1] : '0';
    if (categoryId === '55555') {
      return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
    }
    return { ok: true, status: 200, text: async () => '', json: async () => policyFor(categoryId) };
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('resolveCoinConditionOverride, coin cases (pre-change snapshot)', () => {
  it('A: ungraded, "uncirculated" in the title resolves Uncirculated', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'morgan dollar uncirculated', description: null, tags: [] });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '2', values: ['7'] }],
    });
  });

  it('B: ungraded, "extremely fine" resolves Extremely Fine to About Uncirculated', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'peace dollar extremely fine', description: null, tags: [] });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '2', values: ['8'] }],
    });
  });

  it('C: ungraded, "very fine" resolves Fine to Very Fine', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'seated dime very fine', description: null, tags: [] });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '2', values: ['9'] }],
    });
  });

  it('D: ungraded, "poor" resolves Below Fine', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'barber half poor', description: null, tags: [] });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '2', values: ['10'] }],
    });
  });

  it('E: ungraded with no grade language takes the Fine to Very Fine default', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'silver round', description: null, tags: [] });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '2', values: ['9'] }],
    });
  });

  it('F: capitalized grade wording misses the keyword rules (pre-existing quirk, pinned)', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'Extremely Fine Morgan', description: null, tags: [] });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '2', values: ['9'] }],
    });
  });

  it('G: graded PCGS MS65 resolves LIKE_NEW with grader, letter grade and numeric grade', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'PCGS MS65 Morgan Dollar', description: null, tags: [] });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'LIKE_NEW',
      conditionDescriptors: [
        { name: '1', values: ['1'] },
        { name: '3', values: ['30'] },
        { name: '4', values: ['40'] },
      ],
    });
  });

  it('H: graded with a number eBay does not list for that letter grade falls back to "None"', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'PCGS MS64 Morgan Dollar', description: null, tags: [] });
    expect(r).toStrictEqual({
      status: 'resolved',
      condition: 'LIKE_NEW',
      conditionDescriptors: [
        { name: '1', values: ['1'] },
        { name: '3', values: ['30'] },
        { name: '4', values: ['41'] },
      ],
    });
  });

  it('I: a grading service named with no parseable grade is unresolved, never ungraded', async () => {
    const r = await resolveCoinConditionOverride('11981', { title: 'NGC Morgan Dollar', description: null, tags: [] });
    expect(r.status).toBe('unresolved');
    expect(Object.keys(r).sort()).toStrictEqual(['reason', 'status']);
    expect((r as { reason: string }).reason).toContain('will not guess a grade');
  });

  it('J: a category with no descriptor policy is not_applicable', async () => {
    const r = await resolveCoinConditionOverride('12345', { title: 'anything', description: null, tags: [] });
    expect(r).toStrictEqual({ status: 'not_applicable' });
  });

  it('K: a failed policy fetch is not_applicable (no descriptors, no throw)', async () => {
    const r = await resolveCoinConditionOverride('55555', { title: 'anything', description: null, tags: [] });
    expect(r).toStrictEqual({ status: 'not_applicable' });
  });
});
