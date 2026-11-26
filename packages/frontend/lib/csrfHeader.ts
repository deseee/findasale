/**
 * CSRF double-submit header for raw fetch() calls.
 *
 * The api axios instance adds x-csrf-token on every POST/PUT/PATCH/DELETE (lib/api.ts). A raw fetch()
 * does not, and the backend's validateCsrfToken (packages/backend/src/middleware/csrf.ts) only skips the
 * check for a Bearer request that carries NO session cookie. Right after POST /api/auth/oauth the browser
 * holds the new accessToken/refreshToken cookies, so a Bearer-only fetch is rejected with
 * 403 "CSRF token validation failed". That is how every Google/Facebook listing claim failed (Nov 2026).
 * Spread csrfHeaders() into the headers of any state-changing raw fetch to the API.
 */

export const CSRF_COOKIE_NAME = 'csrf-token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** The csrf-token cookie's value from a document.cookie string, or undefined when it is absent or empty. */
export function readCsrfToken(cookieString: string | null | undefined): string | undefined {
  if (!cookieString) return undefined;
  for (const part of cookieString.split(';')) {
    const row = part.trim();
    if (row.startsWith(`${CSRF_COOKIE_NAME}=`)) {
      const value = row.slice(CSRF_COOKIE_NAME.length + 1);
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

/** { 'x-csrf-token': token } when the cookie is present, otherwise {}. Defaults to the browser's cookies. */
export function csrfHeaders(cookieString?: string | null): Record<string, string> {
  const source = cookieString !== undefined
    ? cookieString
    : (typeof document !== 'undefined' ? document.cookie : undefined);
  const token = readCsrfToken(source);
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}
