/**
 * Colorado Division of Financial Services (DORA) — Pawnbroker License Scraper (Phase 2)
 *
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 * (no statewide auctioneer licensing law in CO; pawnbrokers licensed under CRS §12-56-101+)
 *
 * DATA SOURCE STATUS (verified 2026-05-09):
 *   - CO DORA Division of Financial Services (DFS) licenses pawnbrokers.
 *   - Primary portal: https://apps2.colorado.gov/dfs/ — returns HTTP 403 (AWS ELB WAF block).
 *   - DORA public license search: https://dora.colorado.gov/pls/apex/ — returns 403 (CloudFront).
 *   - CO Open Data portal (data.colorado.gov) has no pawnbroker dataset found.
 *   - CO SOS business search (sos.state.co.us) covers entity registration, not pawn licenses.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *   1. CO Open Data portal: https://data.colorado.gov — search "pawnbroker" or "financial services".
 *      If a Socrata dataset appears, replace stub fetch with:
 *      GET https://data.colorado.gov/resource/<DATASET_ID>.json?$limit=1000&$offset=<offset>
 *   2. CO DFS downloadable licensee list: Contact DORA DFS at (303) 894-2336 or
 *      https://dora.colorado.gov/division-financial-services — they may publish a CSV on request.
 *   3. NMLS (Nationwide Multistate Licensing System) covers some CO financial licenses —
 *      check https://nmlsconsumeraccess.org for pawnbroker coverage.
 *   4. If WAF rules change, try: https://apps2.colorado.gov/dfs/licensing/pawnbroker
 *      with a browser User-Agent and appropriate cookies.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const LIVE_ENDPOINT_AVAILABLE = false;

// Placeholder — replace with confirmed CO DFS dataset URL once available
const CO_DATA_URL = 'https://data.colorado.gov/resource/PLACEHOLDER.json';
const PAGE_SIZE = 500;

interface CoLicenseRecord {
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

async function fetchPage(offset: number, domain: string): Promise<CoLicenseRecord[]> {
  /**
   * TODO: Implement once CO DFS endpoint is confirmed.
   *
   * Option A — Socrata open data:
   *   const url = `${CO_DATA_URL}?$limit=${PAGE_SIZE}&$offset=${offset}&license_type=Pawnbroker`;
   *   const res = await fetch(url, {
   *     headers: { 'User-Agent': getRandomUserAgent() },
   *     signal: AbortSignal.timeout(30000),
   *   });
   *   const json: any[] = await res.json();
   *   return json.map((r) => ({
   *     businessName: r.business_name ?? r.licensee_name ?? '',
   *     licenseNumber: r.license_number ?? '',
   *     city: r.city ?? '',
   *     address: r.address ?? '',
   *     phone: r.phone ?? '',
   *   }));
   *
   * Option B — HTML table from DORA portal (if WAF access resumes):
   *   POST search form, parse <tr>/<td> rows with the extractText helper.
   */
  return [];
}

async function upsertRecord(record: CoLicenseRecord): Promise<boolean> {
  const { businessName, licenseNumber, city, address, phone } = record;
  if (!businessName || !licenseNumber) return false;

  const dedupeKey = `CO-PAWN-${licenseNumber}`;
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
    .replace(/-$/, '');
  const citySlug = (city || 'co')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 20);

  const existing = await prisma.organizer.findFirst({
    where: {
      OR: [
        { licenseNumber: dedupeKey },
        {
          businessName: { equals: businessName, mode: 'insensitive' },
          licenseState: 'CO',
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
        licenseState: 'CO',
        isStateLicensed: true,
        directoryMostRecentSource: 'ColoradoPhase2',
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
      address: address ?? (city ? `${city}, CO` : 'Colorado'),
      city: city || null,
      bio: `Licensed pawnbroker in ${city || 'Colorado'}.`,
      isClaimed: false,
      isUnmanagedListing: true,
      licenseNumber: dedupeKey,
      licenseState: 'CO',
      isStateLicensed: true,
      businessCategory: 'PAWN_SHOP',
      directoryMostRecentSource: 'ColoradoPhase2',
      directoryMostRecentAt: new Date(),
      user: {
        create: {
          email: `scraper+${slug}-${citySlug}-co-cophase2@system.finda.sale`,
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

export async function runColoradoPhase2Scraper(): Promise<void> {
  console.log('[ColoradoPhase2] Starting pawnbroker license scraper');

  if (!LIVE_ENDPOINT_AVAILABLE) {
    console.warn(
      '[ColoradoPhase2] STUB MODE: CO DORA DFS portal returns 403 (WAF blocked). ' +
        'See scraper header comments for unblocking options. ' +
        'Set LIVE_ENDPOINT_AVAILABLE = true and implement fetchPage() once endpoint is confirmed.'
    );
    console.log('[ColoradoPhase2] Scraper exited (stub mode) — 0 records processed');
    return;
  }

  const domain = new URL(CO_DATA_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;
  let offset = 0;

  try {
    while (true) {
      await defaultRateLimiter.waitBeforeRequest(domain);

      const records = await fetchPage(offset, domain);
      if (records.length === 0) {
        console.log('[ColoradoPhase2] No more records — pagination complete');
        break;
      }

      for (const record of records) {
        try {
          const created = await upsertRecord(record);
          if (created) createdOrganizers++;
          totalRecords++;

          if (totalRecords % 50 === 0) {
            console.log(
              `[ColoradoPhase2] Progress: ${totalRecords} processed, ${createdOrganizers} created`
            );
          }
        } catch (err) {
          console.error(`[ColoradoPhase2] Error processing ${record.businessName}:`, err);
        }
      }

      offset += records.length;
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(
      `[ColoradoPhase2] Scraper completed: ${totalRecords} records processed, ${createdOrganizers} organizers created`
    );
  } catch (error) {
    console.error('[ColoradoPhase2] Scraper error:', error);
    throw error;
  }
}
