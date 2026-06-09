/**
 * Shared text formatting utilities
 */

/**
 * Decode HTML entities in a string.
 * eBay category names come back with &amp; instead of &, &#233; instead of é, etc.
 */
export const decodeHtmlEntities = (str: string): string =>
  str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
