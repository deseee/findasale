/**
 * qrScanGuards.ts -- pure helpers for the item-QR scan endpoint (controllers/itemController.recordQrScan).
 * Kept dependency-free so they can be unit tested without booting the 5,800-line controller.
 */

const STRICT_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Strictly parse a numeric query value: only a plain decimal string (optional sign, digits, optional
 * fraction) is accepted, and it must be finite and within [-maxAbs, maxAbs]. Arrays, objects, '12abc'
 * (which parseFloat would accept as 12), exponents, 'NaN', 'Infinity' and blanks all return undefined.
 */
export function parseStrictNumber(raw: unknown, maxAbs: number): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!STRICT_DECIMAL.test(t)) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || Math.abs(n) > maxAbs) return undefined;
  return n;
}

/** Latitude in [-90, 90], or undefined. */
export const parseLatitude = (raw: unknown): number | undefined => parseStrictNumber(raw, 90);

/** Longitude in [-180, 180], or undefined. */
export const parseLongitude = (raw: unknown): number | undefined => parseStrictNumber(raw, 180);

/** Browser-reported GPS accuracy in meters, clamped to [0, 100]; anything invalid counts as 0. */
export function parseAccuracyMeters(raw: unknown): number {
  const n = parseStrictNumber(raw, 1e9);
  if (n === undefined) return 0;
  return Math.min(Math.max(n, 0), 100);
}

/**
 * Coordinate parsing for JSON bodies (POST endpoints): accepts a finite JS number or a strict decimal string,
 * within range. Everything else (null, arrays, objects, booleans, NaN, strings like '12abc') is undefined.
 */
function parseBodyNumber(raw: unknown, maxAbs: number): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && Math.abs(raw) <= maxAbs ? raw : undefined;
  }
  return parseStrictNumber(raw, maxAbs);
}
export const parseBodyLatitude = (raw: unknown): number | undefined => parseBodyNumber(raw, 90);
export const parseBodyLongitude = (raw: unknown): number | undefined => parseBodyNumber(raw, 180);
/** Accuracy from a JSON body, clamped to [0, 100] like parseAccuracyMeters. */
export function parseBodyAccuracyMeters(raw: unknown): number {
  const n = parseBodyNumber(raw, 1e9);
  if (n === undefined) return 0;
  return Math.min(Math.max(n, 0), 100);
}

/** Stable per-(user, item, UTC day) key used for the Postgres advisory lock that serializes dedupe-then-award. */
export function buildQrScanLockKey(userId: string, itemId: string, day: Date): string {
  return `qrscan:${userId}:${itemId}:${day.toISOString().slice(0, 10)}`;
}
