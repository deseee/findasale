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
  updateMarkdownConfig,
  getMarkdownConfig,
  cancelSale,
  recordVisit,
} from '../controllers/saleController';
import { generateMarketingKit } from '../controllers/marketingKitController';
import { getSaleLabels } from '../controllers/labelController'; // W2
import { getHeatmapHandler } from '../controllers/heatmapController'; // Feature #28
import rippleRoutes from './ripples'; // Feature #51: Sale Ripples
import photoOpsRoutes from './photoOps'; // Feature #39: Photo Op Stations
import treasureHuntQRRoutes from './treasureHuntQR'; // Feature #85: Treasure Hunt QR
import { createAlaCarteCheckout } from '../controllers/stripeController'; // #132: À La Carte
import { getApproachNotes, updateApproachNotes, sendApproachNotification } from '../controllers/arrivalController'; // Feature #84: Approach Notes
import { exportSaleToEbay } from '../controllers/ebayController'; // Feature #244: eBay CSV export
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireOrganizer } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { requireTier } from '../middleware/requireTier'; // Feature #91: PRO tier gate

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

// Specific /:id/* routes MUST come before generic /:id to prevent catch-all matching
router.get('/:id/activity', getSaleActivity); // Real-time activity feed (public)
router.get('/:id/status', getSaleStatus); // Feature #14: Real-time status (public)
router.get('/:id/calendar.ics', generateIcal); // BUG FIX #184: public, no auth needed — must be before /:id
router.get('/:saleId/labels', authenticate, getSaleLabels); // W2: all-items label PDF
router.get('/:id/markdown-config', authenticate, getMarkdownConfig);
router.put('/:id/markdown-config', authenticate, requireTier('PRO'), updateMarkdownConfig); // Feature #91: Auto-Markdown

router.post('/', authenticate, createSale);
router.post('/generate-description', authenticate, generateSaleDescriptionHandler); // AI sale description generator
router.post('/:id/visit', authenticate, recordVisit); // Phase 2a: Record visit and award XP
router.post('/:id/track-scan', trackQrScan); // public, no auth needed
router.post('/:id/generate-qr', authenticate, generateQRCode);
router.post('/:id/generate-marketing-kit', authenticate, generateMarketingKit);
router.post('/:id/ala-carte-checkout', authenticate, createAlaCarteCheckout); // #132: À La Carte
router.post('/:id/cancel', authenticate, cancelSale); // #120: Sale cancellation audit

// Generic /:id routes (last so they don't intercept specific subroutes)
router.get('/:id', getSale);
router.put('/:id', authenticate, updateSale);
router.patch('/:id/status', authenticate, updateSaleStatus);
router.delete('/:id', authenticate, deleteSale);
router.post('/:id/clone', authenticate, cloneSale);

// Feature #84: Approach Notes — day-of notifications with parking/entrance info
router.get('/:saleId/approach-notes', getApproachNotes); // Public read for saved sales, organizer only for unsaved
router.post('/:saleId/approach-notes', authenticate, requireOrganizer, updateApproachNotes); // Organizer only
router.post('/:saleId/send-approach-notification', authenticate, requireOrganizer, sendApproachNotification); // Organizer triggers notification

// Feature #244: eBay CSV export
router.get('/:saleId/ebay-export', authenticate, requireOrganizer, exportSaleToEbay);

// Feature #51: Sale Ripples — social proof activity tracking
router.use('/:saleId/ripples', rippleRoutes);

// Feature #39: Photo Op Stations — photo spot management
router.use('/:saleId/photo-ops', photoOpsRoutes);

// Feature #85: Treasure Hunt QR — per-sale scavenger hunt
router.use('/:saleId/treasure-hunt-qr', treasureHuntQRRoutes);

// Feature #228: Lifecycle stage management
// PATCH /api/sales/:saleId/lifecycle — update sale lifecycle stage
router.patch('/:saleId/lifecycle', authenticate, requireOrganizer, async (req: AuthRequest, res) => {
  try {
    const { saleId } = req.params;
    const { stage } = req.body;
    const validStages = ['LEAD', 'CONTRACTED', 'PREP', 'LIVE', 'POST_SALE', 'CLOSED'];

    if (!stage || !validStages.includes(stage)) {
      return res.status(400).json({ message: `Invalid stage. Must be one of: ${validStages.join(', ')}` });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId: req.user?.id } },
      select: { id: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: { lifecycleStage: stage },
      select: { id: true, lifecycleStage: true },
    });

    // Also update settlement if it exists
    await prisma.saleSettlement.updateMany({
      where: { saleId },
      data: { lifecycleStage: stage },
    });

    res.json(updated);
  } catch (error) {
    console.error('lifecycle update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
