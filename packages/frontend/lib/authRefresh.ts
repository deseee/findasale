/**
 * Pure helpers behind the axios 401 / 403 handling in lib/api.ts (2026-09-30). Kept free of axios, window and React so
 * they can be unit tested with `npm test` (node:test through tsx).
 *
 * Backend contract these mirror:
 *   - 403 { code: 'ACCOUNT_SUSPENDED', reason?, message } from any authenticated route for a suspended account
 *   - 401 { code: 'ACCOUNT_DELETED' } from any authenticated route (and from /auth/refresh) for a removed account
 *   - POST /auth/refresh rotates the refresh token; 401 means the session is dead (cookies cleared by the server),
 *     503 means a transient server problem and the cookies are kept, so the session must NOT be dropped
 */

export type AuthFailureKind =
  | 'ACCOUNT_SUSPENDED' // show the suspended-account screen, never redirect-loop
  | 'ACCOUNT_DELETED' // log out cleanly
  | 'TRANSIENT' // refresh 5xx / no response: keep the session, retry, then tell the user
  | 'SESSION_DEAD' // refresh 401/403: the session really ended
  | 'OTHER';

type ErrorLike = { response?: { status?: number; data?: any } } | Error | null | undefined;

export const errorStatus = (error: ErrorLike): number | undefined => (error as { response?: { status?: number } } | null | undefined)?.response?.status;
export const errorCode = (error: ErrorLike): string | undefined => {
  const code = (error as { response?: { data?: { code?: unknown } } } | null | undefined)?.response?.data?.code;
  return typeof code === 'string' ? code : undefined;
};

/** Classify a failed API response (any endpoint except the refresh call itself). */
export const classifyApiError = (error: ErrorLike): AuthFailureKind => {
  const status = errorStatus(error);
  const code = errorCode(error);
  if (status === 403 && code === 'ACCOUNT_SUSPENDED') return 'ACCOUNT_SUSPENDED';
  if (status === 401 && code === 'ACCOUNT_DELETED') return 'ACCOUNT_DELETED';
  return 'OTHER';
};

/** Classify a failed POST /auth/refresh. */
export const classifyRefreshError = (error: ErrorLike): AuthFailureKind => {
  const status = errorStatus(error);
  const code = errorCode(error);
  if (code === 'ACCOUNT_DELETED') return 'ACCOUNT_DELETED';
  if (code === 'ACCOUNT_SUSPENDED') return 'ACCOUNT_SUSPENDED';
  // No response at all (network drop) or any 5xx (503 = database trouble): the session is not proven dead.
  if (status === undefined || status >= 500) return 'TRANSIENT';
  if (status === 401 || status === 403) return 'SESSION_DEAD';
  return 'OTHER';
};

/** User-facing copy (no em dashes, no product jargon). */
export const AUTH_COPY = {
  temporaryError: 'We could not refresh your session just now. Your changes are safe. Please try again in a moment.',
  suspendedTitle: 'Your account is suspended',
  suspendedBody: 'You cannot use this account right now. If you think this is a mistake, contact support@finda.sale and we will review it.',
  deletedMessage: 'This account is no longer available. You have been logged out.',
  sessionEnded: 'Your session ended. Please log back in to continue. (This can happen right after your account is upgraded.)',
} as const;

/**
 * Single-flight: while a call is in progress every caller gets the SAME promise, so N concurrent 401s trigger ONE
 * refresh request. The slot frees as soon as the promise settles (success or failure), so a later 401 starts a new one.
 */
export const createSingleFlight = <T>(fn: () => Promise<T>): (() => Promise<T>) => {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (inFlight) return inFlight;
    const p = (async () => {
      try {
        return await fn();
      } finally {
        inFlight = null;
      }
    })();
    inFlight = p;
    return p;
  };
};

export class TransientRefreshError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super('Session refresh is temporarily unavailable');
    this.name = 'TransientRefreshError';
    this.cause = cause;
  }
}

/**
 * Run the refresh call. A transient failure (503 or no response) is retried ONCE after `delayMs` (default 1 second);
 * if the retry also fails transiently a TransientRefreshError is thrown so the caller can show a temporary-error
 * message WITHOUT logging the user out. Any other failure is rethrown unchanged for the caller to classify.
 */
export const refreshWithTransientRetry = async <T>(
  doRefresh: () => Promise<T>,
  opts: { delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<T> => {
  const delayMs = opts.delayMs ?? 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  try {
    return await doRefresh();
  } catch (first) {
    if (classifyRefreshError(first as ErrorLike) !== 'TRANSIENT') throw first;
    await sleep(delayMs);
    try {
      return await doRefresh();
    } catch (second) {
      if (classifyRefreshError(second as ErrorLike) !== 'TRANSIENT') throw second;
      throw new TransientRefreshError(second);
    }
  }
};

/** A suspension reason is shown only when it is readable text; internal codes such as SERIAL_CHARGEBACKS are not. */
export const readableSuspensionReason = (reason: unknown): string | null => {
  if (typeof reason !== 'string') return null;
  const r = reason.trim();
  if (!r || r.length > 300) return null;
  if (/^[A-Z0-9_]+$/.test(r)) return null; // ADMIN_ACTION, SERIAL_CHARGEBACKS, ...
  return r;
};
