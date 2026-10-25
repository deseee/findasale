/**
 * postCapRetryEligible (2026-10-25, S-EXT-VINTED-HARD-STOP-REPROBE). Past the hard stop with no captured
 * remote listing id, a removal is re-probed once per HARD_STOP_REPROBE_MS instead of never; after a
 * 'listing_not_found' probe the hourly cooldown applies so the 3-report gone-listing streak can finish.
 * Pure function, synthetic data.
 */
import { postCapRetryEligible, HARD_STOP_REPROBE_MS } from '../removalRetryGate';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const base = { hardStopAfter: 10, hasRemoteListingId: false, now: NOW, cooldownMs: HOUR };

describe('postCapRetryEligible', () => {
  test('below the hard stop: plain hourly cooldown', () => {
    expect(postCapRetryEligible({ ...base, skipCount: 5, lastSkipReason: 'no_confident_listing_match', lastSkipAt: new Date(NOW - 30 * 60 * 1000) })).toBe(false);
    expect(postCapRetryEligible({ ...base, skipCount: 5, lastSkipReason: 'no_confident_listing_match', lastSkipAt: new Date(NOW - HOUR) })).toBe(true);
  });

  test('past the hard stop with no listing id: not retried hourly any more', () => {
    expect(postCapRetryEligible({ ...base, skipCount: 10, lastSkipReason: 'no_confident_listing_match', lastSkipAt: new Date(NOW - 2 * HOUR) })).toBe(false);
    expect(postCapRetryEligible({ ...base, skipCount: 10, lastSkipReason: 'no_confident_listing_match', lastSkipAt: new Date(NOW - HARD_STOP_REPROBE_MS + 1) })).toBe(false);
  });

  test('past the hard stop with no listing id: re-probed once the daily window has passed (was: never)', () => {
    expect(postCapRetryEligible({ ...base, skipCount: 10, lastSkipReason: 'no_confident_listing_match', lastSkipAt: new Date(NOW - HARD_STOP_REPROBE_MS) })).toBe(true);
    // Live case: item cmuqvzky806pdsm41hd5izclz, ten VINTED skips on 2026-10-11, stranded since.
    expect(postCapRetryEligible({ ...base, skipCount: 10, lastSkipReason: 'no_confident_listing_match', lastSkipAt: new Date(Date.UTC(2026, 9, 11, 9, 2, 16)) })).toBe(true);
  });

  test('past the hard stop: a listing_not_found probe goes back to the hourly cooldown so the streak can finish', () => {
    expect(postCapRetryEligible({ ...base, skipCount: 11, lastSkipReason: 'listing_not_found', lastSkipAt: new Date(NOW - HOUR) })).toBe(true);
    expect(postCapRetryEligible({ ...base, skipCount: 11, lastSkipReason: 'listing_not_found', lastSkipAt: new Date(NOW - 10 * 60 * 1000) })).toBe(false);
  });

  test('a captured listing id keeps the hourly cooldown past the hard stop (unchanged)', () => {
    expect(postCapRetryEligible({ ...base, skipCount: 20, hasRemoteListingId: true, lastSkipReason: 'detail_page_title_mismatch', lastSkipAt: new Date(NOW - HOUR) })).toBe(true);
  });

  test('no skip timestamp on record fails open (unchanged)', () => {
    expect(postCapRetryEligible({ ...base, skipCount: 12, lastSkipReason: null, lastSkipAt: null })).toBe(true);
  });
});
