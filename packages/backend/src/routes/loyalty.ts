import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMyPassport } from '../controllers/loyaltyController';

const router = Router();

router.get('/passport', authenticate, getMyPassport);

export default router;
