/**
 * requireSameSiteOrigin (2026-09-30): Origin / Referer allowlist for the cookie-authenticated auth POSTs
 * (POST /api/auth/refresh and POST /api/auth/logout).
 *
 * WHY: both routes are on the global CSRF exemption list (middleware/csrf.ts CSRF_EXEMPT_AUTH_PATHS) because the
 * double-submit cookie cannot be relied on there (logout must work with an expired session, refresh runs before a new
 * csrf cookie exists, and the cookie path can mismatch behind the Next.js proxy). The exemption rested on two things:
 * the refresh cookie is SameSite=Lax (a cross-SITE POST does not carry it) and it is httpOnly. That still leaves a
 * SAME-SITE attacker (another subdomain of the site, or a sibling preview deployment) able to fire a credentialed
 * POST, forcing a logout or burning a rotation. This check closes that gap without needing a token:
 *
 *   - Origin header present: it must be an allowed web origin (ALLOWED_ORIGINS env + the production domains +
 *     the project's Vercel previews + localhost in development), OR a chrome-extension:// origin that authenticates
 *     with the X-Refresh-Token header and carries NO session cookie (the Marketplace Autofill extension; a cookie
 *     bearing browser request from an extension origin is refused).
 *   - Origin absent, Referer present: the Referer's origin must be allowed (some privacy settings strip Origin on
 *     same-origin requests but keep Referer).
 *   - Both absent: allowed. Browsers always send Origin on a cross-origin POST, so a missing pair means a
 *     non-browser client (server-to-server, curl, the extension service worker on some platforms), which is not a CSRF
 *     vector (no ambient cookies are attached by a forger that cannot set these headers).
 *
 * A rejected request gets 403 { code: 'ORIGIN_NOT_ALLOWED' } and nothing is read, cleared or rotated.
 */
import type { NextFunction, Request, Response } from 'express';

/** The same allowlist index.ts builds for CORS: ALLOWED_ORIGINS plus the production domains. */
export const getAllowedWebOrigins = (): string[] => {
  const fromEnv = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  for (const o of ['https://finda.sale', 'https://www.finda.sale', 'https://api.finda.sale']) {
    if (!fromEnv.includes(o)) fromEnv.push(o);
  }
  return fromEnv;
};

const VERCEL_PREVIEW = /^https:\/\/findasale[a-z0-9-]*\.vercel\.app$/;

const originOf = (value: string): string | null => {
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
};

export const isAllowedWebOrigin = (origin: string, allowed: string[] = getAllowedWebOrigins()): boolean =>
  allowed.includes(origin) || VERCEL_PREVIEW.test(origin);

const hasSessionCookie = (req: Request): boolean => {
  const header = String(req.headers.cookie ?? '');
  return /(?:^|;\s*)(accessToken|refreshToken)=/.test(header);
};

export function requireSameSiteOrigin(req: Request, res: Response, next: NextFunction) {
  const deny = () => res.status(403).json({ message: 'Request origin not allowed.', code: 'ORIGIN_NOT_ALLOWED' });
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';

  if (originHeader) {
    if (originHeader.startsWith('chrome-extension://')) {
      const viaHeader = typeof req.headers['x-refresh-token'] === 'string' && req.headers['x-refresh-token'].length > 0;
      return viaHeader && !hasSessionCookie(req) ? next() : deny();
    }
    const normalized = originOf(originHeader);
    return normalized && isAllowedWebOrigin(normalized) ? next() : deny();
  }

  const referer = typeof req.headers.referer === 'string' ? req.headers.referer : '';
  if (referer) {
    const normalized = originOf(referer);
    return normalized && isAllowedWebOrigin(normalized) ? next() : deny();
  }
  return next();
}
