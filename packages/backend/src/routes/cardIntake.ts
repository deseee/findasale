/**
 * Card intake routes (ADR-134 #642, batch B4). Mounted at /api/card-intake by the wiring batch (B9).
 *
 *   GET  /api/card-intake/formats
 *   POST /api/card-intake/:saleId/preview
 *   POST /api/card-intake/:saleId/confirm
 *
 * Every route requires a logged-in ORGANIZER. There is deliberately NO requireTier: intake never calls Cloud
 * Vision or Haiku, so it costs nothing per item and is open to every tier (ADR-134 section 4.3). Do not "fix" this.
 *
 * Limiters live here (middleware/rateLimiter.ts is a shared file and is not edited): preview 30 per hour per
 * user, confirm 6 per hour per user. The sale ownership check runs BEFORE the upload is accepted.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { cardIntakeHandlers } from '../controllers/cardIntakeController';
import { API_MESSAGES } from '../services/cardIntake/messages';

const router = Router();

const keyByUser = (req: any): string => req.user?.id ?? req.ip ?? '0.0.0.0';

export const cardIntakePreviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: keyByUser,
  validate: false,
  message: { success: false, error: API_MESSAGES.RATE_LIMITED_PREVIEW, code: 'RATE_LIMITED' },
  standardHeaders: false,
  legacyHeaders: false,
});

export const cardIntakeConfirmLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  keyGenerator: keyByUser,
  validate: false,
  message: { success: false, error: API_MESSAGES.RATE_LIMITED_CONFIRM, code: 'RATE_LIMITED' },
  standardHeaders: false,
  legacyHeaders: false,
});

/** Light limiter for the static formats route. */
export const cardIntakeFormatsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: keyByUser,
  validate: false,
  message: { success: false, error: API_MESSAGES.RATE_LIMITED_PREVIEW, code: 'RATE_LIMITED' },
  standardHeaders: false,
  legacyHeaders: false,
});

router.get('/formats', authenticate, requireOrganizer, cardIntakeFormatsLimiter, cardIntakeHandlers.formats);
router.post(
  '/:saleId/preview',
  authenticate,
  requireOrganizer,
  cardIntakePreviewLimiter,
  cardIntakeHandlers.authorizeSale,
  cardIntakeHandlers.upload,
  cardIntakeHandlers.preview
);
router.post(
  '/:saleId/confirm',
  authenticate,
  requireOrganizer,
  cardIntakeConfirmLimiter,
  cardIntakeHandlers.authorizeSale,
  cardIntakeHandlers.upload,
  cardIntakeHandlers.confirm
);

export default router;
