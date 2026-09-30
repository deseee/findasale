import axios from 'axios';
import {
  AUTH_COPY,
  TransientRefreshError,
  classifyApiError,
  classifyRefreshError,
  createSingleFlight,
  refreshWithTransientRetry,
} from './authRefresh';

// EPN review fix: lightweight client-side marker indicating a user has logged in
// on this browser. Used by the 401 interceptor to distinguish "expired session"
// (attempt refresh, redirect on failure) from "anonymous visitor on a public page"
// (401 is normal — never redirect). Set on login/session-restore, cleared on logout.
const SESSION_MARKER_KEY = 'fas_has_session';

export const setSessionMarker = (): void => {
  try { localStorage.setItem(SESSION_MARKER_KEY, '1'); } catch { /* SSR / storage blocked */ }
};

export const clearSessionMarker = (): void => {
  try { localStorage.removeItem(SESSION_MARKER_KEY); } catch { /* SSR / storage blocked */ }
};

export const hasSessionMarker = (): boolean => {
  try { return localStorage.getItem(SESSION_MARKER_KEY) === '1'; } catch { return false; }
};

const api = axios.create({
  // P0 FIX: Browser requests must go through the Next.js proxy (/api) so that
  // httpOnly cookies are set/sent on the same origin (finda.sale).
  // Direct Railway URL (NEXT_PUBLIC_API_URL) is cross-domain — SameSite=Lax blocks
  // cookie transmission on XHR/fetch, breaking the entire auth flow.
  // SSR still uses NEXT_PUBLIC_API_URL directly (server-to-server, no cookie issue).
  baseURL: typeof window !== 'undefined'
    ? '/api'
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'),
  headers: {
    'Content-Type': 'application/json',
  },
  // P0 Security Fix: Enable automatic cookie sending/receiving (httpOnly JWT)
  withCredentials: true,
});

// Add a request interceptor to include CSRF token
// P0 Security Fix: JWT now comes from httpOnly cookie, no longer from localStorage
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      // #104: CSRF Protection - include CSRF token from cookie in header for state-mutating requests
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method?.toUpperCase() || '')) {
        const csrfToken = document.cookie
          .split('; ')
          .find(row => row.startsWith('csrf-token='))
          ?.split('=')[1];

        if (csrfToken) {
          config.headers['x-csrf-token'] = csrfToken;
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---- Session refresh plumbing (2026-09-30) ---------------------------------------------------------------------
// The backend rotates the refresh token on every POST /auth/refresh and treats a replayed token as theft, so the
// refresh call must be SINGLE-FLIGHT: when several requests 401 at once (a page load fires many), they all wait on
// ONE refresh and then each retries with the new cookie. A transient refresh failure (503 or no response) is retried
// once after 1 second and, if it still fails, the user keeps their session and sees a temporary-error toast instead
// of being logged out.
const refreshSessionOnce = createSingleFlight(() =>
  refreshWithTransientRetry(() => api.post('/auth/refresh'))
);

let lastTemporaryErrorAt = 0;
const notifyTemporaryAuthError = (): void => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastTemporaryErrorAt < 10000) return; // one toast per burst
  lastTemporaryErrorAt = now;
  window.dispatchEvent(new CustomEvent('authTemporaryError', { detail: { message: AUTH_COPY.temporaryError } }));
};

let suspendedToastShown = false;
let suspendedRedirecting = false;
// A suspended account gets a clear message. A background read (GET) only raises the toast once, so a suspended user can
// still look at public pages; a user ACTION (POST, PUT, PATCH, DELETE) also sends them to the suspended-account page.
// Nothing here can loop: the page itself is never redirected away from, and each step happens at most once per load.
const handleAccountSuspended = (data: any, method: string): void => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem('fas_account_suspended', JSON.stringify({ reason: data?.reason ?? null, at: Date.now() }));
  } catch { /* storage blocked */ }
  const onSuspendedPage = window.location.pathname.startsWith('/account-suspended');
  if (!suspendedToastShown && !onSuspendedPage) {
    suspendedToastShown = true;
    window.dispatchEvent(new CustomEvent('accountSuspended', { detail: { message: AUTH_COPY.suspendedTitle + '. Contact support@finda.sale.' } }));
  }
  const isUserAction = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  if (isUserAction && !onSuspendedPage && !suspendedRedirecting) {
    suspendedRedirecting = true;
    window.location.assign('/account-suspended');
  }
};

let deletedHandled = false;
// A removed account: end the session cleanly (server cookies, browser marker, cart) and explain on the login page.
const handleAccountDeleted = async (): Promise<void> => {
  if (typeof window === 'undefined' || deletedHandled) return;
  deletedHandled = true;
  clearSessionMarker();
  try { localStorage.removeItem('fas_shopper_cart'); } catch { /* storage blocked */ }
  try {
    // Plain axios (not `api`) so this cannot re-enter the interceptor below.
    await axios.post('/api/auth/logout', undefined, { withCredentials: true });
  } catch { /* best effort: the server already refuses this account */ }
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login?' + new URLSearchParams({ message: AUTH_COPY.deletedMessage }).toString();
  }
};

// Add a response interceptor to handle auth errors and surface Zod validation messages
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as any;

    // P0 Security Fix: Auto-refresh expired access token using refresh token
    // Guard: never retry the refresh endpoint itself — prevents infinite 401 loops
    if (originalRequest.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    // Account state codes from the backend (2026-09-30): a suspended account and a removed account are not an expired
    // session, so neither is sent through the refresh-and-redirect path below.
    const apiKind = classifyApiError(error);
    if (apiKind === 'ACCOUNT_SUSPENDED') {
      handleAccountSuspended(error.response?.data, String(originalRequest.method || 'get'));
      return Promise.reject(error);
    }
    if (apiKind === 'ACCOUNT_DELETED') {
      await handleAccountDeleted();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Public endpoints like /auth/me return 401 for unauthenticated users — this is normal.
      // Only redirect to login if the endpoint requires authentication (not /auth/me or similar).
      if (originalRequest.url?.includes('/auth/me')) {
        return Promise.reject(error); // Let caller handle unauthenticated state gracefully
      }

      // EPN review fix: anonymous visitors must NEVER be redirected to /login by this
      // interceptor. Public pages (/items/[id], /sales/[id]) fire background calls
      // (favorites status, notifications, etc.) that 401 for logged-out users — that is
      // normal and the callers handle it. Only attempt refresh + redirect when this
      // browser has an active session marker (set on login, cleared on logout).
      if (typeof window !== 'undefined' && !hasSessionMarker()) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        // Call the refresh endpoint to get a new access token (single-flight: concurrent 401s share ONE call)
        await refreshSessionOnce();
        // Retry the original request with the new cookie
        return api(originalRequest);
      } catch (refreshError) {
        const refreshKind = refreshError instanceof TransientRefreshError ? 'TRANSIENT' : classifyRefreshError(refreshError as any);
        if (refreshKind === 'TRANSIENT') {
          // The server had a hiccup (refresh answered 503 twice, or the network dropped). The session is NOT proven
          // dead and the server kept the cookies, so keep the marker, do not redirect, and tell the user.
          notifyTemporaryAuthError();
          return Promise.reject(error);
        }
        if (refreshKind === 'ACCOUNT_DELETED') {
          await handleAccountDeleted();
          return Promise.reject(refreshError);
        }
        if (refreshKind === 'ACCOUNT_SUSPENDED') {
          // The server ended this session (cookies cleared). Explain instead of a silent redirect to login.
          clearSessionMarker();
          handleAccountSuspended((refreshError as any)?.response?.data, 'POST');
          return Promise.reject(refreshError);
        }
        // Refresh failed — session is genuinely dead. Clear the marker so subsequent
        // 401s on public pages don't re-trigger refresh/redirect, then send to login
        // (skip if already on login to prevent reload loop).
        clearSessionMarker();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          // BQ fix (2026-07-29): this redirect fires whenever tokenVersion/organizerTokenVersion
          // no longer matches (password reset, logout-all, suspension, OR a benign tier change --
          // e.g. PRO->TEAMS upgrade bumps organizer.tokenVersion by design to invalidate stale tier
          // claims). Previously this was a silent, unexplained redirect -- most confusing right after
          // a customer just paid for an upgrade mid-purchase. Reuses the existing ?message= banner
          // login.tsx already renders (Roadmap #422) rather than inventing a new mechanism. Kept
          // generic since this interceptor has no way to know WHY tokenVersion changed.
          const params = new URLSearchParams({
            message: AUTH_COPY.sessionEnded,
          });
          window.location.href = '/login?' + params.toString();
        }
        return Promise.reject(refreshError);
      }
    }

    // Public endpoints (like GET /api/items/:id) allow 401 to propagate — auth is optional for these routes.
    // Only redirect if the request was intended to be authenticated (indicated by presence of auth token).
    // Do NOT redirect from public item viewing — let the page gracefully handle unauthenticated state.

    // Handle 429 Too Many Requests — rate limit exceeded
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      const message = `Rate limited. Please wait ${Math.ceil(retryAfterMs / 1000)}s before retrying.`;

      console.warn(`[429 Rate Limit] ${message}`, { retryAfter, error });

      // HIGH-2 fix: Only show the toast for explicit user-action requests (POST, PUT, PATCH, DELETE)
      // or requests that opt-in via _showRateLimit429Toast: true.
      // GET requests (page-load data fetches, background polls, auth checks) fire silently —
      // surfacing a toast on every page load when the rate limiter is active is disruptive and
      // confusing for users who haven't done anything wrong.
      const method = (originalRequest.method || '').toUpperCase();
      const isUserAction = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
        || (originalRequest as any)._showRateLimit429Toast === true;

      if (isUserAction && typeof window !== 'undefined') {
        // Store notification in sessionStorage so components can access it (works without React context)
        sessionStorage.setItem('rateLimit429', JSON.stringify({ message, timestamp: Date.now() }));

        // Dispatch custom event for toast notification (captured by app root or layout)
        window.dispatchEvent(
          new CustomEvent('rateLimit429', {
            detail: { message, retryAfterMs },
          })
        );
      }
    }

    // E5: When the backend returns 400 with a Zod `errors` array, attach a
    // human-readable `validationMessage` so callers can display per-field feedback.
    if (error.response?.status === 400 && Array.isArray(error.response.data?.errors)) {
      const fieldMessages = (error.response.data.errors as Array<{ path?: string[]; message: string }>)
        .map((e) => (e.path?.length ? `${e.path.join('.')}: ${e.message}` : e.message))
        .join(' • ');
      error.validationMessage = fieldMessages || error.response.data.message;
    }

    return Promise.reject(error);
  }
);

/**
 * POST with automatic retry -- but ONLY for a true network error (axios `error.response`
 * is undefined, meaning no HTTP response was ever received at all -- the connection dropped
 * before the server could reply, e.g. a mobile connectivity blip mid-request). This NEVER
 * retries when the server DID respond (403, 404, 413, 500, etc.) -- those are deterministic
 * failures a retry will not fix.
 *
 * IMPORTANT -- only use this for calls that are safe to send twice. Endpoints that CREATE a
 * new database row with no idempotency key (e.g. POST /upload/rapidfire, which creates a new
 * Item server-side) must NOT use this: if the first attempt actually succeeded on the server
 * but the response was lost in the same connectivity drop, a retry would create a duplicate
 * row. Safe candidates: uploads that only return URLs with no DB write (/upload/sale-photos),
 * and appends to an existing record where a duplicate is low-harm (an extra photo URL).
 *
 * Bug fix (2026-07-03): added after a Sentry-confirmed "AxiosError: Network Error" (no HTTP
 * response received) hit a rapidfire photo upload on a mobile connection drop. Default: up to
 * 2 retries with a short backoff (1.5s, then 3s) before giving up and throwing the original
 * error to the caller's catch block, unchanged.
 */
export const postWithRetry = async (
  url: string,
  data: any,
  config?: Record<string, any>,
  retries = 2,
  backoffMs: number[] = [1500, 3000]
): Promise<any> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await api.post(url, data, config);
    } catch (err: any) {
      const isTrueNetworkError = !err?.response; // no HTTP response received at all
      if (!isTrueNetworkError || attempt === retries) throw err;
      await new Promise((resolve) =>
        setTimeout(resolve, backoffMs[attempt] ?? backoffMs[backoffMs.length - 1])
      );
    }
  }
  // Unreachable -- loop above always either returns or throws -- satisfies TS return type.
  throw new Error('postWithRetry: exhausted retries without a terminal return or throw');
};

export default api;
