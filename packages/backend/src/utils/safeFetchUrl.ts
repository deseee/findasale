/**
 * safeFetchUrl.ts -- SSRF guard for server-side downloads of stored / imported photo URLs (2026-09-29).
 *
 * Item.photoUrls can be written from imports (CSV, scrapers, marketplace sync), so a stored URL is
 * untrusted input the moment the server fetches it (internal hosts, cloud metadata endpoints such
 * as 169.254.169.254, localhost admin ports). Industry-standard mitigation, layered:
 *   1. https only, no credentials in the URL, port 443 only
 *   2. hostname must be on an allowlist (default: Cloudinary's delivery host) -- never an IP literal
 *   3. callers pass { maxRedirects: 0 } to axios so an allowed host cannot bounce to an internal one
 *
 * Extra hosts (for example our own image CDN) come from SAFE_FETCH_ALLOWED_HOSTS, a comma-separated
 * list of exact hostnames or "*.example.com" suffix patterns. IP literals are always refused, even
 * if listed, because DNS-name allowlisting is the whole point.
 *
 * Organizer brand logos (brandLogoUrl) are typed in by the organizer, so besides Cloudinary the
 * print-kit fetch also trusts the app's own configured hosts (see appAssetHosts and
 * isSafeBrandAssetUrl below). That is allowlist CONFIG, not a looser check: same https / no
 * credentials / port 443 / no IP literal rules apply.
 */

const CLOUDINARY_HOST = /^res(-\d+)?\.cloudinary\.com$/i;
const MAX_URL_LENGTH = 2048;

function envAllowedHosts(): string[] {
  return (process.env.SAFE_FETCH_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** True for dotted IPv4 (including shorthand/decimal forms browsers accept) and any IPv6 literal. */
export function isIpLiteralHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '');
  if (h.includes(':')) return true; // IPv6 (URL keeps brackets; either way a colon means IPv6)
  // Dotted quad, or a single all-digit / hex label like "2130706433" or "0x7f000001"
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (/^(0x[0-9a-f]+|\d+)$/i.test(h)) return true;
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){1,3}$/i.test(h)) return true;
  return false;
}

function hostAllowed(hostname: string, extraHosts: string[] = []): boolean {
  const host = hostname.toLowerCase();
  if (CLOUDINARY_HOST.test(host)) return true;
  return [...envAllowedHosts(), ...extraHosts].some((entry) => {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1); // ".example.com"
      return host.length > suffix.length && host.endsWith(suffix);
    }
    return host === entry;
  });
}

/** True only for an https URL on an allowlisted DNS host. Never throws. */
export function isSafeFetchUrl(raw: unknown, opts: { extraHosts?: string[] } = {}): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  if (isIpLiteralHost(u.hostname)) return false;
  return hostAllowed(u.hostname, (opts.extraHosts || []).map((h) => h.trim().toLowerCase()).filter(Boolean));
}

/**
 * Hostnames of the app's own public origins (frontend, backend, site URL envs) plus the optional
 * BRAND_ASSET_ALLOWED_HOSTS list (comma-separated, exact hosts or "*.example.com"). Read lazily so
 * tests and env changes apply. Never throws; unparseable values are skipped.
 */
export function appAssetHosts(): string[] {
  const hosts: string[] = [];
  const urlEnvs = ['FRONTEND_URL', 'NEXT_PUBLIC_FRONTEND_URL', 'NEXT_PUBLIC_SITE_URL', 'BACKEND_URL', 'RAILWAY_BACKEND_URL'];
  for (const name of urlEnvs) {
    const v = (process.env[name] || '').trim();
    if (!v) continue;
    try {
      hosts.push(new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase());
    } catch {
      /* skip unparseable env value */
    }
  }
  const publicDomain = (process.env.RAILWAY_PUBLIC_DOMAIN || '').trim().toLowerCase();
  if (publicDomain && !/[\/:]/.test(publicDomain)) hosts.push(publicDomain);
  for (const h of (process.env.BRAND_ASSET_ALLOWED_HOSTS || '').split(',')) {
    const t = h.trim().toLowerCase();
    if (t) hosts.push(t);
  }
  // Never trust dev/loopback style hosts derived from env (single-label names, localhost, IP literals).
  return hosts.filter((h) => h.includes('.') && h !== 'localhost' && !h.endsWith('.localhost') && !isIpLiteralHost(h));
}

/** Guard for organizer-supplied brand asset URLs: the standard allowlist plus the app's own hosts. */
export function isSafeBrandAssetUrl(raw: unknown): boolean {
  return isSafeFetchUrl(raw, { extraHosts: appAssetHosts() });
}

/** Returns the URL string when safe, otherwise throws (for call sites that already have a try/catch). */
export function assertSafeFetchUrl(raw: unknown): string {
  if (!isSafeFetchUrl(raw)) {
    throw new Error('Blocked: URL is not an allowed https image host');
  }
  return raw as string;
}

/** Axios options that pair with the guard: no redirect following, bounded size and time. */
export const SAFE_FETCH_AXIOS_OPTIONS = {
  maxRedirects: 0,
  timeout: 15000,
  maxContentLength: 25 * 1024 * 1024,
  maxBodyLength: 25 * 1024 * 1024,
} as const;
