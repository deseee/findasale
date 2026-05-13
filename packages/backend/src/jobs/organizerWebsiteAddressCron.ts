/**
 * Organizer Website Address Enrichment Cron
 *
 * Processes Organizers that have a website set but no street address by
 * scraping their public homepage / contact / about pages.
 *
 * Schedule: Tuesdays 04:00 UTC (weekly).
 * Gate: ENABLE_ORGANIZER_WEBSITE_ENRICHMENT=true (default false).
 *
 * Per-run cap: 500 organizers. RateLimiter enforces per-host pacing and
 * the scraper sleeps 5–15s between page fetches.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { RateLimiter } from '../services/scraper/rateLimiter';
import {
  scrapeOrganizerWebsiteAddress,
  ExtractedAddress,
} from '../services/scraper/sources/organizerWebsite';

const PER_RUN_LIMIT = 500;
const JOB_NAME = 'organizerWebsiteAddress';

/**
 * One iteration: pull up to PER_RUN_LIMIT eligible organizers and try to
 * extract a street address from their websites.
 */
export async function runOrganizerWebsiteAddressEnrichment(): Promise<{
  processed: number;
  filled: number;
  missed: number;
}> {
  if (process.env.ENABLE_ORGANIZER_WEBSITE_ENRICHMENT !== 'true') {
    console.log(`[${JOB_NAME}] Skipped — ENABLE_ORGANIZER_WEBSITE_ENRICHMENT != "true"`);
    return { processed: 0, filled: 0, missed: 0 };
  }

  // Pull organizers with a website and empty address.
  // Organizer.address is a non-null String column, so "empty" means '' (or whitespace).
  const candidates = await prisma.organizer.findMany({
    where: {
      website: { not: null },
      NOT: { website: '' },
      OR: [{ address: '' }, { address: { equals: ' ' } }],
    },
    select: {
      id: true,
      businessName: true,
      website: true,
      address: true,
    },
    take: PER_RUN_LIMIT,
    orderBy: { id: 'asc' },
  });

  console.log(`[${JOB_NAME}] Processing ${candidates.length} organizers`);

  const rateLimiter = new RateLimiter({ requestsPerSecond: 1 });
  let filled = 0;
  let missed = 0;

  for (const org of candidates) {
    if (!org.website) {
      missed++;
      continue;
    }

    let extracted: ExtractedAddress | null = null;
    try {
      extracted = await scrapeOrganizerWebsiteAddress(
        {
          id: org.id,
          businessName: org.businessName,
          website: org.website,
          address: org.address,
        },
        rateLimiter
      );
    } catch (err) {
      console.warn(
        `[${JOB_NAME}] Scrape failed for ${org.id} (${org.website}):`,
        err instanceof Error ? err.message : String(err)
      );
      missed++;
      continue;
    }

    if (!extracted || !extracted.address) {
      missed++;
      continue;
    }

    // Compose the full address string. Organizer.address is a single String
    // column so we collapse street + city + state + zip into one line.
    const parts = [
      extracted.address.trim(),
      [extracted.city, extracted.state].filter(Boolean).join(', '),
      extracted.zip,
    ].filter(Boolean);
    const fullAddress = parts.join(', ').replace(/\s+/g, ' ').trim();

    try {
      await prisma.organizer.update({
        where: { id: org.id },
        data: { address: fullAddress },
      });
      filled++;
      console.log(`[${JOB_NAME}] Filled address for ${org.businessName ?? org.id}: ${fullAddress}`);
    } catch (err) {
      console.warn(
        `[${JOB_NAME}] DB update failed for ${org.id}:`,
        err instanceof Error ? err.message : String(err)
      );
      missed++;
    }
  }

  console.log(
    `[${JOB_NAME}] Complete — processed=${candidates.length}, filled=${filled}, missed=${missed}`
  );
  return { processed: candidates.length, filled, missed };
}

/**
 * Schedule the organizer-website address enrichment cron.
 * Tuesdays 04:00 UTC. Called from index.ts during boot.
 */
export function scheduleOrganizerWebsiteAddressCron(): void {
  cron.schedule(
    '0 4 * * 2',
    cronGuard({ jobName: JOB_NAME }, async () => {
      await runOrganizerWebsiteAddressEnrichment();
    })
  );
  console.log(`[${JOB_NAME}] Scheduled for Tuesdays 04:00 UTC (weekly)`);
}
