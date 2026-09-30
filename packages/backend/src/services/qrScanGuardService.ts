/**
 * qrScanGuardService.ts -- server-side anti-spoof checks shared by every endpoint that turns a client-reported
 * location into XP: item QR scan (itemController.recordQrScan), treasure-hunt clue (treasureHuntQRController.markClueFound)
 * and sale check-in (saleController.checkInToSale).
 *
 * A browser can send any latitude/longitude it likes, so no single check is proof of presence. The checks stack:
 *   1. Sale active window: startDate/endDate in the sale's timezone (organizer timezone, else platform default),
 *      with small grace periods. A date-only endDate (midnight in the sale timezone) covers that whole local day.
 *   2. Rate limits per user+sale and per IP+sale (fixed window, Redis when connected, in-memory otherwise;
 *      never fail-open: when Redis is down the in-memory counter keeps enforcing per instance).
 *   3. Haversine radius from the sale (QR_SCAN_MAX_RADIUS_M, default 500 m, widened by the browser-reported GPS
 *      accuracy, capped at 100 m).
 *   4. Impossible-speed check between the same user's consecutive accepted scans (default max 70 m/s; only when the
 *      jump is over 1 km, so GPS jitter never trips it). A rejected scan does not move the stored position.
 * Every rejection is logged as `[qrScan] rejected reason=<reason> ...` and the caller must NOT award anything.
 * No schema: last positions live in Redis (TTL) with an in-memory fallback.
 *
 * Env (all optional): QR_SCAN_MAX_RADIUS_M, QR_SCAN_MAX_SPEED_MPS, QR_SCAN_USER_SALE_MAX_PER_HOUR (60),
 * QR_SCAN_IP_SALE_MAX_PER_HOUR (200), QR_SCAN_EARLY_GRACE_MIN (60), QR_SCAN_LATE_GRACE_MIN (120),
 * QR_CHECKIN_REQUIRE_LOCATION ('true' makes coordinates mandatory for check-in; default off until the client sends them).
 */
import { haversineDistance } from '../lib/placesService';
import { redisIncrWithWindow, redisGetValue, redisSetValue } from '../middleware/rateLimitShared';
import { resolveSendTimeZone } from './smsComplianceService';

export type QrScanKind = 'item' | 'clue' | 'checkin';

export type QrScanRejectReason =
  | 'outside_window'
  | 'rate_limited_user'
  | 'rate_limited_ip'
  | 'location_required'
  | 'sale_location_unverified'
  | 'too_far'
  | 'impossible_speed';

export interface QrScanSale {
  id: string;
  lat: number | null;
  lng: number | null;
  startDate: Date | string;
  endDate: Date | string;
  /** Organizer timezone (IANA). Missing/invalid falls back to the platform region, then America/Chicago. */
  timeZone?: string | null;
}

export interface QrScanInput {
  kind: QrScanKind;
  userId: string;
  ip?: string | null;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  sale: QrScanSale;
  now?: Date;
}

export type QrScanDecision =
  | { ok: true; located: boolean; distanceM?: number }
  | { ok: false; reason: QrScanRejectReason; status: number; code: string; message: string };

const envInt = (name: string, dflt: number, min = 0): number => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n >= min ? n : dflt;
};
const envNum = (name: string, dflt: number): number => {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) && n > 0 ? n : dflt;
};

export const qrScanConfig = () => ({
  maxRadiusM: envNum('QR_SCAN_MAX_RADIUS_M', 500),
  maxSpeedMps: envNum('QR_SCAN_MAX_SPEED_MPS', 70),
  userSaleMaxPerHour: envInt('QR_SCAN_USER_SALE_MAX_PER_HOUR', 60, 1),
  ipSaleMaxPerHour: envInt('QR_SCAN_IP_SALE_MAX_PER_HOUR', 200, 1),
  earlyGraceMin: envInt('QR_SCAN_EARLY_GRACE_MIN', 60),
  lateGraceMin: envInt('QR_SCAN_LATE_GRACE_MIN', 120),
  checkinRequiresLocation: (process.env.QR_CHECKIN_REQUIRE_LOCATION || '').toLowerCase() === 'true',
  /** Jumps shorter than this never count as "impossible speed" (GPS jitter, walking between rooms). */
  minSpeedCheckDistanceM: 1000,
  lastPositionTtlSeconds: 6 * 60 * 60,
  windowSeconds: 60 * 60,
});

// ---------- sale window ----------

/** Minutes since local midnight of `d` in `timeZone`. */
export function localMinutesOfDay(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10) % 24;
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return h * 60 + m;
}

/** Instants (ms) between which scans are accepted for a sale, in the sale's timezone. Exported for tests. */
export function computeScanWindow(
  startDate: Date | string,
  endDate: Date | string,
  timeZone: string,
  earlyGraceMin: number,
  lateGraceMin: number
): { opensAt: number; closesAt: number } {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate);
  let endMs = end.getTime();
  // Date-only storage: an end at local midnight means "through the end of that day".
  if (Number.isFinite(endMs) && localMinutesOfDay(end, timeZone) === 0) endMs += 24 * 60 * 60 * 1000;
  return { opensAt: start - earlyGraceMin * 60_000, closesAt: endMs + lateGraceMin * 60_000 };
}

// ---------- fixed-window counters (memory fallback) ----------

const memCounters = new Map<string, { count: number; resetAt: number }>();
const MAX_MEM_KEYS = 20_000;

function memIncr(key: string, windowSeconds: number, nowMs: number): number {
  const cur = memCounters.get(key);
  if (cur && cur.resetAt > nowMs) {
    cur.count += 1;
    return cur.count;
  }
  if (memCounters.size >= MAX_MEM_KEYS) {
    for (const [k, v] of memCounters) if (v.resetAt <= nowMs) memCounters.delete(k);
    if (memCounters.size >= MAX_MEM_KEYS) memCounters.delete(memCounters.keys().next().value as string);
  }
  memCounters.set(key, { count: 1, resetAt: nowMs + windowSeconds * 1000 });
  return 1;
}

/** Redis fixed window when connected, else per-instance memory. Never returns "unlimited". */
async function incrWindow(key: string, windowSeconds: number, nowMs: number): Promise<number> {
  const viaRedis = await redisIncrWithWindow(key, windowSeconds);
  if (viaRedis !== null) return viaRedis;
  return memIncr(key, windowSeconds, nowMs);
}

// ---------- last accepted position (impossible-speed check) ----------

interface LastPos { lat: number; lng: number; ts: number }
const lastPositions = new Map<string, LastPos>();
const MAX_LAST_POSITIONS = 20_000;
const lastKey = (userId: string) => `rl:qrscan:last:${userId}`;

async function loadLast(userId: string): Promise<LastPos | null> {
  const raw = await redisGetValue(lastKey(userId));
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (Number.isFinite(v?.lat) && Number.isFinite(v?.lng) && Number.isFinite(v?.ts)) return v as LastPos;
    } catch { /* fall through to memory */ }
  }
  return lastPositions.get(userId) ?? null;
}

async function saveLast(userId: string, pos: LastPos, ttlSeconds: number): Promise<void> {
  if (lastPositions.size >= MAX_LAST_POSITIONS && !lastPositions.has(userId)) {
    lastPositions.delete(lastPositions.keys().next().value as string);
  }
  lastPositions.set(userId, pos);
  await redisSetValue(lastKey(userId), JSON.stringify(pos), ttlSeconds);
}

/** Test helper: clears the in-memory counters and last positions. */
export function __resetQrScanGuardState(): void {
  memCounters.clear();
  lastPositions.clear();
}

// ---------- decision helpers ----------

const MESSAGES: Record<QrScanRejectReason, string> = {
  outside_window: 'This sale is not open for scanning right now.',
  rate_limited_user: 'Too many scans. Please slow down and try again later.',
  rate_limited_ip: 'Too many scans from this network. Please try again later.',
  location_required: 'Location is required to scan this QR code.',
  sale_location_unverified: 'This sale has no verified location yet, so this scan cannot be counted.',
  too_far: 'You must be at the sale location to scan this QR code.',
  impossible_speed: 'Your location changed too quickly to verify this scan. Please try again in a moment.',
};

function reject(input: QrScanInput, reason: QrScanRejectReason, extra: Record<string, unknown> = {}): QrScanDecision {
  const status =
    reason === 'rate_limited_user' || reason === 'rate_limited_ip'
      ? 429
      : reason === 'location_required'
        ? input.kind === 'clue' ? 403 : 400 // the clue page already treats 403 as "location required"
        : 403;
  const code =
    reason === 'location_required' ? 'LOCATION_REQUIRED'
    : reason === 'rate_limited_user' || reason === 'rate_limited_ip' ? 'RATE_LIMITED'
    : reason === 'outside_window' ? 'SALE_NOT_ACTIVE'
    : reason === 'sale_location_unverified' ? 'SALE_LOCATION_UNVERIFIED'
    : reason === 'impossible_speed' ? 'IMPLAUSIBLE_MOVEMENT'
    : 'OUT_OF_RANGE';
  const message = input.kind === 'checkin' && reason === 'too_far'
    ? 'You must be at the sale location to check in.'
    : MESSAGES[reason];
  console.warn(
    `[qrScan] rejected reason=${reason} kind=${input.kind} userId=${input.userId} saleId=${input.sale.id} ip=${input.ip || 'unknown'}` +
      Object.entries(extra).map(([k, v]) => ` ${k}=${v}`).join('')
  );
  return { ok: false, reason, status, code, message };
}

/**
 * Runs every guard for one scan attempt. Returns ok:true only if the caller may proceed to award; on ok:false
 * the caller responds with `status` and `{ error: message, message, code }` and awards nothing.
 */
export async function checkQrScan(input: QrScanInput): Promise<QrScanDecision> {
  const cfg = qrScanConfig();
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const { sale } = input;

  // 1. Active window in the sale timezone
  const tz = resolveSendTimeZone(sale.timeZone);
  const win = computeScanWindow(sale.startDate, sale.endDate, tz, cfg.earlyGraceMin, cfg.lateGraceMin);
  if (!Number.isFinite(win.opensAt) || !Number.isFinite(win.closesAt) || nowMs < win.opensAt || nowMs > win.closesAt) {
    return reject(input, 'outside_window', { tz });
  }

  // 2. Rate limits (every attempt counts, including ones rejected later)
  const userCount = await incrWindow(`rl:qrscan:u:${sale.id}:${input.userId}`, cfg.windowSeconds, nowMs);
  if (userCount > cfg.userSaleMaxPerHour) return reject(input, 'rate_limited_user', { count: userCount });
  if (input.ip) {
    const ipCount = await incrWindow(`rl:qrscan:ip:${sale.id}:${input.ip}`, cfg.windowSeconds, nowMs);
    if (ipCount > cfg.ipSaleMaxPerHour) return reject(input, 'rate_limited_ip', { count: ipCount });
  }

  // 3. Location
  const hasCoords = input.lat !== undefined && input.lng !== undefined;
  const saleHasCoords = sale.lat !== null && sale.lat !== undefined && sale.lng !== null && sale.lng !== undefined;
  const locationMandatory = input.kind !== 'checkin' || cfg.checkinRequiresLocation;

  if (!hasCoords) {
    if (locationMandatory) return reject(input, 'location_required');
    return { ok: true, located: false }; // check-in without coordinates while the requirement flag is off
  }
  if (!saleHasCoords) {
    if (locationMandatory) return reject(input, 'sale_location_unverified');
    return { ok: true, located: false };
  }

  const lat = input.lat as number;
  const lng = input.lng as number;
  const distanceM = haversineDistance(lat, lng, sale.lat as number, sale.lng as number);
  const allowed = cfg.maxRadiusM + Math.min(Math.max(input.accuracyMeters ?? 0, 0), 100);
  if (distanceM > allowed) {
    return reject(input, 'too_far', { distanceM: Math.round(distanceM), allowedM: Math.round(allowed) });
  }

  // 4. Impossible speed vs the user's previous accepted scan
  const prev = await loadLast(input.userId);
  if (prev) {
    const jumpM = haversineDistance(prev.lat, prev.lng, lat, lng);
    if (jumpM > cfg.minSpeedCheckDistanceM) {
      const dtSec = Math.max((nowMs - prev.ts) / 1000, 1);
      const speed = jumpM / dtSec;
      if (speed > cfg.maxSpeedMps) {
        return reject(input, 'impossible_speed', { jumpM: Math.round(jumpM), dtSec: Math.round(dtSec), mps: Math.round(speed) });
      }
    }
  }
  await saveLast(input.userId, { lat, lng, ts: nowMs }, cfg.lastPositionTtlSeconds);

  return { ok: true, located: true, distanceM };
}

/** Convenience for controllers: the JSON body for a rejected decision (same keys the client already reads). */
export const qrScanRejectionBody = (d: Extract<QrScanDecision, { ok: false }>) => ({
  error: d.message,
  message: d.message,
  code: d.code,
});
