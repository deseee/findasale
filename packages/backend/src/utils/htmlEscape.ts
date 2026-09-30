/**
 * htmlEscape (2026-09-29): one shared place for putting untrusted text into HTML emails.
 *
 * Sale titles, addresses, organizer business names and photo URLs are typed by users and are
 * interpolated into mass emails (weekly digest, reminders, follower alerts). Without escaping, a
 * title such as `"><img src=x onerror=...>` or a photo URL like `" onerror="...` becomes markup in
 * every recipient's mailbox (and a phishing link inside an email that is signed by our domain).
 *
 *   escapeHtml(v)        text content AND double-quoted attribute values
 *   safeHttpsUrl(v)      returns the normalized https URL, or '' when v is not a plain https URL
 *                        (javascript:, data:, http:, protocol-relative, credentials in the URL,
 *                        control characters). Escape the result with escapeHtml() before putting
 *                        it in an attribute.
 *   safeHttpUrl(v)       same, but also allows http: (for links that may point at localhost in dev)
 *   sanitizeHeaderText   strips CR/LF and control characters (email subjects, header values)
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(CONTROL_CHARS, '').replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
}

const parseUrl = (value: unknown, allowHttp: boolean): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  // Reject control characters and whitespace outright (the URL parser would silently strip some).
  // eslint-disable-next-line no-control-regex
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(trimmed)) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) return '';
  if (url.username || url.password || !url.hostname) return '';
  return url.toString();
};

export function safeHttpsUrl(value: unknown): string {
  return parseUrl(value, false);
}

export function safeHttpUrl(value: unknown): string {
  return parseUrl(value, true);
}

export function sanitizeHeaderText(value: unknown, maxLen = 200): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
