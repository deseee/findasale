import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * GET /api/cities/:slug/top-finds
 * ADR-074: Returns top 12 eBay sold items synced to MetroTopFinds table
 */
export async function getTopFinds(req: Request, res: Response) {
  try {
    const { slug } = req.params;

    // Validate slug format (lowercase-with-hyphens-state)
    if (!/^[a-z0-9-]+-[a-z]{2}$/.test(slug.toLowerCase())) {
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
 * GET /api/cities/:slug/data
 * Returns city metadata, top finds, and recent sales for a city page
 * Schema-light: computes top finds on-demand from Item table
 */
export async function getCityPageData(req: Request, res: Response) {
  try {
    const { slug } = req.params;

    // Validate slug format (lowercase-with-hyphens-state)
    if (!/^[a-z0-9-]+-[a-z]{2}$/.test(slug.toLowerCase())) {
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
    // TODO: Phase 2 — implement nightly cron job
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
    const limit = Math.min(parseInt((req.query.limit as string) || '8', 10), 24);

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
        address: { contains: cityName, mode: 'insensitive' },
      },
      select: {
        id: true,
        businessName: true,
        address: true,
        website: true,
        googleRating: true,
        googleRatingCount: true,
        businessCategory: true,
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
      organizers,
      count: organizers.length,
    });
  } catch (err) {
    console.error('[citiesController] getCityDirectory error:', err);
    return res.status(500).json({ error: 'Failed to fetch city directory' });
  }
}
