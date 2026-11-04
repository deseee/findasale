import { z } from 'zod';

/**
 * Link-URL hygiene for user-entered links that the frontend renders as <a href>.
 *
 * Organizer website/social links, bounty reference links and encyclopedia links are shown to other
 * people. zod's z.string().url() accepts javascript:, data: and vbscript: URLs (new URL parses them),
 * so every write path for these fields must accept only absolute http(s) URLs.
 */

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** True only for an absolute http: or https: URL (after trimming). */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Control characters and whitespace inside a URL are a classic scheme-smuggling trick.
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname;
  } catch {
    return false;
  }
}

/**
 * Normalizes a free-text social/profile link. A value with no scheme ("instagram.com/shop") gets
 * "https://" in front, which keeps the long-standing free-text entry working. A value that names any
 * scheme other than http(s) is rejected. Returns:
 *   - '' for an empty value (clears the field),
 *   - the normalized URL when it is a valid http(s) URL,
 *   - null when the value must be rejected.
 */
export function normalizeLinkUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '';
  // "localhost:3000/x" or "shop.com:8080" would look like a scheme; only treat it as one when the
  // part before ":" has no dot and is followed by something other than a port number.
  const hasScheme = SCHEME_RE.test(trimmed) && !/^[^/:]+\.[^/:]+:\d/.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
  return isHttpUrl(candidate) ? candidate : null;
}

/**
 * Returns the targets of markdown links "[text](target)" whose target is not an http(s) URL.
 * Uses the same pattern the encyclopedia page renders links with, so anything that page would turn
 * into an <a href> is checked here.
 */
export function findUnsafeMarkdownLinks(markdown: unknown): string[] {
  if (typeof markdown !== 'string' || !markdown) return [];
  const bad: string[] = [];
  const re = /\[(.+?)\]\((.+?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    if (!isHttpUrl(m[2])) bad.push(m[2]);
  }
  return bad;
}

/**
 * zod field schemas for organizer profile links (routes/organizers.ts PATCH /me).
 * Website (and eBay store URL) must be an absolute http(s) URL or empty. Social links were free text, so a
 * value with no scheme gets https:// in front; any other scheme is refused.
 */
export const websiteUrlSchema = z
  .string()
  .max(2048)
  .refine((v) => v.trim() === '' || isHttpUrl(v), { message: 'Website must be a link starting with http:// or https://' })
  .transform((v) => v.trim());

export const socialUrlSchema = z
  .string()
  .max(2048)
  .refine((v) => normalizeLinkUrl(v) !== null, { message: 'Links must start with http:// or https://' })
  .transform((v) => normalizeLinkUrl(v) as string);
