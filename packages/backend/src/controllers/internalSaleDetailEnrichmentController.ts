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
