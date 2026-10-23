/**
 * Socket handshake auth. The socket server is a different origin from finda.sale, so the httpOnly session cookie
 * never reaches it. Pass `socketAuth` as the `auth` option of io(): socket.io-client calls it on every connection
 * attempt (first connect and each reconnect), and it fetches a fresh short-lived token from the same-origin
 * GET /api/auth/socket-token. Signed-out visitors (or any failure) connect anonymously, which still works for the
 * public rooms. Any failure other than a plain 401 (signed out) is logged and, unless it is a network blip or a
 * rate limit, sent to Sentry, so a broken token route is never silent again.
 */
import * as Sentry from '@sentry/nextjs';
import type { Socket } from 'socket.io-client';

// Report each kind of failure once per page load: socket.io-client calls socketAuth on every reconnect, so an
// unthrottled report would flood Sentry while the backend is down.
const reportedReasons = new Set<string>();

function reportFallback(reason: string, extra: Record<string, unknown>, toSentry: boolean): void {
  if (reportedReasons.has(reason)) return;
  reportedReasons.add(reason);
  console.warn(`[socketAuth] socket token unavailable (${reason}); connecting anonymously, private rooms will not receive events`, extra);
  Sentry.addBreadcrumb({ category: 'socket-auth', level: 'warning', message: `socket token fallback: ${reason}`, data: extra });
  if (toSentry) {
    Sentry.captureMessage(`Socket token fetch failed: ${reason}`, {
      level: 'warning',
      tags: { feature: 'socket-auth', reason },
      extra,
    });
  }
}

export async function fetchSocketToken(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  let res: Response;
  try {
    res = await fetch('/api/auth/socket-token', { credentials: 'include', cache: 'no-store' });
  } catch (err) {
    // Offline or flaky connection: expected on mobile, so log it but do not raise a Sentry event.
    reportFallback('network', { message: (err as Error)?.message }, false);
    return undefined;
  }
  // 401 is the normal answer for a signed-out visitor, who is meant to connect anonymously.
  if (res.status === 401) return undefined;
  if (!res.ok) {
    // 429 is the rate limiter doing its job; anything else (400 from NextAuth, 404, 5xx) is a real bug.
    reportFallback(`http-${res.status}`, { status: res.status, path: window.location.pathname }, res.status !== 429);
    return undefined;
  }
  try {
    const data = await res.json();
    if (typeof data?.token === 'string') return data.token;
    reportFallback('no-token', { status: res.status, path: window.location.pathname }, true);
  } catch (err) {
    reportFallback('bad-json', { status: res.status, message: (err as Error)?.message }, true);
  }
  return undefined;
}

export const socketAuth = (cb: (data: { token?: string }) => void): void => {
  fetchSocketToken().then((token) => cb(token ? { token } : {}));
};

/**
 * 2026-10-23: the backend force-disconnects a user's sockets when their sessions or plan change (suspension, role or
 * tier change, password change). socket.io-client never auto-reconnects after a server-side disconnect, so without
 * this the page would silently stop receiving POS payment requests, cart shares and status updates until reload.
 * Reconnecting re-runs socketAuth, so a revoked user comes back anonymous and everyone else gets a fresh token.
 * Rooms do not survive a reconnect; callers that join rooms already re-join on 'connect'.
 */
export function reconnectAfterServerDrop(socket: Socket): void {
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') socket.connect();
  });
}
