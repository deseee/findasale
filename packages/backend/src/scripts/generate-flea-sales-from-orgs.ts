/**
 * Backfill: generate a FLEA_MARKET Sale for each orphan geocoded flea-market Organizer.
 *
 * Background
 * ----------
 * The Foursquare / HERE Places scrapers created ~600 Organizer rows with
 * businessCategory='FLEA_MARKET' that are geocoded (lat/lng not null) but have
 * NO published Sale of saleType='FLEA_MARKET'. Without a Sale row these organizers
 * never surface on the shopper-facing /city/{slug}/flea-markets SEO pages.
 *
 * The 477 flea sales that DO exist were created by those same scrapers as
 * FLEA_MARKET sales with synthetic ~1-year rolling startDate/endDate. This script
 * mirrors that exact pattern (startDate = now, endDate = now + 1 year) and ingests
 * one FLEA_MARKET listing per orphan organizer via ingestScrapedListing(), which
 * handles dedup + organizer linkage.
 *
 * Organizer linkage
 * -----------------
 * Organizer has NO discrete city/state column — location lives in `address`
 * (format often "Name, ST" or a real street address) plus lat/lng. We derive
 * city/state from `address` using the same "City, ST" parse the places scrapers
 * use as their fallback. If an organizer's address has no parseable city, we SKIP
 * it (counted) — we never invent a city.
 *
 * We pass the EXISTING organizer's id straight to ingestScrapedListing() and do
 * NOT set organizerName. ingestScrapedListing() only re-resolves the organizer by
 * name when organizerName is present; by omitting it and passing organizerId we
 * link the new Sale to the exact orphan organizer with zero corroboration churn
 * and zero risk of a name-collision linking to the wrong record. The business
 * name is still recorded in scrapedMetadata for audit.
 *
 * Safety
 * ------
 * - DRY-RUN by default. Pass --apply to actually write Sale rows.
 * - Without --apply the script only logs what WOULD be created (counts + 10 samples).
 * - Uses the shared prisma singleton (../lib/prisma) — no hardcoded credentials.
 * - DATABASE_URL must point to the Railway DB when applying (see run command below).
 *
 * Usage
 * -----
 *   # Dry run (default — writes nothing):
 *   npx tsx src/scripts/generate-flea-sales-from-orgs.ts
 *
 *   # Apply (writes Sale rows):
 *   npx tsx src/scripts/generate-flea-sales-from-orgs.ts --apply
 */

import { prisma } from '../lib/prisma';
import { ingestScrapedListing, ScrapedItem } from '../services/scraper/index';

const APPLY = process.argv.includes('--apply');

const SOURCE_NAME = 'FleaOrgBackfill';
const FLEA_LABEL = 'Flea Market';

interface OrphanOrg {
  id: string;
  businessName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
}

/**
 * Derive { city, state, zip } from an Organizer.address string.
 *
 * Mirrors the "City, ST" fallback the places scrapers use
 * (foursquarePlaces.parseCityState / herePlaces.parseCityState):
 *   metroFallback.match(/^(.+),\s*([A-Z]{2})$/)
 *
 * Organizer.address is free-form. It may be:
 *   - "Some Business Name, MI"           -> city unknown (only a name + state) -> SKIP
 *   - "123 Main St, Grand Rapids, MI"    -> city = "Grand Rapids", state = "MI"
 *   - "Grand Rapids, MI 49503"           -> city = "Grand Rapids", state = "MI"
 *   - "123 Main St, Grand Rapids, MI 49503"
 *
 * Strategy: split on commas, find the trailing US/CA 2-letter state token
 * (optionally followed by a postal code). The comma segment immediately
 * BEFORE the state token is the city. If there is no segment before the state
 * token, or the city would be empty, return null (caller skips).
 *
 * Returns null when no city can be confidently derived — never invents one.
 */
function deriveCityState(
  address: string | null | undefined
): { city: string; state: string; zip: string } | null {
  if (!address) return null;

  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length < 2) return null;

  // The last segment usually holds the state (and maybe a ZIP):
  //   "MI", "MI 49503", "ON M5V 2T6"
  const lastSegment = parts[parts.length - 1];

  // US 2-letter state, optionally followed by a 5(-4) ZIP.
  const usMatch = lastSegment.match(/^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
  // Canadian province (2-letter) optionally followed by a postal code (A1A 1A1).
  const caMatch = lastSegment.match(
    /^([A-Za-z]{2})(?:\s+([A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d))?$/
  );

  const match = usMatch ?? caMatch;
  if (!match) return null;

  const state = match[1].toUpperCase();
  const zip = (match[2] ?? '').trim();

  // City is the segment immediately before the state segment.
  const cityCandidate = parts[parts.length - 2];
  if (!cityCandidate) return null;

  // Guard: the "city" must not itself look like a state token, and must contain
  // at least one letter (avoid pure-number street fragments being treated as city).
  if (/^[A-Za-z]{2}$/.test(cityCandidate)) return null;
  if (!/[A-Za-z]/.test(cityCandidate)) return null;

  return { city: cityCandidate, state, zip };
}

async function main(): Promise<void> {
  console.log(
    `[flea-backfill] Mode: ${APPLY ? 'APPLY (writing Sale rows)' : 'DRY-RUN (no writes)'}`
  );

  // 1. Find FLEA_MARKET organizers that are geocoded but have NO FLEA_MARKET sale.
  //    "orphan" = businessCategory='FLEA_MARKET' AND lat not null
  //    AND none of their sales is saleType='FLEA_MARKET'.
  const orphans = (await prisma.organizer.findMany({
    where: {
      businessCategory: 'FLEA_MARKET',
      lat: { not: null },
      sales: {
        none: { saleType: 'FLEA_MARKET' },
      },
    },
    select: {
      id: true,
      businessName: true,
      address: true,
      lat: true,
      lng: true,
      phone: true,
      website: true,
    },
    orderBy: { createdAt: 'asc' },
  })) as OrphanOrg[];

  console.log(`[flea-backfill] Found ${orphans.length} orphan geocoded FLEA_MARKET organizers`);

  const now = new Date();
  const endDate = new Date(now);
  endDate.setFullYear(endDate.getFullYear() + 1); // synthetic ~1-year rolling window (mirrors places scrapers)

  const stats = {
    candidates: orphans.length,
    skippedNoCity: 0,
    skippedNoLatLng: 0,
    created: 0,
    updated: 0,
    skippedDedup: 0,
    failed: 0,
  };

  const samples: Array<{
    organizerId: string;
    businessName: string;
    title: string;
    city: string;
    state: string;
    lat: number | null;
    lng: number | null;
  }> = [];

  for (const org of orphans) {
    if (org.lat === null || org.lng === null) {
      stats.skippedNoLatLng++;
      continue;
    }

    const parsed = deriveCityState(org.address);
    if (!parsed) {
      stats.skippedNoCity++;
      continue;
    }
    const { city, state, zip } = parsed;

    // Mirror herePlaces title format: "<name> — <label> in <city>, <state>"
    const title = `${org.businessName} — ${FLEA_LABEL} in ${city}, ${state}`;

    if (samples.length < 10) {
      samples.push({
        organizerId: org.id,
        businessName: org.businessName,
        title,
        city,
        state,
        lat: org.lat,
        lng: org.lng,
      });
    }

    if (!APPLY) {
      // Dry run: count as a would-be create (real dedup runs only under --apply).
      stats.created++;
      continue;
    }

    // Build the FLEA_MARKET listing. We intentionally DO NOT set organizerName —
    // ingestScrapedListing() will use the passed organizerId for linkage when
    // organizerName is absent (see file header). lat/lng are read by
    // ingestScrapedListing from scrapedMetadata.lat / scrapedMetadata.lng.
    const listing: ScrapedItem = {
      title,
      address: org.address ?? '',
      city,
      state,
      zip,
      startDate: now,
      endDate,
      description: undefined,
      saleType: 'FLEA_MARKET',
      businessCategory: 'FLEA_MARKET',
      photoUrls: [],
      sourceName: SOURCE_NAME,
      sourceUrl: `https://finda.sale/internal/flea-org-backfill/${org.id}`,
      sourceItemId: `flea-org-backfill:${org.id}`,
      scrapedMetadata: {
        backfill: true,
        organizerId: org.id,
        organizerName: org.businessName,
        businessCategory: 'FLEA_MARKET',
        lat: org.lat,
        lng: org.lng,
        phone: org.phone ?? null,
        website: org.website ?? null,
        derivedCity: city,
        derivedState: state,
        sourceItemId: `flea-org-backfill:${org.id}`,
      },
    };

    try {
      const result = await ingestScrapedListing(listing, org.id);
      switch (result.status) {
        case 'created':
          stats.created++;
          break;
        case 'updated':
          stats.updated++;
          break;
        case 'skipped':
          stats.skippedDedup++;
          break;
        case 'failed':
          stats.failed++;
          console.warn(
            `[flea-backfill] FAILED org=${org.id} (${org.businessName}) — ${result.reason ?? 'unknown'}`
          );
          break;
      }
    } catch (err) {
      stats.failed++;
      console.error(
        `[flea-backfill] ERROR org=${org.id} (${org.businessName}):`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  console.log('\n[flea-backfill] ===== Samples (first 10 would-be / created) =====');
  samples.forEach((s, i) => {
    console.log(
      `  ${i + 1}. ${s.title}\n     org=${s.organizerId} city=${s.city} state=${s.state} lat=${s.lat} lng=${s.lng}`
    );
  });

  console.log('\n[flea-backfill] ===== Summary =====');
  console.log(`  Mode:                 ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Candidates (orphans): ${stats.candidates}`);
  console.log(`  Skipped (no lat/lng): ${stats.skippedNoLatLng}`);
  console.log(`  Skipped (no city):    ${stats.skippedNoCity}`);
  if (APPLY) {
    console.log(`  Created:              ${stats.created}`);
    console.log(`  Updated:              ${stats.updated}`);
    console.log(`  Skipped (dedup):      ${stats.skippedDedup}`);
    console.log(`  Failed:               ${stats.failed}`);
  } else {
    console.log(`  WOULD create:         ${stats.created}`);
    console.log('  (dedup runs only under --apply; some of these may dedup-skip when applied)');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[flea-backfill] Fatal error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
