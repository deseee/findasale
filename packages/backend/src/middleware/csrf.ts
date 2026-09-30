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
 * Exact-path allowlist (2026-09-29). This used to be `req.path.includes('/webhook')` plus a pile of other
 * substring matches, which (a) exempted /api/webhooks (the TEAMS webhook CRUD, cookie-authenticated) and any
 * path that merely contained the text "/auth/oauth" or "/webhook", and (b) let a crafted path such as
 * /api/items/x/webhook-anything skip the check. Only the real machine-to-machine / mail-client endpoints
 * below are exempt, each authenticated by something other than a browser session (signature, shared secret,
 * or an HMAC/one-time token in the URL).
 */

/** Signature- or shared-secret-authenticated server-to-server endpoints (no cookies, no CSRF context). */
const CSRF_EXEMPT_EXACT_PATHS: ReadonlySet<string> = new Set([
  // Payment / provider webhooks (signature verified in the handler)
  '/api/stripe/webhook',
  '/api/billing/webhook',
  '/api/square/webhook',
  '/api/snooze/webhook', // MailerLite HMAC
  '/api/outreach/resend-webhook', // svix signature
  '/api/notifications/sms-webhook', // inbound SMS (Twilio signature)
  '/api/ebay/account-deletion',
  '/api/ebay/notifications',
  // Machine-to-machine triggers with their own shared secret
  '/api/crawler-log',
  '/api/video/footage-ingest', // x-ingest-secret
  // Anonymous callers with no browser session
  '/api/outreach/page-view',
  '/api/outreach/unsubscribe', // RFC 8058 one-click from mail servers
  '/api/shopper/waitlist/unsubscribe', // RFC 8058 one-click for Notify Me emails (HMAC token in the URL)
]);

/** Prefixes whose every route is server-to-server (each route verifies its own secret/signature). */
const CSRF_EXEMPT_PREFIXES: readonly string[] = [
  '/api/internal/', // x-scraper-key / REVALIDATE_SECRET gated
  '/api/twilio/', // X-Twilio-Signature HMAC (isValidTwilioRequest in routes/twilioVoice.ts)
];

/**
 * Unauthenticated login-flow endpoints (exact paths). They read/write httpOnly cookies but authenticate by
 * credential or by a secret cookie an attacker cannot read cross-origin, so the double-submit token adds
 * nothing (and the cookie path/domain can mismatch behind the Next.js proxy). /api/auth/oauth is the
 * OAuth login POST only: /api/auth/oauth/link and /api/auth/oauth-verify-age are authenticated mutations
 * and DO need CSRF.
 */
const CSRF_EXEMPT_AUTH_PATHS: ReadonlySet<string> = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/oauth',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/refresh', // reads a secret httpOnly cookie an attacker cannot read or forge cross-origin
  '/api/auth/logout',
]);

const normalizePath = (path: string): string => (path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path);

/** True when this exact request path is on the CSRF allowlist. Exported for tests. */
export const isCsrfExemptPath = (rawPath: string): boolean => {
  const path = normalizePath(rawPath);
  if (CSRF_EXEMPT_EXACT_PATHS.has(path) || CSRF_EXEMPT_AUTH_PATHS.has(path)) return true;
  return CSRF_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
};

/** Cookie names that carry a browser session (a request with one of these is cookie-authenticated). */
const AUTH_COOKIE_NAMES = ['accessToken', 'refreshToken'];

/**
 * Middleware to validate CSRF token on state-mutating requests (POST/PUT/PATCH/DELETE).
 * Skips only the exact-path allowlists above (signature/secret-authenticated endpoints), and skips the
 * double-submit check for Bearer-authenticated requests that carry no session cookie.
 */
export const validateCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  // Signature-authenticated webhooks, machine-to-machine triggers, mail-client one-click endpoints and the
  // unauthenticated login flow are matched by EXACT path (or a server-to-server prefix); see the allowlists
  // above for why each is safe and why nothing is matched by substring any more.
  if (isCsrfExemptPath(req.path)) {
    return next();
  }

  // Parse cookies once: needed for the Bearer rule below and for the double-submit check.
  const cookies = parseCookies(req.headers.cookie);

  // JWT Bearer auth is inherently CSRF-safe (attackers cannot set custom headers cross-origin) ONLY when the
  // browser is not also carrying a session cookie: a cookie-authenticated request can be forged cross-site,
  // and an attacker-controlled page could try to add a junk Authorization header alongside the victim's
  // cookie. So the Bearer skip applies only when no auth cookie is present.
  const authHeader = req.headers['authorization'];
  const hasAuthCookie = AUTH_COOKIE_NAMES.some((name) => !!cookies[name]);
  if (authHeader && authHeader.startsWith('Bearer ') && !hasAuthCookie) {
    return next();
  }

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
