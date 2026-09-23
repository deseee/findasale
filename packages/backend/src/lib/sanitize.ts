/**
 * Strips HTML tags and script-injectable content from user input.
 * Lightweight alternative to sanitize-html for user-generated text fields.
 */
export function sanitizeText(input: string): string {
  if (!input) return input;
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
};

/**
 * Single-pass HTML entity decode (&#39; &quot; &amp; &lt; &gt; &#x27; and other numeric
 * references) to plain text. Each entity is decoded exactly once, so "&amp;#39;" becomes the
 * literal text "&#39;" (never a second pass). Unknown named entities are left untouched.
 * Used for text sent to plain-text destinations such as Discogs listing comments, and for
 * Discogs GET responses, which HTML-escape `comments` on output (ADR-132, 2026-09-23 QA).
 */
export function decodeHtmlEntities(input: string): string;
export function decodeHtmlEntities(input: string | null | undefined): string | null | undefined;
export function decodeHtmlEntities(input: string | null | undefined): string | null | undefined {
  if (!input || input.indexOf('&') === -1) return input;
  return input.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[ref.toLowerCase()];
    return named !== undefined ? named : whole;
  });
}
