// V1: Socket.io singleton — initialized once in index.ts, shared across controllers
import { Server, Socket } from 'socket.io';

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

  _io.on('connection', (socket: Socket) => {
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

export const getIO = (): Server => {
  if (!_io) throw new Error('Socket.io not initialized — call initSocket first');
  return _io;
};