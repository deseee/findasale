/**
 * services/liveListingState.ts (2026-10-27): one rule for "is item I live on platform P". A Poshmark Multi Item listing stays live
 * after a unit sale there (latest row = REMOVE/REMOVED sold_on_poshmark) while units still show; everything else keeps the
 * newest-non-SKIPPED-row-is-POST/POSTED rule. Pure functions plus one loader with an injected db. Synthetic data only.
 */
import {
  liveListingFromRows, liveListingsByItemPlatform, livePlatformsByItem, unitSalesSinceNewestPost, syncedQuantityToStore,
  liveListingAfterUnitSale, isQuantityListingPlatform,
} from '../services/liveListingState';

jest.mock('../lib/prisma', () => ({ prisma: {} }));

const at = (m: number) => new Date(Date.UTC(2026, 9, 20, 0, m));
const post = (m: number, q: number | null, over: Record<string, unknown> = {}) =>
  ({ id: 'p' + m, action: 'POST', status: 'POSTED', createdAt: at(m), syncedQuantity: q, remoteListingId: 'posh' + m, lastErrorMessage: null, ...over });
const soldOn = (m: number, platform = 'poshmark') => ({ id: 's' + m, action: 'REMOVE', status: 'REMOVED', createdAt: at(m), lastErrorMessage: `sold_on_${platform}` });
const removed = (m: number, msg: string | null = null) => ({ id: 'r' + m, action: 'REMOVE', status: 'REMOVED', createdAt: at(m), lastErrorMessage: msg });
const skipped = (m: number) => ({ id: 'k' + m, action: 'REMOVE', status: 'SKIPPED', createdAt: at(m), lastErrorMessage: 'no_confident_title_match' });

describe('liveListingFromRows', () => {
  it('a latest POST/POSTED row is live, showing its syncedQuantity (NULL reads as 1)', () => {
    expect(liveListingFromRows([post(1, 3)], 'POSHMARK')).toMatchObject({ unitsShowing: 3, remoteListingId: 'posh1', afterUnitSale: false });
    expect(liveListingFromRows([post(1, null)], 'MERCARI')).toMatchObject({ unitsShowing: 1, afterUnitSale: false });
  });

  it('a Poshmark Multi Item listing that sold one of 3 units is still live with 2 showing, held by the POST row', () => {
    const live = liveListingFromRows([post(1, 3), soldOn(2)], 'POSHMARK');
    expect(live).toMatchObject({ unitsShowing: 2, remoteListingId: 'posh1', afterUnitSale: true });
    expect(live!.postRow.id).toBe('p1');
  });

  it('sold out on Poshmark itself (every posted unit sold there) is not live', () => {
    expect(liveListingFromRows([post(1, 2), soldOn(2), soldOn(3)], 'POSHMARK')).toBeNull();
  });

  it('a single-unit Poshmark listing that sold is not live', () => {
    expect(liveListingFromRows([post(1, 1), soldOn(2)], 'POSHMARK')).toBeNull();
    expect(liveListingFromRows([post(1, null), soldOn(2)], 'POSHMARK')).toBeNull();
  });

  it('a unit sale on a one-unit marketplace (Mercari, Vinted) ends the listing', () => {
    expect(liveListingFromRows([post(1, 3), soldOn(2, 'mercari')], 'MERCARI')).toBeNull();
    expect(liveListingFromRows([post(1, 3), soldOn(2, 'vinted')], 'VINTED')).toBeNull();
  });

  it('a removal after the unit sale ends the Multi Item listing', () => {
    expect(liveListingFromRows([post(1, 3), soldOn(2), removed(3)], 'POSHMARK')).toBeNull();
  });

  it('a REMOVE/SKIPPED row never ends a listing (2026-09-22 rule), also after a unit sale', () => {
    expect(liveListingFromRows([post(1, 1), skipped(2)], 'FACEBOOK')).not.toBeNull();
    expect(liveListingFromRows([post(1, 3), soldOn(2), skipped(3)], 'POSHMARK')).toMatchObject({ unitsShowing: 2 });
  });

  it('a sold_on row for ANOTHER platform does not keep a Poshmark listing live', () => {
    expect(liveListingFromRows([post(1, 3), soldOn(2, 'mercari')], 'POSHMARK')).toBeNull();
  });

  it('never posted, or only removed, is not live', () => {
    expect(liveListingFromRows([], 'POSHMARK')).toBeNull();
    expect(liveListingFromRows([removed(1)], 'POSHMARK')).toBeNull();
  });
});

describe('liveListingsByItemPlatform / livePlatformsByItem', () => {
  it('groups by item and platform, in any row order', () => {
    const rows = [
      { itemId: 'a', platform: 'POSHMARK', ...soldOn(2) },
      { itemId: 'a', platform: 'FACEBOOK', ...removed(3) },
      { itemId: 'a', platform: 'POSHMARK', ...post(1, 3) },
      { itemId: 'a', platform: 'FACEBOOK', ...post(1, null) },
      { itemId: 'b', platform: 'MERCARI', ...post(1, 1) },
    ];
    const live = liveListingsByItemPlatform(rows);
    expect([...live.keys()].sort()).toEqual(['a:POSHMARK', 'b:MERCARI']);
    expect(live.get('a:POSHMARK')!.unitsShowing).toBe(2);
    expect(livePlatformsByItem(live)).toEqual(new Map([['a', ['POSHMARK']], ['b', ['MERCARI']]]));
  });
});

describe('quantity baseline (syncedQuantityToStore)', () => {
  it('stores shown + unit sales there since the POST, so units showing reads back as shown', () => {
    const rows = [post(1, 3), soldOn(2)];
    expect(unitSalesSinceNewestPost(rows, 'POSHMARK')).toBe(1);
    // A sale elsewhere left 1 in stock; the extension set the Multi Item listing to 1 and confirmed it.
    const stored = syncedQuantityToStore(rows, 'POSHMARK', 1);
    expect(stored).toBe(2);
    expect(liveListingFromRows([post(1, stored), soldOn(2)], 'POSHMARK')).toMatchObject({ unitsShowing: 1 });
  });

  it('is the shown value itself on a one-unit platform or with no unit sale since the POST', () => {
    expect(syncedQuantityToStore([post(1, 3), soldOn(2, 'mercari')], 'MERCARI', 2)).toBe(2);
    expect(syncedQuantityToStore([soldOn(0), post(1, 3)], 'POSHMARK', 3)).toBe(3);
    expect(isQuantityListingPlatform('POSHMARK')).toBe(true);
    expect(isQuantityListingPlatform('FACEBOOK')).toBe(false);
  });
});

describe('liveListingAfterUnitSale (for findFirst callers)', () => {
  const db = (rows: any[]) => ({ marketplaceListingJob: { findMany: jest.fn().mockResolvedValue(rows) } });

  it('loads the rows only when the latest row is a Poshmark unit sale, and returns the live Multi Item listing', async () => {
    const d = db([post(1, 3), soldOn(2)]);
    const live = await liveListingAfterUnitSale('i1', 'POSHMARK', soldOn(2), d);
    expect(live).toMatchObject({ unitsShowing: 2, afterUnitSale: true });
    expect(d.marketplaceListingJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { itemId: 'i1', platform: 'POSHMARK' } }));
  });

  it('returns null with no query for a plain removal, a POST row, or a one-unit platform', async () => {
    const d = db([post(1, 3), soldOn(2)]);
    expect(await liveListingAfterUnitSale('i1', 'POSHMARK', removed(3), d)).toBeNull();
    expect(await liveListingAfterUnitSale('i1', 'POSHMARK', post(1, 3), d)).toBeNull();
    expect(await liveListingAfterUnitSale('i1', 'MERCARI', soldOn(2, 'mercari'), d)).toBeNull();
    expect(await liveListingAfterUnitSale('i1', 'POSHMARK', null, d)).toBeNull();
    expect(d.marketplaceListingJob.findMany).not.toHaveBeenCalled();
  });

  it('returns null when the Multi Item listing is sold out', async () => {
    expect(await liveListingAfterUnitSale('i1', 'POSHMARK', soldOn(3), db([post(1, 2), soldOn(2), soldOn(3)]))).toBeNull();
  });
});
