import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getVintedBundleOptions, markVintedBundleItemsSold } from '../controllers/vintedBundleController';

// Manual reconciliation for a Vinted bundle sale (2026-10-12). Cookie-authenticated web routes (the
// global CSRF check applies to the POST), same auth/tier chain as /api/extension/vinted-sold.
const router = Router();

router.get('/', authenticate, requireOrganizer, requireTier('PRO'), getVintedBundleOptions);
router.post('/mark-sold', authenticate, requireOrganizer, requireTier('PRO'), markVintedBundleItemsSold);

export default router;
