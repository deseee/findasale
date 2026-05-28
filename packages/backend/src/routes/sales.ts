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
  checkInToSale,
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
import { returnItemsToInventoryHandler } from '../controllers/returnToInventoryController'; // Feature #300: Return to Inventory
import { toggleSaleRSVP, removeRSVP, getRSVPCount, getMyRSVPStatus, getRSVPAttendees } from '../controllers/rsvpController'; // Feature #154: Sale RSVP
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireOrganizer } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { requireTier } from '../middleware/requireTier'; // Feature #91: PRO tier gate
import { getSaleOgBuyerCount } from '../services/badgeService'; // Feature #404: OG Buyer count

const router = Router();

// Public routes
router.get('/', listSales);
router.get('/search', searchSales);
router.get('/cities', getCities); // Get cities with active sales counts
router.get('/heatmap', getHeatmapHandler); // Feature #28: Neighborhood heatmap
router.get('/neighborhood/:slug', getSalesByNeighborhood); // U2: SEO landing pages
router.get('/city/:city', getSalesByCity); // Bug fix: City page route


// SEO: GET /sales/by-city/:citySlug — city landing page data
// citySlug format: "grand-rapids-mi", "chicago-il", etc.
router.get('/by-city/:citySlug', async (req, res) => {
  try {
    const { citySlug } = req.params;
    const { category } = req.query as { category?: string };

    // Validate slug format: word-chars-state e.g. "grand-rapids-mi"
    if (!/^[a-z0-9-]+-[a-z]{2}$/.test(citySlug)) {
      return res.status(400).json({ error: 'Invalid city slug format' });
    }

    // Parse city + state from slug: last 2-char segment is state
    const parts = citySlug.split('-');
    const stateCode = parts[parts.length - 1].toUpperCase();
    const cityName = parts
      .slice(0, -1)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Map category slug → saleType enum
    const categoryMap: Record<string, string> = {
      'estate-sales': 'ESTATE',
      'yard-sales': 'YARD',
      'auctions': 'AUCTION',
      'flea-markets': 'FLEA_MARKET',
      'consignment': 'RETAIL',
    };
    const saleTypeFilter = category ? categoryMap[category] : undefined;

    const whereClause: any = {
      status: { in: ['PUBLISHED', 'ENDED'] },
      city: { equals: cityName, mode: 'insensitive' },
      state: { equals: stateCode, mode: 'insensitive' },
    };
    if (saleTypeFilter) {
      whereClause.saleType = saleTypeFilter;
    }

    const sales = await prisma.sale.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        saleType: true,
        startDate: true,
        endDate: true,
        city: true,
        state: true,
        address: true,
        photoUrls: true,
        status: true,
        sourceUrl: true,
        sourceName: true,
        organizer: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
      take: 50,
    });

    // Derive available categories from all sales (ignoring category filter for sidebar)
    const allSalesForCategories = saleTypeFilter
      ? await prisma.sale.findMany({
          where: {
            status: { in: ['PUBLISHED', 'ENDED'] },
            city: { equals: cityName, mode: 'insensitive' },
            state: { equals: stateCode, mode: 'insensitive' },
          },
          select: { saleType: true },
        })
      : sales;

    const categorySet = new Set<string>(allSalesForCategories.map((s: any) => s.saleType));
    const categories = Array.from(categorySet);

    const serialized = sales.map((s: any) => ({
      ...s,
      startDate: s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate,
      endDate: s.endDate instanceof Date ? s.endDate.toISOString() : s.endDate,
      photoUrl: s.photoUrls?.[0] ?? null,
    }));

    return res.json({
      city: cityName,
      state: stateCode,
      slug: citySlug,
      sales: serialized,
      totalCount: serialized.length,
      categories,
    });
  } catch (err) {
    console.error('[sales/by-city] error:', err);
    return res.status(500).json({ error: 'Failed to fetch city sales' });
  }
});

// SEO: GET /sales/city-slugs — returns all available city slugs for sitemaps/getStaticPaths
router.get('/city-slugs', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ slug: string; city: string; state: string; count: bigint }>>`
      SELECT
        LOWER(REPLACE(city, ' ', '-')) || '-' || LOWER(state) AS slug,
        city,
        state,
        COUNT(*) AS count
      FROM "Sale"
      WHERE status IN ('PUBLISHED', 'ENDED')
        AND city IS NOT NULL
        AND state IS NOT NULL
      GROUP BY city, state
      ORDER BY count DESC
      LIMIT 200
    `;

    const slugs = rows.map((r) => ({
      slug: r.slug.replace(/\./g, ''),
      city: r.city,
      state: r.state,
      count: Number(r.count),
    }));

    return res.json({ slugs, total: slugs.length });
  } catch (err) {
    console.error('[sales/city-slugs] error:', err);
    return res.status(500).json({ error: 'Failed to fetch city slugs' });
  }
});

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
router.post('/:saleId/checkin', authenticate, checkInToSale); // Award XP for QR check-in
router.post('/:id/track-scan', trackQrScan); // public, no auth needed
router.post('/:id/generate-qr', authenticate, generateQRCode);
router.post('/:id/generate-marketing-kit', authenticate, generateMarketingKit);
router.post('/:id/ala-carte-checkout', authenticate, createAlaCarteCheckout); // #132: À La Carte
router.post('/:id/cancel', authenticate, cancelSale); // #120: Sale cancellation audit

// Fix 1: Dedicated coordinates endpoint (must come before generic /:id routes)
router.patch('/:id/coordinates', authenticate, requireOrganizer, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ message: 'lat and lng must be numbers' });
    }
    // Verify this organizer owns the sale (organizerId references Organizer.id, not User.id)
    const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user!.id } });
    if (!organizerProfile) return res.status(403).json({ message: 'Organizer profile not found' });
    const sale = await prisma.sale.findFirst({ where: { id, organizerId: organizerProfile.id } });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    const updated = await prisma.sale.update({ where: { id }, data: { lat, lng } });
    return res.json({ lat: updated.lat, lng: updated.lng });
  } catch (err: any) {
    console.error('Coordinates update error:', err);
    return res.status(500).json({ message: 'Failed to update coordinates' });
  }
});

// #403: Family Bundle Pricing — public bundle list for a sale
router.get('/:id/bundles', async (req, res) => {
  try {
    const { id } = req.params;
    const bundles = await prisma.itemBundle.findMany({
      where: { saleId: id, isActive: true },
      include: {
        items: {
          select: { id: true, title: true, photoUrls: true, status: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(bundles);
  } catch (err) {
    console.error('bundles fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch bundles' });
  }
});

// #403: Bundle CRUD — organizer-only create/update/delete
router.post('/:saleId/bundles', authenticate, requireOrganizer, async (req: AuthRequest, res) => {
  try {
    const { saleId } = req.params;
    const { title, description, bundlePrice, itemIds } = req.body;
    if (!title || typeof bundlePrice !== 'number' || !Array.isArray(itemIds)) {
      return res.status(400).json({ message: 'title, bundlePrice (number), and itemIds (array) are required' });
    }
    const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user!.id } });
    if (!organizerProfile) return res.status(403).json({ message: 'Organizer profile not found' });
    const sale = await prisma.sale.findFirst({ where: { id: saleId, organizerId: organizerProfile.id } });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied' });
    const bundle = await prisma.itemBundle.create({
      data: {
        saleId,
        title,
        description: description ?? null,
        bundlePrice,
        isActive: true,
        items: { connect: itemIds.map((id: string) => ({ id })) },
      },
      include: { items: { select: { id: true, title: true, price: true, photoUrls: true } } },
    });
    return res.status(201).json(bundle);
  } catch (err) {
    console.error('bundle create error:', err);
    return res.status(500).json({ message: 'Failed to create bundle' });
  }
});

router.put('/:saleId/bundles/:bundleId', authenticate, requireOrganizer, async (req: AuthRequest, res) => {
  try {
    const { saleId, bundleId } = req.params;
    const { title, description, bundlePrice, itemIds } = req.body;
    const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user!.id } });
    if (!organizerProfile) return res.status(403).json({ message: 'Organizer profile not found' });
    const sale = await prisma.sale.findFirst({ where: { id: saleId, organizerId: organizerProfile.id } });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied' });
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (bundlePrice !== undefined) updateData.bundlePrice = bundlePrice;
    if (Array.isArray(itemIds)) {
      updateData.items = { set: itemIds.map((id: string) => ({ id })) };
    }
    const bundle = await prisma.itemBundle.update({
      where: { id: bundleId },
      data: updateData,
      include: { items: { select: { id: true, title: true, price: true, photoUrls: true } } },
    });
    return res.json(bundle);
  } catch (err) {
    console.error('bundle update error:', err);
    return res.status(500).json({ message: 'Failed to update bundle' });
  }
});

router.delete('/:saleId/bundles/:bundleId', authenticate, requireOrganizer, async (req: AuthRequest, res) => {
  try {
    const { saleId, bundleId } = req.params;
    const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user!.id } });
    if (!organizerProfile) return res.status(403).json({ message: 'Organizer profile not found' });
    const sale = await prisma.sale.findFirst({ where: { id: saleId, organizerId: organizerProfile.id } });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied' });
    await prisma.itemBundle.update({ where: { id: bundleId }, data: { isActive: false } });
    return res.json({ message: 'Bundle deactivated' });
  } catch (err) {
    console.error('bundle delete error:', err);
    return res.status(500).json({ message: 'Failed to deactivate bundle' });
  }
});

// #450: EventSeries — public endpoint for recurring organizer sales (used by SSR JSON-LD)
// GET /sales/organizer/:organizerId/recurring?saleType=ESTATE
router.get('/organizer/:organizerId/recurring', async (req, res) => {
  try {
    const { organizerId } = req.params;
    const { saleType } = req.query as { saleType?: string };

    if (!organizerId || typeof organizerId !== 'string') {
      return res.status(400).json({ error: 'organizerId is required' });
    }

    const where: Record<string, unknown> = {
      organizerId,
      status: { in: ['PUBLISHED', 'ENDED'] },
    };
    if (saleType && typeof saleType === 'string') {
      where.saleType = saleType;
    }

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { startDate: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        city: true,
        state: true,
        saleType: true,
        organizer: {
          select: { id: true, businessName: true },
        },
      },
    });

    const isRecurring = sales.length >= 3;
    const organizerName = sales[0]?.organizer?.businessName || null;
    const resolvedSaleType = saleType || (sales[0]?.saleType ?? null);

    return res.json({
      isRecurring,
      organizerName,
      saleType: resolvedSaleType,
      sales: sales.map((s) => ({
        id: s.id,
        title: s.title,
        startDate: s.startDate,
        endDate: s.endDate,
        city: s.city,
        state: s.state,
      })),
    });
  } catch (err) {
    console.error('[recurring] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

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

// Feature #300: Return to Inventory — return unsold items from ENDED sale to inventory
router.post('/:saleId/return-items', authenticate, requireOrganizer, returnItemsToInventoryHandler);

// Feature #154: Sale RSVP — shoppers can RSVP to attend a sale
router.post('/:id/rsvp', authenticate, toggleSaleRSVP); // Toggle RSVP for current user + award XP + trigger notification
router.delete('/:id/rsvp', authenticate, removeRSVP); // Remove RSVP for current user
router.get('/:id/rsvp/count', getRSVPCount); // Get count of people going (public)
router.get('/:id/rsvp/mine', authenticate, getMyRSVPStatus); // Check if current user has RSVP'd
router.get('/:id/rsvp/attendees', getRSVPAttendees); // Get list of attendees (names only, for organizer/public modal)

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

// Feature #404: OG Buyer count — for organizer dashboard
router.get('/:saleId/og-buyer-count', authenticate, requireOrganizer, async (req: AuthRequest, res) => {
  try {
    const { saleId } = req.params;
    const count = await getSaleOgBuyerCount(saleId);
    res.json({ count: Math.min(count, 100), limit: 100 });
  } catch (error) {
    console.error('[og-buyer-count] error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
