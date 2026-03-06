import { Router } from 'express';
import { submitFeedback, listFeedback, getFeedbackStats } from '../controllers/feedbackController';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// Public endpoint — allows anonymous feedback
router.post('/', submitFeedback);

// Admin-only endpoints
router.get('/', authenticate, requireAdmin, listFeedback);
router.get('/stats', authenticate, requireAdmin, getFeedbackStats);

export default router;
