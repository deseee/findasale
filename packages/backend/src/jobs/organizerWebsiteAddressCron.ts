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

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { RateLimiter } from '../services/scraper/rateLimiter';
import {
  scrapeOrganizerWebsiteAddress,
  ExtractedAddress,
} from '../services/scraper/sources/organizerWebsite';
import { isBlockedWebsiteDomain } from '../config/domainBlocklist';
import {
  shouldFetch,
  recordOutcome,
  isTerminal,
  createRunDedupGuard,
} from '../services/scraper/domainFetchState';

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
      AND "websiteEnrichmentExhausted" = false
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
  // One de-dup guard for the whole run — each website domain is fetched at most once.
  const dedup = createRunDedupGuard();
  let filled = 0;
  let missed = 0;

  for (const org of candidates) {
    if (!org.website) {
      missed++;
      continue;
    }

    // Anti-abuse gate 1: aggregator/social/mega-brand host wrongly stored as a website.
    if (isBlockedWebsiteDomain(org.website)) {
      await markExhausted(org.id, org.website);
      missed++;
      continue;
    }

    // Anti-abuse gate 2: per-domain circuit breaker — permanently-dead domain.
    if (await isTerminal(org.website)) {
      await markExhausted(org.id, org.website);
      missed++;
      continue;
    }

    // Anti-abuse gate 3: in-run de-dup — one fetch per domain per run.
    if (!dedup.firstTime(org.website)) {
      missed++;
      continue;
    }

    // Anti-abuse gate 4: breaker cooldown window.
    if (!(await shouldFetch(org.website))) {
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
      // Hard fetch failure -> escalate the breaker; mark exhausted once TERMINAL.
      const outcome = await recordOutcome(org.website, false);
      if (outcome.status === 'TERMINAL') {
        await markExhausted(org.id, org.website);
      }
      missed++;
      continue;
    }

    if (!extracted || !extracted.address) {
      // Ambiguous miss (site may be alive but have no machine-readable address). Leave the
      // SHARED per-domain breaker untouched so we don't poison the email pipeline for a live
      // site; keep the existing back-of-queue behaviour.
      try {
        await prisma.$executeRaw`UPDATE "Organizer" SET "updatedAt" = NOW() WHERE "id" = ${org.id}`;
      } catch (_e) { /* non-fatal */ }
      missed++;
      continue;
    }

    // Address found -> the site is definitively alive; reset the breaker for this domain.
    await recordOutcome(org.website, true);

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
 * Mark an organizer (and any other organizer storing the exact same website URL) as having a
 * permanently-exhausted website enrichment path, so it stops re-qualifying for this cron's
 * selector and the email discovery selector. Best-effort; never throws.
 */
async function markExhausted(organizerId: string, website: string | null): Promise<void> {
  try {
    await prisma.organizer.update({
      where: { id: organizerId },
      data: { websiteEnrichmentExhausted: true },
    });
    if (website) {
      await prisma.organizer.updateMany({
        where: { website, websiteEnrichmentExhausted: false },
        data: { websiteEnrichmentExhausted: true },
      });
    }
  } catch (err) {
    console.warn(
      `[${JOB_NAME}] Failed to mark organizer ${organizerId} website exhausted:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}
