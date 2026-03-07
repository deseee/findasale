import { Router } from 'express';
import { 
  generateAffiliateLink,
  getAffiliateLinks,
  trackAffiliateClick,
  getCreatorStats
} from '../controllers/affiliateController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public route for tracking affiliate clicks
router.get('/click/:id', trackAffiliateClick);

// Protected routes for creators
router.post('/generate', authenticate, generateAffiliateLink);
router.get('/links', authenticate, getAffiliateLinks);
router.get('/stats', authenticate, getCreatorStats);

export default router;
