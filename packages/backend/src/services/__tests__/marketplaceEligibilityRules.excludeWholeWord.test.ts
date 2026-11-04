/**
 * 2026-11-04: excludeKeywords are matched whole-word and case-insensitively.
 *
 * They used plain substring matching, and an exclude vetoes the whole rule, so 'ring' inside
 * "Spring assisted knife" or 'gunmetal' anywhere in a weapon title let prohibited items through.
 */
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import { checkEligibility, matchesExcludeKeyword, EligibilityPlatform } from '../marketplaceEligibilityRules';

function eligible(platform: EligibilityPlatform, title: string, category = 'Collectibles'): boolean {
  return checkEligibility(platform, { category, ebayCategoryId: null, title }).eligible;
}

describe('matchesExcludeKeyword', () => {
  it('matches whole words, any case, with a plural tail', () => {
    expect(matchesExcludeKeyword('Vintage Gold RING', 'ring')).toBe(true);
    expect(matchesExcludeKeyword('two silver rings', 'ring')).toBe(true);
    expect(matchesExcludeKeyword('coin tubes lot', 'tube')).toBe(true);
    expect(matchesExcludeKeyword('wall-mounted rack', 'mounted')).toBe(true);
    expect(matchesExcludeKeyword('butter knife set', 'butter knife')).toBe(true);
    expect(matchesExcludeKeyword('Gunmetal grey', 'gunmetal')).toBe(true);
  });

  it('does not match a keyword embedded in another word', () => {
    expect(matchesExcludeKeyword('spring assisted knife', 'ring')).toBe(false);
    expect(matchesExcludeKeyword('guitar string', 'ring')).toBe(false);
    expect(matchesExcludeKeyword('boxing gloves', 'ring')).toBe(false);
    expect(matchesExcludeKeyword('unmounted blade', 'mounted')).toBe(false);
    expect(matchesExcludeKeyword('kitchenware', 'kitchen')).toBe(false);
  });

  it('keeps a punctuation edge literal', () => {
    expect(matchesExcludeKeyword('brand new, sealed', 'new,')).toBe(true);
    expect(matchesExcludeKeyword('newspaper', 'new,')).toBe(false);
  });
});

describe('weapons rules are no longer vetoed by an embedded exclude', () => {
  it('Mercari: "spring" does not trip the "ring" jewelry carve-out', () => {
    expect(eligible('MERCARI', 'Spring Assisted Pocket Knife')).toBe(false);
  });

  it('Mercari: a real jewelry piece still uses the carve-out', () => {
    expect(eligible('MERCARI', 'Sterling knife pendant ring', 'Jewelry')).toBe(true);
  });

  it('Craigslist: a gunmetal weapon is still blocked, a gunmetal golf club is not', () => {
    expect(eligible('CRAIGSLIST', 'Gunmetal grey golf driver', 'Sporting Goods')).toBe(true);
    expect(eligible('FACEBOOK', 'Gunmetal grey golf driver', 'Sporting Goods')).toBe(true);
  });
});
