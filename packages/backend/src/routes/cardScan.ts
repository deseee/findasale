/**
 * Card scan routes (ADR-138 section 9, batch B5). Mounted at /api/card-scan by the wiring batch (B9); this file
 * mounts nothing itself.
 *
 *   GET    /api/card-scan/status
 *   POST   /api/card-scan/sessions
 *   GET    /api/card-scan/sessions?saleId=
 *   GET    /api/card-scan/sessions/:id?afterSeq=&limit=
 *   POST   /api/card-scan/sessions/:id/frames
 *   POST   /api/card-scan/sessions/:id/entries
 *   POST   /api/card-scan/sessions/:id/entries/bulk
 *   PATCH  /api/card-scan/sessions/:id/entries/:entryId
 *   POST   /api/card-scan/sessions/:id/commit
 *   POST   /api/card-scan/sessions/:id/discard
 *
 * Every route needs a logged-in ORGANIZER with an Organizer row. There is deliberately NO requireTier: the tier
 * only decides how many Smart tags a month the frame route may spend (lib/aiTagsQuotaTracker), and manual add,
 * edits and commit cost nothing, so they are open to every tier. Do not "fix" this.
 *
 * The switch CARD_SCAN_ENABLED guards the frame route only (503 SCAN_DISABLED). The status route always answers
 * so the page can hide the link, and manual add, edits and commit keep working with the switch off.
 *
 * Limiters (ADR-138 section 9) are declared here because middleware/rateLimiter.ts is a shared file and is not
 * edited. They are keyed by user id and use the shared store, which falls back to memory when Redis is down.
 * The frame upload is capped by the controller (one file in memory, CARD_SCAN_MAX_FRAME_KB), after the role check,
 * the limiters, the switch and the session ownership check, so a stranger never streams a picture to us.
 *
 * Batch B8 adds the Delver address routes (ingest-tokens) in a clearly delimited block below; the public ingest
 * route itself lives in routes/cardScanIngest.ts.
 */
import { Router } from 'express';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { createRateLimitStore } from '../middleware/rateLimitShared';
import { cardScanHandlers } from '../controllers/cardScanController';
import type { CardScanHandlers } from '../controllers/cardScanController';
import { SCAN_API_MESSAGES } from '../services/cardScan/messages';

const keyByUser = (req: Request): string => (req as Request & { user?: { id?: string } }).user?.id ?? req.ip ?? '0.0.0.0';

function limiter(name: string, windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: keyByUser,
    validate: false,
    message: { success: false, error: SCAN_API_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
    standardHeaders: false,
    legacyHeaders: false,
    store: createRateLimitStore(`rl:cardScan:${name}:`),
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Builds the router around a set of handlers, so a test can mount it with fakes. Limiters are fresh per router. */
export function createCardScanRouter(h: CardScanHandlers): Router {
  const router = Router();

  // Session create 30 per hour; frames 40 per minute and 1,500 per hour (a stand loop is faster than hand shooting);
  // PATCH, bulk and manual add 300 per minute; commit 12 per hour; reads 60 per minute (the page polls about 20).
  const createLimiter = limiter('create', HOUR, 30);
  const frameBurstLimiter = limiter('frameBurst', MINUTE, 40);
  const frameHourlyLimiter = limiter('frameHourly', HOUR, 1500);
  const editLimiter = limiter('edit', MINUTE, 300);
  const commitLimiter = limiter('commit', HOUR, 12);
  const readLimiter = limiter('read', MINUTE, 60);

  router.get('/status', authenticate, requireOrganizer, readLimiter, h.resolveOrganizer, h.status);

  router.post('/sessions', authenticate, requireOrganizer, createLimiter, h.resolveOrganizer, h.sessionCreate);
  router.get('/sessions', authenticate, requireOrganizer, readLimiter, h.resolveOrganizer, h.sessionList);
  router.get('/sessions/:id', authenticate, requireOrganizer, readLimiter, h.resolveOrganizer, h.sessionGet);

  router.post(
    '/sessions/:id/frames',
    authenticate,
    requireOrganizer,
    frameBurstLimiter,
    frameHourlyLimiter,
    h.resolveOrganizer,
    h.frameGate,
    h.frameSession,
    h.frameUpload,
    h.frame
  );

  router.post('/sessions/:id/entries', authenticate, requireOrganizer, editLimiter, h.resolveOrganizer, h.entryAdd);
  router.post('/sessions/:id/entries/bulk', authenticate, requireOrganizer, editLimiter, h.resolveOrganizer, h.entryBulk);
  router.patch('/sessions/:id/entries/:entryId', authenticate, requireOrganizer, editLimiter, h.resolveOrganizer, h.entryPatch);

  router.post('/sessions/:id/commit', authenticate, requireOrganizer, commitLimiter, h.resolveOrganizer, h.commit);
  router.post('/sessions/:id/discard', authenticate, requireOrganizer, editLimiter, h.resolveOrganizer, h.sessionDiscard);

  // ---- B8 (Delver address tokens) goes here: POST/GET /ingest-tokens, DELETE /ingest-tokens/:id ----

  return router;
}

export default createCardScanRouter(cardScanHandlers);
