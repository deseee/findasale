import { Router } from 'express';
import {
  listSales,
  getMySales,
  getSale,
  createSale,
  updateSale,
  updateSaleStatus,
  deleteSale,
  searchSales,
  generateQRCode,
  trackQrScan,
  generateIcal,
  getSalesByNeighborhood,
  cloneSale,
  getSaleActivity,
} from '../controllers/saleController';
import { generateMarketingKit } from '../controllers/marketingKitController';
import { getSaleLabels } from '../controllers/labelController'; // W2
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', listSales);
router.get('/search', searchSales);
router.get('/neighborhood/:slug', getSalesByNeighborhood); // U2: SEO landing pages

// /mine must be registered before /:id so Express doesn't treat "mine" as an ID
router.get('/mine', authenticate, getMySales);

router.get('/:id', getSale);
router.get('/:id/activity', getSaleActivity); // Real-time activity feed (public)
router.post('/', authenticate, createSale);
router.put('/:id', authenticate, updateSale);
router.patch('/:id/status', authenticate, updateSaleStatus);
router.delete('/:id', authenticate, deleteSale);
router.post('/:id/clone', authenticate, cloneSale);
router.post('/:id/generate-qr', authenticate, generateQRCode);
router.post('/:id/generate-marketing-kit', authenticate, generateMarketingKit);
router.post('/:id/track-scan', trackQrScan); // public, no auth needed
router.get('/:id/calendar.ics', generateIcal); // public, no auth needed
router.get('/:saleId/labels', authenticate, getSaleLabels); // W2: all-items label PDF

export default router;
