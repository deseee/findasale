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

export default router;
