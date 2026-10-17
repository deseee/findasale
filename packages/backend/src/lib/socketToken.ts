// Short-lived, single-purpose JWT for the Socket.io handshake.
// The socket server lives on a different origin (Railway) from the app (finda.sale), so the host-only httpOnly
// accessToken cookie never reaches it. The browser instead fetches one of these from the same-origin
// GET /api/auth/socket-token and passes it in handshake.auth.token. It is signed with JWT_SECRET (HS256) and
// carries the same identity claims as an access token (id, role, tokenVersion) plus purpose: 'socket'.
// middleware/auth.ts refuses any token carrying a purpose, so it can never authenticate an API route.
import jwt from 'jsonwebtoken';

export const SOCKET_TOKEN_PURPOSE = 'socket';
export const SOCKET_TOKEN_TTL_SECONDS = 120;

export function signSocketToken(user: { id: string; role?: string | null; tokenVersion?: number | null }): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign(
    { id: user.id, role: user.role ?? undefined, tokenVersion: user.tokenVersion ?? 0, purpose: SOCKET_TOKEN_PURPOSE },
    secret,
    { algorithm: 'HS256', expiresIn: SOCKET_TOKEN_TTL_SECONDS }
  );
}
