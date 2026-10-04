/**
 * lib/etsyCallback.ts -- pure helpers for pages/organizer/etsy-oauth-callback.tsx (ADR-135 D1.5, batch E-B5).
 *
 * The callback page reads Etsy's `code` and `state` from the address bar ONCE, scrubs them from the URL,
 * posts them to POST /api/etsy/callback exactly once, and sends the organizer back to the Etsy tab in
 * Settings with a banner. Rules enforced here and tested in lib/__tests__/etsyCallback.test.ts:
 *   - `code` and `state` are never part of a redirect target and never logged.
 *   - the banner reason in the redirect is a key from a fixed whitelist, never free text.
 *   - claimEtsyCallbackOnce() makes a second effect run (React strict mode, a remount, a fast double
 *     navigation) a no-op for the same `state`.
 *
 * Pure module: no imports of React or Next, no env reads, no network.
 */

import { ETSY_BANNER_MESSAGES } from './etsyCopy';
import { etsyErrorCode, etsyErrorStatus } from './etsyUiState';

export const ETSY_CALLBACK_PATH = '/organizer/etsy-oauth-callback';
export const ETSY_SETTINGS_PATH = '/organizer/settings';

export type EtsyCallbackQuery =
  | { kind: 'code'; code: string; state: string }
  | { kind: 'denied' }
  | { kind: 'missing' };

function first(v: unknown): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' && x.length > 0 ? x : null;
}

const MAX_PARAM_LEN = 2048;

/**
 * Etsy redirects back with `code` + `state` (approved) or `error` (declined), the standard OAuth
 * query. An `error` always wins, even when a code is also present.
 */
export function parseEtsyCallbackQuery(query: Record<string, unknown> | null | undefined): EtsyCallbackQuery {
  const q = query ?? {};
  if (first(q.error)) return { kind: 'denied' };
  const code = first(q.code);
  const state = first(q.state);
  if (code && state && code.length <= MAX_PARAM_LEN && state.length <= MAX_PARAM_LEN) return { kind: 'code', code, state };
  return { kind: 'missing' };
}

/** In-memory guard: the first caller for a given key gets true, every later caller gets false. */
export function createOnceGuard(): (key: string) => boolean {
  // No prototype, so keys such as "constructor" or "__proto__" are ordinary keys.
  const claimed: Record<string, boolean> = Object.create(null);
  return (key: string): boolean => {
    if (key in claimed) return false;
    claimed[key] = true;
    return true;
  };
}

/** Shared for the page's lifetime in the browser tab. Holds the state value in memory only. */
export const claimEtsyCallbackOnce = createOnceGuard();

export type EtsyCallbackOutcome =
  | { ok: true }
  | { ok: false; reason: keyof typeof ETSY_BANNER_MESSAGES };

/** Maps a failed POST /api/etsy/callback to a whitelisted banner key. */
export function outcomeFromCallbackError(err: unknown): EtsyCallbackOutcome {
  const code = etsyErrorCode(err);
  const status = etsyErrorStatus(err);
  if (code && Object.prototype.hasOwnProperty.call(ETSY_BANNER_MESSAGES, code) && code !== 'connected') {
    return { ok: false, reason: code as keyof typeof ETSY_BANNER_MESSAGES };
  }
  if (code === 'ETSY_NOT_CONFIGURED') return { ok: false, reason: 'ETSY_DISABLED' };
  if (code === 'ETSY_BLOCKED' || code === 'ETSY_BUDGET' || status === 429) return { ok: false, reason: 'ETSY_BUSY' };
  return { ok: false, reason: 'generic' };
}

/** Where to send the organizer next. Contains only fixed keys: no code, no state, no free text. */
export function buildEtsySettingsRedirect(
  outcome: EtsyCallbackOutcome | { ok: false; reason: 'denied' | 'missing' }
): string {
  const base = `${ETSY_SETTINGS_PATH}?tab=etsy`;
  if (outcome.ok) return `${base}&etsy=connected`;
  return `${base}&etsy=error&reason=${encodeURIComponent(outcome.reason)}`;
}
