import axios from 'axios';

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
        // Call the refresh endpoint to get a new access token
        await api.post('/auth/refresh');
        // Retry the original request with the new cookie
        return api(originalRequest);
      } catch (refreshError) {
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
            message: 'Your session ended -- please log back in to continue. (This can happen right after your account is upgraded.)',
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
