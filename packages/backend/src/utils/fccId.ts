/**
 * FCC ID helpers (eBay FCC ID item specific, effective 2026-10-13).
 *
 * normalizeFccId: shared normalizer (previously inline in itemController): trim, uppercase, keep only
 * letters, digits and hyphens, max 20 chars. Empty or non-string input becomes null.
 *
 * extractFccIdFromText: deterministic OCR fallback, same spirit as cloudAIService.extractIsbnFromText.
 * Only matches when the text carries an explicit "FCC ID" label (this also covers "Contains FCC ID")
 * immediately before an alphanumeric token. The token must be 6-19 alphanumeric characters (3 or 5
 * character grantee code + product code up to 14), hyphens allowed inside, and must contain at least one
 * letter and one digit so plain words, digit-only runs (ISBN/UPC/EAN) and prose never match.
 */

export const normalizeFccId = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
  return cleaned.length > 0 ? cleaned : null;
};

// "FCC ID" label, then either a colon/hash (value may wrap to the next line) or plain spacing, then the token.
const FCC_ID_LABELLED_TOKEN =
  /\bFCC[ \t]*ID(?:[ \t]*[:#][ \t]*\n?[ \t]*|[ \t]+)([A-Z0-9](?:[A-Z0-9-]{4,22}[A-Z0-9]))(?![A-Z0-9-])/gi;

/**
 * Strict shape check for a model-read or OCR-read candidate: normalizes with normalizeFccId, then requires
 * 6-19 alphanumeric characters (hyphens allowed, no doubled hyphens) with at least one letter and one digit.
 * Returns the normalized value or null. Organizer-typed values are NOT held to this (they use normalizeFccId).
 */
export function normalizeFccIdStrict(v: unknown): string | null {
  const n = normalizeFccId(v);
  if (!n) return null;
  if (typeof v === 'string' && v.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').length > 20) return null; // would be truncated
  const alnum = n.replace(/-/g, '');
  if (alnum.length < 6 || alnum.length > 19) return null;
  if (!/[A-Z]/.test(alnum) || !/[0-9]/.test(alnum)) return null;
  if (/--/.test(n) || n.startsWith('-') || n.endsWith('-')) return null;
  return n;
}

export function extractFccIdFromText(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;
  FCC_ID_LABELLED_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FCC_ID_LABELLED_TOKEN.exec(text)) !== null) {
    const strict = normalizeFccIdStrict(m[1]);
    if (strict) return strict;
  }
  return null;
}
