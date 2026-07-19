/**
 * Batch AI enrichment for scraped organizer listings.
 * Called by GitHub Actions on schedule — NOT triggered per-request.
 *
 * Primary path (2026-07-19): submits the whole night's unenriched sales as ONE
 * Anthropic Message Batch (enrichScrapedListingsBatch) — 50% cheaper than the old
 * per-item /v1/messages loop, since this job is fully background/non-organizer-facing
 * (nothing waits synchronously on scrapedMetadata.aiEnriched). If batch SUBMISSION
 * itself fails (network/API error before any polling starts), falls back to the
 * original sequential enrichScrapedListing loop with a 1500ms inter-call delay, so
 * a Batch API outage never silently stops nightly enrichment.
 */

import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { enrichScrapedListing, enrichScrapedListingsBatch } from '../services/listingEnrichmentService';

const DEFAULT_BATCH_SIZE = 35;

/**
 * Strip characters that cause PostgreSQL hex-escape parse errors.
 * Covers: NUL bytes, incomplete \x escapes (\x not followed by 2 hex digits),
 * and lone backslashes before non-escape characters.
 * Applied to every string in the metadata blob before the Prisma update.
 */
function sanitizeStr(s: string): string {
  return s
    .replace(/\x00/g, '')                        // NUL bytes
    .replace(/\\x(?![0-9a-fA-F]{2})/g, ' ')     // incomplete \x hex escapes
    .replace(/\\(?![\\nrtbf"'0-9xu])/g, '\\\\'); // lone backslash -> escaped backslash
}

/** Recursively sanitize all string values in a plain-object/array tree. */
function sanitizeMetadataStrings(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeStr(value);
  if (Array.isArray(value)) return value.map(sanitizeMetadataStrings);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeMetadataStrings(v);
    }
    return out;
  }
  return value;
}

/**
 * Belt-and-suspenders: JSON round-trip to normalize any encoding edge cases
 * that string-level regex sanitization might miss (surrogate pairs, embedded
 * control chars, etc.). Falls back to original value on parse error.
 */
function deepSanitizeViaJson(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return value;
    // Strip NUL bytes at the serialized-string level (safety net)
    const cleaned = serialized.replace(/\\u0000/g, '');
    return JSON.parse(cleaned);
  } catch {
    return value;
  }
}

type UnenrichedSale = {
  id: string;
  title: string;
  description: string | null;
  scrapedMetadata: unknown;
};

/**
 * Persist one enrichment result to Sale.scrapedMetadata.aiEnriched. Shared by both the
 * Batch API path and the sequential-fallback path so the sanitize/Prisma-error handling
 * never drifts between them.
 * Returns 'enriched' | 'skipped' for the caller's counters.
 */
async function applyEnrichmentResult(
  sale: UnenrichedSale,
  result: { categories: string[]; priceRange: string; summary: string } | null | undefined
): Promise<'enriched' | 'skipped'> {
  if (!result) return 'skipped';

  try {
    const rawMetadata = (sale.scrapedMetadata as Record<string, unknown>) || {};
    // Sanitize all string values then JSON round-trip for belt-and-suspenders encoding safety
    const currentMetadata = deepSanitizeViaJson(
      sanitizeMetadataStrings(rawMetadata)
    ) as Record<string, unknown>;
    const sanitizedResult = deepSanitizeViaJson(sanitizeMetadataStrings(result));

    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        scrapedMetadata: {
          ...currentMetadata,
          aiEnriched: sanitizedResult,
        },
      },
    });
    console.log(`[ListingEnrichmentBatch] Enriched sale ${sale.id}`);
    return 'enriched';
  } catch (err: unknown) {
    // Surface full Prisma error detail -- PrismaClientKnownRequestError.message
    // is often empty in Sentry; the real signal is .code and .meta
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        // Sale was deleted between findMany and update -- expected race, not a bug
        console.warn(`[ListingEnrichmentBatch] Sale ${sale.id} deleted mid-batch -- skipping (P2025)`);
        return 'skipped';
      }
      console.error(
        `[ListingEnrichmentBatch] Prisma error enriching sale ${sale.id}:`,
        `code=${err.code}`,
        `meta=${JSON.stringify(err.meta)}`,
        `message=${err.message}`
      );
      Sentry.captureException(err, {
        extra: { saleId: sale.id, prismaCode: err.code, prismaMeta: err.meta },
      });
    } else {
      const errObj = err as { message?: string };
      console.error(`[ListingEnrichmentBatch] Failed to enrich sale ${sale.id}:`, errObj.message ?? err);
      Sentry.captureException(err, { extra: { saleId: sale.id } });
    }
    return 'skipped';
  }
}

/**
 * Original sequential path: one /v1/messages call per sale with a 1500ms delay between
 * calls (Haiku rate-limit safety). Kept as the fallback for when Batch API submission
 * itself fails, so a Batch API outage never silently stops nightly enrichment.
 */
async function _runEnrichmentSequential(unenriched: UnenrichedSale[]): Promise<{ enriched: number; skipped: number }> {
  let enriched = 0;
  let skipped = 0;
  let processed = 0;

  for (const sale of unenriched) {
    processed++;
    try {
      const result = await enrichScrapedListing(sale.description!, sale.title);
      const outcome = await applyEnrichmentResult(sale, result);
      if (outcome === 'enriched') enriched++;
      else skipped++;
    } catch (err: unknown) {
      console.error(`[ListingEnrichmentBatch] Failed to enrich sale ${sale.id}:`, (err as { message?: string })?.message ?? err);
      Sentry.captureException(err, { extra: { saleId: sale.id } });
      skipped++;
    }

    // 1500ms delay between calls to stay under Haiku rate limits
    if (processed < unenriched.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return { enriched, skipped };
}

async function _runEnrichmentBatch(batchSize: number): Promise<void> {
  // Fetch only unenriched sales: scrapedMetadata exists but aiEnriched key is absent.
  // SQL-level filter avoids the previous 3x over-fetch + JS JSON blob scanning.
  const sales = await prisma.sale.findMany({
    where: {
      // deletedAt: null — added 2026-07-12. This query previously had NO
      // soft-delete filter, meaning any soft-deleted scraped sale (e.g. a
      // stale/expired Facebook Events page removed via the 2026-07-12 cleanup,
      // see claude_docs/STATE.md Blocked Queue) would still get picked up and
      // Haiku-enriched here even though it's supposed to be gone. Enrichment
      // should never process a soft-deleted row.
      deletedAt: null,
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

  if (unenriched.length === 0) {
    console.log('[ListingEnrichmentBatch] Complete -- processed=0 enriched=0 skipped=0');
    return;
  }

  let enriched = 0;
  let skipped = 0;

  try {
    // Primary path: one Anthropic Message Batch for the whole night's run (50% cheaper --
    // see enrichScrapedListingsBatch doc comment for the latency/self-healing tradeoffs).
    const resultMap = await enrichScrapedListingsBatch(
      unenriched.map((sale) => ({ id: sale.id, description: sale.description ?? '', saleTitle: sale.title }))
    );

    for (const sale of unenriched) {
      const outcome = await applyEnrichmentResult(sale, resultMap.get(sale.id));
      if (outcome === 'enriched') enriched++;
      else skipped++;
    }
  } catch (err: unknown) {
    // Batch submission itself failed (not a per-item failure -- those come back as null
    // results from enrichScrapedListingsBatch and are handled above). Fall back to the
    // original sequential per-item path so nightly enrichment still runs tonight.
    console.error('[ListingEnrichmentBatch] Batch API path failed, falling back to sequential:', (err as { message?: string })?.message ?? err);
    Sentry.captureException(err, { extra: { context: 'listing-enrichment-batch-fallback', count: unenriched.length } });

    const fallback = await _runEnrichmentSequential(unenriched);
    enriched = fallback.enriched;
    skipped = fallback.skipped;
  }

  console.log(`[ListingEnrichmentBatch] Complete -- processed=${unenriched.length} enriched=${enriched} skipped=${skipped}`);
}

export function runListingEnrichmentBatch(req: Request, res: Response): void {
  const batchSize = parseInt(process.env.AI_ENRICHMENT_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10);

  // Respond immediately to avoid Railway's 30s HTTP proxy timeout.
  // The enrichment job runs in the background -- check Railway logs for results.
  res.status(202).json({ message: 'Enrichment batch started' });

  _runEnrichmentBatch(batchSize).catch((err) => {
    console.error('[enrichment] background error:', err);
    Sentry.captureException(err);
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
