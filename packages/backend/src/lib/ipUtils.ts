import { Request } from 'express';

export function getClientIp(req: Request): string | undefined {
  // Trust the first proxy (as per app.set('trust proxy', 1) in index.ts)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0]?.trim();
  }
  return req.socket.remoteAddress;
}
