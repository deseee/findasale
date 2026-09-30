/**
 * Anti-spoof guard for location-gated XP (item QR scan, treasure-hunt clue, sale check-in).
 * Pure service test: Redis helpers are mocked (null = "Redis unavailable", which must fall back to memory).
 */
const mockIncr = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('../middleware/rateLimitShared', () => ({
  redisIncrWithWindow: (...a: unknown[]) => mockIncr(...a),
  redisGetValue: (...a: unknown[]) => mockGet(...a),
  redisSetValue: (...a: unknown[]) => mockSet(...a),
}));

import {
  checkQrScan,
  computeScanWindow,
  qrScanRejectionBody,
  __resetQrScanGuardState,
  QrScanInput,
} from '../services/qrScanGuardService';

const SALE_LAT = 42.2178;
const SALE_LNG = -85.8919;
const M_PER_DEG_LAT = 111_195;

// 2026-10-03 09:00 to 17:00 America/Chicago (CDT = UTC-5)
const START = new Date('2026-10-03T14:00:00Z');
const END = new Date('2026-10-03T22:00:00Z');
const DURING = new Date('2026-10-03T18:00:00Z');

const sale = (over: Record<string, unknown> = {}) => ({
  id: 'sale-A',
  lat: SALE_LAT,
  lng: SALE_LNG,
  startDate: START,
  endDate: END,
  timeZone: 'America/Chicago',
  ...over,
});

const base = (over: Partial<QrScanInput> = {}): QrScanInput => ({
  kind: 'item',
  userId: 'u1',
  ip: '1.2.3.4',
  lat: SALE_LAT,
  lng: SALE_LNG,
  accuracyMeters: 0,
  sale: sale(),
  now: DURING,
  ...over,
});

const offsetLat = (meters: number) => SALE_LAT + meters / M_PER_DEG_LAT;

const ENV_KEYS = [
  'QR_SCAN_MAX_RADIUS_M', 'QR_SCAN_MAX_SPEED_MPS', 'QR_SCAN_USER_SALE_MAX_PER_HOUR',
  'QR_SCAN_IP_SALE_MAX_PER_HOUR', 'QR_SCAN_EARLY_GRACE_MIN', 'QR_SCAN_LATE_GRACE_MIN', 'QR_CHECKIN_REQUIRE_LOCATION',
];

let warn: jest.SpyInstance;
beforeEach(() => {
  __resetQrScanGuardState();
  ENV_KEYS.forEach((k) => delete process.env[k]);
  mockIncr.mockReset().mockResolvedValue(null); // Redis down -> memory fallback
  mockGet.mockReset().mockResolvedValue(null);
  mockSet.mockReset().mockResolvedValue(undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('sale active window (sale timezone)', () => {
  it('accepts a scan during the sale', async () => {
    expect((await checkQrScan(base())).ok).toBe(true);
  });

  it('rejects before the early grace and after the late grace, and logs the reason', async () => {
    const early = await checkQrScan(base({ now: new Date(START.getTime() - 61 * 60_000) }));
    expect(early).toMatchObject({ ok: false, reason: 'outside_window', status: 403, code: 'SALE_NOT_ACTIVE' });
    const late = await checkQrScan(base({ now: new Date(END.getTime() + 121 * 60_000) }));
    expect(late).toMatchObject({ ok: false, reason: 'outside_window' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[qrScan] rejected reason=outside_window'));
    expect((await checkQrScan(base({ now: new Date(START.getTime() - 59 * 60_000) }))).ok).toBe(true);
    expect((await checkQrScan(base({ now: new Date(END.getTime() + 119 * 60_000) }))).ok).toBe(true);
  });

  it('treats a date-only endDate (local midnight) as running through that local day', () => {
    // Oct 4 00:00 CDT == 05:00Z. The window must extend a full day past it (plus grace).
    const w = computeScanWindow('2026-10-03T05:00:00Z', '2026-10-04T05:00:00Z', 'America/Chicago', 60, 120);
    expect(w.closesAt).toBe(new Date('2026-10-05T07:00:00Z').getTime());
    // A real end time is not extended.
    const w2 = computeScanWindow(START, END, 'America/Chicago', 60, 120);
    expect(w2.closesAt).toBe(END.getTime() + 120 * 60_000);
  });

  it('falls back to a valid timezone when the organizer value is garbage', async () => {
    expect((await checkQrScan(base({ sale: sale({ timeZone: 'Not/AZone' }) }))).ok).toBe(true);
  });

  it('rejects a sale with an unparseable date instead of letting everything through', async () => {
    const r = await checkQrScan(base({ sale: sale({ startDate: 'garbage' }) }));
    expect(r).toMatchObject({ ok: false, reason: 'outside_window' });
  });
});

describe('rate limits', () => {
  it('limits per user+sale using the in-memory fallback when Redis is down', async () => {
    process.env.QR_SCAN_USER_SALE_MAX_PER_HOUR = '3';
    for (let i = 0; i < 3; i++) expect((await checkQrScan(base())).ok).toBe(true);
    const r = await checkQrScan(base());
    expect(r).toMatchObject({ ok: false, reason: 'rate_limited_user', status: 429, code: 'RATE_LIMITED' });
    // another user on another IP is unaffected
    expect((await checkQrScan(base({ userId: 'u2', ip: '9.9.9.9' }))).ok).toBe(true);
    // the same user on a different sale is unaffected
    expect((await checkQrScan(base({ sale: sale({ id: 'sale-B' }) }))).ok).toBe(true);
  });

  it('limits per IP+sale across different users', async () => {
    process.env.QR_SCAN_IP_SALE_MAX_PER_HOUR = '2';
    expect((await checkQrScan(base({ userId: 'a' }))).ok).toBe(true);
    expect((await checkQrScan(base({ userId: 'b' }))).ok).toBe(true);
    const r = await checkQrScan(base({ userId: 'c' }));
    expect(r).toMatchObject({ ok: false, reason: 'rate_limited_ip', status: 429 });
  });

  it('uses Redis counts when available and keeps the rl: prefix', async () => {
    process.env.QR_SCAN_USER_SALE_MAX_PER_HOUR = '5';
    mockIncr.mockResolvedValueOnce(6);
    const r = await checkQrScan(base());
    expect(r).toMatchObject({ ok: false, reason: 'rate_limited_user' });
    expect(mockIncr).toHaveBeenCalledWith('rl:qrscan:u:sale-A:u1', 3600);
  });

  it('memory window resets after an hour', async () => {
    process.env.QR_SCAN_USER_SALE_MAX_PER_HOUR = '1';
    expect((await checkQrScan(base())).ok).toBe(true);
    expect((await checkQrScan(base())).ok).toBe(false);
    // memIncr keys off input.now, so a scan 61 minutes later (still inside the sale) starts a new window
    expect((await checkQrScan(base({ now: new Date(DURING.getTime() + 61 * 60_000) }))).ok).toBe(true);
  });
});

describe('location and radius', () => {
  it('requires coordinates for item scans (400) and clues (403), with the LOCATION_REQUIRED code', async () => {
    const item = await checkQrScan(base({ lat: undefined, lng: undefined }));
    expect(item).toMatchObject({ ok: false, reason: 'location_required', status: 400, code: 'LOCATION_REQUIRED' });
    const clue = await checkQrScan(base({ kind: 'clue', lat: undefined, lng: undefined }));
    expect(clue).toMatchObject({ ok: false, reason: 'location_required', status: 403, code: 'LOCATION_REQUIRED' });
  });

  it('check-in may omit coordinates until QR_CHECKIN_REQUIRE_LOCATION=true', async () => {
    const noLoc = base({ kind: 'checkin', lat: undefined, lng: undefined });
    expect(await checkQrScan(noLoc)).toEqual({ ok: true, located: false });
    process.env.QR_CHECKIN_REQUIRE_LOCATION = 'true';
    expect(await checkQrScan(noLoc)).toMatchObject({ ok: false, reason: 'location_required' });
  });

  it('check-in that DOES send coordinates is still radius-checked', async () => {
    const far = await checkQrScan(base({ kind: 'checkin', lat: offsetLat(5000) }));
    expect(far).toMatchObject({ ok: false, reason: 'too_far' });
    expect(far.ok === false && far.message).toBe('You must be at the sale location to check in.');
  });

  it('default radius is 500 m, widened by accuracy up to 100 m', async () => {
    expect((await checkQrScan(base({ lat: offsetLat(450) }))).ok).toBe(true);
    __resetQrScanGuardState();
    expect(await checkQrScan(base({ lat: offsetLat(550) }))).toMatchObject({ ok: false, reason: 'too_far', status: 403, code: 'OUT_OF_RANGE' });
    __resetQrScanGuardState();
    expect((await checkQrScan(base({ lat: offsetLat(550), accuracyMeters: 80 }))).ok).toBe(true);
    __resetQrScanGuardState();
    // accuracy is capped at 100 m, so a huge claimed accuracy cannot buy a huge radius
    expect((await checkQrScan(base({ lat: offsetLat(700), accuracyMeters: 5000 }))).ok).toBe(false);
  });

  it('radius is env configurable', async () => {
    process.env.QR_SCAN_MAX_RADIUS_M = '100';
    expect((await checkQrScan(base({ lat: offsetLat(150) }))).ok).toBe(false);
    __resetQrScanGuardState();
    process.env.QR_SCAN_MAX_RADIUS_M = '2000';
    expect((await checkQrScan(base({ lat: offsetLat(1500) }))).ok).toBe(true);
  });

  it('fails closed for a sale without coordinates on item/clue scans', async () => {
    const r = await checkQrScan(base({ kind: 'clue', sale: sale({ lat: null, lng: null }) }));
    expect(r).toMatchObject({ ok: false, reason: 'sale_location_unverified', status: 403 });
  });
});

describe('impossible speed between consecutive scans', () => {
  const saleB = () => sale({ id: 'sale-B', lat: SALE_LAT + 20_000 / M_PER_DEG_LAT, lng: SALE_LNG });
  const atB = (over: Partial<QrScanInput> = {}) => base({ sale: saleB(), lat: SALE_LAT + 20_000 / M_PER_DEG_LAT, ...over });

  it('rejects a 20 km jump in one minute, then accepts it an hour later', async () => {
    expect((await checkQrScan(base())).ok).toBe(true);
    const fast = await checkQrScan(atB({ now: new Date(DURING.getTime() + 60_000) }));
    expect(fast).toMatchObject({ ok: false, reason: 'impossible_speed', status: 403, code: 'IMPLAUSIBLE_MOVEMENT' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reason=impossible_speed'));
    // the rejected scan must not have moved the stored position: an hour after the FIRST scan it is fine
    const later = await checkQrScan(atB({ now: new Date(DURING.getTime() + 3600_000) }));
    expect(later.ok).toBe(true);
  });

  it('does not flag short hops (GPS jitter, walking around a big property)', async () => {
    expect((await checkQrScan(base())).ok).toBe(true);
    expect((await checkQrScan(base({ lat: offsetLat(400), now: new Date(DURING.getTime() + 2000) }))).ok).toBe(true);
  });

  it('uses the Redis copy of the last position when present (multi-instance)', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ lat: SALE_LAT, lng: SALE_LNG, ts: DURING.getTime() }));
    const r = await checkQrScan(atB({ now: new Date(DURING.getTime() + 30_000) }));
    expect(r).toMatchObject({ ok: false, reason: 'impossible_speed' });
  });

  it('max speed is env configurable', async () => {
    process.env.QR_SCAN_MAX_SPEED_MPS = '100000';
    expect((await checkQrScan(base())).ok).toBe(true);
    expect((await checkQrScan(atB({ now: new Date(DURING.getTime() + 60_000) }))).ok).toBe(true);
  });

  it('stores the accepted position in Redis with a TTL and never stores a rejected one', async () => {
    await checkQrScan(base());
    expect(mockSet).toHaveBeenCalledWith('rl:qrscan:last:u1', expect.any(String), 6 * 3600);
    mockSet.mockClear();
    await checkQrScan(base({ lat: offsetLat(9000) })); // too far -> rejected
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('rejection body', () => {
  it('keeps the { error, message, code } keys the clients read', async () => {
    const r = await checkQrScan(base({ lat: undefined, lng: undefined }));
    if (r.ok) throw new Error('expected a rejection');
    expect(qrScanRejectionBody(r)).toEqual({
      error: 'Location is required to scan this QR code.',
      message: 'Location is required to scan this QR code.',
      code: 'LOCATION_REQUIRED',
    });
  });

  it('never uses em dashes or the word AI in user-facing messages', async () => {
    const reasons = [
      base({ lat: undefined, lng: undefined }),
      base({ lat: offsetLat(9000) }),
      base({ now: new Date(0) }),
    ];
    for (const i of reasons) {
      const r = await checkQrScan(i);
      if (r.ok) throw new Error('expected a rejection');
      expect(r.message).not.toMatch(/\u2014|\bAI\b/);
    }
  });
});
