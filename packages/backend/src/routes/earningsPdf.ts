import { Router } from 'express';
import { getEarningsPdf } from '../controllers/earningsPdfController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/pdf', authenticate, getEarningsPdf);

export default router;
