import { Request } from 'express';

/**
 * Extract client IP address from request
 * Respects X-Forwarded-For header and proxy configuration
 */
export const getClientIp = (req: Request): string => {
  // req.ip is set by Express with 'trust proxy' enabled
  return req.ip || req.socket?.remoteAddress || 'unknown';
};
