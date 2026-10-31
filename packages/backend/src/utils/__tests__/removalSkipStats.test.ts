/**
 * removalSkipStatsByItemPlatform (2026-10-30): REMOVE/SKIPPED rows count only after the item+platform's newest
 * POST/POSTED row, so a repost starts the removal skip counter over. Synthetic rows shaped like the live
 * 2026-10-30 case (95 Poshmark skips 2026-09-28..30, REMOVED 2026-09-30, reposted 2026-10-22).
 */
import { removalSkipStatsByItemPlatform } from '../removalSkipStats';

const d = (s: string) => new Date(s);
const row = (itemId: string, platform: string, action: string, status: string, createdAt: string, extra: Record<string, unknown> = {}) =>
  ({ itemId, platform, action, status, createdAt: d(createdAt), lastAttemptAt: null as Date | null, lastErrorMessage: null as string | null, ...extra });
const skip = (itemId: string, platform: string, createdAt: string, reason = 'no_confident_closet_match') =>
  row(itemId, platform, 'REMOVE', 'SKIPPED', createdAt, { lastAttemptAt: d(createdAt), lastErrorMessage: reason });

describe('removalSkipStatsByItemPlatform', () => {
  it('a repost resets the counter: 95 old skips, then REMOVED, then a new POST -> nothing counted', () => {
    const rows: any[] = [row('zoom', 'POSHMARK', 'POST', 'POSTED', '2026-09-02T10:00:00Z')];
    for (let i = 0; i < 95; i++) rows.push(skip('zoom', 'POSHMARK', new Date(Date.parse('2026-09-28T00:00:00Z') + i * 20 * 60000).toISOString()));
    rows.push(row('zoom', 'POSHMARK', 'REMOVE', 'REMOVED', '2026-09-30T12:00:00Z', { lastErrorMessage: 'resync:listing_not_found' }));
    rows.push(row('zoom', 'POSHMARK', 'POST', 'POSTED', '2026-10-22T09:00:00Z'));
    expect(removalSkipStatsByItemPlatform(rows).has('zoom:POSHMARK')).toBe(false);
  });

  it('skips after the newest POST still count, with the newest reason and timestamps', () => {
    const rows: any[] = [
      skip('a', 'MERCARI', '2026-10-01T00:00:00Z', 'old'),
      row('a', 'MERCARI', 'POST', 'POSTED', '2026-10-10T00:00:00Z'),
      skip('a', 'MERCARI', '2026-10-12T00:00:00Z', 'no_confident_listing_match'),
      skip('a', 'MERCARI', '2026-10-14T00:00:00Z', 'listing_not_found'),
      skip('a', 'MERCARI', '2026-10-13T00:00:00Z', 'no_confident_listing_match'),
    ];
    const st = removalSkipStatsByItemPlatform(rows).get('a:MERCARI')!;
    expect(st.count).toBe(3);
    expect(st.lastReason).toBe('listing_not_found');
    expect(st.lastAttemptAt).toEqual(d('2026-10-14T00:00:00Z'));
    expect(st.lastActivityAt).toEqual(d('2026-10-14T00:00:00Z'));
  });

  it('with no POST/POSTED row on record every skip counts', () => {
    const rows: any[] = [skip('b', 'VINTED', '2026-10-01T00:00:00Z'), skip('b', 'VINTED', '2026-10-02T00:00:00Z')];
    expect(removalSkipStatsByItemPlatform(rows).get('b:VINTED')!.count).toBe(2);
  });

  it('is per platform: a repost on one platform does not reset another', () => {
    const rows: any[] = [
      row('c', 'POSHMARK', 'POST', 'POSTED', '2026-09-01T00:00:00Z'),
      row('c', 'FACEBOOK', 'POST', 'POSTED', '2026-09-01T00:00:00Z'),
      skip('c', 'POSHMARK', '2026-09-05T00:00:00Z'), skip('c', 'POSHMARK', '2026-09-06T00:00:00Z'), skip('c', 'POSHMARK', '2026-09-07T00:00:00Z'),
      skip('c', 'FACEBOOK', '2026-09-05T00:00:00Z'), skip('c', 'FACEBOOK', '2026-09-06T00:00:00Z'), skip('c', 'FACEBOOK', '2026-09-07T00:00:00Z'),
      row('c', 'POSHMARK', 'POST', 'POSTED', '2026-10-01T00:00:00Z'),
    ];
    const m = removalSkipStatsByItemPlatform(rows);
    expect(m.has('c:POSHMARK')).toBe(false);
    expect(m.get('c:FACEBOOK')!.count).toBe(3);
  });

  it('a failed POST or a REMOVE/REMOVED row does not reset the counter; only POST/POSTED does', () => {
    const rows: any[] = [
      row('e', 'POSHMARK', 'POST', 'POSTED', '2026-09-01T00:00:00Z'),
      skip('e', 'POSHMARK', '2026-09-05T00:00:00Z'),
      row('e', 'POSHMARK', 'POST', 'FAILED', '2026-09-06T00:00:00Z'),
      row('e', 'POSHMARK', 'REMOVE', 'REMOVED', '2026-09-07T00:00:00Z', { lastErrorMessage: 'sold_on_poshmark' }),
      skip('e', 'POSHMARK', '2026-09-08T00:00:00Z'),
    ];
    expect(removalSkipStatsByItemPlatform(rows).get('e:POSHMARK')!.count).toBe(2);
  });

  it('accepts ISO strings and rows in any order; a skip at the exact POST instant belongs to the old listing', () => {
    const rows: any[] = [
      { itemId: 'f', platform: 'GRAILED', action: 'REMOVE', status: 'SKIPPED', createdAt: '2026-10-05T00:00:00Z', lastAttemptAt: null, lastErrorMessage: 'x' },
      { itemId: 'f', platform: 'GRAILED', action: 'POST', status: 'POSTED', createdAt: '2026-10-05T00:00:00Z' },
      { itemId: 'f', platform: 'GRAILED', action: 'REMOVE', status: 'SKIPPED', createdAt: '2026-10-06T00:00:00Z', lastAttemptAt: null, lastErrorMessage: 'y' },
    ];
    const st = removalSkipStatsByItemPlatform(rows).get('f:GRAILED')!;
    expect(st.count).toBe(1);
    expect(st.lastReason).toBe('y');
    expect(st.lastAttemptAt).toBeNull();
    expect(st.lastActivityAt).toEqual(d('2026-10-06T00:00:00Z'));
  });
});
