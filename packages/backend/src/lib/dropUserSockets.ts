/**
 * 2026-10-23 (security): drop a user's live sockets after anything that revokes or re-scopes their sessions
 * (tokenVersion bump on User or Organizer, suspension, role or tier change). Their personal room carries POS payment
 * requests, hold invoices and cart shares, and a socket joined before the change otherwise keeps receiving them.
 * Clients reconnect on their own (frontend lib/socketAuth.ts reconnectAfterServerDrop) and the handshake re-checks
 * the user in the DB, so a revoked or suspended user comes back anonymous and everyone else gets a fresh socket.
 *
 * Best effort: never throws, and a missing userId is a no-op. lib/socket is imported lazily so callers (and their
 * tests) do not load socket.io / redis just to call this.
 */
export async function dropUserSockets(userId: string | null | undefined, context = 'revoke'): Promise<void> {
  if (!userId) return;
  try {
    const { disconnectUserSockets } = await import('./socket');
    if (typeof disconnectUserSockets === 'function') disconnectUserSockets(userId);
  } catch (err) {
    console.error(`[socket] dropUserSockets failed (${context}):`, err);
  }
}
