import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganizer } from '../middleware/auth';
import {
  previewConsignorSettlement,
  getConsignorSalesSummary,
  getConsignorAnnualSummary,
  createConsignorSettlementBatch,
  getConsignorSettlementBatch,
  refreshConsignorSettlementBatch,
  approveConsignorSettlementBatch,
  cancelConsignorSettlementBatch,
  exportConsignorSettlementCsv,
  markConsignorPayoutPaid,
  undoConsignorPayoutPaid,
  holdConsignorPayout,
  releaseConsignorPayout,
  voidConsignorPayout,
  sendConsignorPayoutStatement,
  getConsignorPayoutStatement,
  getConsignorPayoutStatementPdf,
  getConsignorPayoutEvents,
} from '../controllers/consignorSettlementController';

const router = Router();

/**
 * Statement resend limiter: 3 sends per 24 hours per payout (organizer-settles ledger, 2026-09-29).
 * Same express-rate-limit shape as consignorOnboardingInviteLimiter in middleware/rateLimiter.ts,
 * but keyed per organizer AND payout id so one payout's quota cannot be burned from another
 * account. Only successful sends count: skipFailedRequests ignores 4xx/5xx, and the controller
 * answers 422 (NO_EMAIL / SUPPRESSED / BLOCKED_DOMAIN) or 502 (ERROR) when nothing was sent.
 * Exported so tests can drive it directly.
 */
export const consignorStatementResendLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req: Request) => `consignor-statement:${(req as any).user?.id ?? req.ip ?? '0.0.0.0'}:${req.params.id}`,
  validate: false,
  skipFailedRequests: true,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'This statement has already been sent 3 times in the last 24 hours. Please try again tomorrow.',
      code: 'STATEMENT_RATE_LIMITED',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Consignor settlement, organizer-settles model. Every route: organizer auth here, TEAMS gate + owner-only +
// workspace scoping in the controller (non-TEAMS gets 403 on every route, foreign ids get 404).
// ORDER MATTERS: every fixed path (/preview, /sales-summary, /annual-summary, /payouts/...) is registered
// BEFORE the /:batchId routes so that "payouts" or "preview" is never captured as a batch id.
router.get('/preview/:saleId', authenticate, requireOrganizer, previewConsignorSettlement);
router.get('/preview', authenticate, requireOrganizer, previewConsignorSettlement);
router.get('/sales-summary', authenticate, requireOrganizer, getConsignorSalesSummary);
router.get('/annual-summary', authenticate, requireOrganizer, getConsignorAnnualSummary);

router.post('/', authenticate, requireOrganizer, createConsignorSettlementBatch);

router.post('/payouts/:id/mark-paid', authenticate, requireOrganizer, markConsignorPayoutPaid);
router.post('/payouts/:id/undo-paid', authenticate, requireOrganizer, undoConsignorPayoutPaid);
router.post('/payouts/:id/hold', authenticate, requireOrganizer, holdConsignorPayout);
router.post('/payouts/:id/release', authenticate, requireOrganizer, releaseConsignorPayout);
router.post('/payouts/:id/void', authenticate, requireOrganizer, voidConsignorPayout);
router.post('/payouts/:id/send-statement', authenticate, requireOrganizer, consignorStatementResendLimiter, sendConsignorPayoutStatement);
router.get('/payouts/:id/statement', authenticate, requireOrganizer, getConsignorPayoutStatement);
router.get('/payouts/:id/statement.pdf', authenticate, requireOrganizer, getConsignorPayoutStatementPdf);
router.get('/payouts/:id/events', authenticate, requireOrganizer, getConsignorPayoutEvents);

router.get('/:batchId/export.csv', authenticate, requireOrganizer, exportConsignorSettlementCsv);
router.get('/:batchId', authenticate, requireOrganizer, getConsignorSettlementBatch);
router.post('/:batchId/refresh', authenticate, requireOrganizer, refreshConsignorSettlementBatch);
router.post('/:batchId/approve', authenticate, requireOrganizer, approveConsignorSettlementBatch);
router.post('/:batchId/cancel', authenticate, requireOrganizer, cancelConsignorSettlementBatch);

export default router;
