/**
 * Organizer Website Address Enrichment Cron
 *
 * Processes Organizers that have a website set but no street address by
 * scraping their public homepage / contact / about pages.
 *
 * Schedule: Tuesdays + Fridays 04:00 UTC.
 * Gate: DISABLE_ORGANIZER_WEBSITE_ENRICHMENT=true to stop (default: enabled).
 *
 * Per-run cap: 1000 organizers (configurable via WEBSITE_SCRAPE_BATCH_SIZE).
 * RateLimiter enforces per-host pacing and the scraper sleeps 5-15s between
 * page fetches.
 */

import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { RateLimiter } from '../services/scraper/rateLimiter';
import {
  scrapeOrganizerWebsiteAddress,
  ExtractedAddress,
} from '../services/scraper/sources/organizerWebsite';

/**
 * Row shape returned by the eligibility raw query.
 */
interface EligibleOrganizerRow {
  id: string;
  businessName: string;
  website: string;
  address: string;
}

const PER_RUN_LIMIT = parseInt(process.env.WEBSITE_SCRAPE_BATCH_SIZE || '1000', 10);
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
  if (process.env.DISABLE_ORGANIZER_WEBSITE_ENRICHMENT === 'true') {
    console.log(`[${JOB_NAME}] Skipped — DISABLE_ORGANIZER_WEBSITE_ENRICHMENT is set`);
    return { processed: 0, filled: 0, missed: 0 };
  }

  // Pull organizers with a website set but no street address.
  // Eligible = has website AND address doesn't start with a digit (no street number).
  // Order by updatedAt ASC so we process the least-recently-touched orgs first.
  // After a miss, we touch updatedAt to push failed orgs to the back of the queue,
  // preventing the same failing sites from blocking new candidates each run.
  const candidates = await prisma.$queryRaw<EligibleOrganizerRow[]>(Prisma.sql`
    SELECT "id", "businessName", "website", "address"
    FROM "Organizer"
    WHERE "website" IS NOT NULL
      AND "website" <> ''
      AND (
        "address" IS NULL
        OR "address" = ''
        OR "address" !~ '^[0-9]'
      )
    ORDER BY "updatedAt" ASC
    LIMIT ${PER_RUN_LIMIT}
  `);

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
      // Touch updatedAt to push this org to the back of the queue.
      // Since we ORDER BY updatedAt ASC, this prevents re-scraping the same
      // failing sites every week while the cap blocks new candidates.
      try {
        await prisma.$executeRaw`UPDATE "Organizer" SET "updatedAt" = NOW() WHERE "id" = ${org.id}`;
      } catch (_e) { /* non-fatal */ }
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
 * Tuesdays + Fridays 04:00 UTC. Called from index.ts during boot.
 */
export function scheduleOrganizerWebsiteAddressCron(): void {
  cron.schedule(
    '0 4 * * 2,5',
    cronGuard({ jobName: JOB_NAME }, async () => {
      await runOrganizerWebsiteAddressEnrichment();
    })
  );
  console.log(`[${JOB_NAME}] Scheduled for Tuesdays + Fridays 04:00 UTC`);
}
