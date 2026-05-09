/**
 * California DOJ — Secondhand Dealer / Pawnbroker License Scraper (Phase 2)
 *
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker/secondhand dealer licensing data
 * (no statewide auctioneer licensing law in CA; pawnbrokers regulated under CA Business &
 * Professions Code §21625–21647 and CA Penal Code §21625+)
 *
 * DATA SOURCE STATUS (verified 2026-05-09):
 *   - CA DOJ is the licensing authority for secondhand dealers and pawnbrokers.
 *   - The public-facing search portal (oag.ca.gov) does not expose a scrapable HTML
 *     table or REST API endpoint — the licensee database is only accessible via
 *     public records request or a downloadable dataset released periodically.
 *   - CA DCA (search.dca.ca.gov) covers BSIS (security guards, PI, alarms) — it does
 *     NOT include secondhand dealers or pawnbrokers, and is Cloudflare Turnstile-protected.
 *   - CA BOE (Board of Equalization) publishes seller permit data but not pawn licenses.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *   1. CA DOJ Public Records Act request for the secondhand dealer licensee list (CSV/XLSX).
 *      File at: https://oag.ca.gov/contact/consumer-complaint-against-business-or-individual
 *      Once received, parse with a CSV loader and call upsertRecord() below.
 *   2. CA OpenData portal: https://data.ca.gov — search "secondhand dealer" or "pawnbroker".
 *      If a dataset exists, replace the stub fetch below with the Socrata/CKAN API call.
 *   3. CA BreEZe system (https://www.breeze.ca.gov/) may expose a bulk export — check with
 *      DOJ directly; BreEZe covers DCA boards but DOJ pawn licensing is a separate system.
 *
 * PAGINATION DESIGN: This scraper is pre-built for cursor/offset pagination with a 2000
 * record per-run cap. When a live endpoint is available, set LIVE_ENDPOINT_AVAILABLE = true
 * and implement fetchPage() below. The upsert logic and deduplication key are production-ready.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// Flip to true once a scrapable CA endpoint or CSV download URL is confirmed.
const LIVE_ENDPOINT_AVAILABLE = false;

const CA_DATA_URL =
  'https://data.ca.gov/api/3/action/datastore_search'; // placeholder — confirm dataset ID
const MAX_RECORDS_PER_RUN = 2000;
const PAGE_SIZE = 100;

interface CaLicenseRecord {
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

async function fetchPage(
  offset: number,
  rateLimiterDomain: string
): Promise<CaLicenseRecord[]> {
  /**
   * TODO: Replace this stub with a real fetch once the CA endpoint is confirmed.
   *
   * Option A — Socrata/CKAN open data (preferred):
   *   const url = `${CA_DATA_URL}?resource_id=<DATASET_ID>&limit=${PAGE_SIZE}&offset=${offset}`;
   *   const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
   *   const json = await res.json();
   *   return json.result.records.map((r: any) => ({
   *     businessName: r['Business Name'] ?? '',
   *     licenseNumber: r['License Number'] ?? '',
   *     city: r['City'] ?? '',
   *     address: r['Address'] ?? '',
   *     phone: r['Phone'] ?? '',
   *   }));
   *
   * Option B — form-based HTML table:
   *   POST to the search endpoint with offset/page params, parse <tr>/<td> rows.
   *
   * Option C — CSV from public records response:
   *   Parse CSV rows with a streaming parser; no pagination needed.
   */
  return [];
}

async function upsertRecord(record: CaLicenseRecord): Promise<boolean> {
  const { businessName, licenseNumber, city, address, phone } = record;
  if (!businessName || !licenseNumber) return false;

  const dedupeKey = `CA-PAWN-${licenseNumber}`;
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
    .replace(/-$/, '');
  const citySlug = (city || 'ca')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 20);

  const existing = await prisma.organizer.findFirst({
    where: {
      OR: [
        { licenseNumber: dedupeKey },
        {
          businessName: { equals: businessName, mode: 'insensitive' },
          licenseState: 'CA',
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
        licenseState: 'CA',
        isStateLicensed: true,
        directoryMostRecentSource: 'CaliforniaPhase2',
        directoryMostRecentAt: new Date(),
        ...(city && { city }),
        ...(phone && { phone }),
      },
    });
    return false; // updated, not created
  }

  await prisma.organizer.create({
    data: {
      businessName,
      phone: phone ?? null,
      address: address ?? (city ? `${city}, CA` : 'California'),
      city: city || null,
      bio: `Licensed secondhand dealer/pawnbroker in ${city || 'California'}.`,
      isClaimed: false,
      isUnmanagedListing: true,
      licenseNumber: dedupeKey,
      licenseState: 'CA',
      isStateLicensed: true,
      businessCategory: 'PAWN_SHOP',
      directoryMostRecentSource: 'CaliforniaPhase2',
      directoryMostRecentAt: new Date(),
      user: {
        create: {
          email: `scraper+${slug}-${citySlug}-ca-caphase2@system.finda.sale`,
          name: businessName,
          password: null,
          role: 'ORGANIZER',
          roles: ['ORGANIZER'],
        },
      },
    },
  });
  return true; // created
}

export async function runCaliforniaPhase2Scraper(): Promise<void> {
  console.log('[CaliforniaPhase2] Starting secondhand dealer/pawnbroker license scraper');

  if (!LIVE_ENDPOINT_AVAILABLE) {
    console.warn(
      '[CaliforniaPhase2] STUB MODE: No live CA endpoint configured. ' +
        'See scraper header comments for unblocking options. ' +
        'Set LIVE_ENDPOINT_AVAILABLE = true and implement fetchPage() once endpoint is confirmed.'
    );
    console.log('[CaliforniaPhase2] Scraper exited (stub mode) — 0 records processed');
    return;
  }

  const domain = new URL(CA_DATA_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;
  let offset = 0;

  try {
    while (totalRecords < MAX_RECORDS_PER_RUN) {
      await defaultRateLimiter.waitBeforeRequest(domain);

      const records = await fetchPage(offset, domain);
      if (records.length === 0) {
        console.log('[CaliforniaPhase2] No more records — pagination complete');
        break;
      }

      for (const record of records) {
        try {
          const created = await upsertRecord(record);
          if (created) createdOrganizers++;
          totalRecords++;

          if (totalRecords % 100 === 0) {
            console.log(
              `[CaliforniaPhase2] Progress: ${totalRecords} processed, ${createdOrganizers} created`
            );
          }

          if (totalRecords >= MAX_RECORDS_PER_RUN) {
            console.log(
              `[CaliforniaPhase2] Reached per-run cap of ${MAX_RECORDS_PER_RUN} — stopping. ` +
                `Resume from offset ${offset + records.indexOf(record) + 1} next run.`
            );
            break;
          }
        } catch (err) {
          console.error(`[CaliforniaPhase2] Error processing ${record.businessName}:`, err);
        }
      }

      offset += records.length;

      // 3s between page fetches — CA dataset is large
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.log(
      `[CaliforniaPhase2] Scraper completed: ${totalRecords} records processed, ${createdOrganizers} organizers created`
    );
  } catch (error) {
    console.error('[CaliforniaPhase2] Scraper error:', error);
    throw error;
  }
}
