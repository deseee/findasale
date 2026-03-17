import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getSaleFraudSignalsHandler,
  reviewSignalHandler,
} from '../controllers/fraudController';

const router = Router();

// GET /api/fraud/sale/:saleId — organizer views fraud signals (PRO tier)
router.get('/sale/:saleId', authenticate, getSaleFraudSignalsHandler);

// POST /api/fraud/signals/:signalId/review — organizer or admin reviews signal
router.post('/signals/:signalId/review', authenticate, reviewSignalHandler);

export default router;
