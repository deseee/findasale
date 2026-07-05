import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * #104: CSRF Protection using Double-Submit Cookie Pattern
 *
 * Double-submit cookies work by:
 * 1. Server generates a random token and sends it in a cookie (not httpOnly, so JS can read it)
 * 2. Client must include the same token in a request header
 * 3. Server validates that the cookie token matches the header token
 *
 * This prevents CSRF because:
 * - Attacker cannot read tokens from other origins (SameSite cookie policy)
 * - Even if attacker tricks user into visiting malicious site, they cannot construct valid request headers
 * - Token is cryptographically random per request
 */

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

/**
 * Generate a new CSRF token
 */
export const generateCsrfToken = (): string => {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
};

/**
 * Simple cookie parser for CSRF token (no external dependency)
 */
const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [key, value] = cookie.split('=').map(c => c.trim());
    if (key && value) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
  });

  return cookies;
};

/**
 * Middleware to set CSRF token cookie on all requests
 * Called before route handlers to ensure token is available for forms
 * BUG #30 FIX: Do not refresh token on OPTIONS preflight requests — this breaks the
 * token validation cycle because the preflight response sets a new token, but the
 * subsequent POST request arrives with the old token value from the preflight.
 *
 * Bug fix (2026-07-03): this used to mint a brand-new token on EVERY request
 * regardless of method, overwriting the cookie each time. That's a race condition for
 * any client that fires more than one state-mutating request in close succession --
 * confirmed in production via Sentry (AxiosError 403, feature=rapidfire-upload): a
 * rapidfire capture session fires several overlapping requests (photo upload,
 * hold-analysis, release-analysis, poll-for-AI), and once enough of those overlap, one
 * request's token gets invalidated by a DIFFERENT response's Set-Cookie landing first --
 * the client reads whichever cookie value is current at send time, but by the time the
 * request reaches this middleware's validator, a concurrent response may have already
 * rotated it. This is why it took "a couple of items" before failing: more concurrent
 * background calls in flight -> higher chance of the race. Double-submit CSRF tokens are
 * a session-lived credential in essentially every mainstream implementation (Django,
 * Rails, OWASP's own reference pattern) -- rotating on every single request added no
 * real defense (the token was never single-use/consumed) while introducing this exact
 * bug. Fix: only mint a token when the request doesn't already carry a valid one: first
 * visit, or after the existing one's Max-Age has expired. It still rotates hourly and
 * naturally rotates after login/logout (new session, new cookie jar state), just not on
 * every request within a session.
 */
export const csrfTokenCookie = (req: Request, res: Response, next: NextFunction) => {
  // Skip token refresh on preflight OPTIONS requests (they don't carry state)
  // This allows the token to remain stable across the preflight-POST cycle
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Reuse the existing token if the client already presented one — only mint a new one
  // when there isn't one yet, instead of rotating on every single request.
  const existingToken = parseCookies(req.headers.cookie)[CSRF_COOKIE_NAME];
  if (existingToken) {
    (req as any).csrfToken = existingToken;
    return next();
  }

  const token = generateCsrfToken();

  // Build Set-Cookie header manually (no cookie-parser dependency)
  const cookieValue = `${CSRF_COOKIE_NAME}=${token}; Path=/; Max-Age=${60 * 60}; ${
    process.env.NODE_ENV === 'production' ? 'Secure; ' : ''
  }SameSite=Strict`;

  res.setHeader('Set-Cookie', cookieValue);

  // Make token available to templates/response handlers
  (req as any).csrfToken = token;
  next();
};

/**
 * Middleware to validate CSRF token on state-mutating requests (POST/PUT/PATCH/DELETE)
 * Skip CSRF validation for:
 * - Webhook routes (Stripe, external services use different auth)
 * - Public endpoints that don't require authentication
 */
export const validateCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for webhooks and external server-to-server callbacks (they use signature verification instead)
  // /api/internal/* routes are server-to-server (e.g. scraper ingest from GitHub Actions) and authenticate
  // via x-scraper-key shared secret — same model as Stripe webhook signatures.
  if (req.path.includes('/webhook') || req.path.includes('/resend-webhook') || req.path.includes('/stripe/webhook') || req.path.includes('/billing/webhook') || req.path.includes('/ebay/account-deletion') || req.path.includes('/api/internal/') || req.path.includes('/api/crawler-log')) {
    return next();
  }

  // Skip CSRF for unauthenticated auth endpoints
  // These endpoints are stateless and don't use cookies for authentication (JWT is in localStorage)
  // CSRF protection only meaningful for authenticated state-mutating requests
  // Cross-origin architecture makes double-submit pattern impossible for unauthenticated requests
  // P0 FIX: /auth/refresh also bypassed — it uses httpOnly cookie (not bearer token) so the
  // Bearer-token bypass below doesn't fire, and the CSRF cookie path/domain may not match
  // when going through the Next.js proxy. Refresh is CSRF-safe: it reads a secret httpOnly cookie
  // that attackers cannot read or forge from a different origin.
  if (req.path.includes('/auth/login') || req.path.includes('/auth/register') ||
      req.path.includes('/auth/oauth') || req.path.includes('/auth/forgot-password') ||
      req.path.includes('/auth/reset-password') || req.path.includes('/auth/refresh') ||
      req.path.includes('/auth/logout')) {
    return next();
  }

  // Public outreach tracking + RFC 8058 unsubscribe — anonymous callers with no browser session.
  // page-view: fire-and-forget tracker from organizer profile page (outreach prospects not logged in).
  // unsubscribe POST: RFC 8058 one-click from Gmail/Yahoo mail servers (no cookies, no CSRF context).
  if (req.path.includes('/outreach/page-view') || req.path.includes('/outreach/unsubscribe')) {
    return next();
  }

  // JWT Bearer auth is inherently CSRF-safe (attackers cannot set custom headers cross-origin)
  // Skip double-submit cookie check when a valid Bearer token is present
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  // Parse cookies manually
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[CSRF_COOKIE_NAME];

  // Get token from header (client must send it)
  const headerToken = req.headers[CSRF_HEADER_NAME];

  // Both must exist and match
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      message: 'CSRF token validation failed. Please refresh the page and try again.'
    });
  }

  next();
};
