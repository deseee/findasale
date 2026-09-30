/**
 * extensionBearerOnly (2026-09-30): the Marketplace Autofill extension routes (/api/extension) are CSRF-exempt ONLY
 * for requests that carry a Bearer token (see the carve-out in index.ts), on the argument that a cross-site page cannot
 * attach an Authorization header the way a browser auto-attaches cookies. That argument fails if the auth middleware
 * would still accept the session COOKIE on such a request: middleware/auth.authenticate reads req.cookies.accessToken
 * FIRST and only falls back to the Authorization header, so "Bearer <anything>" + a victim's cookie would skip CSRF and
 * authenticate as the cookie's owner. This middleware closes that gap for the extension router:
 *   - a request WITH a Bearer token has the accessToken cookie removed before authenticate runs, so the Bearer token is
 *     the only credential considered (a junk token then simply 401s);
 *   - a state-changing request (anything but GET/HEAD/OPTIONS) WITHOUT a Bearer token is refused with 401, so a
 *     cookie-only write can never get through this router (it would also fail the global CSRF check);
 *   - a GET/HEAD without a Bearer token is left alone (the organizer's own web page reads /sync-health with its cookie;
 *     a safe method needs no CSRF defense).
 * It does not authenticate anything itself; `authenticate` and the role/tier checks still run afterwards.
 */
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True when the Authorization header is "Bearer <non-empty token>". */
export const hasBearerToken = (req: Pick<Request, 'headers'>): boolean =>
  /^Bearer\s+\S+/.test(String(req.headers?.authorization ?? ''));

/** True for /api/extension and anything under it (exact segment, so /api/extensionfoo does not count). */
export const isExtensionPath = (path: string): boolean => path === '/api/extension' || path.startsWith('/api/extension/');

/** The global CSRF carve-out: an extension-path request that presents a Bearer token. */
export const isExtensionBearerRequest = (req: Pick<Request, 'headers' | 'path'>): boolean =>
  isExtensionPath(req.path) && hasBearerToken(req);

export function extensionBearerOnly(req: Request, res: Response, next: NextFunction) {
  if (hasBearerToken(req)) {
    if (req.cookies && typeof req.cookies === 'object') delete (req.cookies as Record<string, unknown>).accessToken;
    return next();
  }
  if (!SAFE_METHODS.has(String(req.method).toUpperCase())) {
    return res.status(401).json({ message: 'Bearer token required', code: 'BEARER_REQUIRED' });
  }
  return next();
}
