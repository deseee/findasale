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
    // Skip timeout guard for health check endpoints, internal pipeline routes,
    // and AI-heavy endpoints that use their own route-level timeout.
    if (
      req.path === '/' ||
      req.path === '/api/health' ||
      req.path.startsWith('/api/internal/') ||
      req.path === '/api/upload/batch-analyze' ||
      // Sentry FINDASALE-NODEJS-4H: Smart-tag re-analyze pipeline (image download +
      // Vision/Haiku + eBay category resolve + catalog enrichment) routinely exceeds
      // 30s. Excluded here; given its own longer timeout at the route registration
      // in index.ts (mirrors the batch-analyze pattern above).
      /^\/api\/items\/[^/]+\/reanalyze$/.test(req.path)
    ) {
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
