/**
 * jsonLdSafe -- safe serializer for JSON-LD (application/ld+json) script blocks.
 * JSON.stringify does not escape <, >, & or the U+2028 / U+2029 line separators,
 * so an untrusted string (e.g. a scraped Facebook event title) can contain
 * </script><script>...</script> and break out of the ld+json <script> element
 * (stored XSS). Fix: stringify, then escape those characters to their \uXXXX
 * forms; inside a JSON string the escapes decode to the same characters, so the
 * parsed structured data is unchanged and only the raw HTML stream is made safe.
 *
 * IMPORTANT: the U+2028 / U+2029 patterns are written as \u escapes inside the
 * regex literals, never the raw characters -- a raw U+2028/U+2029 is an ECMAScript
 * line terminator and makes the regex literal "unterminated" (build failure).
 */
export function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export default jsonLdSafe;
