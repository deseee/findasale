import {
  sanitizePausedPlatforms,
  isPlatformPaused,
  filterPausedPlatforms,
  applyPauseToRemovalEntries,
} from '../services/pausedMarketplaces';

describe('pausedMarketplaces helpers', () => {
  it('sanitizes input: case, unknown values, duplicates, non-arrays', () => {
    expect(sanitizePausedPlatforms(['facebook', 'FACEBOOK', 'nope', 5, ' mercari '])).toEqual(['FACEBOOK', 'MERCARI']);
    expect(sanitizePausedPlatforms('FACEBOOK')).toEqual([]);
    expect(sanitizePausedPlatforms(undefined)).toEqual([]);
  });

  it('isPlatformPaused handles empty and missing lists', () => {
    expect(isPlatformPaused(['FACEBOOK'], 'FACEBOOK')).toBe(true);
    expect(isPlatformPaused(['FACEBOOK'], 'POSHMARK')).toBe(false);
    expect(isPlatformPaused(null, 'FACEBOOK')).toBe(false);
    expect(isPlatformPaused([], 'FACEBOOK')).toBe(false);
  });

  it('filterPausedPlatforms drops only paused ones', () => {
    expect(filterPausedPlatforms(['FACEBOOK', 'POSHMARK'], ['FACEBOOK'])).toEqual(['POSHMARK']);
    expect(filterPausedPlatforms(['FACEBOOK'], [])).toEqual(['FACEBOOK']);
  });

  it('applyPauseToRemovalEntries strips paused platforms, trims listingRefs, counts held-back entries', () => {
    const entries = [
      { id: 'a', platforms: ['FACEBOOK'], listingRefs: { FACEBOOK: 'x' } },
      { id: 'b', platforms: ['FACEBOOK', 'VINTED'], listingRefs: { FACEBOOK: 'x', VINTED: '123' } },
      { id: 'c', platforms: ['POSHMARK'], listingRefs: {} },
    ];
    const { kept, heldBack } = applyPauseToRemovalEntries(entries, ['FACEBOOK']);
    expect(heldBack).toBe(1);
    expect(kept.map((e) => e.id)).toEqual(['b', 'c']);
    expect(kept[0].platforms).toEqual(['VINTED']);
    expect(kept[0].listingRefs).toEqual({ VINTED: '123' });
    expect(kept[1]).toBe(entries[2]);
  });

  it('applyPauseToRemovalEntries is a no-op with nothing paused', () => {
    const entries = [{ id: 'a', platforms: ['FACEBOOK'] }];
    expect(applyPauseToRemovalEntries(entries, [])).toEqual({ kept: entries, heldBack: 0 });
  });
});
