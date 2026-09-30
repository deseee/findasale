import { parseStrictNumber, parseLatitude, parseLongitude, parseAccuracyMeters, buildQrScanLockKey, parseBodyLatitude, parseBodyLongitude, parseBodyAccuracyMeters } from '../utils/qrScanGuards';

describe('JSON body coordinate helpers', () => {
  it('accept finite numbers and strict numeric strings in range', () => {
    expect(parseBodyLatitude(42.2)).toBe(42.2);
    expect(parseBodyLatitude('42.2')).toBe(42.2);
    expect(parseBodyLongitude(-85.9e0)).toBe(-85.9);
    expect(parseBodyLatitude(0)).toBe(0);
  });
  it('reject NaN, Infinity, out of range, null, arrays, objects, booleans and junk strings', () => {
    for (const bad of [NaN, Infinity, -Infinity, 91, null, undefined, [42], { a: 1 }, true, '12abc', '']) {
      expect(parseBodyLatitude(bad as any)).toBeUndefined();
    }
    expect(parseBodyLongitude(181)).toBeUndefined();
    expect(parseBodyAccuracyMeters('abc')).toBe(0);
    expect(parseBodyAccuracyMeters(5000)).toBe(100);
    expect(parseBodyAccuracyMeters(-4)).toBe(0);
  });
});

describe('parseStrictNumber', () => {
  it('accepts plain decimals inside the range', () => {
    expect(parseStrictNumber('42.2178', 90)).toBe(42.2178);
    expect(parseStrictNumber('-85.8919', 180)).toBe(-85.8919);
    expect(parseStrictNumber(' 7 ', 10)).toBe(7);
    expect(parseStrictNumber('0', 10)).toBe(0);
  });
  it('rejects everything parseFloat would have silently accepted or coerced', () => {
    for (const bad of ['12abc', '1e3', '1e400', 'NaN', 'Infinity', '-Infinity', '', ' ', '.5', '5.', '--5', '+5', '0x10', ['42'], { a: 1 }, null, undefined, 42, true]) {
      expect(parseStrictNumber(bad as any, 1000)).toBeUndefined();
    }
  });
  it('rejects out-of-range values', () => {
    expect(parseStrictNumber('91', 90)).toBeUndefined();
    expect(parseStrictNumber('-91', 90)).toBeUndefined();
    expect(parseStrictNumber('90', 90)).toBe(90);
  });
});

describe('coordinate helpers', () => {
  it('latitude is within [-90, 90], longitude within [-180, 180]', () => {
    expect(parseLatitude('42.2')).toBe(42.2);
    expect(parseLatitude('90.0001')).toBeUndefined();
    expect(parseLongitude('-179.9')).toBe(-179.9);
    expect(parseLongitude('181')).toBeUndefined();
    expect(parseLatitude(['42'])).toBeUndefined();
  });
  it('accuracy clamps to [0, 100] and treats garbage as 0', () => {
    expect(parseAccuracyMeters('25')).toBe(25);
    expect(parseAccuracyMeters('5000')).toBe(100);
    expect(parseAccuracyMeters('-4')).toBe(0);
    expect(parseAccuracyMeters('abc')).toBe(0);
    expect(parseAccuracyMeters(undefined)).toBe(0);
  });
});

describe('buildQrScanLockKey', () => {
  it('is stable per user, item and UTC day, and different otherwise', () => {
    const d = new Date('2026-09-29T23:59:59Z');
    expect(buildQrScanLockKey('u1', 'i1', d)).toBe('qrscan:u1:i1:2026-09-29');
    expect(buildQrScanLockKey('u1', 'i1', new Date('2026-09-29T00:00:00Z'))).toBe(buildQrScanLockKey('u1', 'i1', d));
    expect(buildQrScanLockKey('u1', 'i1', new Date('2026-09-30T00:00:00Z'))).not.toBe(buildQrScanLockKey('u1', 'i1', d));
    expect(buildQrScanLockKey('u2', 'i1', d)).not.toBe(buildQrScanLockKey('u1', 'i1', d));
    expect(buildQrScanLockKey('u1', 'i2', d)).not.toBe(buildQrScanLockKey('u1', 'i1', d));
  });
});
