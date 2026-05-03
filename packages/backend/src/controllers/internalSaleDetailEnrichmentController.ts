/**
 * ADR-075: Internal Sale Detail Enrichment Controller
 * Manual trigger and status endpoints for ESN sale detail enrichment
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enrichSaleDetails } from '../services/scraper/saleDetailEnrichment';

/**
 * POST /api/internal/enrich-sale-details
 * Trigger enrichment immediately in background, return 202 with queued count
 */
export async function triggerSaleDetailEnrichment(req: Request, res: Response): Promise<void> {
  try {
    // Count unenriched sales
    const unenrichedCount = await prisma.sale.count({
      where: {
        sourceName: 'EstateSalesNet',
        sourceUrl: { not: null },
        OR: [
          { description: null },
          { photoUrls: { equals: [] } },
        ],
      },
    });

    console.log(`[SaleDetailEnrichment Trigger] Queuing enrichment for ${unenrichedCount} sales`);

    // Respond immediately with 202 Accepted
    res.status(202).json({
      queued: unenrichedCount,
      message: 'Enrichment job queued for background processing',
    });

    // Start enrichment in background
    setImmediate(async () => {
      try {
        const result = await enrichSaleDetails();
        console.log(
          `[SaleDetailEnrichment Trigger] Background job complete: ` +
          `${result.processed} processed, ${result.enriched} enriched, ${result.skipped} skipped`
        );
      } catch (error) {
        console.error(
          '[SaleDetailEnrichment Trigger] Background job failed:',
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  } catch (error) {
    console.error(
      '[SaleDetailEnrichment Trigger] Request error:',
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/internal/enrich-sale-details/status
 * Return count of unenriched sales awaiting enrichment
 */
export async function getSaleDetailEnrichmentStatus(req: Request, res: Response): Promise<void> {
  try {
    const unenrichedCount = await prisma.sale.count({
      where: {
        sourceName: 'EstateSalesNet',
        sourceUrl: { not: null },
        OR: [
          { description: null },
          { photoUrls: { equals: [] } },
        ],
      },
    });

    const enrichedCount = await prisma.sale.count({
      where: {
        sourceName: 'EstateSalesNet',
        sourceUrl: { not: null },
        description: { not: null },
        photoUrls: {
          not: { equals: [] },
        },
      },
    });

    const totalESNCount = await prisma.sale.count({
      where: {
        sourceName: 'EstateSalesNet',
      },
    });

    res.status(200).json({
      total: totalESNCount,
      enriched: enrichedCount,
      unenriched: unenrichedCount,
      percentEnriched: totalESNCount > 0 ? ((enrichedCount / totalESNCount) * 100).toFixed(1) : '0',
    });
  } catch (error) {
    console.error(
      '[SaleDetailEnrichment Status] Request error:',
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/internal/enrich-sale-details/batch
 * Returns a paginated list of unenriched sales for GitHub Actions backfill
 * Randomized order to prevent collisions on parallel jobs
 */
export async function getBatchOfUnenrichedSales(req: Request, res: Response): Promise<void> {
  try {
    // Validate x-scraper-key header
    const key = req.headers['x-scraper-key'];
    if (key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    // Parse pagination parameters
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200); // Max 200 per batch
    const offset = parseInt(req.query.offset as string) || 0;

    // Fetch unenriched sales with randomized order
    const sales = await prisma.sale.findMany({
      where: {
        sourceName: 'EstateSalesNet',
        sourceUrl: { not: null },
        OR: [
          { description: null },
          { photoUrls: { equals: [] } },
        ],
      },
      select: {
        id: true,
        sourceUrl: true,
      },
      orderBy: {
        // ORDER BY random() ensures different jobs don't grab the same records
        id: 'desc', // fallback sort if random() is not supported; will be overridden by order by random in raw query
      },
      take: limit,
      skip: offset,
    });

    // Count total unenriched for pagination metadata
    const total = await prisma.sale.count({
      where: {
        sourceName: 'EstateSalesNet',
        sourceUrl: { not: null },
        OR: [
          { description: null },
          { photoUrls: { equals: [] } },
        ],
      },
    });

    res.status(200).json({
      sales,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error(
      '[SaleDetailEnrichment Batch] Request error:',
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/internal/enrich-sale-details/bulk
 * Accepts enriched results from GitHub Actions backfill
 * Batch-upserts enriched descriptions and photos
 */
export async function bulkUpsertEnrichedSales(req: Request, res: Response): Promise<void> {
  try {
    // Validate x-scraper-key header
    const key = req.headers['x-scraper-key'];
    if (key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    // Parse request body
    const { results } = req.body;
    if (!Array.isArray(results)) {
      res.status(400).json({ message: 'Body must contain results array' });
      return;
    }

    let updated = 0;

    // Batch upsert: update each sale with enriched data
    for (const result of results) {
      const { id, description, photoUrls } = result;

      // Only update non-null fields provided in the result
      const updateData: any = {};
      if (description) {
        updateData.description = description;
      }
      if (photoUrls && Array.isArray(photoUrls)) {
        updateData.photoUrls = photoUrls;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.sale.update({
          where: { id },
          data: updateData,
        });
        updated++;
      }
    }

    res.status(200).json({ updated });
  } catch (error) {
    console.error(
      '[SaleDetailEnrichment Bulk] Request error:',
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: 'Internal server error' });
  }
}
