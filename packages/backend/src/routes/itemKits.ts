/**
 * Kit routes (kits / bundles, Phase 1, 2026-10-16). Mounted at /api/kits. Organizer only; every handler resolves the organizer from
 * the logged-in account and checks ownership of the kit and of every component. Limiters live here: reads 120 per minute per user,
 * writes 30 per minute per user.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { itemKitHandlers } from '../controllers/itemKitController';

const router = Router();

const keyByUser = (req: any): string => req.user?.id ?? req.ip ?? '0.0.0.0';
const limited = (windowMs: number, max: number) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator: keyByUser,
    validate: false,
    message: { success: false, error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    standardHeaders: false,
    legacyHeaders: false,
  });

const kitReadLimiter = limited(60 * 1000, 120);
const kitWriteLimiter = limited(60 * 1000, 30);

router.get('/candidates', authenticate, requireOrganizer, kitReadLimiter, itemKitHandlers.candidates);
router.get('/', authenticate, requireOrganizer, kitReadLimiter, itemKitHandlers.list);
// Registered before '/:kitId' so it is not swallowed by it.
router.get('/by-component/:itemId', authenticate, requireOrganizer, kitReadLimiter, itemKitHandlers.byComponent);
router.post('/', authenticate, requireOrganizer, kitWriteLimiter, itemKitHandlers.create);
router.get('/:kitId', authenticate, requireOrganizer, kitReadLimiter, itemKitHandlers.getOne);
router.put('/:kitId', authenticate, requireOrganizer, kitWriteLimiter, itemKitHandlers.update);
router.post('/:kitId/recompute', authenticate, requireOrganizer, kitWriteLimiter, itemKitHandlers.recompute);
router.delete('/:kitId', authenticate, requireOrganizer, kitWriteLimiter, itemKitHandlers.archive);

export default router;
