/**
 * Socket handshake auth. The socket server is a different origin from finda.sale, so the httpOnly session cookie
 * never reaches it. Pass `socketAuth` as the `auth` option of io(): socket.io-client calls it on every connection
 * attempt (first connect and each reconnect), and it fetches a fresh short-lived token from the same-origin
 * GET /api/auth/socket-token. Signed-out visitors (or any failure) connect anonymously, which still works for the
 * public rooms.
 */
export async function fetchSocketToken(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const res = await fetch('/api/auth/socket-token', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return undefined;
    const data = await res.json();
    return typeof data?.token === 'string' ? data.token : undefined;
  } catch {
    return undefined;
  }
}

export const socketAuth = (cb: (data: { token?: string }) => void): void => {
  fetchSocketToken().then((token) => cb(token ? { token } : {}));
};
