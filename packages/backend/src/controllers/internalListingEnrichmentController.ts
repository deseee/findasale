/**
 * Batch AI enrichment for scraped organizer listings.
 * Called by GitHub Actions on schedule — NOT triggered per-request.
 * Processes unenriched sales in batches with delay to stay under Haiku rate limits.
 */

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { enrichScrapedListing } from '../services/listingEnrichmentService';

const DEFAULT_BATCH_SIZE = 35;

async function _runEnrichmentBatch(batchSize: number): Promise<void> {
  let processed = 0;
  let enriched = 0;
  let skipped = 0;

  // Fetch only unenriched sales: scrapedMetadata exists but aiEnriched key is absent.
  // SQL-level filter avoids the previous 3× over-fetch + JS JSON blob scanning.
  const sales = await prisma.sale.findMany({
    where: {
      scrapedMetadata: { not: Prisma.DbNull },
      description: { not: null },
      NOT: {
        scrapedMetadata: {
          path: ['aiEnriched'],
          not: Prisma.DbNull,
        },
      },
    },
    select: {
      id: true,
      title: true,
      description: true,
      scrapedMetadata: true,
    },
    take: batchSize,
  });

  // Secondary filter: skip descriptions too short to enrich (service rejects them anyway)
  const unenriched = sales.filter((sale) => (sale.description ?? '').length > 50);

  console.log(`[ListingEnrichmentBatch] Processing ${unenriched.length} unenriched sales (batchSize=${batchSize})`);

  for (const sale of unenriched) {
    processed++;
    try {
      const result = await enrichScrapedListing(sale.description!, sale.title);

      if (result) {
        const currentMetadata = (sale.scrapedMetadata as Record<string, unknown>) || {};
        await prisma.sale.update({
          where: { id: sale.id },
          data: {
            scrapedMetadata: {
              ...currentMetadata,
              aiEnriched: result,
            },
          },
        });
        enriched++;
        console.log(`[ListingEnrichmentBatch] Enriched sale ${sale.id}`);
      } else {
        skipped++;
      }
    } catch (err: any) {
      console.error(`[ListingEnrichmentBatch] Failed to enrich sale ${sale.id}:`, err.message ?? err);
      skipped++;
    }

    // 1500ms delay between calls to stay under Haiku rate limits
    if (processed < unenriched.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log(`[ListingEnrichmentBatch] Complete — processed=${processed} enriched=${enriched} skipped=${skipped}`);
}

export function runListingEnrichmentBatch(req: Request, res: Response): void {
  const batchSize = parseInt(process.env.AI_ENRICHMENT_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10);

  // Respond immediately to avoid Railway's 30s HTTP proxy timeout.
  // The enrichment job runs in the background — check Railway logs for results.
  res.status(202).json({ message: 'Enrichment batch started' });

  _runEnrichmentBatch(batchSize).catch((err) => {
    console.error('[enrichment] background error:', err);
  });
}

/**
 * Cron-callable entry point (no HTTP context).
 * Uses AI_ENRICHMENT_BATCH_SIZE env var (default: 50 for nightly runs).
 */
export async function runListingEnrichmentCronBatch(): Promise<void> {
  const batchSize = parseInt(process.env.AI_ENRICHMENT_BATCH_SIZE || '50', 10);
  await _runEnrichmentBatch(batchSize);
}
