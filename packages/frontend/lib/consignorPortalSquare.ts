/**
 * Consignor portal Square connect helpers (2026-10-06).
 *
 * Square redirects every OAuth flow to ONE fixed registered URL (/square-oauth-callback). The
 * consignor portal flow has no FindA.Sale login, so before sending the consignor to Square the
 * portal page remembers its own portal token in THIS TAB ONLY (sessionStorage, 30 minute max). The
 * portal sends the same tab to Square and Square returns to the same tab, so nothing is written to
 * localStorage: on a shared device (an organizer's tablet at drop-off) the token never outlives the
 * tab. The callback page reads it back to call the public portal callback, then clears it.
 *
 * isPortalSquareState only PEEKS at the unsigned envelope to pick a route. The backend verifies the
 * HMAC signature, expiry, consignor binding and single-use nonce; nothing here is trusted for that.
 */

import axios from 'axios';

const KEY = 'fas_portal_square_pending';
const MAX_AGE_MS = 30 * 60 * 1000;

export const PORTAL_SQUARE_ANCHOR = 'square-payouts';

export type PortalSquareOutcome = 'connected' | 'needs-activation' | 'cancelled' | 'already-connected' | 'error';

function decodeBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

export function isPortalSquareState(state: string): boolean {
  try {
    if (!state || state.length > 4096) return false;
    const envelope = JSON.parse(decodeBase64Url(state));
    if (!envelope || typeof envelope.p !== 'string') return false;
    const payload = JSON.parse(envelope.p);
    return payload?.via === 'PORTAL';
  } catch {
    return false;
  }
}

export function rememberPendingPortalSquareToken(portalToken: string): void {
  const value = JSON.stringify({ t: portalToken, at: Date.now() });
  try { sessionStorage.setItem(KEY, value); } catch { /* storage blocked */ }
}

function readFrom(storage: Storage | undefined): string | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.t !== 'string' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed.t;
  } catch {
    return null;
  }
}

export function readPendingPortalSquareToken(): string | null {
  let session: Storage | undefined;
  try { session = sessionStorage; } catch { session = undefined; }
  return readFrom(session);
}

export function clearPendingPortalSquareToken(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export function portalSquareResultHref(portalToken: string, outcome: PortalSquareOutcome): string {
  return `/consignor/portal/${encodeURIComponent(portalToken)}?square=${outcome}#${PORTAL_SQUARE_ANCHOR}`;
}

export interface PortalSquareDisconnectResponse {
  status: 'NOT_CONNECTED' | 'ACTIVE' | 'NEEDS_ACTIVATION';
  canConnect: boolean;
  payoutsFlaggedForReview: boolean;
  /** false when there was nothing to disconnect (already disconnected). */
  disconnected: boolean;
}

/** Consignor disconnects Square from their portal (public, capability-token endpoint; records are kept). */
export async function disconnectPortalSquare(apiBase: string, portalToken: string): Promise<PortalSquareDisconnectResponse> {
  const response = await axios.post(`${apiBase}/consignors/portal/${encodeURIComponent(portalToken)}/square/disconnect`);
  return response.data;
}

/** Consignor asks their organizer to remove or review their personal data. Deletes nothing by itself. */
export async function requestPortalDataRemoval(apiBase: string, portalToken: string): Promise<void> {
  await axios.post(`${apiBase}/consignors/portal/${encodeURIComponent(portalToken)}/data-removal-request`);
}
