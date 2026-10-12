/**
 * eBay comp relevance filter (2026-10-11). Pure functions: no network, no database, no mocks.
 * NOT executed when written (jest cannot run on the authoring device); CI is the first real run.
 */
import {
  tokenizeTitle,
  extractYears,
  requiredOverlap,
  passesTokenOverlap,
  isExcludedComp,
  medianOf,
  trimPriceOutliers,
  filterRelevantComps,
  MIN_RELEVANT_COMPS,
  MAX_SPREAD_RATIO,
  percentileOf,
  priceSpreadRatio,
  isSpreadTooWide,
  stableShadowQuery,
} from '../adapters/ebayRelevance';

const c = (title: string, price: number) => ({ title, price });

describe('tokenizeTitle', () => {
  it('drops stopwords and generic words, lowercases, de-duplicates and stems a trailing s', () => {
    expect(tokenizeTitle('Vintage Wood Folding Wood Divider Screen, Staff Only')).toEqual(['wood', 'folding', 'divider', 'screen']);
    expect(tokenizeTitle('BCW Card Sleeves')).toEqual(['bcw', 'card', 'sleeve']);
  });
  it('handles empty, null and punctuation-only input', () => {
    expect(tokenizeTitle('')).toEqual([]);
    expect(tokenizeTitle(null)).toEqual([]);
    expect(tokenizeTitle(undefined)).toEqual([]);
    expect(tokenizeTitle(' - , . ')).toEqual([]);
    expect(tokenizeTitle('Vintage used lot')).toEqual([]);
  });
});

describe('requiredOverlap / passesTokenOverlap', () => {
  it('requires all tokens for 1-2 token titles and 40% (min 2) beyond that', () => {
    expect(requiredOverlap(1)).toBe(1);
    expect(requiredOverlap(2)).toBe(2);
    expect(requiredOverlap(3)).toBe(2);
    expect(requiredOverlap(7)).toBe(3);
    expect(requiredOverlap(10)).toBe(4);
  });
  it('accepts a relevant comp and rejects an unrelated one', () => {
    expect(passesTokenOverlap('Mouse Trap Board Game, Milton Bradley 2005', 'Mouse Trap Board Game Milton Bradley Complete')).toBe(true);
    expect(passesTokenOverlap('Mouse Trap Board Game, Milton Bradley 2005', 'Monopoly Board Game Hasbro')).toBe(false);
  });
  it('a short item title needs every token; an empty or generic-only item title accepts nothing', () => {
    expect(passesTokenOverlap('Card Sleeves', 'BCW Card Sleeves 100ct')).toBe(true);
    expect(passesTokenOverlap('Card Sleeves', 'Card Binder')).toBe(false);
    expect(passesTokenOverlap('', 'Anything at all')).toBe(false);
    expect(passesTokenOverlap('Vintage', 'Vintage thing')).toBe(false);
  });
  it('treats an empty comp title as no overlap', () => {
    expect(passesTokenOverlap('Saloon Doors', '')).toBe(false);
  });
});

describe('isExcludedComp', () => {
  it('drops parts / incomplete / replacement / manual-only comps', () => {
    for (const t of [
      'Mouse Trap Game FOR PARTS',
      'Mouse Trap Game incomplete missing pieces',
      'Mouse Trap replacement pieces',
      'Mouse Trap instructions only',
      'Mouse Trap box only',
      'Mouse Trap parts or repair',
    ]) {
      expect(isExcludedComp('Mouse Trap Board Game', t)).toBe(true);
    }
  });
  it('keeps those comps when the item title itself says so', () => {
    expect(isExcludedComp('Mouse Trap Game for parts', 'Mouse Trap Game FOR PARTS')).toBe(false);
    expect(isExcludedComp('Mouse Trap Game incomplete', 'Mouse Trap incomplete game')).toBe(false);
  });
  it('drops a different-year edition but keeps same-year and year-less comps', () => {
    const item = 'Mouse Trap Board Game, Milton Bradley 2005';
    expect(isExcludedComp(item, 'Mouse Trap Game Hasbro 2016')).toBe(true);
    expect(isExcludedComp(item, 'Mouse Trap Game Milton Bradley 2005')).toBe(false);
    expect(isExcludedComp(item, 'Mouse Trap Game Milton Bradley')).toBe(false);
    expect(isExcludedComp('Mouse Trap Board Game', 'Mouse Trap Game 2016')).toBe(false); // item names no year
  });
  it('tolerates empty titles', () => {
    expect(isExcludedComp('', '')).toBe(false);
  });
});

describe('extractYears / medianOf / trimPriceOutliers', () => {
  it('extracts only 19xx/20xx four-digit years', () => {
    expect(extractYears('Game 2005 and 1999 edition 12345 3000')).toEqual(['2005', '1999']);
    expect(extractYears('')).toEqual([]);
  });
  it('computes odd and even medians, NaN when empty', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([1, 2, 3, 10])).toBe(2.5);
    expect(medianOf([])).toBeNaN();
  });
  it('trims outside 0.4x to 2.5x of the median and leaves fewer than 3 comps alone', () => {
    const kept = trimPriceOutliers([c('a', 5), c('b', 60), c('c', 63), c('d', 70), c('e', 250)]);
    expect(kept.map(x => x.price)).toEqual([60, 63, 70]);
    const two = [c('a', 5), c('b', 500)];
    expect(trimPriceOutliers(two)).toBe(two);
    expect(trimPriceOutliers([])).toEqual([]);
  });
});

describe('filterRelevantComps', () => {
  it('Mouse Trap: drops other-edition, parts and unrelated comps and reports the post-filter count', () => {
    const comps = [
      c('Mouse Trap Board Game Milton Bradley 2005 Complete', 24),
      c('Mouse Trap Game Milton Bradley Vintage', 28),
      c('Mouse Trap Board Game Milton Bradley 2005', 26),
      c('Mouse Trap Game Hasbro 2016 easier setup', 19),
      c('Mouse Trap Game FOR PARTS missing pieces', 6),
      c('Mouse Trap replacement parts lot', 8),
      c('Monopoly Board Game', 22),
    ];
    const r = filterRelevantComps('Mouse Trap Board Game, Milton Bradley 2005', comps);
    expect(r.kept.map(x => x.price)).toEqual([24, 28, 26]);
    expect(r.stats.input).toBe(7);
    expect(r.stats.kept).toBe(3);
    expect(r.stats.sparse).toBe(false);
  });

  it('screen: trims the $38 and $995 extremes around a $300 median', () => {
    const titles = 'Folding Wood Divider Screen';
    const comps = [38, 250, 280, 300, 320, 350, 995].map((p, i) => c(`${titles} ${i}`, p));
    const r = filterRelevantComps('Vintage Wood Folding Wood Divider Screen, Staff Only', comps);
    expect(r.kept.map(x => x.price)).toEqual([250, 280, 300, 320, 350]);
  });

  it('card sleeves: drops the $250 bulk outlier', () => {
    const comps = [4.5, 5, 5.5, 6, 250].map(p => c('BCW Card Sleeves 100 count', p));
    const r = filterRelevantComps('BCW Card Sleeves', comps);
    expect(r.kept.map(x => x.price)).toEqual([4.5, 5, 5.5, 6]);
  });

  it('flags sparse results (< 3 kept) without back-filling dropped comps', () => {
    const r = filterRelevantComps('Mouse Trap Board Game', [
      c('Mouse Trap Board Game', 20),
      c('Mouse Trap Board Game for parts', 5),
      c('Totally different', 30),
    ]);
    expect(r.kept).toHaveLength(1);
    expect(r.stats.sparse).toBe(true);
    expect(MIN_RELEVANT_COMPS).toBe(3);
  });

  it('handles empty input, bad prices and an empty item title', () => {
    expect(filterRelevantComps('Anything', []).kept).toEqual([]);
    expect(filterRelevantComps('Anything', []).stats.sparse).toBe(true);
    expect(filterRelevantComps('Saloon Doors', [c('Saloon Doors', 0), c('Saloon Doors', NaN as number)]).kept).toEqual([]);
    expect(filterRelevantComps('', [c('Saloon Doors', 100)]).kept).toEqual([]);
    expect(filterRelevantComps('Saloon Doors', undefined as unknown as { title: string; price: number }[]).kept).toEqual([]);
  });
});

// ---- Dispersion check (2026-10-11). Price sets are reconstructed from the live 2026-10-11 comp sets. ----
const MOUSE_TRAP_PRICES = [10, 14, 17, 20, 22, 24, 26, 30, 35, 50]; // median 23, tight
const BANKERS_LAMP_PRICES = [30, 36, 42, 48, 52, 58, 65, 72, 80, 90]; // median 55, tight
const SALOON_PRICES = [18.99, 60, 150, 260, 400, 500, 650, 800, 950, 1144]; // median 450, mixed junk

describe('percentileOf / priceSpreadRatio / isSpreadTooWide', () => {
  it('interpolates percentiles and is order independent', () => {
    expect(percentileOf([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(percentileOf([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentileOf([1, 2, 3, 4, 5], 0.75)).toBe(4);
    expect(percentileOf([], 0.5)).toBeNaN();
  });
  it('MAX_SPREAD_RATIO is 3', () => {
    expect(MAX_SPREAD_RATIO).toBe(3);
  });
  it('Mouse Trap and banker lamp sets pass', () => {
    expect(priceSpreadRatio(MOUSE_TRAP_PRICES) as number).toBeCloseTo(1.63, 1);
    expect(priceSpreadRatio(BANKERS_LAMP_PRICES) as number).toBeCloseTo(1.61, 1);
    expect(isSpreadTooWide(priceSpreadRatio(MOUSE_TRAP_PRICES))).toBe(false);
    expect(isSpreadTooWide(priceSpreadRatio(BANKERS_LAMP_PRICES))).toBe(false);
  });
  it('the saloon doors set ($19 to $1,144, median $450) fails', () => {
    expect(priceSpreadRatio(SALOON_PRICES) as number).toBeCloseTo(4.3, 1);
    expect(isSpreadTooWide(priceSpreadRatio(SALOON_PRICES))).toBe(true);
  });
  it('one bulk-lot outlier among tight comps does not fail the set (the trim absorbs it)', () => {
    expect(isSpreadTooWide(priceSpreadRatio([10, 14, 17, 20, 22, 24, 26, 30, 35, 250]))).toBe(false);
  });
  it('is null with fewer than 3 usable prices and never judges a missing ratio', () => {
    expect(priceSpreadRatio([10, 40])).toBeNull();
    expect(priceSpreadRatio([10, 0, NaN, 40])).toBeNull();
    expect(isSpreadTooWide(null)).toBe(false);
    expect(isSpreadTooWide(undefined)).toBe(false);
    expect(isSpreadTooWide(NaN)).toBe(false);
    expect(isSpreadTooWide(MAX_SPREAD_RATIO)).toBe(false);
    expect(isSpreadTooWide(MAX_SPREAD_RATIO + 0.01)).toBe(true);
  });
});

describe('filterRelevantComps reports the pre-trim spread', () => {
  it('saloon doors: the trim keeps a mid band but spreadRatio (pre-trim) still flags the set', () => {
    const comps = SALOON_PRICES.map(p => c('Wood Partition Divider Shutters Panel', p));
    const r = filterRelevantComps('Vintage Wood Partition Divider Shutters, Staff Only, Set of 2', comps);
    expect(r.stats.afterExclusions).toBe(10);
    expect(r.kept.length).toBeLessThan(10);
    expect(r.stats.spreadRatio as number).toBeGreaterThan(MAX_SPREAD_RATIO);
  });
  it('Mouse Trap and banker lamp sets: spreadRatio stays under the limit', () => {
    const mt = filterRelevantComps('Mouse Trap Board Game Milton Bradley', MOUSE_TRAP_PRICES.map(p => c('Mouse Trap Board Game Milton Bradley', p)));
    const lamp = filterRelevantComps('Banker Lamp Green Glass Shade', BANKERS_LAMP_PRICES.map(p => c('Banker Lamp Green Glass Shade', p)));
    expect(mt.stats.spreadRatio as number).toBeLessThanOrEqual(MAX_SPREAD_RATIO);
    expect(lamp.stats.spreadRatio as number).toBeLessThanOrEqual(MAX_SPREAD_RATIO);
    expect(mt.kept.length).toBe(10);
    expect(lamp.kept.length).toBe(10);
  });
  it('is null when fewer than 3 relevant comps', () => {
    expect(filterRelevantComps('Saloon Doors', [c('Saloon Doors', 100)]).stats.spreadRatio).toBeNull();
    expect(filterRelevantComps('Anything', []).stats.spreadRatio).toBeNull();
  });
});

describe('stableShadowQuery', () => {
  it('drops details the prior title did not have ("Set of 2") and keeps the shared tokens in the new order', () => {
    expect(stableShadowQuery(
      'Vintage Wood Partition Divider Shutters, Staff Only, Set of 2',
      'Wooden Staff Only Partition Divider, Vintage Wood Shutters',
    )).toBe('wood partition divider shutter');
  });
  it('is deterministic', () => {
    const a = stableShadowQuery('Vintage Wood Partition Divider Shutters, Set of 2', 'Wood Partition Divider Shutters');
    const b = stableShadowQuery('Vintage Wood Partition Divider Shutters, Set of 2', 'Wood Partition Divider Shutters');
    expect(a).toBe(b);
  });
  it('returns the new title unchanged with no prior title, an empty prior, or nothing to drop', () => {
    expect(stableShadowQuery('Mouse Trap Board Game', undefined)).toBe('Mouse Trap Board Game');
    expect(stableShadowQuery('Mouse Trap Board Game', null)).toBe('Mouse Trap Board Game');
    expect(stableShadowQuery('Mouse Trap Board Game', '  ')).toBe('Mouse Trap Board Game');
    expect(stableShadowQuery('Mouse Trap Board Game', 'Mouse Trap Board Game, Milton Bradley')).toBe('Mouse Trap Board Game');
  });
  it('uses the new title when fewer than 2 tokens are shared (the item was genuinely re-identified)', () => {
    expect(stableShadowQuery('Banker Lamp Green Glass Shade', 'Saloon Doors Wood')).toBe('Banker Lamp Green Glass Shade');
    expect(stableShadowQuery('Banker Lamp Green Glass Shade', 'Green Cup')).toBe('Banker Lamp Green Glass Shade');
  });
});
