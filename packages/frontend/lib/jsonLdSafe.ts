/**
 * jsonLdSafe — safe serializer for JSON-LD (`application/ld+json`) script blocks.
 *
 * `JSON.stringify` does NOT escape `<`, `>`, `&`, or the U+2028 / U+2029 line
 * separators. Any string value that reaches a JSON-LD block from an untrusted
 * source (e.g. a scraped Facebook-event title, which anyone can author) can
 * therefore contain `</script><script>...</script>` and break out of the
 * `<script type="application/ld+json">` element, executing arbitrary JavaScript
 * for anonymous visitors on public SEO pages. This is a stored-XSS sink.
 *
 * Fix: stringify normally, then replace the dangerous characters with their
 * `\uXXXX` unicode escapes. Inside a JSON string these escapes decode to the
 * exact same characters, so the PARSED structured data (and thus all SEO
 * content) is byte-for-byte identical — only the raw HTML stream is made safe.
 * A `<` can no longer form `</script>`, closing the breakout. (This is the same
 * technique React/Next.js use internally for embedded JSON.)
 *
 * NOTE: HTML entities (`&lt;` etc.) are intentionally NOT used — those would
 * corrupt the JSON string values as seen by structured-data consumers.
 */
export function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/ /g, '\\u2028')
    .replace(/ /g, '\\u2029');
}

export default jsonLdSafe;
