/**
 * Safe-URL helpers for user-entered links and post-login redirects.
 *
 * React 18 only warns about javascript: hrefs and still renders them, and the site CSP allows
 * inline script, so any user-entered link must pass safeHref before it reaches <a href>.
 */

/** rel for links to user-entered, off-site destinations. */
export const UNTRUSTED_LINK_REL = 'noopener noreferrer nofollow';

/**
 * Returns the URL when it is an absolute http(s) URL, otherwise null.
 * With `{ assumeHttps: true }` a value with no scheme ("instagram.com/shop") gets "https://" in
 * front first, for free-text profile links saved before the backend required a scheme.
 */
export function safeHref(value: unknown, opts: { assumeHttps?: boolean } = {}): string | null {
  if (typeof value !== 'string') return null;
  let candidate = value.trim();
  if (!candidate) return null;
  if (/[\u0000-\u001f\u007f\s]/.test(candidate)) return null;
  if (opts.assumeHttps && !/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, '')}`;
  }
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) return candidate;
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns `value` when it is a same-origin relative path ("/organizer/dashboard"), otherwise
 * `fallback`. Rejects absolute URLs, protocol-relative "//host" and "/\host" (browsers treat a
 * backslash like a slash), and any control characters.
 */
export function safeReturnTo(value: unknown, fallback: string): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== 'string' || !v) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(v)) return fallback;
  if (!v.startsWith('/')) return fallback;
  if (v.startsWith('//') || v.startsWith('/\\')) return fallback;
  return v;
}
