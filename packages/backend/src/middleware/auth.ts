import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

// Extend Express Request type
export interface AuthRequest extends Request {
  user?: any & {
    roles?: string[]; // Feature #72 Phase 2: Array of roles
    organizerProfile?: {
      subscriptionTier?: string;
      [key: string]: any;
    };
    effectiveTier?: 'SIMPLE' | 'PRO' | 'TEAMS'; // Feature #75: Effective tier after lapse fallback
    subscriptionLapsed?: boolean; // Feature #75: Whether subscription is currently lapsed
  };
}

// 2026-09-30: a full-strength access JWT in `?token=` leaks through access logs, browser history, Referer headers and
// shared links, and it stays valid for an hour. Nothing in the repo uses it any more (the brand-kit PDF buttons fetch
// with the cookie as a blob), so the query-string fallback is OFF everywhere by default. A route that genuinely must
// accept a URL token has to be listed, by exact path or path prefix, in AUTH_URL_TOKEN_PATHS (comma separated), and
// even then the token must have been issued within URL_TOKEN_MAX_AGE_SECONDS. New code that needs a link-borne
// credential should mint a dedicated single-purpose short token instead of reusing the session JWT.
const URL_TOKEN_MAX_AGE_SECONDS = 5 * 60;

export function urlTokenAllowedFor(req: Request): boolean {
  const list = (process.env.AUTH_URL_TOKEN_PATHS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return false;
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return list.some((entry) => path === entry || path.startsWith(entry.endsWith('/') ? entry : `${entry}/`));
}

const warnedUrlTokenPaths = new Set<string>();

export const optionalAuthenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // P0 Security Fix: Try cookie first (httpOnly), then Authorization header, then (allowlisted routes only) query param
    let token: string | null = null;
    let tokenFromUrl = false;

    // Try httpOnly cookie first
    if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    // Fallback to Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    // Query-parameter fallback: allowlisted routes only (see URL_TOKEN_MAX_AGE_SECONDS above). Elsewhere the value is
    // ignored, so the request is simply anonymous.
    if (!token && typeof req.query.token === 'string' && req.query.token) {
      if (urlTokenAllowedFor(req)) {
        token = req.query.token;
        tokenFromUrl = true;
      } else {
        const p = (req.originalUrl || req.url || '').split('?')[0];
        if (!warnedUrlTokenPaths.has(p) && warnedUrlTokenPaths.size < 200) {
          warnedUrlTokenPaths.add(p);
          console.warn(`[auth] ignoring ?token= JWT on ${p}: URL tokens are not accepted on this route`);
        }
      }
    }

    if (!token) {
      return next(); // No token — proceed as unauthenticated
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return next();
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { id: string; role?: string; roles?: string[]; tokenVersion?: number; iat?: number };
    if (tokenFromUrl && (typeof decoded.iat !== 'number' || Date.now() / 1000 - decoded.iat > URL_TOKEN_MAX_AGE_SECONDS)) {
      return next(); // a URL-borne token must be fresh; a stale one is anonymous, never an error
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    // 2026-09-29: honor tokenVersion here exactly like `authenticate` does. A token invalidated by a password
    // change / reset / logout-all used to keep identifying the user on every optionalAuthenticate route (viewer-specific
    // hold and invoice fields, personalised data). A stale token is treated as anonymous, never as an error.
    const staleTokenVersion = user
      ? (decoded.tokenVersion === undefined ? user.tokenVersion > 0 : decoded.tokenVersion !== user.tokenVersion)
      : false;
    // 2026-09-30: a suspended or soft-deleted account is not identified on optional routes either (guest checkout and
    // other viewer-aware routes must not treat it as a signed-in user).
    const blockedAccount = Boolean(user && (user.suspendedAt || user.deletedAt));
    if (user && !staleTokenVersion && !blockedAccount) {
      req.user = user;
      // SECURITY FIX S692: Always use DB roles — never JWT roles.
      // JWT roles go stale immediately when an admin changes a user's role.
      // DB is the single source of truth for authorization.
      req.user.roles = user.roles || [];
    }
  } catch (err) {
    // S-HOLD-INVOICE-CARD fix (2026-08-26): an EXPIRED access token is not the same case as
    // NO token at all. Previously both were folded into "proceed as unauthenticated," which
    // silently downgraded a still-logged-in shopper (valid refresh-token cookie, expired
    // short-lived access-token cookie) to anonymous for this single request -- with no error
    // for the frontend to detect or recover from. That is exactly what starved
    // GET /items/:id of req.user on a hard reload: buildHoldFieldsForViewer() only returns
    // reservedBy/invoiceCheckoutUrl/invoiceExpiresAt when it can see who the viewer is, so an
    // INVOICE_ISSUED item silently rendered without its HoldInvoiceStatusCard even though the
    // shopper was, from their own perspective, still logged in.
    // `authenticate` (below) already treats TokenExpiredError as a 401 specifically so that
    // packages/frontend/lib/api.ts's response interceptor can transparently refresh the access
    // token and retry the original request. Mirroring that here for the one error case that
    // means "a session exists but needs refreshing" restores that same self-heal for every
    // optionalAuthenticate route without changing behavior for a genuinely anonymous visitor
    // (no token at all never reaches this catch) or for a malformed/invalid token (falls
    // through to the unchanged silent-anonymous fallback below, unauthenticated but not
    // blocked -- this route must still work with no session).
    if ((err as any)?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    // Invalid token (bad signature, malformed, etc.) — proceed as unauthenticated, do not block
  }
  next();
};

// Feature #72 / BUG #22: requireOrganizer checks both legacy `role` field and
// the multi-role `roles` array. ADMIN users are included to allow admins to manage organizer features.
export const requireOrganizer = (req: AuthRequest, res: Response, next: NextFunction) => {
  const hasOrganizerRole =
    req.user?.roles?.includes('ORGANIZER') ||
    req.user?.role === 'ORGANIZER' ||
    req.user?.roles?.includes('ADMIN') ||
    req.user?.role === 'ADMIN';
  if (!req.user || !hasOrganizerRole) {
    return res.status(403).json({ message: 'Organizer access required.' });
  }
  next();
};

// S244: requireAdmin — restricts route to ADMIN role only
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const isAdmin =
    req.user?.roles?.includes('ADMIN') ||
    req.user?.role === 'ADMIN';
  if (!req.user || !isAdmin) {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

// Feature #75: Check tier lapse state and set effective tier
export const checkTierLapse = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next();
    }

    // Check if user is an organizer
    const isOrganizer = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!isOrganizer) {
      // Non-organizers don't have tier lapse state
      return next();
    }

    // Fetch UserRoleSubscription for ORGANIZER role
    const roleSubscription = await prisma.userRoleSubscription.findFirst({
      where: {
        userId: req.user.id,
        role: 'ORGANIZER',
      },
    });

    if (!roleSubscription) {
      // No subscription record found — use current tier from organizer profile
      req.user.effectiveTier = req.user.organizerProfile?.subscriptionTier || 'SIMPLE';
      req.user.subscriptionLapsed = false;
      return next();
    }

    // Check if subscription is lapsed (tierLapsedAt set AND tierResumedAt null)
    const isLapsed = roleSubscription.tierLapsedAt !== null && roleSubscription.tierResumedAt === null;

    if (isLapsed) {
      // Subscription is lapsed — effective tier is SIMPLE regardless of subscriptionTier
      req.user.effectiveTier = 'SIMPLE';
      req.user.subscriptionLapsed = true;
    } else {
      // Subscription is active — use the subscription tier
      req.user.effectiveTier = roleSubscription.subscriptionTier;
      req.user.subscriptionLapsed = false;
    }

    next();
  } catch (error) {
    console.error('[checkTierLapse] Error checking tier lapse:', error);
    // On error, fall back to organizer profile tier and continue
    req.user.effectiveTier = req.user?.organizerProfile?.subscriptionTier || 'SIMPLE';
    req.user.subscriptionLapsed = false;
    next();
  }
};

const SUSPENDED_ALLOWED_PATHS = new Set(['/api/auth/me', '/api/auth/logout', '/auth/me', '/auth/logout']);

/** True when a suspended user may still use this route (own status, logout, admin console for admins). */
export function suspensionExempt(req: Request, user: { role?: string; roles?: string[] }): boolean {
  const path = (req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
  if (SUSPENDED_ALLOWED_PATHS.has(path)) return true;
  const isAdmin = user.role === 'ADMIN' || Boolean(user.roles?.includes('ADMIN'));
  return isAdmin && (path === '/api/admin' || path.startsWith('/api/admin/'));
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // P0 Security Fix: Try cookie first (httpOnly), then Authorization header
    let token: string | null = null;

    // Try httpOnly cookie first
    if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    // Fallback to Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET is not set');
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { id: string; role?: string; roles?: string[]; tokenVersion?: number; organizerTokenVersion?: number };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { organizer: true, roleSubscriptions: true }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // P0 Fix 4: Validate tokenVersion — if JWT has stale version, token is invalidated
    if (decoded.tokenVersion === undefined ? user.tokenVersion > 0 : decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: 'Token has been invalidated' });
    }

    // P0-1 Fix: Validate organizerTokenVersion for organizers — invalidate stale tier claims
    if ((decoded.role === 'ORGANIZER' || decoded.roles?.includes('ORGANIZER')) && decoded.organizerTokenVersion !== undefined && user.organizer) {
      if (decoded.organizerTokenVersion !== user.organizer.tokenVersion) {
        return res.status(401).json({ message: 'Session invalidated. Please log in again.' });
      }
    }

    // Platform Safety #117 / 2026-09-30: suspension is enforced on EVERY authenticated route, not just checkout paths
    // (a suspended account used to keep full access to messaging, listings, bidding and organizer tools). The user row
    // is already loaded above on every request, so this needs no extra query and no cache: an unsuspend takes effect on
    // the very next request. Checked after the token-version tests so a stale token learns nothing about the account.
    // A soft-deleted account is refused outright. Exemptions: a suspended user may still read their own status
    // (GET /auth/me) and log out, and an ADMIN keeps /api/admin/* so an admin account can never be locked out of the
    // console that unsuspends accounts.
    if (user.deletedAt) {
      return res.status(401).json({ code: 'ACCOUNT_DELETED', message: 'This account is no longer available.' });
    }
    if (user.suspendedAt && !suspensionExempt(req, user)) {
      return res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended',
        reason: user.suspendReason,
        details: 'Contact support@finda.sale for account review',
      });
    }

    // Attach user to request
    req.user = user;
    // SECURITY FIX S692: Always use DB roles — never JWT roles (same fix as optionalAuthenticate).
    req.user.roles = user.roles || [];
    // Attach organizer profile for tier checks
    if (user.organizer) {
      req.user.organizerProfile = user.organizer;
    }

    // Exit-impersonation support (2026-09-25, exit-impersonation-adr): the impersonation
    // JWT carries impersonatedBy (the admin's own id), but req.user is always built fresh
    // from the DB row above, which has no such column -- so this claim was silently lost
    // for every route, including GET /auth/me. Forward it through so it survives both the
    // initial "Log in as" click and a page refresh mid-impersonation.
    if ((decoded as any).impersonatedBy) {
      (req.user as any).impersonatedBy = (decoded as any).impersonatedBy;
      (req.user as any).impersonatingAdminEmail = (decoded as any).impersonatingAdminEmail ?? null;
      (req.user as any).impersonatingAdminName = (decoded as any).impersonatingAdminName ?? null;
    }

    // Feature #75: Check tier lapse state for organizers
    return checkTierLapse(req, res, next);
  } catch (error) {
    // S708-style fix: TokenExpiredError is the routine, expected case of a short-lived
    // access token naturally expiring - the client silently refreshes via /auth/refresh
    // and retries. Logging it at error severity floods Sentry with non-actionable noise.
    // Only genuinely invalid/malformed tokens are logged as errors (see lib/socket.ts:66-71
    // for the same pattern).
    const errName = (error as any)?.name;
    if (errName !== 'TokenExpiredError') {
      console.error('Authentication error:', error);
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};
