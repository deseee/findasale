import {
  AUTO_QUEUE_PLATFORMS,
  AUTO_QUEUE_FLAG_BY_PLATFORM,
  toAutoQueueSettings,
  parseAutoQueuePatch,
  isPickupOnlyBlockedForAutoQueue,
} from '../services/autoQueueSettings';

describe('autoQueueSettings helpers', () => {
  it('maps all six platforms to Organizer columns and has no Vinted entry', () => {
    expect([...AUTO_QUEUE_PLATFORMS]).toEqual(['CRAIGSLIST', 'FACEBOOK', 'GUMTREE_AU', 'GRAILED', 'POSHMARK', 'MERCARI']);
    expect(AUTO_QUEUE_FLAG_BY_PLATFORM.MERCARI).toBe('mercariAutoListEnabled');
    expect((AUTO_QUEUE_FLAG_BY_PLATFORM as any).VINTED).toBeUndefined();
  });

  it('reads settings from an organizer row, defaulting to false', () => {
    expect(toAutoQueueSettings({ mercariAutoListEnabled: true, facebookAutoListEnabled: false })).toEqual({
      CRAIGSLIST: false, FACEBOOK: false, GUMTREE_AU: false, GRAILED: false, POSHMARK: false, MERCARI: true,
    });
    expect(toAutoQueueSettings(null).MERCARI).toBe(false);
  });

  it('parses a PATCH body: only provided keys, case-insensitive platform names', () => {
    const r = parseAutoQueuePatch({ settings: { mercari: true, POSHMARK: false } });
    expect(r).toEqual({ ok: true, data: { mercariAutoListEnabled: true, poshmarkAutoListEnabled: false } });
  });

  it('rejects non-boolean values, unknown platforms, empty and malformed bodies', () => {
    expect(parseAutoQueuePatch({ settings: { MERCARI: 'true' } }).ok).toBe(false);
    expect(parseAutoQueuePatch({ settings: { MERCARI: 1 } }).ok).toBe(false);
    expect(parseAutoQueuePatch({ settings: { VINTED: true } }).ok).toBe(false);
    expect(parseAutoQueuePatch({ settings: {} }).ok).toBe(false);
    expect(parseAutoQueuePatch({ settings: [true] }).ok).toBe(false);
    expect(parseAutoQueuePatch({}).ok).toBe(false);
    expect(parseAutoQueuePatch(undefined).ok).toBe(false);
  });

  it('holds pickup-only items back from Mercari and Poshmark only', () => {
    expect(isPickupOnlyBlockedForAutoQueue('MERCARI', true)).toBe(true);
    expect(isPickupOnlyBlockedForAutoQueue('POSHMARK', true)).toBe(true);
    expect(isPickupOnlyBlockedForAutoQueue('FACEBOOK', true)).toBe(false);
    expect(isPickupOnlyBlockedForAutoQueue('MERCARI', false)).toBe(false);
  });
});
