/**
 * Organizer display-name hygiene (2026-09-29).
 *
 * businessName is rendered on public pages, in emails and on invoices, so it must be a single clean
 * line: every control character (C0 including CR, LF and tab, DEL, C1 including U+0085 NEL, and the
 * Unicode line/paragraph separators U+2028 and U+2029) becomes a space, runs of whitespace collapse,
 * the result is trimmed, must not be empty, and is capped at 120 characters.
 */
export const BUSINESS_NAME_MAX_LENGTH = 120;

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g;

export function normalizeBusinessName(raw: string): string {
  return raw.replace(CONTROL_CHARS_RE, ' ').replace(/\s+/g, ' ').trim();
}

export type BusinessNameResult = { ok: true; value: string } | { ok: false; message: string };

export function validateBusinessName(raw: unknown): BusinessNameResult {
  if (typeof raw !== 'string') return { ok: false, message: 'Business name must be text' };
  if (raw.length > 1000) return { ok: false, message: 'Business name is too long' };
  const value = normalizeBusinessName(raw);
  if (value.length === 0) return { ok: false, message: 'Business name is required' };
  if (value.length > BUSINESS_NAME_MAX_LENGTH) {
    return { ok: false, message: `Business name must be ${BUSINESS_NAME_MAX_LENGTH} characters or fewer` };
  }
  return { ok: true, value };
}
