import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { isCurioScanAvailable } from '../lib/curioCostTracker';

/**
 * curioCostGate -- Phase 1 pre-flight cost/abuse gate for POST /api/curio/scan (see
 * claude_docs/feature-notes/curio-api-adr-2026-07-17.md). Runs AFTER authenticate +
 * curioRateLimiter, BEFORE the controller ever calls
 * analyzeItemImage(s)()/getVisionLabelsDegraded()/fetchEbayPriceComps(). Checks the
 * Curio-specific daily scan caps (CURIO_DAILY_SCAN_CAP per-user, CURIO_GLOBAL_DAILY_SCAN_CAP
 * all users) -- a fully separate pool from the existing organizer AI_DAILY_CALL_CAP
 * (lib/aiCostTracker.ts).
 *
 * Deliberately does NOT check the monthly $ ceiling or the degraded-mode threshold here --
 * isCurioCostCeilingExceeded()/isCurioDegradedMode() are checked inside curioController.ts
 * itself, because they change WHICH pipeline runs (full / degraded / hard-cap-identification-only)
 * rather than whether the request is allowed through the gate at all.
 */
export async function curioCostGate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user?.id) {
    // Should be unreachable -- `authenticate` runs before this middleware on every Curio route --
    // but never assume upstream ordering; a route wiring mistake must still fail closed here.
    res.status(401).json({ error: 'LOGIN_REQUIRED' });
    return;
  }
  try {
    const check = await isCurioScanAvailable(req.user.id);
    if (!check.available) {
      res.status(429).json({ error: 'CURIO_RATE_LIMITED', retryAfterSeconds: check.retryAfterSeconds ?? 3600 });
      return;
    }
    next();
  } catch (err) {
    // Fail open on an unexpected error in the gate itself -- a governance-check bug must never
    // take the endpoint down entirely. The shared organizer AI ceiling inside
    // analyzeItemImage(s)() (isAICostCeilingExceeded/isAIDailyCallCapAvailable) is still a
    // backstop even if this gate errors.
    console.error('[curioCostGate] Error checking scan availability, failing open:', err);
    next();
  }
}
