import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getFlipReportHandler } from '../controllers/flipReportController';

const router = Router();

// GET /:saleId - Fetch flip report for a sale (PRO tier required)
router.get('/:saleId', authenticate, requireTier('PRO'), getFlipReportHandler);

export default router;
