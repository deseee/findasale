import {
  mergeNotificationPrefs,
  validateIncomingNotificationPrefs,
  MAX_NOTIFICATION_PREFS_BYTES,
} from '../notificationPrefsMerge';

describe('mergeNotificationPrefs', () => {
  it('keeps existing keys and overlays incoming ones', () => {
    expect(mergeNotificationPrefs({ a: true, b: false }, { b: true, c: 1 })).toEqual({ a: true, b: true, c: 1 });
  });
  it('stores false and 0 (falsy values are real choices)', () => {
    expect(mergeNotificationPrefs({ a: true }, { a: false, n: 0 })).toEqual({ a: false, n: 0 });
  });
  it('null deletes a key', () => {
    expect(mergeNotificationPrefs({ a: true, b: false }, { a: null })).toEqual({ b: false });
  });
  it('treats a missing, null, array or string existing value as empty', () => {
    expect(mergeNotificationPrefs(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeNotificationPrefs(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(mergeNotificationPrefs([1], { a: 1 })).toEqual({ a: 1 });
    expect(mergeNotificationPrefs('x', { a: 1 })).toEqual({ a: 1 });
  });
  it('does not mutate its inputs and is shallow (nested objects are replaced)', () => {
    const existing = { nested: { x: 1, y: 2 }, k: 1 };
    const incoming = { nested: { x: 9 } };
    const out = mergeNotificationPrefs(existing, incoming);
    expect(out).toEqual({ nested: { x: 9 }, k: 1 });
    expect(existing).toEqual({ nested: { x: 1, y: 2 }, k: 1 });
  });
  it('ignores prototype-polluting keys', () => {
    const evil = JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"ok":1}');
    const out = mergeNotificationPrefs({}, evil);
    expect(out).toEqual({ ok: 1 });
    expect(({} as any).polluted).toBeUndefined();
  });
});

describe('validateIncomingNotificationPrefs', () => {
  it('accepts plain objects', () => {
    expect(validateIncomingNotificationPrefs({ a: 1 })).toBeNull();
    expect(validateIncomingNotificationPrefs({})).toBeNull();
  });
  it('rejects arrays, strings, numbers and null', () => {
    for (const v of [[1], 'x', 5, null]) expect(validateIncomingNotificationPrefs(v)).toBe('notificationPrefs must be an object');
  });
  it('rejects oversized documents', () => {
    expect(validateIncomingNotificationPrefs({ blob: 'x'.repeat(MAX_NOTIFICATION_PREFS_BYTES + 1) })).toBe('notificationPrefs is too large');
  });
});
