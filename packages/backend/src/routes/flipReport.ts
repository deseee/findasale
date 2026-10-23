import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTierOrSaleUpgrade } from '../middleware/requireTier';
import { getFlipReportHandler } from '../controllers/flipReportController';

const router = Router();

// GET /:saleId - Fetch flip report for a sale. PRO and above, or the sale's own organizer when that sale has the paid
// $9.99 a-la-carte upgrade (2026-10-23, lib/saleProFeatures.ts). getFlipReport still checks ownership.
router.get('/:saleId', authenticate, requireTierOrSaleUpgrade('PRO', (req) => req.params.saleId), getFlipReportHandler);

export default router;
