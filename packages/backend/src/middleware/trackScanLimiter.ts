/**
 * Per-IP, per-sale limiter for the PUBLIC POST /api/sales/:id/track-scan route.
 *
 * The route is unauthenticated (a shopper scanning a yard-sign QR has no session), so without a cap
 * anyone could inflate a sale's qrScanCount with a loop. The client already sends at most one scan
 * per browser session per sale; this is the server-side backstop: 5 counted scans per IP per sale
 * per hour (a household re-scanning is still counted, a script is not). Once over the limit the
 * request is answered with the same 204 the route always returns, so the page never shows an error
 * and the count simply stops rising. Redis-backed like the other limiters (rateLimitShared.ts).
 */
import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { createRateLimitStore } from './rateLimitShared';

export const TRACK_SCAN_MAX_PER_HOUR = 5;

export const trackScanKey = (req: Request): string =>
  `${req.ip ?? '0.0.0.0'}:${req.params?.id ?? 'unknown'}`;

export const trackScanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: TRACK_SCAN_MAX_PER_HOUR,
  keyGenerator: trackScanKey,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:trackScan:'),
  handler: (_req, res) => {
    res.status(204).end();
  },
});
