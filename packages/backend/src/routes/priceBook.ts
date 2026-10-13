/**
 * Price book routes (ADR-140 batch B4). Mounted at /api/price-book by the wiring batch (B9); this file mounts nothing.
 * See controllers/priceBookController.ts for the route list, the envelope and the alignment notes.
 *
 * Order of middleware on every route but GET /status: the platform switch (404 PRICE_BOOK_DISABLED while
 * CARD_PRICE_BOOK_ENABLED is off), the authentication, the role, the limiter, then the handler. Reads that a team member
 * may make (GET /status, GET /book, POST /suggest) use authenticate only and the handler resolves the owner's organizer
 * (utils/posAuth); every other route is organizer only (authenticate, requireOrganizer) and the handler refuses a team member
 * again. There is deliberately NO requireTier: the price book is open to every tier, like card intake and bulk lots. Do not
 * "fix" this.
 *
 * Limiters are declared here because middleware/rateLimiter.ts is a shared file and is not edited. They are keyed by user id
 * (the account, not the shop) and use the shared store, which falls back to memory when Redis is down:
 *   reads 120 per minute, writes 30 per minute, preview 6 per minute, apply and undo 12 per minute.
 *
 * Route order matters: the fixed paths (/rules/reorder, /references/from-stock, /references/import, /runs/preview) are
 * declared before the paths with an :id.
 */
import { Router } from 'express';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { createRateLimitStore } from '../middleware/rateLimitShared';
import { priceBookHandlers } from '../controllers/priceBookController';
import type { PriceBookHandlers } from '../controllers/priceBookController';

const keyByUser = (req: Request): string => (req as Request & { user?: { id?: string } }).user?.id ?? req.ip ?? '0.0.0.0';

const MINUTE = 60 * 1000;

function limiter(name: string, max: number) {
  return rateLimit({
    windowMs: MINUTE,
    max,
    keyGenerator: keyByUser,
    validate: false,
    message: { success: false, error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    standardHeaders: false,
    legacyHeaders: false,
    store: createRateLimitStore(`rl:priceBook:${name}:`),
  });
}

/** Builds the router around a set of handlers, so a test can mount it with fakes. Limiters are fresh per router. */
export function createPriceBookRouter(h: PriceBookHandlers): Router {
  const router = Router();

  const readLimiter = limiter('read', 120);
  const writeLimiter = limiter('write', 30);
  const previewLimiter = limiter('preview', 6);
  const applyLimiter = limiter('apply', 12);

  // Flags, vocabulary and limits. Open to any signed in user; the switch never hides it (the page needs to know it is off).
  router.get('/status', authenticate, readLimiter, h.status);

  // Organizer or team member (read only).
  router.get('/book', h.flagGate, authenticate, readLimiter, h.getBook);
  router.post('/suggest', h.flagGate, authenticate, readLimiter, h.suggest);

  // Book and starter rules.
  router.put('/book', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.putBook);
  router.post('/book/templates', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.applyTemplate);

  // Rules.
  router.get('/rules', h.flagGate, authenticate, requireOrganizer, readLimiter, h.listRules);
  router.post('/rules', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.createRule);
  router.post('/rules/reorder', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.reorderRules);
  router.put('/rules/:id', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.updateRule);
  router.delete('/rules/:id', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.deleteRule);

  // Typed references.
  router.get('/references', h.flagGate, authenticate, requireOrganizer, readLimiter, h.listReferences);
  router.put('/references', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.putReference);
  router.post('/references/from-stock', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.referencesFromStock);
  router.post('/references/import', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.importUpload, h.importReferences);
  router.delete('/references/:id', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.deleteReference);

  // Benchmarks.
  router.get('/benchmarks', h.flagGate, authenticate, requireOrganizer, readLimiter, h.listBenchmarks);
  router.put('/benchmarks', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.putBenchmark);
  router.delete('/benchmarks/:id', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.deleteBenchmark);

  // Bulk rate card and the buy calculator.
  router.get('/bulk-rates', h.flagGate, authenticate, requireOrganizer, readLimiter, h.getBulkRates);
  router.put('/bulk-rates', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.putBulkRates);
  router.post('/bulk-rates/adjust', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.adjustBulkRates);
  router.post('/buylist/quote', h.flagGate, authenticate, requireOrganizer, readLimiter, h.buylistQuote);
  router.post('/buylist/bulk-quote', h.flagGate, authenticate, requireOrganizer, readLimiter, h.buylistBulkQuote);

  // Locks (pinned prices).
  router.get('/locks', h.flagGate, authenticate, requireOrganizer, readLimiter, h.listLocks);
  router.put('/locks/:itemId', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.putLock);

  // Runs.
  router.post('/runs/preview', h.flagGate, authenticate, requireOrganizer, previewLimiter, h.previewRun);
  router.get('/runs', h.flagGate, authenticate, requireOrganizer, readLimiter, h.listRuns);
  router.get('/runs/:id', h.flagGate, authenticate, requireOrganizer, readLimiter, h.getRun);
  router.get('/runs/:id/items', h.flagGate, authenticate, requireOrganizer, readLimiter, h.listRunItems);
  router.patch('/runs/:id/items', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.patchRunItems);
  router.post('/runs/:id/apply', h.flagGate, authenticate, requireOrganizer, applyLimiter, h.applyRun);
  router.post('/runs/:id/undo', h.flagGate, authenticate, requireOrganizer, applyLimiter, h.undoRun);
  router.post('/runs/:id/cancel', h.flagGate, authenticate, requireOrganizer, writeLimiter, h.cancelRun);

  return router;
}

export default createPriceBookRouter(priceBookHandlers);
