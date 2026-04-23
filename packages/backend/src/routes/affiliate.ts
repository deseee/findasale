import { Router } from 'express';
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
import { authenticate } from '../middleware/auth';

const router = Router();

// Public route for tracking affiliate clicks
router.get('/click/:id', trackAffiliateClick);

// Protected routes for creators (legacy per-sale links)
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
