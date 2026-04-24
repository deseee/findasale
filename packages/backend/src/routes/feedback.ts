import { Router } from 'express';
import { submitFeedback, listFeedback, getFeedbackStats, createSuppression, listSuppressions } from '../controllers/feedbackController';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// Public endpoint — allows anonymous feedback
router.post('/', optionalAuthenticate, submitFeedback);

// Suppression endpoints (auth required)
router.post('/suppression', authenticate, createSuppression);
router.get('/suppression', authenticate, listSuppressions);

// Admin-only endpoints
router.get('/', authenticate, requireAdmin, listFeedback);
router.get('/stats', authenticate, requireAdmin, getFeedbackStats);

export default router;
