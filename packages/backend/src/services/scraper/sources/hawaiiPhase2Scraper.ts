/**
 * Hawaii Division of Financial Institutions (DFI) — Pawnbroker License Scraper (Phase 2)
 *
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 * (no statewide auctioneer licensing law in HI; pawnbrokers regulated under HRS §445-21+)
 *
 * DATA SOURCE STATUS (verified 2026-05-09):
 *   - Hawaii DFI (under DCCA) licenses pawnbrokers under HRS Chapter 445.
 *   - Primary portal: https://pvl.ehawaii.gov/pvlsearch/app — returns HTTP 200 but page
 *     is JavaScript-rendered (React/Angular SPA). Static HTML fetch returns no license-type
 *     options or form inputs — requires a headless browser to interact.
 *   - https://cca.hawaii.gov/dfi/licensees/ returns 404 — page does not exist.
 *   - DCCA DCCA has a combined professional license portal at pvl.ehawaii.gov but it
 *     appears to use a client-side API that requires session tokens obtained via JS execution.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *   1. Discover the pvl.ehawaii.gov API:
 *      Open Chrome DevTools → Network tab → navigate to pvl.ehawaii.gov/pvlsearch/app
 *      → search for "Pawnbroker" → capture the XHR/fetch call. The API endpoint and
 *      required headers/tokens can then be hardcoded here.
 *      Likely pattern: GET https://pvl.ehawaii.gov/pvlsearch/api/licenses?type=PAWNBROKER
 *   2. Hawaii Open Data: https://opendata.hawaii.gov — search "pawnbroker" or "DFI".
 *      If a Socrata dataset exists, use the standard JSON API.
 *   3. DCCA direct inquiry: https://cca.hawaii.gov or (808) 586-2820.
 *      Request the pawnbroker licensee list under HRS §92F (Uniform Information Practices Act).
 *   4. NMLS consumer access: https://nmlsconsumeraccess.org — may cover HI pawnbrokers
 *      if they are treated as regulated lenders under Hawaii law.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const LIVE_ENDPOINT_AVAILABLE = false;

// Placeholder — update once the pvl.ehawaii.gov API endpoint is discovered
const HI_API_URL = 'https://pvl.ehawaii.gov/pvlsearch/api/licenses';

interface HiLicenseRecord {
  businessName: string;
  licenseNumber: string;
  city: string;
  island?: string;
  address?: string;
  phone?: string;
}

const extractText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

async function fetchAllRecords(): Promise<HiLicenseRecord[]> {
  /**
   * TODO: Implement once the pvl.ehawaii.gov API endpoint is confirmed via DevTools.
   *
   * Expected pattern (update params once API is discovered):
   *   await defaultRateLimiter.waitBeforeRequest(new URL(HI_API_URL).hostname);
   *   const res = await fetch(`${HI_API_URL}?licenseType=PAWNBROKER&status=ACTIVE`, {
   *     headers: {
   *       'User-Agent': getRandomUserAgent(),
   *       Accept: 'application/json',
   *       // Add any required session headers discovered from DevTools
   *     },
   *     signal: AbortSignal.timeout(30000),
   *   });
   *   const json = await res.json();
   *   return (json.licenses ?? json.results ?? json).map((r: any) => ({
   *     businessName: r.businessName ?? r.name ?? '',
   *     licenseNumber: r.licenseNumber ?? r.id ?? '',
   *     city: r.city ?? '',
   *     island: r.island ?? '',
   *     address: r.address ?? '',
   *     phone: r.phone ?? '',
   *   }));
   */
  return [];
}

async function upsertRecord(record: HiLicenseRecord): Promise<boolean> {
  const { businessName, licenseNumber, city, island, address, phone } = record;
  if (!businessName || !licenseNumber) return false;

  const dedupeKey = `HI-PAWN-${licenseNumber}`;
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
    .replace(/-$/, '');
  const citySlug = (city || island || 'hi')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 20);

  const existing = await prisma.organizer.findFirst({
    where: {
      OR: [
        { licenseNumber: dedupeKey },
        {
          businessName: { equals: businessName, mode: 'insensitive' },
          licenseState: 'HI',
        },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.organizer.update({
      where: { id: existing.id },
      data: {
        licenseNumber: dedupeKey,
        licenseState: 'HI',
        isStateLicensed: true,
        directoryMostRecentSource: 'HawaiiPhase2',
        directoryMostRecentAt: new Date(),
        ...(city && { city }),
        ...(phone && { phone }),
      },
    });
    return false;
  }

  const locationStr = city
    ? `${city}, HI`
    : island
    ? `${island}, Hawaii`
    : 'Hawaii';

  await prisma.organizer.create({
    data: {
      businessName,
      phone: phone ?? null,
      address: address ?? locationStr,
      city: city || island || null,
      bio: `Licensed pawnbroker in ${locationStr}.`,
      isClaimed: false,
      isUnmanagedListing: true,
      licenseNumber: dedupeKey,
      licenseState: 'HI',
      isStateLicensed: true,
      businessCategory: 'PAWN_SHOP',
      directoryMostRecentSource: 'HawaiiPhase2',
      directoryMostRecentAt: new Date(),
      user: {
        create: {
          email: `scraper+${slug}-${citySlug}-hi-hiphase2@system.finda.sale`,
          name: businessName,
          password: null,
          role: 'ORGANIZER',
          roles: ['ORGANIZER'],
        },
      },
    },
  });
  return true;
}

export async function runHawaiiPhase2Scraper(): Promise<void> {
  console.log('[HawaiiPhase2] Starting pawnbroker license scraper');

  if (!LIVE_ENDPOINT_AVAILABLE) {
    console.warn(
      '[HawaiiPhase2] STUB MODE: pvl.ehawaii.gov is JS-rendered (SPA) — ' +
        'static fetch returns no license data. Requires DevTools API discovery or headless browser. ' +
        'See scraper header comments for unblocking options. ' +
        'Set LIVE_ENDPOINT_AVAILABLE = true and implement fetchAllRecords() once API is confirmed.'
    );
    console.log('[HawaiiPhase2] Scraper exited (stub mode) — 0 records processed');
    return;
  }

  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    const records = await fetchAllRecords();
    console.log(`[HawaiiPhase2] Fetched ${records.length} records`);

    for (const record of records) {
      try {
        const created = await upsertRecord(record);
        if (created) createdOrganizers++;
        totalRecords++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[HawaiiPhase2] Progress: ${totalRecords} processed, ${createdOrganizers} created`
          );
        }

        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error(`[HawaiiPhase2] Error processing ${record.businessName}:`, err);
      }
    }

    console.log(
      `[HawaiiPhase2] Scraper completed: ${totalRecords} records processed, ${createdOrganizers} organizers created`
    );
  } catch (error) {
    console.error('[HawaiiPhase2] Scraper error:', error);
    throw error;
  }
}
