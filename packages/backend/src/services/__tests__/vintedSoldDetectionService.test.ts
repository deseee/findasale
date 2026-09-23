/**
 * vintedSoldDetectionService.ts -- unit tests (S-EXT-VINTED-SOLD-DETECT, 2026-09-23).
 * Prisma and the shared sale helper are mocked at the module boundary; every test injects deps,
 * so only the matching / result logic is exercised.
 */

jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn() }));

import {
  normalizeListingTitle,
  buildVintedSoldMatchContext,
  matchVintedSoldEntry,
  processVintedSoldReport,
  sanitizeVintedSoldEntries,
  SOLD_VIA_VINTED,
} from '../vintedSoldDetectionService';

const MR_NATURAL = 'Mr. Natural #2  R. Crumb (San Francisco Comic Book Company Oct 1971)';

describe('normalizeListingTitle', () => {
  it('collapses case, whitespace and punctuation', () => {
    expect(normalizeListingTitle(MR_NATURAL)).toBe('mr natural 2 r crumb san francisco comic book company oct 1971');
    expect(normalizeListingTitle('  MR NATURAL #2 r. crumb (San Francisco Comic Book Company, Oct 1971) ')).toBe(
      normalizeListingTitle(MR_NATURAL),
    );
  });
  it('folds diacritics', () => {
    expect(normalizeListingTitle('Crème Brûlée Dish')).toBe('creme brulee dish');
  });
});

describe('matchVintedSoldEntry', () => {
  const items = [
    { id: 'item_mr', title: MR_NATURAL, status: 'AVAILABLE' },
    { id: 'item_dup_a', title: 'Blue Glass Vase', status: 'AVAILABLE' },
    { id: 'item_dup_b', title: 'blue glass vase!', status: 'AVAILABLE' },
    { id: 'item_linked', title: 'Brass Candle Holder Pair', status: 'AVAILABLE' },
    { id: 'item_other_id', title: 'Walnut Jewelry Box Vintage', status: 'AVAILABLE' },
  ];
  const jobs = [
    { itemId: 'item_linked', remoteListingId: '555' },
    { itemId: 'item_other_id', remoteListingId: '777' },
  ];
  const ctx = buildVintedSoldMatchContext(items, jobs);

  it('matches a unique normalized title', () => {
    expect(matchVintedSoldEntry({ vintedId: '9879473979', title: 'mr natural #2 r crumb (san francisco comic book company oct 1971)' }, ctx))
      .toEqual({ kind: 'matched', itemId: 'item_mr', via: 'title' });
  });

  it('reports a duplicated title as ambiguous and never picks one', () => {
    expect(matchVintedSoldEntry({ vintedId: '1', title: 'Blue Glass Vase' }, ctx))
      .toEqual({ kind: 'ambiguous', candidateCount: 2, via: 'title' });
  });

  it('prefers the recorded Vinted listing id over the title', () => {
    // Title points at item_mr, but the id is recorded on item_linked: the id wins.
    expect(matchVintedSoldEntry({ vintedId: '555', title: MR_NATURAL }, ctx))
      .toEqual({ kind: 'matched', itemId: 'item_linked', via: 'remoteId' });
  });

  it('refuses a title match whose item has a different Vinted id on record', () => {
    expect(matchVintedSoldEntry({ vintedId: '888', title: 'Walnut Jewelry Box Vintage' }, ctx))
      .toEqual({ kind: 'notFound', reason: 'title_match_has_different_vinted_id' });
  });

  it('returns notFound for no match and for too-short titles', () => {
    expect(matchVintedSoldEntry({ vintedId: '2', title: 'Something Else Entirely' }, ctx)).toEqual({ kind: 'notFound', reason: 'no_match' });
    expect(matchVintedSoldEntry({ vintedId: '3', title: 'Vase' }, ctx)).toEqual({ kind: 'notFound', reason: 'title_too_short' });
  });
});

describe('sanitizeVintedSoldEntries', () => {
  it('keeps numeric ids only and de-duplicates', () => {
    expect(sanitizeVintedSoldEntries([
      { vintedId: 9879473979, title: 'A' },
      { vintedId: '9879473979', title: 'dup' },
      { vintedId: 'abc', title: 'bad' },
      null,
      { vintedId: '42', title: 7 },
    ])).toEqual([{ vintedId: '9879473979', title: 'A' }, { vintedId: '42', title: '' }]);
  });
});

describe('processVintedSoldReport', () => {
  function deps(overrides: Record<string, any> = {}) {
    return {
      loadCandidateItems: jest.fn(async () => [
        { id: 'item_mr', title: MR_NATURAL, status: 'AVAILABLE' },
        { id: 'item_dup_a', title: 'Blue Glass Vase', status: 'AVAILABLE' },
        { id: 'item_dup_b', title: 'Blue Glass Vase', status: 'AVAILABLE' },
      ]),
      loadVintedJobs: jest.fn(async () => []),
      closeVintedListingRecord: jest.fn(async () => false),
      commitSale: jest.fn(async () => ({ alreadyCommitted: false })),
      getItemStatus: jest.fn(async () => 'SOLD'),
      ...overrides,
    };
  }

  it('commits a unique title match with lastSoldVia VINTED and closes the Vinted record first', async () => {
    const order: string[] = [];
    const d = deps({
      closeVintedListingRecord: jest.fn(async () => { order.push('close'); return true; }),
      commitSale: jest.fn(async () => { order.push('commit'); return { alreadyCommitted: false }; }),
    });
    const r = await processVintedSoldReport('org_1', [{ vintedId: '9879473979', title: MR_NATURAL }], d);
    expect(r).toEqual([expect.objectContaining({ result: 'sold', itemId: 'item_mr', via: 'title', vintedListingClosed: true })]);
    expect(d.commitSale).toHaveBeenCalledWith('item_mr', SOLD_VIA_VINTED);
    expect(order).toEqual(['close', 'commit']);
    expect(d.loadCandidateItems).toHaveBeenCalledWith('org_1');
  });

  it('is idempotent: an already SOLD item reports alreadySold', async () => {
    const d = deps({ commitSale: jest.fn(async () => ({ alreadyCommitted: true })) });
    const r = await processVintedSoldReport('org_1', [{ vintedId: '9879473979', title: MR_NATURAL }], d);
    expect(r[0].result).toBe('alreadySold');
  });

  it('never commits an ambiguous title', async () => {
    const d = deps();
    const r = await processVintedSoldReport('org_1', [{ vintedId: '5', title: 'Blue Glass Vase' }], d);
    expect(r[0].result).toBe('ambiguous');
    expect(d.commitSale).not.toHaveBeenCalled();
    expect(d.closeVintedListingRecord).not.toHaveBeenCalled();
  });

  it('keeps going when one entry fails and reports it as error', async () => {
    const d = deps({ commitSale: jest.fn(async () => { throw new Error('boom'); }) });
    const r = await processVintedSoldReport('org_1', [
      { vintedId: '9879473979', title: MR_NATURAL },
      { vintedId: '6', title: 'Nothing Like This Here' },
    ], d);
    expect(r.map((x) => x.result)).toEqual(['error', 'notFound']);
  });

  it('refuses to run without an organizer scope', async () => {
    await expect(processVintedSoldReport('', [{ vintedId: '1', title: MR_NATURAL }], deps())).rejects.toThrow();
  });
});
