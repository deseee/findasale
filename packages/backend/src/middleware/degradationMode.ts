import { Request, Response, NextFunction } from 'express';
import { getDegraded } from '../controllers/healthController';

/**
 * Proactive Degradation Mode Middleware (Feature #20)
 *
 * When server is degraded:
 * - Adds X-Degradation-Mode: true header
 * - Skips analytics recording (if req has analytics flag)
 * - Allows frontend to reduce image quality, disable non-core features
 */

declare global {
  namespace Express {
    interface Request {
      degradationMode?: boolean;
    }
  }
}

export function degradationMode(req: Request, res: Response, next: NextFunction): void {
  const degraded = getDegraded();
  const lite = req.query.lite === 'true';

  // Set flag on request object for downstream handlers
  req.degradationMode = degraded || lite;

  // Add header so frontend can detect degradation
  if (degraded) {
    res.set('X-Degradation-Mode', 'true');
  }

  // Skip analytics recording if degraded (prevents additional load)
  if (degraded && req.body && typeof req.body === 'object') {
    req.body._skipAnalytics = true;
  }

  next();
}
