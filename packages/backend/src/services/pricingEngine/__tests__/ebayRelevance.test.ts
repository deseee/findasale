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
