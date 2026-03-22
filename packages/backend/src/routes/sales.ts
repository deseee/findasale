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
  getSalesByCity,
  cloneSale,
  getSaleActivity,
  generateSaleDescriptionHandler,
  getSaleStatus,
  getCities,
} from '../controllers/saleController';
import { generateMarketingKit } from '../controllers/marketingKitController';
import { getSaleLabels } from '../controllers/labelController'; // W2
import { getHeatmapHandler } from '../controllers/heatmapController'; // Feature #28
import rippleRoutes from './ripples'; // Feature #51: Sale Ripples
import photoOpsRoutes from './photoOps'; // Feature #39: Photo Op Stations
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', listSales);
router.get('/search', searchSales);
router.get('/cities', getCities); // Get cities with active sales counts
router.get('/heatmap', getHeatmapHandler); // Feature #28: Neighborhood heatmap
router.get('/neighborhood/:slug', getSalesByNeighborhood); // U2: SEO landing pages
router.get('/city/:city', getSalesByCity); // Bug fix: City page route

// /mine must be registered before /:id so Express doesn't treat "mine" as an ID
router.get('/mine', authenticate, getMySales);

router.get('/:id', getSale);
router.get('/:id/activity', getSaleActivity); // Real-time activity feed (public)
router.get('/:id/status', getSaleStatus); // Feature #14: Real-time status (public)
router.post('/', authenticate, createSale);
router.put('/:id', authenticate, updateSale);
router.patch('/:id/status', authenticate, updateSaleStatus);
router.delete('/:id', authenticate, deleteSale);
router.post('/:id/clone', authenticate, cloneSale);
router.post('/:id/generate-qr', authenticate, generateQRCode);
router.post('/:id/generate-marketing-kit', authenticate, generateMarketingKit);
router.post('/generate-description', authenticate, generateSaleDescriptionHandler); // AI sale description generator
router.post('/:id/track-scan', trackQrScan); // public, no auth needed
router.get('/:id/calendar.ics', generateIcal); // public, no auth needed
router.get('/:saleId/labels', authenticate, getSaleLabels); // W2: all-items label PDF

// Feature #51: Sale Ripples — social proof activity tracking
router.use('/:saleId/ripples', rippleRoutes);

// Feature #39: Photo Op Stations — photo spot management
router.use('/:saleId/photo-ops', photoOpsRoutes);

export default router;
