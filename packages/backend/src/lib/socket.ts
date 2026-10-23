// V1: Socket.io singleton — initialized once in index.ts, shared across controllers
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { SOCKET_TOKEN_PURPOSE } from './socketToken';
import { canAccessOrganizerSales } from '../utils/saleStaffAccess';

let _io: Server | undefined;

type SocketUserRow = {
  id: string;
  role: any;
  roles: any;
  tokenVersion: number | null;
  suspendedAt: Date | null;
  deletedAt: Date | null;
};

/**
 * 2026-10-23 (security): shared user half of every socket privilege check. A handshake JWT is only trusted if the
 * user still exists, is not suspended or deleted, and the token's tokenVersion matches the DB (password reset,
 * change-password, suspend and delete all bump tokenVersion). A token minted without tokenVersion is accepted only
 * while the user's tokenVersion is still 0.
 */
function isSocketUserActive(socketData: { tokenVersion?: number }, user: SocketUserRow | null): user is SocketUserRow {
  if (!user || user.suspendedAt || user.deletedAt) return false;
  const staleTokenVersion =
    socketData.tokenVersion === undefined ? (user.tokenVersion ?? 0) > 0 : socketData.tokenVersion !== user.tokenVersion;
  return !staleTokenVersion;
}

const SOCKET_USER_SELECT = { id: true, role: true, roles: true, tokenVersion: true, suspendedAt: true, deletedAt: true } as const;

/** Re-reads the handshake user from the DB; false for anonymous, revoked, suspended or deleted. Never throws. */
export async function isSocketUserCurrent(socketData: { userId?: string; tokenVersion?: number }): Promise<boolean> {
  try {
    if (!socketData?.userId) return false;
    const user = await prisma.user.findUnique({ where: { id: socketData.userId }, select: SOCKET_USER_SELECT });
    return isSocketUserActive(socketData, user as SocketUserRow | null);
  } catch (error) {
    console.error('[socket] user check failed (denying):', error);
    return false;
  }
}

/**
 * Force-disconnect every live socket in a user's personal room (POS payment requests, hold invoices, cart shares).
 * Call after anything that revokes the user's sessions (tokenVersion bump). Safe before initSocket and never throws;
 * with the Redis adapter this reaches sockets on every instance.
 */
export function disconnectUserSockets(userId: string): void {
  try {
    if (!_io || !userId) return;
    _io.in(`user:${userId}`).disconnectSockets(true);
  } catch (error) {
    console.error('[socket] disconnectUserSockets failed:', error);
  }
}

/**
 * 2026-10-13 (security): private sale rooms (morning briefing team data, live organizer status with
 * revenue) are joined only by the sale's organizer, its workspace staff or an admin. Identity comes from
 * the handshake JWT (socket.data.userId); roles, suspension and tokenVersion are re-read from the DB so a
 * stale or revoked token cannot join. Anonymous sockets are always refused.
 */
export async function canJoinPrivateSaleRoom(
  socketData: { userId?: string; tokenVersion?: number },
  saleId: string
): Promise<boolean> {
  try {
    if (!socketData?.userId) return false;
    const [user, sale] = await Promise.all([
      prisma.user.findUnique({ where: { id: socketData.userId }, select: SOCKET_USER_SELECT }),
      prisma.sale.findUnique({ where: { id: saleId }, select: { organizerId: true } }),
    ]);
    if (!sale || !isSocketUserActive(socketData, user as SocketUserRow | null)) return false;
    return await canAccessOrganizerSales({ id: user!.id, role: user!.role, roles: user!.roles }, sale.organizerId);
  } catch (error) {
    console.error('[socket] private sale room check failed (denying):', error);
    return false;
  }
}

export const initSocket = (httpServer: any, allowedOrigins: string[]): Server => {
  _io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (/^https:\/\/findasale[a-z0-9-]*\.vercel\.app$/.test(origin)) return callback(null, true);
        return callback(new Error(`Socket CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Feature #70: Redis adapter for multi-instance deployment
  // Graceful degradation: if Redis unavailable, continue without adapter (single-instance mode)
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
          _io!.adapter(createAdapter(pubClient, subClient));
          console.log('[socket] Redis adapter connected');
        })
        .catch((err) => {
          console.warn('[socket] Redis connection failed — continuing without adapter:', err.message);
        });
    } catch (error) {
      console.warn('[socket] Redis adapter initialization failed:', error);
    }
  } else {
    console.log('[socket] REDIS_URL not set — running without adapter (single-instance mode)');
  }

  _io.on('connection', (socket: Socket) => {
    // Feature #70: JWT socket auth middleware — extract and verify token from handshake.
    // Unauthenticated connections allowed for public live feed viewing.
    // S708: Read token from accessToken cookie as primary source (httpOnly cookie auth is
    // canonical post-migration). Fall back to handshake.auth.token for legacy/native clients.
    let token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const match = /(?:^|;\s*)accessToken=([^;]+)/.exec(cookieHeader);
        if (match) token = decodeURIComponent(match[1]);
      }
    }
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as any;
        // Accept a normal access token (no purpose) or the dedicated socket token; any other purpose is not ours.
        if (decoded.purpose && decoded.purpose !== SOCKET_TOKEN_PURPOSE) throw new Error('Token purpose not accepted');
        socket.data.userId = decoded.id;
        socket.data.role = decoded.role;
        socket.data.tokenVersion = decoded.tokenVersion;
        // Auto-join authenticated users to their personal user room for direct notifications (POS payment requests,
        // hold invoices, cart shares). 2026-10-23 (security): only after a DB check, so a revoked token (tokenVersion
        // bumped by password reset/change, suspend, delete) or a suspended/deleted user never receives them.
        const userId = decoded.id;
        void isSocketUserCurrent(socket.data).then((ok) => {
          if (ok && socket.connected) socket.join(`user:${userId}`);
        });
      } catch (err) {
        // S708: TokenExpiredError is expected — the client will refresh via /auth/refresh on
        // the next API call and reconnect with a fresh cookie. Only log truly invalid tokens
        // (forged/malformed) so the logs stay useful and don't drown out real issues.
        const errName = (err as any)?.name;
        if (errName !== 'TokenExpiredError') {
          console.log('[socket] Invalid token on connection:', (err as any).message);
        }
      }
    }
    // socket.data.userId remains undefined if no valid token
    socket.on('join:item', (itemId: unknown) => {
      if (typeof itemId === 'string' && itemId.length > 0 && itemId.length < 128) {
        socket.join(`item:${itemId}`);
      }
    });

    socket.on('leave:item', (itemId: unknown) => {
      if (typeof itemId === 'string') {
        socket.leave(`item:${itemId}`);
      }
    });

    // Feature #70: Live Sale Feed — join/leave sale activity rooms
    socket.on('JOIN_SALE_FEED', (saleId: unknown) => {
      if (typeof saleId === 'string' && saleId.length > 0 && saleId.length < 128) {
        socket.join(`sale:${saleId}`);
      }
    });

    socket.on('LEAVE_SALE_FEED', (saleId: unknown) => {
      if (typeof saleId === 'string') {
        socket.leave(`sale:${saleId}`);
      }
    });

    // Live organizer sale status (Feature #14: sold today, holds, revenue) -- private room, see
    // canJoinPrivateSaleRoom. The public sale:<id> room no longer receives revenue figures.
    socket.on('JOIN_SALE_STATUS', async (saleId: unknown) => {
      if (typeof saleId === 'string' && saleId.length > 0 && saleId.length < 128) {
        if (await canJoinPrivateSaleRoom(socket.data, saleId)) socket.join(`sale-status:${saleId}`);
      }
    });

    socket.on('LEAVE_SALE_STATUS', (saleId: unknown) => {
      if (typeof saleId === 'string') {
        socket.leave(`sale-status:${saleId}`);
      }
    });

    // Morning Briefing — join/leave day-of-sale briefing room (organizer / workspace staff / admin only)
    socket.on('JOIN_BRIEFING', async (saleId: unknown) => {
      if (typeof saleId === 'string' && saleId.length > 0 && saleId.length < 128) {
        if (await canJoinPrivateSaleRoom(socket.data, saleId)) socket.join(`briefing:${saleId}`);
      }
    });

    socket.on('LEAVE_BRIEFING', (saleId: unknown) => {
      if (typeof saleId === 'string') {
        socket.leave(`briefing:${saleId}`);
      }
    });
  });

  return _io;
};

export const getIO = (): Server => {
  if (!_io) throw new Error('Socket.io not initialized — call initSocket first');
  return _io;
};
