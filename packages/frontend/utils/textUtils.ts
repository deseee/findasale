/**
 * Shared text formatting utilities
 */

/**
 * Decode HTML entities in a string.
 * eBay category names come back with &amp; instead of &, etc.
 */
export const decodeHtmlEntities = (str: string): string =>
  str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
