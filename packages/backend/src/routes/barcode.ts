/**
 * Barcode Routes
 *
 * Mounted at /api/barcode in index.ts
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { lookupBarcode } from '../controllers/barcodeController';

const router = Router();

// POST /api/barcode/lookup — organizer scans barcode, enriches item from eBay Catalog
router.post('/lookup', authenticate, lookupBarcode);

export default router;
