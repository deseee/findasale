import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  exportEstatesalesCSV,
  exportFacebookJSON,
  exportCraigslistText,
} from '../controllers/exportController';

const router = Router();

// GET /api/export/:saleId/estatesales-csv
router.get('/:saleId/estatesales-csv', authenticate, exportEstatesalesCSV);

// GET /api/export/:saleId/facebook-json
router.get('/:saleId/facebook-json', authenticate, exportFacebookJSON);

// GET /api/export/:saleId/craigslist-text
router.get('/:saleId/craigslist-text', authenticate, exportCraigslistText);

export default router;
