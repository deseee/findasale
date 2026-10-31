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
// Response methods a handler may still call after the timeout has answered 503. Each becomes a no-op that
// returns the response (so chained calls like res.status(500).json(...) still work) once the 503 is sent.
const LATE_RESPONSE_METHODS = [
  'status', 'set', 'header', 'append', 'type', 'location', 'vary', 'links', 'cookie', 'clearCookie', 'attachment',
  'json', 'jsonp', 'send', 'sendStatus', 'sendFile', 'download', 'redirect', 'render', 'format',
  // setHeader/removeHeader can only throw once the 503 has gone out, so silencing them loses nothing. writeHead,
  // write and end are left alone: Node calls this.writeHead internally, and a second end() is already harmless.
  'setHeader', 'removeHeader',
] as const;

export function suppressLateResponse(req: Request, res: Response): void {
  (req as any).timedout = true;
  let warned = false;
  const r = res as any;
  for (const name of LATE_RESPONSE_METHODS) {
    r[name] = function lateResponseNoop() {
      if (!warned) {
        warned = true;
        console.warn(`[requestTimeout] late response suppressed after 503: ${req.method} ${req.originalUrl || req.path} (res.${name})`);
      }
      return res;
    };
  }
}

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
      /^\/api\/items\/[^/]+\/reanalyze$/.test(req.path) ||
      // ADR-134 B4: card intake preview (parse + catalog resolve) and confirm (one item per row, NDJSON
      // progress) exceed 30s on real spreadsheets. Excluded here; given requestTimeout(180000) at the route
      // registration in index.ts, same pattern as the reanalyze line above.
      /^\/api\/card-intake\/[^/]+\/(preview|confirm)$/.test(req.path) ||
      // ADR-137 #660: TCGplayer export reconcile (preview and apply), same reasoning and same route-level timeout.
      /^\/api\/card-tcgplayer\/[^/]+\/reconcile\/(preview|apply)$/.test(req.path) ||
      // ADR-138 B9: card scan commit writes every ready card in one request; excluded here and given
      // requestTimeout(180000) at the route registration in index.ts.
      /^\/api\/card-scan\/sessions\/[^/]+\/commit$/.test(req.path)
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
        // Sentry FINDASALE-NODEJS-91 / -93: the handler is still running after the 503 goes out. When it
        // finishes it calls res.json(), which throws ERR_HTTP_HEADERS_SENT ("Cannot set headers after they
        // are sent to the client"); a catch block that answers 500 throws again and the async handler ends
        // in an unhandled rejection. Mark the request timed out and make every later response write a no-op.
        suppressLateResponse(req, res);
      }
    }, timeoutMs);

    // Clear timeout if the response finishes normally
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
};
