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
 */
export const csrfTokenCookie = (req: Request, res: Response, next: NextFunction) => {
  // Always set a new CSRF token for every request (fresh tokens improve security)
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
  // Skip CSRF for webhooks (they use signature verification instead)
  if (req.path.includes('/webhook') || req.path.includes('/stripe/webhook') || req.path.includes('/billing/webhook')) {
    return next();
  }

  // Skip CSRF for unauthenticated auth endpoints
  // These endpoints are stateless and don't use cookies for authentication (JWT is in localStorage)
  // CSRF protection only meaningful for authenticated state-mutating requests
  // Cross-origin architecture makes double-submit pattern impossible for unauthenticated requests
  if (req.path.includes('/auth/login') || req.path.includes('/auth/register') ||
      req.path.includes('/auth/oauth') || req.path.includes('/auth/forgot-password') ||
      req.path.includes('/auth/reset-password')) {
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
