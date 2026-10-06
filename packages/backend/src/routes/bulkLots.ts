/**
 * Bulk lot routes (ADR-136, roadmap #659). Mounted at /api/bulk-lots. See controllers/bulkLotController.ts for the
 * route list and the response envelope.
 *
 * Every route except GET /status answers 404 BULK_DISABLED while CARD_BULK_LOTS_ENABLED is off. Limiters live here
 * (middleware/rateLimiter.ts is a shared file and is not edited): public routes 120 per minute per IP, organizer reads
 * 120 per minute per user, organizer writes 30 per minute per user. There is deliberately NO requireTier: bulk lots
 * are open to every tier, like card intake (ADR-134). Do not "fix" this.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { bulkLotHandlers } from '../controllers/bulkLotController';
import { bulkLotFollowupHandlers } from '../controllers/bulkLotFollowupController'; // ADR-136 Addendum B: adjust, history, refunds by cards, holds

const router = Router();

const keyByUser = (req: any): string => req.user?.id ?? req.ip ?? '0.0.0.0';
const keyByIp = (req: any): string => req.ip ?? '0.0.0.0';

const limited = (windowMs: number, max: number, keyGenerator: (req: any) => string) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator,
    validate: false,
    message: { success: false, error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    standardHeaders: false,
    legacyHeaders: false,
  });

export const bulkLotPublicLimiter = limited(60 * 1000, 120, keyByIp);
export const bulkLotReadLimiter = limited(60 * 1000, 120, keyByUser);
export const bulkLotWriteLimiter = limited(60 * 1000, 30, keyByUser);

// Public
router.get('/status', bulkLotPublicLimiter, bulkLotHandlers.status);
router.get('/sale/:saleId/public', bulkLotPublicLimiter, bulkLotHandlers.publicSaleLots);
router.get('/item/:itemId/public', bulkLotPublicLimiter, bulkLotHandlers.publicLot);

// Organizer or team member (the register reads these). The handler resolves the actor and answers 403 itself.
router.get('/sale/:saleId', authenticate, bulkLotReadLimiter, bulkLotHandlers.listForSale);
router.get('/item/:itemId', authenticate, bulkLotReadLimiter, bulkLotHandlers.getOne);
router.post('/item/:itemId/quote', authenticate, bulkLotReadLimiter, bulkLotHandlers.quote);

// Organizer only
router.post('/sale/:saleId/items', authenticate, requireOrganizer, bulkLotWriteLimiter, bulkLotHandlers.createInSale);
router.post('/item/:itemId/enable', authenticate, requireOrganizer, bulkLotWriteLimiter, bulkLotHandlers.enable);
router.patch('/item/:itemId', authenticate, requireOrganizer, bulkLotWriteLimiter, bulkLotHandlers.update);

// ADR-136 Addendum B (#659): recount and adjust with history, sale rows for refunds by card count, holds on N cards.
// Organizer or team member reads (the handler resolves the actor and answers 403 itself).
router.get('/item/:itemId/adjustments', authenticate, bulkLotReadLimiter, bulkLotFollowupHandlers.adjustments);
router.get('/item/:itemId/sales', authenticate, bulkLotReadLimiter, bulkLotFollowupHandlers.sales);
router.post('/item/:itemId/refund-preview', authenticate, bulkLotReadLimiter, bulkLotFollowupHandlers.refundPreview);
router.get('/item/:itemId/holds', authenticate, bulkLotReadLimiter, bulkLotFollowupHandlers.listHolds);
// Organizer only
router.post('/item/:itemId/adjust', authenticate, requireOrganizer, bulkLotWriteLimiter, bulkLotFollowupHandlers.adjust);
// Organizer or team member at the register (Addendum D): same resolution as the POS (utils/posAuth). The handler resolves the actor
// and answers 403 itself, and every hold is checked against the RESOLVED organizer, so staff never reach another shop's lots.
router.post('/item/:itemId/holds', authenticate, bulkLotWriteLimiter, bulkLotFollowupHandlers.placeOrganizerHold);
router.post('/holds/:holdId/release', authenticate, bulkLotWriteLimiter, bulkLotFollowupHandlers.releaseOrganizerHold);
router.post('/holds/:holdId/convert', authenticate, bulkLotWriteLimiter, bulkLotFollowupHandlers.convertHold);
// Signed-in shopper (their own holds only, 2 hours, one hold per lot)
router.post('/item/:itemId/hold', authenticate, bulkLotWriteLimiter, bulkLotFollowupHandlers.placeShopperHold);
router.get('/my-holds', authenticate, bulkLotReadLimiter, bulkLotFollowupHandlers.myHolds);
router.post('/my-holds/:holdId/release', authenticate, bulkLotWriteLimiter, bulkLotFollowupHandlers.releaseShopperHold);

export default router;
