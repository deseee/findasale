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
  processVintedSoldTitleReport,
  sanitizeVintedSoldEntries,
  markItemsSoldOnVinted,
  sanitizeManualSoldItemIds,
  VINTED_MANUAL_SOLD_MAX_ITEMS,
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

// 2026-10-12: live-row aware matching and token-overlap fallback (Nickel coin tube / multi-unit BCW relists).
describe('live-listing aware matching', () => {
  const T0 = new Date('2026-10-01T00:00:00Z');
  const T1 = new Date('2026-10-05T00:00:00Z');
  const T2 = new Date('2026-10-10T00:00:00Z');
  const items = [
    { id: 'nickel', title: 'BCW Nickel Size Coin Tube Crystal Clear, Qty 1', status: 'AVAILABLE' },
    { id: 'dime', title: 'BCW Dime Size Coin Tube Crystal Clear, Qty 1', status: 'AVAILABLE' },
    { id: 'penny', title: 'BCW Penny Size Coin Tube Crystal Clear, Qty 1', status: 'AVAILABLE' },
    { id: 'relisted', title: 'BCW Quarter Size Coin Tube Crystal Clear Qty 48', status: 'AVAILABLE' },
    { id: 'notlive', title: 'BCW Half Dollar Coin Tube Crystal Clear Qty 1', status: 'AVAILABLE' },
    { id: 'comic2', title: 'Mr Natural Comic Book Underground Crumb Issue 2', status: 'AVAILABLE' },
    { id: 'comic3', title: 'Mr Natural Comic Book Underground Crumb Issue 3', status: 'AVAILABLE' },
  ];
  const jobs = [
    { itemId: 'nickel', remoteListingId: '10324289174', action: 'POST', status: 'POSTED', createdAt: T1 },
    { itemId: 'dime', remoteListingId: null, action: 'POST', status: 'POSTED', createdAt: T1 },
    { itemId: 'penny', remoteListingId: null, action: 'POST', status: 'POSTED', createdAt: T1 },
    // quarter: old sold listing 111 (REMOVE row carries it), relisted live row with NO recorded id
    { itemId: 'relisted', remoteListingId: null, action: 'POST', status: 'POSTED', createdAt: T0 },
    { itemId: 'relisted', remoteListingId: '111', action: 'REMOVE', status: 'REMOVED', createdAt: T1 },
    { itemId: 'relisted', remoteListingId: null, action: 'POST', status: 'POSTED', createdAt: T2 },
    { itemId: 'notlive', remoteListingId: null, action: 'REMOVE', status: 'REMOVED', createdAt: T1 },
    { itemId: 'comic2', remoteListingId: null, action: 'POST', status: 'POSTED', createdAt: T1 },
    { itemId: 'comic3', remoteListingId: null, action: 'POST', status: 'POSTED', createdAt: T1 },
  ];
  const ctx = buildVintedSoldMatchContext(items, jobs);

  it('Nickel case: the re-worded sold e-mail title matches the ONE live item by token overlap (title-only entry)', () => {
    expect(matchVintedSoldEntry({ vintedId: '', title: 'BCW Nickel Coin Tubes, Each, Crystal Clear Storage' }, ctx))
      .toEqual({ kind: 'matched', itemId: 'nickel', via: 'titleTokens' });
  });

  it('a sibling product is never matched: Dime e-mail goes to the Dime item, not Nickel/Penny; no live Dime item -> no match', () => {
    expect(matchVintedSoldEntry({ vintedId: '', title: 'BCW Dime Coin Tubes, Each, Crystal Clear Storage' }, ctx))
      .toEqual({ kind: 'matched', itemId: 'dime', via: 'titleTokens' });
    const noDime = buildVintedSoldMatchContext(items, jobs.filter((j) => j.itemId !== 'dime'));
    expect(matchVintedSoldEntry({ vintedId: '', title: 'BCW Dime Coin Tubes, Each, Crystal Clear Storage' }, noDime))
      .toEqual({ kind: 'notFound', reason: 'no_match' });
  });

  it('only items with a LIVE Vinted listing are token candidates (Half Dollar has only a REMOVE row)', () => {
    expect(matchVintedSoldEntry({ vintedId: '', title: 'BCW Half Dollar Coin Tubes Each Crystal Clear Storage' }, ctx))
      .toEqual({ kind: 'notFound', reason: 'no_match' });
  });

  it('two equally good live candidates are ambiguous, never guessed', () => {
    const dup = buildVintedSoldMatchContext(
      [...items, { id: 'nickel2', title: 'BCW Nickel Coin Tubes Crystal Clear', status: 'AVAILABLE' }],
      [...jobs, { itemId: 'nickel2', remoteListingId: null, action: 'POST', status: 'POSTED', createdAt: T1 }],
    );
    expect(matchVintedSoldEntry({ vintedId: '', title: 'BCW Nickel Coin Tubes, Each, Crystal Clear Storage' }, dup))
      .toEqual({ kind: 'ambiguous', candidateCount: 2, via: 'titleTokens' });
  });

  it('numbers must agree: Issue 2 vs Issue 3 never cross-match', () => {
    expect(matchVintedSoldEntry({ vintedId: '', title: 'Mr Natural Comic Book Underground Crumb Issue 3 NM' }, ctx))
      .toEqual({ kind: 'matched', itemId: 'comic3', via: 'titleTokens' });
  });

  it('with an id: a live row recorded with a DIFFERENT id excludes the token candidate', () => {
    expect(matchVintedSoldEntry({ vintedId: '999', title: 'BCW Nickel Coin Tubes, Each, Crystal Clear Storage' }, ctx))
      .toEqual({ kind: 'notFound', reason: 'no_match' });
    expect(matchVintedSoldEntry({ vintedId: '10324289174', title: 'BCW Nickel Coin Tubes, Each, Crystal Clear Storage' }, ctx))
      .toEqual({ kind: 'matched', itemId: 'nickel', via: 'remoteId' });
  });

  it('a relisted multi-unit item: old sold ids on earlier rows do NOT veto a title match when the live row has no recorded id (NULL tolerated)', () => {
    expect(matchVintedSoldEntry({ vintedId: '222', title: 'BCW Quarter Size Coin Tube Crystal Clear Qty 48' }, ctx))
      .toEqual({ kind: 'matched', itemId: 'relisted', via: 'title' });
  });

  it('a live row WITH a different recorded id still refuses the exact-title match', () => {
    expect(matchVintedSoldEntry({ vintedId: '999', title: 'BCW Nickel Size Coin Tube Crystal Clear, Qty 1' }, ctx))
      .toEqual({ kind: 'notFound', reason: 'title_match_has_different_vinted_id' });
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
    expect(d.commitSale).toHaveBeenCalledWith('item_mr', SOLD_VIA_VINTED, '9879473979');
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

  it('a retry of a unit already counted for this Vinted id (alreadyCounted) is alreadySold even though the item stays AVAILABLE', async () => {
    const d = deps({
      commitSale: jest.fn(async () => ({ alreadyCommitted: true, alreadyCounted: true, noopReason: 'no_live_posted_row' })),
      getItemStatus: jest.fn(async () => 'AVAILABLE'),
    });
    const r = await processVintedSoldReport('org_1', [{ vintedId: '9879473979', title: MR_NATURAL }], d);
    expect(r[0]).toEqual(expect.objectContaining({ result: 'alreadySold', itemStatus: 'AVAILABLE', reason: 'listing_already_counted' }));
  });

  it('a guard no-op on an AVAILABLE item stays notAvailable and carries the no-op reason (visible in logs)', async () => {
    const d = deps({
      commitSale: jest.fn(async () => ({ alreadyCommitted: true, noopReason: 'relist_after_sale_guard' })),
      getItemStatus: jest.fn(async () => 'AVAILABLE'),
    });
    const r = await processVintedSoldReport('org_1', [{ vintedId: '9879473979', title: MR_NATURAL }], d);
    expect(r[0]).toEqual(expect.objectContaining({ result: 'notAvailable', reason: 'relist_after_sale_guard' }));
  });

  it('trustedOrder is passed to the commit only when requested (wardrobe reports keep the 3-argument call)', async () => {
    const d = deps();
    await processVintedSoldReport('org_1', [{ vintedId: '9879473979', title: MR_NATURAL }], d, { trustedOrder: true });
    expect(d.commitSale).toHaveBeenCalledWith('item_mr', SOLD_VIA_VINTED, '9879473979', { trustedOrder: true });
  });

  it('refuses to run without an organizer scope', async () => {
    await expect(processVintedSoldReport('', [{ vintedId: '1', title: MR_NATURAL }], deps())).rejects.toThrow();
  });
});

describe('title-only entry (Vinted sold email, no listing id)', () => {
  const items = [
    { id: 'item_mr', title: MR_NATURAL, status: 'AVAILABLE' },
    { id: 'item_dup_a', title: 'Blue Glass Vase', status: 'AVAILABLE' },
    { id: 'item_dup_b', title: 'blue glass vase!', status: 'AVAILABLE' },
    { id: 'item_other_id', title: 'Walnut Jewelry Box Vintage', status: 'AVAILABLE' },
  ];
  const jobs = [{ itemId: 'item_other_id', remoteListingId: '777' }];
  const ctx = buildVintedSoldMatchContext(items, jobs);

  it('matches the email title (single spaces) to the stored title (double space) via the normalizer', () => {
    expect(matchVintedSoldEntry({ vintedId: '', title: 'Mr. Natural #2 R. Crumb (San Francisco Comic Book Company Oct 1971)' }, ctx))
      .toEqual({ kind: 'matched', itemId: 'item_mr', via: 'title' });
  });

  it('matches a job-tracked item by title when no id is reported (no id to compare against)', () => {
    expect(matchVintedSoldEntry({ vintedId: '', title: 'Walnut Jewelry Box Vintage' }, ctx))
      .toEqual({ kind: 'matched', itemId: 'item_other_id', via: 'title' });
  });

  it('keeps the ambiguity and minimum-length refusals', () => {
    expect(matchVintedSoldEntry({ vintedId: '', title: 'Blue Glass Vase' }, ctx)).toEqual({ kind: 'ambiguous', candidateCount: 2, via: 'title' });
    expect(matchVintedSoldEntry({ vintedId: '', title: 'Vase' }, ctx)).toEqual({ kind: 'notFound', reason: 'title_too_short' });
  });

  it('does no fuzzy matching', () => {
    expect(matchVintedSoldEntry({ vintedId: '', title: 'Mr. Natural #2 R. Crumb' }, ctx)).toEqual({ kind: 'notFound', reason: 'no_match' });
  });

  it('never looks up an empty id against a job row', () => {
    const c = buildVintedSoldMatchContext(items, [{ itemId: 'item_dup_a', remoteListingId: '' }]);
    expect(matchVintedSoldEntry({ vintedId: '', title: MR_NATURAL }, c)).toEqual({ kind: 'matched', itemId: 'item_mr', via: 'title' });
  });

  it('processVintedSoldTitleReport commits with VINTED, and a second run (extension or email) gets alreadySold', async () => {
    let sold = false;
    const d = {
      loadCandidateItems: jest.fn(async () => items),
      loadVintedJobs: jest.fn(async () => jobs),
      closeVintedListingRecord: jest.fn(async () => false),
      commitSale: jest.fn(async () => { const was = sold; sold = true; return { alreadyCommitted: was }; }),
      getItemStatus: jest.fn(async () => 'SOLD'),
    };
    const first = await processVintedSoldTitleReport('org_1', 'Mr. Natural #2 R. Crumb (San Francisco Comic Book Company Oct 1971)', d);
    expect(first).toEqual(expect.objectContaining({ vintedId: '', result: 'sold', itemId: 'item_mr', via: 'title' }));
    expect(d.commitSale).toHaveBeenCalledWith('item_mr', SOLD_VIA_VINTED, '');
    const second = await processVintedSoldReport('org_1', [{ vintedId: '9879473979', title: MR_NATURAL }], d);
    expect(second[0].result).toBe('alreadySold');
  });
});

// 2026-10-12: manual reconciliation for a Vinted bundle sale (organizer ticks the bundled items).
describe('markItemsSoldOnVinted / sanitizeManualSoldItemIds', () => {
  const owned = [
    { id: 'a', title: 'Item A', status: 'AVAILABLE' },
    { id: 'b', title: 'Item B', status: 'AVAILABLE' },
    { id: 'c', title: 'Item C', status: 'SOLD' },
    { id: 'd', title: 'Item D', status: 'RESERVED' },
  ];
  function deps(over: Record<string, any> = {}) {
    return {
      loadOwnedItems: jest.fn(async (_org: string, ids: string[]) => owned.filter((o) => ids.includes(o.id))),
      closeVintedListingRecord: jest.fn(async () => true),
      commitSale: jest.fn(async (id: string) => ({ alreadyCommitted: id === 'c' || id === 'd' })),
      getItemStatus: jest.fn(async (id: string) => owned.find((o) => o.id === id)!.status),
      ...over,
    };
  }

  it('runs the same sold flow per owned item: close the Vinted record, then commit with VINTED (no price argument)', async () => {
    const d = deps();
    const r = await markItemsSoldOnVinted('org_1', ['a', 'b'], d);
    expect(r.map((x) => x.result)).toEqual(['sold', 'sold']);
    expect(d.closeVintedListingRecord).toHaveBeenCalledTimes(2);
    expect(d.commitSale).toHaveBeenCalledWith('a', SOLD_VIA_VINTED, '');
    expect(d.commitSale.mock.calls[0]).toHaveLength(3);
    expect(d.loadOwnedItems).toHaveBeenCalledWith('org_1', ['a', 'b']);
  });

  it('is idempotent: an already-sold item is reported alreadySold, a reserved one notAvailable', async () => {
    const r = await markItemsSoldOnVinted('org_1', ['c', 'd'], deps());
    expect(r.map((x) => x.result)).toEqual(['alreadySold', 'notAvailable']);
  });

  it('never touches an item the organizer does not own (not returned by the scoped load)', async () => {
    const d = deps();
    const r = await markItemsSoldOnVinted('org_1', ['a', 'someone_elses'], d);
    expect(r[1]).toEqual({ itemId: 'someone_elses', result: 'notFound', reason: 'not_found_for_this_organizer' });
    expect(d.commitSale).toHaveBeenCalledTimes(1);
  });

  it('one failing item does not fail the others', async () => {
    const d = deps({ commitSale: jest.fn(async (id: string) => { if (id === 'a') throw new Error('boom'); return { alreadyCommitted: false }; }) });
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const r = await markItemsSoldOnVinted('org_1', ['a', 'b'], d);
      expect(r.map((x) => x.result)).toEqual(['error', 'sold']);
    } finally {
      err.mockRestore();
    }
  });

  it('a multi-unit item that keeps stock reports AVAILABLE with the Vinted listing closed', async () => {
    const r = await markItemsSoldOnVinted('org_1', ['a'], deps({ commitSale: jest.fn(async () => ({ alreadyCommitted: false, partial: true })), closeVintedListingRecord: jest.fn(async () => false) }));
    expect(r[0]).toEqual(expect.objectContaining({ result: 'sold', itemStatus: 'AVAILABLE', vintedListingClosed: true }));
  });

  it('requires an organizer id and caps the selection at 50', async () => {
    await expect(markItemsSoldOnVinted('', ['a'], deps())).rejects.toThrow('organizerId required');
    const many = Array.from({ length: VINTED_MANUAL_SOLD_MAX_ITEMS + 1 }, (_, i) => `i${i}`);
    await expect(markItemsSoldOnVinted('org_1', many, deps())).rejects.toThrow('too_many_items');
    expect(await markItemsSoldOnVinted('org_1', [], deps())).toEqual([]);
  });

  it('sanitizeManualSoldItemIds keeps unique non-empty strings only', () => {
    expect(sanitizeManualSoldItemIds(['a', ' a ', '', 5, null, 'b', 'x'.repeat(65)])).toEqual(['a', 'b']);
    expect(sanitizeManualSoldItemIds('nope')).toEqual([]);
  });
});
