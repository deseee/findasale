import { Router } from 'express';
import { subscribe, unsubscribe } from '../controllers/pushController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/subscribe', authenticate, subscribe);
router.delete('/unsubscribe', authenticate, unsubscribe);

export default router;
