import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { createRateLimitStore, createBurstAlerter } from './rateLimitShared';
import { AuthRequest } from './auth';

/**
 * curioRateLimiter -- burst-protection rate limiter for all Curio endpoints (Phase 1, see
 * claude_docs/feature-notes/curio-api-adr-2026-07-17.md). Every Curio route sits behind
 * `authenticate` first, so req.user.id is always populated here -- keyed purely by user id, no
 * IP/anonId fallback needed (no anonymous tier exists anywhere in Curio v1, ADR Decision #3).
 *
 * This is a SEPARATE, looser concern from curioCostGate's daily/monthly caps
 * (lib/curioCostTracker.ts): this limiter exists purely to stop a burst of rapid-fire requests
 * (a retry-loop bug, a scripted abuser) from hammering the endpoint within a short window,
 * independent of whether the actual scan quota has been reached yet. Redis-backed
 * (createRateLimitStore()), mirrors the shopperReservationsLimiter pattern in
 * middleware/rateLimiter.ts.
 */
const getCurioKeyGenerator = (req: Request) => {
  const authReq = req as AuthRequest;
  return authReq.user?.id ?? req.ip ?? '0.0.0.0'; // fallback only reached if authenticate somehow ran after this
};

const curioBurstAlert = createBurstAlerter('curioRateLimiter');

export const curioRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // burst guard only -- CURIO_DAILY_SCAN_CAP (3/day) + curioCostGate are the real quota enforcement
  keyGenerator: getCurioKeyGenerator,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore(),
  handler: (req, res) => {
    const authReq = req as AuthRequest;
    console.warn(`[curioRateLimiter] 429 ${req.method} ${req.path} userId=${authReq.user?.id ?? 'unknown'}`);
    curioBurstAlert(req);
    res.status(429).json({ error: 'CURIO_RATE_LIMITED', retryAfterSeconds: 600 });
  },
});
