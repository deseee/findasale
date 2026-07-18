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
import { exportCommerceManagerFeed } from '../controllers/exportController'; // Commerce Manager data feed
import { returnItemsToInventoryHandler } from '../controllers/returnToInventoryController'; // Feature #300: Return to Inventory
import { toggleSaleRSVP, removeRSVP, getRSVPCount, getMyRSVPStatus, getRSVPAttendees } from '../controllers/rsvpController'; // Feature #154: Sale RSVP
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireOrganizer } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { requireTier } from '../middleware/requireTier'; // Feature #91: PRO tier gate
import { getSaleOgBuyerCount } from '../services/badgeService'; // Feature #404: OG Buyer count

const router = Router();

// ---------------------------------------------------------------------------
// RETAIL suppression filter — S934 data-quality audit
// Suppresses junk scraped rows from city×category SEO pages at query time.
// No database mutations — filter only.
// ---------------------------------------------------------------------------

// Canadian province codes to exclude from US SEO pages
const CANADIAN_PROVINCES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

// Clean RETAIL suffix categories (0–4% junk). Anything NOT in this list is suppressed.
// Audit ref: §3 — clean categories verified via heuristic scan.
const RETAIL_CLEAN_SUFFIXES = new Set([
  'Antique Mall',
  'Pawn Shop',
  'Thrift Store',
  'Resale Shop',
  'Used Furniture Store',
  'Auction House',
  'Surplus Store',
  'Record Store',
  'Salvage Store',
  'Used Electronics',
  'Antique Dealer',
  'Vintage Shop',
  'Jewelry Resale',
  'Used Bookstore',
  'Used Sporting Goods',
  'Coin Dealer',
  'Estate Liquidator',
]);

// Non-resale business keywords — suppress any RETAIL title containing these terms.
// Catches residual junk inside otherwise-clean categories (e.g. dental center in Antique Mall).
// Audit ref: §2 — heuristic blocklist used to classify 1,312 junk rows.
export const RETAIL_JUNK_KEYWORDS = [ // exported for #567 companyDirectoryController
  'real estate', 'realty', 'realtor', 'bienes raices',
  'brewing', 'brewery', 'brew',
  'barber', 'barbershop',
  'smoke shop', 'vape', 'kratom',
  'restaurant', 'cafe', 'coffee', 'diner',
  'church', 'cathedral', 'chapel',
  'university', 'college', 'school',
  'attorney', 'law firm', 'legal',
  'dental', 'dentist', 'orthodontic',
  'medical', 'clinic', 'hospital',
  'insurance',
  'salon', 'spa', 'beauty',
  'manufacturing', 'industries', 'industrial',
  'dealership', 'auto sales', 'motors',
  'theatre', 'theater',
  'funeral', 'mortuary',
  'pool', 'aquatic',
  'racquet', 'tennis',
];

/**
 * Extract the suffix category from a RETAIL title of the form:
 *   "Shop Name — Category in City, ST"
 * Returns null if the title has no suffix (raw scraped business name with no category).
 */
function extractRetailSuffix(title: string): string | null {
  const match = title.match(/— (.+?) in /);
  return match ? match[1] : null;
}

/**
 * Returns true if a RETAIL sale row should be suppressed from public SEO pages.
 * Suppression rules (in priority order):
 *  1. Canadian region gate — exclude if state is a Canadian province code
 *  2. No-suffix bucket — raw scraped names with no "— Category in City" pattern (28% junk)
 *  3. Excluded suffix categories — Estate Sale Company (39% junk), Consignment Shop (22% junk)
 *  4. Business-keyword blocklist — non-resale businesses in any suffix category
 * Deduplification is handled separately in the calling code.
 */
function shouldSuppressRetailRow(sale: { title: string; state: string }): boolean {
  const stateUpper = sale.state.toUpperCase();

  // Rule 1: Canadian region gate
  if (CANADIAN_PROVINCES.has(stateUpper)) return true;

  const suffix = extractRetailSuffix(sale.title);

  // Rule 2: No-suffix raw-name bucket — 3,459 rows, 28% junk, not salvageable
  if (suffix === null) return true;

  // Rule 3: Excluded suffix categories
  if (!RETAIL_CLEAN_SUFFIXES.has(suffix)) return true;

  // Rule 4: Business-keyword blocklist (case-insensitive)
  const titleLower = sale.title.toLowerCase();
  for (const kw of RETAIL_JUNK_KEYWORDS) {
    if (titleLower.includes(kw)) return true;
  }

  return false;
}

/**
 * Deduplicate an array of sales by title (case-insensitive).
 * Keeps the first occurrence (earliest startDate, as the query is ordered by startDate asc).
 * Removes 1,478 duplicate rows per S934 audit §4.
 */
function deduplicateByTitle(sales: Array<{ title: string; [key: string]: unknown }>): typeof sales {
  const seen = new Set<string>();
  const out: typeof sales = [];
  for (const s of sales) {
    const key = s.title.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

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
      'resale': 'RETAIL',
    };
    const saleTypeFilter = category ? categoryMap[category] : undefined;

    const whereClause: any = {
      status: 'PUBLISHED',
      deletedAt: null,
      // Permanent storefronts (isOngoing) always count as current — same pattern as
      // discoveryService.ts / saleController.ts / search.ts / heatmapService.ts.
      // Bug fix (566-row TODAY/Live badge bug, S1130 diagnostic).
      OR: [{ isOngoing: true }, { endDate: { gte: new Date() } }],
      state: { equals: stateCode, mode: 'insensitive' },
    };
    // Problem C: expand city match to known borough/alias sets
    const cityAliases: Record<string, string[]> = {
      'New York': ['New York City', 'NYC', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Manhattan'],
      'Los Angeles': ['LA', 'Los Angeles City'],
      'Chicago': ['Chicago City'],
    };
    const aliases = cityAliases[cityName] ?? [];
    if (aliases.length > 0) {
      whereClause.city = { in: [cityName, ...aliases], mode: 'insensitive' };
    } else {
      whereClause.city = { equals: cityName, mode: 'insensitive' };
    }
    if (saleTypeFilter) {
      whereClause.saleType = saleTypeFilter;
    }

    // Fetch more rows when RETAIL is in scope so post-suppression result set is still
    // populated after junk is removed (audit: ~55% of RETAIL rows are suppressed).
    const isRetailQuery = saleTypeFilter === 'RETAIL' || !saleTypeFilter;
    const fetchLimit = isRetailQuery ? 300 : 50;

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
        isOngoing: true,
        sourceUrl: true,
        sourceName: true,
        scrapedMetadata: true,
        organizer: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
      orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }],
      take: fetchLimit,
    });

    // ---------------------------------------------------------------------------
    // Geo-mismatch suppression — exclude scraped rows whose city/state could NOT be
    // confirmed to match the scraped address (geoConfidence='unresolved' in
    // scrapedMetadata, set by facebook-events-discovery.ts parsePlace()). The flag was
    // being written but nothing acted on it, so mismatched rows (e.g. a "Phoenix, AZ"
    // sale whose real scraped address is in Modesto, CA) rendered on the wrong city
    // page. Post-query, no DB mutation — same pattern as RETAIL suppression below.
    // (claude_docs/STATE.md Blocked Queue — Facebook Events Scraper)
    // ---------------------------------------------------------------------------
    let filteredSales = sales.filter((s: any) => {
      const meta = s.scrapedMetadata as Record<string, unknown> | null;
      return !(meta && meta.geoConfidence === 'unresolved');
    });
    if (isRetailQuery) {
      filteredSales = filteredSales.filter((s: any) => {
        // Only apply suppression to RETAIL rows; pass non-RETAIL through unchanged
        if (s.saleType !== 'RETAIL') return true;
        return !shouldSuppressRetailRow({ title: s.title, state: s.state });
      });

      // Collapse exact-title duplicates (1,478 redundant rows per audit §4)
      const nonRetail = filteredSales.filter((s: any) => s.saleType !== 'RETAIL');
      const retailOnly = filteredSales.filter((s: any) => s.saleType === 'RETAIL');
      const deduped = deduplicateByTitle(retailOnly as Array<{ title: string; [key: string]: unknown }>);
      filteredSales = [...nonRetail, ...(deduped as typeof sales)];
    }

    // Cap final output at 50 rows after suppression
    const capped = filteredSales.slice(0, 50);

    // Derive available categories from all sales (ignoring category filter for sidebar)
    const allSalesForCategories = saleTypeFilter
      ? await prisma.sale.findMany({
          where: {
            status: 'PUBLISHED',
            deletedAt: null,
            city: { equals: cityName, mode: 'insensitive' },
            state: { equals: stateCode, mode: 'insensitive' },
          },
          select: { saleType: true },
        })
      : filteredSales;

    const categorySet = new Set<string>(allSalesForCategories.map((s: any) => s.saleType));
    const categories = Array.from(categorySet);

    const serialized = capped.map((s: any) => {
      const { scrapedMetadata, ...rest } = s;
      return {
        ...rest,
        startDate: s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate,
        endDate: s.endDate instanceof Date ? s.endDate.toISOString() : s.endDate,
        photoUrl: s.photoUrls?.[0] ?? null,
      };
    });

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

    // S1071 crawl-budget: per-saleType ACTIVE counts per city, so the sitemap can emit
    // city×type URLs only where real inventory exists. "Active" mirrors /sales/by-city:
    // status='PUBLISHED' AND endDate >= NOW(). saleType values per schema.prisma:
    // ESTATE | YARD | AUCTION | FLEA_MARKET | RETAIL.
    const activeRows = await prisma.$queryRaw<Array<{ city: string; state: string; saleType: string; count: bigint }>>`
      SELECT city, state, "saleType", COUNT(*) AS count
      FROM "Sale"
      WHERE status = 'PUBLISHED'
        AND "endDate" >= NOW()
        AND city IS NOT NULL
        AND state IS NOT NULL
      GROUP BY city, state, "saleType"
    `;

    const activeByCity = new Map<string, { total: number; byType: Record<string, number> }>();
    for (const r of activeRows) {
      const key = `${r.city.toLowerCase()}|${r.state.toLowerCase()}`;
      const entry = activeByCity.get(key) ?? { total: 0, byType: {} };
      const n = Number(r.count);
      entry.total += n;
      entry.byType[r.saleType] = (entry.byType[r.saleType] ?? 0) + n;
      activeByCity.set(key, entry);
    }

    const slugs = rows.map((r) => {
      const active = activeByCity.get(`${r.city.toLowerCase()}|${r.state.toLowerCase()}`);
      return {
        slug: r.slug.replace(/\./g, ''),
        city: r.city,
        state: r.state,
        count: Number(r.count),
        // S1071 additive fields — existing slug/city/state/count consumers are unaffected
        activeCount: active?.total ?? 0,
        activeByType: active?.byType ?? {},
      };
    });

    return res.json({ slugs, total: slugs.length });
  } catch (err) {
    console.error('[sales/city-slugs] error:', err);
    return res.status(500).json({ error: 'Failed to fetch city slugs' });
  }
});

// SEO: GET /sales/sitemap — returns all PUBLISHED sale IDs + updatedAt for sitemaps
// Returns at most 5000 most recently updated sales to stay within sitemap limits.
// No auth, no endDate filter (expired sales still have indexable pages).
router.get('/sitemap', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        isInventoryContainer: false,
      },
      select: {
        id: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
    return res.json({ sales });
  } catch (err) {
    console.error('[sales/sitemap] error:', err);
    return res.status(500).json({ error: 'Failed to fetch sitemap sales' });
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

// Facebook Commerce Manager data feed — public, no auth (FB crawler has no session token)
router.get('/:saleId/export/commerce-feed', exportCommerceManagerFeed);

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
