/**
 * Pure normalization helpers for the card catalog (ADR-134 sections 2.2, 3.4).
 * No imports, no I/O.
 */

/**
 * Lookup key for card names: lower case, accents stripped, apostrophes dropped, every other
 * run of non-alphanumerics collapsed to one space. The same function is applied to the stored
 * name (nameNorm) and to the seller's query, so a prefix search on nameNorm is symmetric.
 */
export function normalizeCardName(input: unknown): string {
  return String(input ?? '')
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The part of a printed collector number before any '/': '138/195' gives '138'. */
export function collectorNumberNumerator(raw: unknown): string {
  return String(raw ?? '').split('/')[0].trim();
}

/**
 * Canonical comparison form: numerator, lower case, leading zeros removed when the numerator is
 * all digits ('001/102' and '1' and '001' all give '1').
 */
export function canonicalCollectorNumber(raw: unknown): string {
  const numerator = collectorNumberNumerator(raw).toLowerCase();
  if (/^\d+$/.test(numerator)) return String(parseInt(numerator, 10));
  return numerator;
}

/**
 * Stored forms a typed collector number may take. Scryfall stores '138', TCGCSV stores
 * '001/102', so a lookup tries the raw text, the numerator, the unpadded number and zero-padded
 * variants. Callers also try each candidate followed by '/' as a prefix.
 */
export function collectorNumberCandidates(raw: unknown): string[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const out = new Set<string>();
  out.add(text);
  const numerator = collectorNumberNumerator(text);
  if (numerator) out.add(numerator);
  if (/^\d+$/.test(numerator)) {
    const unpadded = String(parseInt(numerator, 10));
    out.add(unpadded);
    out.add(unpadded.padStart(2, '0'));
    out.add(unpadded.padStart(3, '0'));
    out.add(unpadded.padStart(4, '0'));
  }
  return Array.from(out);
}

/** True when two printed collector numbers refer to the same number. */
export function collectorNumbersMatch(a: unknown, b: unknown): boolean {
  const ca = canonicalCollectorNumber(a);
  const cb = canonicalCollectorNumber(b);
  return ca !== '' && ca === cb;
}

/** Four-digit year from an ISO-like date string ('2024-02-09'), or null when absent or out of range. */
export function yearFromDate(value: unknown): number | null {
  const m = /^(\d{4})-/.exec(String(value ?? ''));
  if (!m) return null;
  const year = parseInt(m[1], 10);
  return year >= 1900 && year <= 2100 ? year : null;
}

/**
 * Decimal string with two places for a catalog price, or null when the value is missing, not a
 * finite non-negative number, or too large for DECIMAL(10,2).
 */
export function parsePrice(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0 || n >= 100000000) return null;
  return n.toFixed(2);
}

export function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 0 || n > 2147483647) return null;
  return n;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * Date encoded in a CardDataSource.sourceVersion: the text before any '|' parsed as a date
 * ('2026-10-03T21:05:42.559+00:00' for Scryfall, '2026-10-03T20:05:38+0000|POKEMON' for TCGCSV).
 * Returns null when it is not a valid date.
 */
export function parseSourceVersionDate(sourceVersion: unknown): Date | null {
  if (typeof sourceVersion !== 'string' || !sourceVersion) return null;
  const head = sourceVersion.split('|')[0].trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(head);
  return Number.isNaN(d.getTime()) ? null : d;
}
