import { Request, Response, NextFunction } from 'express';

/**
 * Feature #108: Global request timeout middleware.
 *
 * Prevents handlers from blocking indefinitely. All routes must respond
 * or be aborted within 30 seconds. If a handler exceeds this timeout,
 * the middleware responds with 503 Service Unavailable.
 *
 * Registration order: AFTER body parsers, BEFORE routes.
 * This ensures the timeout guard wraps all business logic.
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip timeout guard for health check endpoints
    if (req.path === '/' || req.path === '/api/health') {
      return next();
    }

    const timer = setTimeout(() => {
      // Only respond if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(503).json({
          error: 'Request timeout',
          message: 'The server took too long to respond. Please try again.',
        });
      }
    }, timeoutMs);

    // Clear timeout if the response finishes normally
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
};