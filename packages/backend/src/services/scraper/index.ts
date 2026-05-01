/**
 * ADR-073: Directory Scraper Phase 1 — Main orchestrator
 * Runs scraping jobs, manages dedup, tracks audit trail
 */

import { prisma } from '../../lib/prisma';
import { ParsedListing } from './htmlParser';
import { checkDuplicate } from './dedupe';
import { RateLimiter, defaultRateLimiter } from './rateLimiter';
import { scrapeEstateSalesNet } from './sources/estatesalesnet';
import { scrapeGarageSaleFinder } from './sources/garagesalefinder';
import { scrapeCraigslist } from './sources/craigslist';
import { enrichOrganizer } from './enrichment';

export interface ScrapeJob {
  source: string;
  metro: string;
  organizerId?: string;
}

export interface ScrapedItem extends ParsedListing {
  sourceUrl: string;
  sourceName: string;
  sourceItemId?: string;
  scrapedMetadata?: Record<string, any>;
}

/** Singleton system organizer ID (cached after first lookup) */
let _systemOrganizerId: string | null = null;

/**
 * Get or create the system organizer used for all unmanaged scraped listings.
 * This is a singleton placeholder — real organizer is linked when a sale is claimed.
 */
export async function getOrCreateSystemOrganizer(): Promise<string> {
  if (_systemOrganizerId) return _systemOrganizerId;

  const SYSTEM_EMAIL = 'system-scraper@finda.sale';

  const existing = await prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
    include: { organizer: { select: { id: true } } },
  });

  if (existing?.organizer?.id) {
    _systemOrganizerId = existing.organizer.id;
    return existing.organizer.id;
  }

  // Create system user + organizer
  const created = await prisma.user.create({
    data: {
      email: SYSTEM_EMAIL,
      name: 'FindA.Sale Directory',
      role: 'ORGANIZER',
      roles: ['ORGANIZER'],
      organizer: {
        create: {
          businessName: 'FindA.Sale Directory',
          phone: '000-000-0000',
          address: 'National',
          isClaimed: false,
          isUnmanagedListing: true,
        },
      },
    },
    include: { organizer: { select: { id: true } } },
  });

  _systemOrganizerId = created.organizer!.id;
  console.log(`[scraper] Created system organizer: ${_systemOrganizerId}`);

  // Fire-and-forget enrichment (non-blocking)
  enrichOrganizer(
    created.organizer!.id,
    'FindA.Sale Directory',
    'National',
    'US'
  ).catch((err) => console.error('[scraper] Enrichment failed silently:', err));

  return _systemOrganizerId!;
}

/**
 * Main scraping entry point.
 * Supports: EstateSalesNet | GarageSaleFinder | Craigslist
 */
export async function runScrapeRun(source: string, metro: string): Promise<void> {
  const jobId = await createScrapeJob(source, metro);
  const rateLimiter = new RateLimiter({ requestsPerSecond: 1, maxRetries: 3 });

  try {
    console.log(`[scraper] Starting job ${jobId} — ${source} / ${metro}`);

    const systemOrganizerId = await getOrCreateSystemOrganizer();

    let stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

    if (source === 'EstateSalesNet') {
      stats = await scrapeEstateSalesNet(metro, systemOrganizerId, rateLimiter);
    } else if (source === 'GarageSaleFinder') {
      stats = await scrapeGarageSaleFinder(metro, systemOrganizerId, rateLimiter);
    } else if (source === 'Craigslist') {
      stats = await scrapeCraigslist(metro, systemOrganizerId, rateLimiter);
    } else {
      console.warn(`[scraper] Unknown source: ${source} — skipping`);
    }

    const itemsFound = stats.created + stats.skipped + stats.failed;
    console.log(`[scraper] Job ${jobId} complete — found ${itemsFound}, created ${stats.created}, skipped ${stats.skipped}, failed ${stats.failed}`);

    await finishScrapeJob(jobId, 'SUCCESS', {
      itemsFound,
      itemsCreated: stats.created,
      itemsUpdated: stats.updated,
      itemsSkipped: stats.skipped,
      itemsFailed: stats.failed,
    });
  } catch (error) {
    console.error(`[scraper] Job ${jobId} failed:`, error);
    await finishScrapeJob(jobId, 'FAILED', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Create a new ScrapedSalesJob record
 */
async function createScrapeJob(source: string, metro: string): Promise<number> {
  const job = await prisma.scrapedSalesJob.create({
    data: { source, metro, status: 'RUNNING' },
  });
  return job.id;
}

/**
 * Finish a scrape job with final status and stats
 */
async function finishScrapeJob(
  jobId: number,
  status: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED',
  stats: {
    itemsFound?: number;
    itemsCreated?: number;
    itemsUpdated?: number;
    itemsSkipped?: number;
    itemsFailed?: number;
    error?: string;
  }
): Promise<void> {
  await prisma.scrapedSalesJob.update({
    where: { id: jobId },
    data: {
      status,
      completedAt: new Date(),
      itemsFound: stats.itemsFound ?? 0,
      itemsCreated: stats.itemsCreated ?? 0,
      itemsUpdated: stats.itemsUpdated ?? 0,
      itemsSkipped: stats.itemsSkipped ?? 0,
      itemsFailed: stats.itemsFailed ?? 0,
      error: stats.error,
    },
  });
}

/**
 * Ingest a single scraped listing into the database.
 * Handles dedup, validation, and DB insertion.
 */
export async function ingestScrapedListing(
  listing: ScrapedItem,
  organizerId?: string
): Promise<{ saleId?: string; status: 'created' | 'updated' | 'skipped' | 'failed'; reason?: string }> {
  try {
    // Dedup check
    const dupeResult = await checkDuplicate(
      listing,
      listing.sourceName,
      listing.sourceUrl,
      listing.sourceItemId
    );

    if (dupeResult.isDuplicate) {
      // Update lastScrapedAt to keep listings fresh
      if (dupeResult.existingSaleId) {
        await prisma.sale.update({
          where: { id: dupeResult.existingSaleId },
          data: { lastScrapedAt: new Date() },
        });
      }
      return {
        saleId: dupeResult.existingSaleId,
        status: 'skipped',
        reason: `Duplicate: ${dupeResult.reason}`,
      };
    }

    // Validate required fields
    if (!listing.title || !listing.address || !listing.city || !listing.state || !listing.zip || !listing.startDate || !listing.endDate) {
      return {
        status: 'failed',
        reason: 'Missing required fields (title, address, city, state, zip, startDate, endDate)',
      };
    }

    // Resolve organizer
    const finalOrganizerId = organizerId ?? (await getOrCreateSystemOrganizer());

    // Create the Sale
    const sale = await prisma.sale.create({
      data: {
        title: listing.title,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        zip: listing.zip,
        startDate: listing.startDate,
        endDate: listing.endDate,
        description: listing.description ?? null,
        status: 'PUBLISHED',
        saleType: listing.saleType ?? 'ESTATE',
        organizerId: finalOrganizerId,
        sourceUrl: listing.sourceUrl,
        sourceName: listing.sourceName,
        lastScrapedAt: new Date(),
        scrapeVersion: 1,
        scrapedMetadata: listing.scrapedMetadata ?? null,
      },
    });

    return { saleId: sale.id, status: 'created' };
  } catch (error) {
    console.error('[scraper] Failed to ingest listing:', error);
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// Re-export utilities for adapters
export { defaultRateLimiter };
export * from './htmlParser';
export * from './dedupe';
export * from './rateLimiter';
