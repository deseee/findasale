import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AuthRequest } from './auth';

/**
 * Middleware: Request Correlation ID
 * Generates a unique UUID for each request to enable end-to-end tracing
 * across logs, payments, and system events.
 *
 * Sets `X-Correlation-ID` response header and stores on request for logging.
 */
export const correlationIdMiddleware = (req: Request & { correlationId?: string }, res: Response, next: NextFunction) => {
  // Generate UUID for this request
  const correlationId = req.get('X-Correlation-ID') || randomUUID();

  // Store on request object for downstream logging
  (req as any).correlationId = correlationId;

  // Set response header
  res.setHeader('X-Correlation-ID', correlationId);

  next();
};
