import { Router } from 'express';
import { getPricingSignals } from '../controllers/pricingSignalsController';

const router = Router();

// GET /api/items/:id/pricing-signals — returns sleeper pattern and brand exception signals
router.get('/:id/pricing-signals', getPricingSignals);

export default router;
