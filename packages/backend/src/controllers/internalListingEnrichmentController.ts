/**
 * Batch AI enrichment for scraped organizer listings.
 * Called by GitHub Actions on schedule — NOT triggered per-request.
 * Processes unenriched sales in batches with delay to stay under Haiku rate limits.
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enrichScrapedListing } from '../services/listingEnrichmentService';

const DEFAULT_BATCH_SIZE = 50;

export async function runListingEnrichmentBatch(req: Request, res: Response): Promise<void> {
  const batchSize = parseInt(process.env.AI_ENRICHMENT_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10);

  let processed = 0;
  let enriched = 0;
  let skipped = 0;

  try {
    // Find unenriched scraped sales: has scrapedMetadata, description > 50 chars, not yet enriched
    const sales = await prisma.sale.findMany({
      where: {
        scrapedMetadata: { not: null },
        description: { not: null },
      },
      select: {
        id: true,
        title: true,
        description: true,
        scrapedMetadata: true,
      },
      take: batchSize * 3, // over-fetch since we filter in JS for JSON field checks
    });

    // Filter: description > 50 chars AND scrapedMetadata.aiEnriched is null/undefined
    const unenriched = sales.filter((sale) => {
      const desc = sale.description ?? '';
      if (desc.length <= 50) return false;
      const meta = sale.scrapedMetadata as Record<string, unknown> | null;
      if (!meta) return false;
      return !meta.aiEnriched;
    }).slice(0, batchSize);

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

      // 300ms delay between calls to stay under Haiku rate limits
      if (processed < unenriched.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    console.log(`[ListingEnrichmentBatch] Complete — processed=${processed} enriched=${enriched} skipped=${skipped}`);
    res.json({ processed, enriched, skipped });
  } catch (err: any) {
    console.error('[ListingEnrichmentBatch] Batch error:', err.message ?? err);
    res.status(500).json({ error: 'Enrichment batch failed', details: err.message ?? String(err) });
  }
}
