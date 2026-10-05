/**
 * Bulk lot eBay bundle routes (ADR-136 Addendum C, roadmap #659). Mounted at /api/bulk-lots/ebay. See
 * controllers/bulkLotEbayController.ts for the route list and the response envelope.
 *
 * Every route except GET /status answers 404 BUNDLE_DISABLED while CARD_BULK_EBAY_ENABLED is off. Limiters live here
 * (middleware/rateLimiter.ts is a shared file and is not edited): reads 120 per minute per user, writes 20 per minute per
 * user (a write can call eBay). There is no requireTier on the settings; the push pipeline applies the eBay tier gate.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { bulkLotEbayHandlers } from '../controllers/bulkLotEbayController';

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

export const bulkLotEbayPublicLimiter = limited(60 * 1000, 120, keyByIp);
export const bulkLotEbayReadLimiter = limited(60 * 1000, 120, keyByUser);
export const bulkLotEbayWriteLimiter = limited(60 * 1000, 20, keyByUser);

router.get('/status', bulkLotEbayPublicLimiter, bulkLotEbayHandlers.status);
router.get('/item/:itemId', authenticate, requireOrganizer, bulkLotEbayReadLimiter, bulkLotEbayHandlers.getOne);
router.put('/item/:itemId', authenticate, requireOrganizer, bulkLotEbayWriteLimiter, bulkLotEbayHandlers.save);
router.post('/item/:itemId/list', authenticate, requireOrganizer, bulkLotEbayWriteLimiter, bulkLotEbayHandlers.list);
router.post('/item/:itemId/sync', authenticate, requireOrganizer, bulkLotEbayWriteLimiter, bulkLotEbayHandlers.sync);

export default router;
