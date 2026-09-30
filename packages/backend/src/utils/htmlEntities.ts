/**
 * htmlEntities.ts -- single-pass HTML entity decoding for imported text (CSV / eBay data).
 * Pure and dependency-free so it can be unit tested without the 5,800-line item controller.
 */

/**
 * Decode HTML entities from CSV/eBay data before writing to the DB, then strip any markup the decode
 * produced. Decoding is a SINGLE pass (the old chained replaces double-decoded "&amp;lt;" into "<"), and the
 * result is tag-stripped afterwards so an encoded payload like "&lt;script&gt;x&lt;/script&gt;" can never
 * come out as "<script>" (2026-09-29 review finding).
 */
export function decodeHtmlEntities(str: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decoded = str.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_m, dec?: string, hex?: string, name?: string) => {
    if (name) return named[name.toLowerCase()] ?? '';
    const code = dec !== undefined ? Number(dec) : parseInt(hex as string, 16);
    if (!Number.isInteger(code) || code < 0x20 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
    return String.fromCodePoint(code);
  });
  return decoded
    .replace(/<[^>]*>?/g, '') // strip tags, including an unterminated "<script..." tail
    .replace(/[<>]/g, '')
    .trim();
}
