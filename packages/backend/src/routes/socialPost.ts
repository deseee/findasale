import { Router } from 'express';
import { generateSocialPost } from '../controllers/socialPostController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/generate', authenticate, generateSocialPost);

export default router;
