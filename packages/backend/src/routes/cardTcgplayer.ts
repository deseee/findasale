/**
 * TCGplayer round trip routes (ADR-137, roadmap #660). Mounted at /api/card-tcgplayer in index.ts.
 *
 *   GET  /api/card-tcgplayer/:saleId/status
 *   GET  /api/card-tcgplayer/:saleId/register-check?itemIds=a,b,c
 *   POST /api/card-tcgplayer/:saleId/export
 *   POST /api/card-tcgplayer/:saleId/export/uploaded
 *   POST /api/card-tcgplayer/:saleId/reconcile/preview
 *   POST /api/card-tcgplayer/:saleId/reconcile/apply
 *
 * Every route requires a logged-in ORGANIZER and a sale the caller owns (the card intake's authorizeSale, which also
 * answers before any upload is accepted). There is deliberately NO requireTier: nothing here costs anything per item,
 * the same reasoning as the card intake (ADR-134 section 4.3). With CARD_TCGPLAYER_SYNC_ENABLED (and the card catalog
 * flag) off, the writing routes answer 404 and status and register-check answer { enabled: false }.
 * Upload middleware is the intake's: disk spooled, size and type checked.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { cardIntakeHandlers } from '../controllers/cardIntakeController';
import { createCardTcgplayerHandlers } from '../controllers/cardTcgplayerController';
import { API_MESSAGES } from '../services/cardTcgplayer/messages';
import { createDefaultDeps, syncDb } from '../services/cardTcgplayer/wiring';

const router = Router();

const keyByUser = (req: any): string => req.user?.id ?? req.ip ?? '0.0.0.0';

function limiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: keyByUser,
    validate: false,
    message: { success: false, error: API_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
    standardHeaders: false,
    legacyHeaders: false,
  });
}

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
export const tcgplayerReadLimiter = limiter(MINUTE, 240);
export const tcgplayerExportLimiter = limiter(HOUR, 30);
export const tcgplayerPreviewLimiter = limiter(HOUR, 30);
export const tcgplayerApplyLimiter = limiter(HOUR, 10);

const handlers = createCardTcgplayerHandlers({
  db: syncDb,
  syncDeps: createDefaultDeps(),
  get env() {
    return process.env;
  },
});

router.get('/:saleId/status', authenticate, requireOrganizer, tcgplayerReadLimiter, cardIntakeHandlers.authorizeSale, handlers.status);
router.get('/:saleId/register-check', authenticate, requireOrganizer, tcgplayerReadLimiter, cardIntakeHandlers.authorizeSale, handlers.registerCheck);
router.post(
  '/:saleId/export',
  authenticate,
  requireOrganizer,
  tcgplayerExportLimiter,
  handlers.requireEnabled,
  cardIntakeHandlers.authorizeSale,
  handlers.export
);
router.post(
  '/:saleId/export/uploaded',
  authenticate,
  requireOrganizer,
  tcgplayerExportLimiter,
  handlers.requireEnabled,
  cardIntakeHandlers.authorizeSale,
  handlers.exportUploaded
);
router.post(
  '/:saleId/reconcile/preview',
  authenticate,
  requireOrganizer,
  tcgplayerPreviewLimiter,
  handlers.requireEnabled,
  cardIntakeHandlers.authorizeSale,
  cardIntakeHandlers.upload,
  handlers.reconcilePreview
);
router.post(
  '/:saleId/reconcile/apply',
  authenticate,
  requireOrganizer,
  tcgplayerApplyLimiter,
  handlers.requireEnabled,
  cardIntakeHandlers.authorizeSale,
  cardIntakeHandlers.upload,
  handlers.reconcileApply
);

export default router;
