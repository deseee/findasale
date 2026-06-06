/**
 * Internal Geocoding Controller
 * Provides batch-fetch and bulk-update endpoints for the GitHub Actions
 * geocode-ungeocoded-sales workflow.
 *
 * Endpoints:
 *   GET  /api/internal/geocode-ungeocoded-sales/batch  — fetch ungeocoded sale address data
 *   POST /api/internal/geocode-ungeocoded-sales/bulk   — accept geocoded lat/lng results
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

interface GeocodedResult {
  id: string;
  lat: number;
  lng: number;
}

/**
 * GET /api/internal/geocode-ungeocoded-sales/batch
 * Returns a paginated list of sales missing lat/lng, with their address fields.
 * Filtered to sources that never provide coordinates (GarageSaleFinder, FacebookEvents).
 * Protected by x-scraper-key header.
 */
export async function getBatchOfUngeocodedSales(req: Request, res: Response): Promise<void> {
  try {
    const key = req.headers['x-scraper-key'];
    if (key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const sourceName = req.query.source as string | undefined;

    // Two categories of ungeocoded sales:
    // 1. Sales with a full street address (GarageSaleFinder, platform sales, FB Events w/ slug)
    // 2. Facebook Events city-only records (address='', city+state present) — use city-center fallback
    // Only geocode PUBLISHED (live/future) sales — ENDED/DRAFT sales never appear
    // on the map, so geocoding them wastes the batch budget. This filter drops the
    // working set from ~15.8k to ~1.2k and lets the real active backlog drain.
    const whereClause = sourceName
      ? {
          lat: null,
          status: 'PUBLISHED',
          city: { not: '' },
          state: { not: '' },
          sourceName,
        }
      : {
          lat: null,
          status: 'PUBLISHED',
          city: { not: '' },
          state: { not: '' },
          OR: [
            // Scraped sources with full addresses
            {
              sourceName: { in: ['GarageSaleFinder', 'Facebook Events'] },
              address: { not: '' },
            },
            // Facebook Events city-only records (no street address — city-center fallback)
            {
              sourceName: 'Facebook Events',
              address: '',
            },
            // Platform sales (organizer-created) published without geocoding
            { sourceName: null, address: { not: '' } },
          ],
        };

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where: whereClause,
        select: {
          id: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          sourceName: true,
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.sale.count({ where: whereClause }),
    ]);

    res.status(200).json({
      sales,
      total,
      hasMore: offset + limit < total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[GeocodingBatch] Request error:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/internal/geocode-ungeocoded-sales/bulk
 * Accepts an array of { id, lat, lng } objects from the GitHub Actions workflow.
 * Only writes lat/lng if the sale still has null lat (prevents overwriting real data).
 * Protected by x-scraper-key header.
 */
export async function bulkUpdateGeocodedSales(req: Request, res: Response): Promise<void> {
  try {
    const key = req.headers['x-scraper-key'];
    if (key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const results: GeocodedResult[] = req.body?.results;

    if (!Array.isArray(results) || results.length === 0) {
      res.status(400).json({ error: 'results array is required and must be non-empty' });
      return;
    }

    // Validate each result has required fields
    const valid = results.filter(
      (r) =>
        typeof r.id === 'string' &&
        typeof r.lat === 'number' &&
        typeof r.lng === 'number' &&
        !isNaN(r.lat) &&
        !isNaN(r.lng)
    );

    if (valid.length === 0) {
      res.status(400).json({ error: 'No valid results in payload (each must have id, lat, lng as number)' });
      return;
    }

    // Respond immediately — Railway has a 30s request timeout; the DB loop below
    // may exceed that for large batches. Fire-and-forget prevents double-response errors.
    res.status(202).json({ message: 'Geocoding batch started', received: results.length, valid: valid.length });

    // Run the update loop in the background after the response is sent
    (async () => {
      let updated = 0;
      let skipped = 0;

      for (const result of valid) {
        const count = await prisma.sale.updateMany({
          where: {
            id: result.id,
            lat: null, // Only update if still ungeocoded — prevents overwriting real data
          },
          data: {
            lat: result.lat,
            lng: result.lng,
          },
        });

        if (count.count > 0) {
          updated++;
        } else {
          skipped++;
        }
      }

      console.log(`[GeocodingBulk] Updated ${updated} sales, skipped ${skipped} (already had lat/lng or not found)`);
    })().catch((err) => console.error('[GeocodingBulk] background error:', err));
  } catch (error) {
    console.error('[GeocodingBulk] Request error:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Internal server error' });
  }
}
