import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  generateAffiliateLink,
  getAffiliateLinks,
  trackAffiliateClick,
  getCreatorStats,
  getAffiliateMe,
  generateAffiliateCode,
  getAffiliateCode,
  getAffiliateReferrals,
  getEarningsSummary,
} from '../controllers/affiliateController';
import {
  getCreatorMe,
  joinCreator,
  patchCreatorSettings,
  getCreatorDashboardHandler,
  getPromotableSales,
} from '../controllers/creatorAffiliateController';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { createRateLimitStore } from '../middleware/rateLimitShared';

const router = Router();

// Click tracking is public and unauthenticated-friendly, so it gets its own limiter (per IP).
// Fraud dedupe (one counted click per link per hashed IP per day) lives in the service; this only
// stops a single client hammering the endpoint. Redis-backed with in-memory fallback, same
// pattern as paymentLimiter.
const affiliateClickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip ?? '0.0.0.0',
  validate: false,
  message: { message: 'Too many requests, please try again shortly.' },
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:affclick:'),
});

// Joining is a one-time action; a low ceiling per account/IP costs real users nothing.
const creatorJoinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? '0.0.0.0',
  validate: false,
  message: { message: 'Too many attempts, please try again later.' },
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:creatorjoin:'),
});

// Public route for tracking affiliate clicks. optionalAuthenticate only so a creator clicking their
// own link is recognised and never counted or attributed. `:id` is an AffiliateLink id, or a creator
// code (CRT_XXXXXX) with ?sale=<saleId>.
router.get('/click/:id', affiliateClickLimiter, optionalAuthenticate, trackAffiliateClick);

// Creator program (self-serve opt-in; gate is an ACTIVE CreatorProfile, legacy CREATOR role as an OR)
router.get('/creator/me', authenticate, getCreatorMe);
router.post('/creator/join', authenticate, creatorJoinLimiter, joinCreator);
router.patch('/creator/settings', authenticate, patchCreatorSettings);
router.get('/creator/dashboard', authenticate, getCreatorDashboardHandler);
router.get('/creator/promotable-sales', authenticate, getPromotableSales);

// Protected routes for creators (per-sale links)
router.post('/generate', authenticate, generateAffiliateLink);
router.get('/links', authenticate, getAffiliateLinks);
router.get('/stats', authenticate, getCreatorStats);

// Batch 1 + Batch 3 + Batch 6: Affiliate program endpoints (organizer-to-organizer)
// GET /me — Batch 1 foundation (get stats without creating code)
router.get('/me', authenticate, getAffiliateMe);

// Batch 3: Code generation endpoints
// POST /generate-code — Generate or retrieve existing affiliate code
router.post('/generate-code', authenticate, generateAffiliateCode);

// GET /code — Retrieve code without creating one
router.get('/code', authenticate, getAffiliateCode);

// Batch 6: Dashboard endpoints
// GET /referrals — List all referrals with pagination and filtering
router.get('/referrals', authenticate, getAffiliateReferrals);

// GET /earnings-summary — Dashboard widget with earnings summary
router.get('/earnings-summary', authenticate, getEarningsSummary);

export default router;
