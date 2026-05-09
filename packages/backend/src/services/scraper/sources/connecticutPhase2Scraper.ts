/**
 * Connecticut Department of Banking — Pawnbroker License Scraper (Phase 2)
 *
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 * (no statewide auctioneer licensing law in CT; pawnbrokers licensed under CGS §21-39+)
 *
 * DATA SOURCE STATUS (verified 2026-05-09):
 *   - CT Department of Banking (DOB) licenses pawnbrokers under CGS §21-39.
 *   - portal.ct.gov/DOB is accessible static HTML.
 *   - Pawnbroker-specific resource page redirects to a 404 (moved or restructured).
 *   - CT DOB does not appear to publish a bulk licensee list or searchable database
 *     for pawnbrokers specifically — their NMLS lookup covers mortgage/lending, not pawn.
 *   - The Nationwide Mortgage Licensing System (NMLS) at nmlsconsumeraccess.org does
 *     not cover CT pawnbrokers (they are regulated separately under DOB).
 *
 * UNBLOCKING OPTIONS (in priority order):
 *   1. CT Open Data portal: https://data.ct.gov — search "pawnbroker" or "DOB licensee".
 *      If a Socrata dataset is found, use:
 *      GET https://data.ct.gov/resource/<DATASET_ID>.json?$limit=500&$offset=<offset>
 *   2. CT DOB direct inquiry: https://portal.ct.gov/DOB or (860) 240-8299.
 *      Request the pawnbroker licensee list as a public records release (CGS §1-210).
 *   3. CT eLicense portal: https://elicense.ct.gov — search for license type "Pawnbroker"
 *      (some CT agencies use this common portal; DOB may have joined it).
 *      Probe: GET https://elicense.ct.gov/Lookup/LicenseLookup.aspx
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const LIVE_ENDPOINT_AVAILABLE = false;

// Placeholder — replace with confirmed CT endpoint once available
const CT_SEARCH_URL = 'https://portal.ct.gov/DOB';

interface CtLicenseRecord {
  businessName: string;
  licenseNumber: string;
  city: string;
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

async function fetchAllRecords(): Promise<CtLicenseRecord[]> {
  /**
   * TODO: Implement once CT DOB endpoint is confirmed.
   *
   * Option A — CT Open Data Socrata:
   *   const res = await fetch(
   *     'https://data.ct.gov/resource/<ID>.json?$limit=500&license_type=Pawnbroker',
   *     { headers: { 'User-Agent': getRandomUserAgent() }, signal: AbortSignal.timeout(30000) }
   *   );
   *   const json: any[] = await res.json();
   *   return json.map((r) => ({ businessName: r.name, licenseNumber: r.license_no, city: r.city }));
   *
   * Option B — HTML form search (iterate A–Z):
   *   for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
   *     POST to CT search endpoint with name prefix = letter, license_type = 'Pawnbroker'
   *     parse <tr>/<td> rows
   *   }
   */
  return [];
}

async function upsertRecord(record: CtLicenseRecord): Promise<boolean> {
  const { businessName, licenseNumber, city, address, phone } = record;
  if (!businessName || !licenseNumber) return false;

  const dedupeKey = `CT-PAWN-${licenseNumber}`;
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
    .replace(/-$/, '');
  const citySlug = (city || 'ct')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 20);

  const existing = await prisma.organizer.findFirst({
    where: {
      OR: [
        { licenseNumber: dedupeKey },
        {
          businessName: { equals: businessName, mode: 'insensitive' },
          licenseState: 'CT',
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
        licenseState: 'CT',
        isStateLicensed: true,
        directoryMostRecentSource: 'ConnecticutPhase2',
        directoryMostRecentAt: new Date(),
        ...(city && { city }),
        ...(phone && { phone }),
      },
    });
    return false;
  }

  await prisma.organizer.create({
    data: {
      businessName,
      phone: phone ?? null,
      address: address ?? (city ? `${city}, CT` : 'Connecticut'),
      city: city || null,
      bio: `Licensed pawnbroker in ${city || 'Connecticut'}.`,
      isClaimed: false,
      isUnmanagedListing: true,
      licenseNumber: dedupeKey,
      licenseState: 'CT',
      isStateLicensed: true,
      businessCategory: 'PAWN_SHOP',
      directoryMostRecentSource: 'ConnecticutPhase2',
      directoryMostRecentAt: new Date(),
      user: {
        create: {
          email: `scraper+${slug}-${citySlug}-ct-ctphase2@system.finda.sale`,
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

export async function runConnecticutPhase2Scraper(): Promise<void> {
  console.log('[ConnecticutPhase2] Starting pawnbroker license scraper');

  if (!LIVE_ENDPOINT_AVAILABLE) {
    console.warn(
      '[ConnecticutPhase2] STUB MODE: CT DOB pawnbroker search page returns 404 (moved/restructured). ' +
        'See scraper header comments for unblocking options. ' +
        'Set LIVE_ENDPOINT_AVAILABLE = true and implement fetchAllRecords() once endpoint is confirmed.'
    );
    console.log('[ConnecticutPhase2] Scraper exited (stub mode) — 0 records processed');
    return;
  }

  const domain = new URL(CT_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    await defaultRateLimiter.waitBeforeRequest(domain);
    const records = await fetchAllRecords();
    console.log(`[ConnecticutPhase2] Fetched ${records.length} records`);

    for (const record of records) {
      try {
        const created = await upsertRecord(record);
        if (created) createdOrganizers++;
        totalRecords++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[ConnecticutPhase2] Progress: ${totalRecords} processed, ${createdOrganizers} created`
          );
        }

        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error(`[ConnecticutPhase2] Error processing ${record.businessName}:`, err);
      }
    }

    console.log(
      `[ConnecticutPhase2] Scraper completed: ${totalRecords} records processed, ${createdOrganizers} organizers created`
    );
  } catch (error) {
    console.error('[ConnecticutPhase2] Scraper error:', error);
    throw error;
  }
}
