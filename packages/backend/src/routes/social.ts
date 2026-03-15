import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getSocialTemplate } from '../controllers/socialController';

const router = Router();

// GET /api/social/:itemId/template?tone=casual&platform=instagram
router.get('/:itemId/template', authenticate, getSocialTemplate);

export default router;
