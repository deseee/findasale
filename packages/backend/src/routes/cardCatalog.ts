/**
 * Card Catalog Routes (ADR-134 section 3.4, batch B3)
 *
 * Mounted at /api/cards by the wiring batch (B9). Every route requires a logged-in ORGANIZER.
 * There is deliberately NO requireTier: Scryfall's terms forbid paywalling its data, so card
 * lookup is open to every tier. Do not "fix" this.
 *
 * Limiters live here (not in middleware/rateLimiter.ts, which is a shared file):
 *   search, vocabulary, suggested-price, status: 120 requests per minute per user
 *   resolve: 30 requests per minute per user
 * Results are capped (20 per search, 500 refs per resolve) and there is no list-all route, so the
 * API cannot be used to copy the catalog.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { cardCatalogHandlers } from '../controllers/cardCatalogController';

const router = Router();

const keyByUser = (req: any): string => req.user?.id ?? req.ip ?? '0.0.0.0';

/** 120 requests per minute per user (search, vocabulary, suggested price, status). */
export const cardLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: keyByUser,
  validate: false,
  message: { error: 'Too many card lookups. Please slow down.', code: 'RATE_LIMITED' },
  standardHeaders: false,
  legacyHeaders: false,
});

/** 30 requests per minute per user (batch resolve). */
export const cardResolveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: keyByUser,
  validate: false,
  message: { error: 'Too many card resolve requests. Please slow down.', code: 'RATE_LIMITED' },
  standardHeaders: false,
  legacyHeaders: false,
});

router.get('/vocabulary', authenticate, requireOrganizer, cardLookupLimiter, cardCatalogHandlers.getVocabulary);
router.get('/search', authenticate, requireOrganizer, cardLookupLimiter, cardCatalogHandlers.search);
router.post('/resolve', authenticate, requireOrganizer, cardResolveLimiter, cardCatalogHandlers.resolve);
router.get('/suggested-price', authenticate, requireOrganizer, cardLookupLimiter, cardCatalogHandlers.suggestedPrice);
router.get('/status', authenticate, requireOrganizer, cardLookupLimiter, cardCatalogHandlers.status);

export default router;
