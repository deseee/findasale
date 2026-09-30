import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { CITY_SLUG_PATTERN } from '../utils/citySlug';
import { parseCitySlug, rankCityFinds, directoryAddressWhere } from '../utils/cityFinds';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';
import { isSaleLocked } from '../services/rankService';

/**
 * GET /api/cities/:slug/top-finds
 * ADR-074: Returns top 12 eBay sold items synced to MetroTopFinds table
 */
export async function getTopFinds(req: Request, res: Response) {
  try {
    const { slug } = req.params;

    // Validate slug format (lowercase-with-hyphens-state)
    if (!CITY_SLUG_PATTERN.test(slug.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid city slug format',
      });
    }

    // Fetch top 12 items from MetroTopFinds ordered by most recent
    const finds = await prisma.metroTopFinds.findMany({
      where: { citySlug: slug },
      orderBy: { soldAt: 'desc' },
      take: 12,
    });

    return res.json({
      slug,
      finds,
      count: finds.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[citiesController] getTopFinds error:', err);
    return res.status(500).json({
      error: 'Failed to fetch top finds',
    });
  }
}

/**
 * GET /api/cities/:slug/finds
 * ADR-074 section 7.2 (schema-light): fresh, real, currently available items from PUBLISHED
 * sales in this city. This is what the public city page renders as "Fresh finds".
 *
 * Deliberately NOT backed by MetroTopFinds: that table's eBay rows are national active listings
 * stamped onto every metro and its own-item rows were chosen by state only, so neither can be
 * described honestly as "in {city}". No eBay data, no sold-price or estimate claims. Savings are
 * only reported when an item has a real original price above its current price.
 *
 * Public, read-only, no PII (item and sale titles, prices, first photo). No METRO_SYNC_ENABLED
 * dependency.
 *
 * Visibility (2026-09-29) matches the anonymous public sale page and publicItemIndexService: the item
 * passes PUBLIC_ITEM_FILTER (active, not grace-locked, PUBLISHED) and is not soft-deleted; the sale is
 * PUBLISHED, not soft-deleted, NOT an inventory container, and past its early-access window (a public
 * visitor is rank INITIATE, so a sale whose publishedAt is still in the future stays hidden).
 */
export async function getCityFinds(req: Request, res: Response) {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const parsed = CITY_SLUG_PATTERN.test(slug) ? parseCitySlug(slug) : null;
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid city slug format' });
    }
    const requested = parseInt(String(req.query.limit ?? '12'), 10);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 12, 1), 24);
    const now = new Date();

    const candidates = await prisma.item.findMany({
      where: {
        ...PUBLIC_ITEM_FILTER,
        isActive: true,
        deletedAt: null,
        status: 'AVAILABLE',
        draftStatus: 'PUBLISHED',
        price: { gt: 0 },
        photoUrls: { isEmpty: false },
        // Auction and reverse-auction prices are not a plain "price", so they are not shown here.
        listingType: { notIn: ['AUCTION', 'REVERSE_AUCTION'] },
        AND: [{ OR: [{ liveDropAt: null }, { liveDropAt: { lte: now } }] }],
        sale: {
          status: 'PUBLISHED',
          deletedAt: null,
          isInventoryContainer: false,
          // Public visitors have no early access: hide sales whose publishedAt is still in the future.
          OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
          state: { equals: parsed.stateCode, mode: 'insensitive' },
          city: { contains: parsed.matchToken, mode: 'insensitive' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        price: true,
        originalPrice: true,
        condition: true,
        category: true,
        photoUrls: true,
        saleId: true,
        createdAt: true,
        sale: { select: { id: true, title: true, city: true, state: true, publishedAt: true } },
      },
    });

    // Belt and braces for the early-access rule (the SQL filter above is the primary gate).
    // A null publishedAt is a scraped/unmanaged sale that is available now, as in publicItemIndexService.
    const visible = (candidates as any[]).filter(
      (c) => !c.sale?.publishedAt || !isSaleLocked(c.sale.publishedAt, 'INITIATE', now),
    );

    // The SQL filter is a cheap pre-filter; the exact city match is enforced here.
    const finds = rankCityFinds(visible, slug, limit);

    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.json({
      slug,
      finds,
      count: finds.length,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error('[citiesController] getCityFinds error:', err);
    return res.status(500).json({ error: 'Failed to fetch city finds' });
  }
}

/**
 * GET /api/cities/:slug/data
 * Returns city metadata, top finds, and recent sales for a city page
 * Schema-light: computes top finds on-demand from Item table
 */
export async function getCityPageData(req: Request, res: Response) {
  try {
    const { slug } = req.params;

    // Validate slug format (lowercase-with-hyphens-state)
    if (!CITY_SLUG_PATTERN.test(slug.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid city slug format',
      });
    }

    // ADR-074: Fetch top finds from MetroTopFinds table
    const topFinds = await prisma.metroTopFinds.findMany({
      where: { citySlug: slug },
      orderBy: { soldAt: 'desc' },
      take: 12,
    });

    // For future expansion: fetch recent sales from FindA.Sale database
    const recentSales: any[] = [];

    return res.json({
      slug,
      topFinds,
      recentSales,
      activeSalesCount: 0,
      totalItemsCount: 0,
      lastRefreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[citiesController] getCityPageData error:', err);
    return res.status(500).json({
      error: 'Failed to fetch city data',
    });
  }
}

/**
 * GET /api/cities
 * Returns list of all available cities (for sitemap, discovery, etc.)
 */
export async function listCities(req: Request, res: Response) {
  try {
    // For MVP, this would return cities from a City table
    // For now, return empty array (cities are in frontend JSON only)
    const cities: any[] = [];

    return res.json({
      cities,
      count: cities.length,
    });
  } catch (err) {
    console.error('[citiesController] listCities error:', err);
    return res.status(500).json({
      error: 'Failed to fetch cities list',
    });
  }
}

/**
 * POST /api/cities/sync
 * Admin-only: triggers city data refresh (eBay sync, stats computation)
 * For Phase 2 when a dedicated cron job is added
 */
export async function syncCityData(req: Request, res: Response) {
  try {
    // NOTE (Phase 2): — implement nightly cron job
    // For now, this is a placeholder for future metro sync cron

    return res.json({
      message: 'City sync not yet implemented in Phase 1 MVP',
      status: 'pending',
    });
  } catch (err) {
    console.error('[citiesController] syncCityData error:', err);
    return res.status(500).json({
      error: 'Sync failed',
    });
  }
}

/**
 * GET /api/cities/:slug/directory
 * Returns scraped/unmanaged organizer listings for a city page directory section.
 * Slug format: "grand-rapids-mi" — last segment is state code, remainder is city name.
 * Queries isUnmanagedListing=true organizers whose address contains the city name.
 */
export async function getCityDirectory(req: Request, res: Response) {
  try {
    const { slug } = req.params;
    const requestedLimit = parseInt(String(req.query.limit ?? '8'), 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 8, 1), 24);

    // Parse city name from slug: "grand-rapids-mi" → city="Grand Rapids", state="MI"
    const parts = slug.toLowerCase().split('-');
    const stateCode = parts[parts.length - 1];
    if (!stateCode || stateCode.length !== 2) {
      return res.status(400).json({ error: 'Invalid city slug format' });
    }
    const cityName = parts
      .slice(0, -1)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Query organizers: unmanaged, active, address contains the city name
    // Scraped organizers store address as "City, ST" or "Street, City, ST"
    const organizers = await prisma.organizer.findMany({
      where: {
        isUnmanagedListing: true,
        isHiddenFromDirectory: false,
        directoryStatus: 'ACTIVE',
        // Never list a business that opted out of outreach/directory (legal condition for the public directory).
        claimStatus: { not: 'OPTED_OUT' },
        // City name AND region code must both appear (see directoryAddressWhere): prevents
        // "Grand Rapids, MN" businesses appearing on the Michigan page.
        ...directoryAddressWhere(cityName, stateCode),
      },
      select: {
        id: true,
        businessName: true,
        address: true,
        website: true,
        googleRating: true,
        googleRatingCount: true,
        businessCategory: true,
        // claimStatus is read only to derive the boolean below and is never returned (it exposes
        // outreach/invite state of unmanaged businesses).
        claimStatus: true,
      },
      orderBy: [
        { googleRating: 'desc' },
        { businessName: 'asc' },
      ],
      take: limit,
    });

    return res.json({
      cityName,
      stateCode: stateCode.toUpperCase(),
      organizers: organizers.map(({ claimStatus, ...rest }) => ({
        ...rest,
        claimable: claimStatus === 'UNCLAIMED' || claimStatus === 'INVITED',
      })),
      count: organizers.length,
    });
  } catch (err) {
    console.error('[citiesController] getCityDirectory error:', err);
    return res.status(500).json({ error: 'Failed to fetch city directory' });
  }
}
