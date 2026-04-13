import { Router } from 'express';
import {
  joinSaleWaitlist,
  leaveSaleWaitlist,
  getSaleWaitlistStatus,
  notifySaleWaitlist,
} from '../controllers/saleWaitlistController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/:saleId/status', authenticate, getSaleWaitlistStatus);
router.post('/:saleId/join', authenticate, joinSaleWaitlist);
router.delete('/:saleId/leave', authenticate, leaveSaleWaitlist);
router.post('/:saleId/notify', authenticate, notifySaleWaitlist);

export default router;
