import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier'; // #65: Tier gating for exports (PRO feature)
import {
  exportEstatesalesCSV,
  exportFacebookJSON,
  exportCraigslistText,
  exportOrganizer,
} from '../controllers/exportController';

const router = Router();

// GET /api/export/:saleId/estatesales-csv
// #65 Sprint 2: Gated to PRO tier (data export is a premium feature)
router.get('/:saleId/estatesales-csv', authenticate, requireTier('PRO'), exportEstatesalesCSV);

// GET /api/export/:saleId/facebook-json
// #65 Sprint 2: Gated to PRO tier
router.get('/:saleId/facebook-json', authenticate, requireTier('PRO'), exportFacebookJSON);

// GET /api/export/:saleId/craigslist-text
// #65 Sprint 2: Gated to PRO tier
router.get('/:saleId/craigslist-text', authenticate, requireTier('PRO'), exportCraigslistText);

export default router;
