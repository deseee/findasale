// V1: Socket.io singleton — initialized once in index.ts, shared across controllers
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';

let _io: Server | undefined;

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
    // Feature #70: JWT socket auth middleware — extract and verify token from handshake
    // Unauthenticated connections allowed for public live feed viewing
    const token = socket.handshake.auth.token as string | undefined;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.data.userId = decoded.id;
        socket.data.role = decoded.role;
        // Auto-join authenticated users to their personal user room for direct notifications (POS payment requests, etc.)
        socket.join(`user:${decoded.id}`);
      } catch (err) {
        // Invalid/expired token — log silently, allow connection for public feed access
        console.log('[socket] Invalid token on connection:', (err as any).message);
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

    // Morning Briefing — join/leave day-of-sale briefing room
    socket.on('JOIN_BRIEFING', (saleId: unknown) => {
      if (typeof saleId === 'string' && saleId.length > 0 && saleId.length < 128) {
        socket.join(`briefing:${saleId}`);
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
