// V1: Socket.io singleton — initialized once in index.ts, shared across controllers
import { Server, Socket } from 'socket.io';

let _io: Server | undefined;

/**
 * Called once at startup from index.ts after the HTTP server is created.
 * Configures CORS to mirror the Express CORS policy.
 */
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
    // Prefer WebSocket transport; fall back to polling for restricted networks
    transports: ['websocket', 'polling'],
  });

  _io.on('connection', (socket: Socket) => {
    // Shopper joins a per-item room to receive live bid updates
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
  });

  return _io;
};

/**
 * Returns the initialized Socket.io server instance.
 * Throws if called before initSocket — should never happen in production.
 */
export const getIO = (): Server => {
  if (!_io) throw new Error('Socket.io not initialized — call initSocket first');
  return _io;
};
