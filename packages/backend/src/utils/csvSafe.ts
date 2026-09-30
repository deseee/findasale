/**
 * CSV cell writer that is safe to open in Excel / Google Sheets (2026-09-29).
 *
 * CSV / formula injection (OWASP): a TEXT cell that starts with = + - @ (or a tab or carriage
 * return) is executed as a formula by spreadsheet software. Item titles and descriptions are free
 * text and can arrive from scraped or imported listings, so those cells get a leading apostrophe,
 * which spreadsheets render as plain text. Numbers, booleans and null are never altered.
 * Fields containing a comma, quote, CR or LF are quoted with internal quotes doubled (RFC 4180).
 */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  if (typeof v === 'string' && (/^[\t\r\n ]*[=+\-@]/.test(s) || /^[\t\r]/.test(s))) {
    s = `'${s}`;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
