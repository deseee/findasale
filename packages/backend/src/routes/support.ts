import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { postSupportChat, getFAQCategory } from '../controllers/supportController';

const router = Router();

// POST /api/support/chat — authenticated, PRO/TEAMS only
router.post('/chat', authenticate, postSupportChat);

// GET /api/support/faq/:category — public FAQ endpoint (not currently used, FAQ is client-side)
router.get('/faq/:category', getFAQCategory);

export default router;
