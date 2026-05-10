/**
 * New Mexico Regulation & Licensing Department (RLD) — Pawnbroker License Scraper (Phase 2)
 *
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 * (no statewide auctioneer licensing law in NM; pawnbrokers regulated under NMSA §56-12-1+)
 *
 * DATA SOURCE STATUS (verified 2026-05-09):
 *   - NM RLD Financial Institutions Division licenses pawnbrokers under NMSA §56-12.
 *   - rld.nm.gov is a WordPress site with a "Verify a License" page but no scrapable
 *     licensee database — the verify portal is a UI-only page with no embedded API.
 *   - opendata.newmexico.gov returns HTTP 000 (unreachable) — portal is offline or restricted.
 *   - NM RLD does NOT appear to be on NMLS for pawnbroker licenses.
 *   - NM SOS business search (portal.sos.nm.gov) has no public Socrata or CKAN API.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *   1. NM RLD direct inquiry: https://www.rld.nm.gov/financial-institutions/
 *      Phone: (505) 476-4885. Request pawnbroker licensee list under NMSA §14-2 (Inspection of
 *      Public Records Act). They may provide a CSV or spreadsheet.
 *   2. NM SOS bulk data: https://portal.sos.nm.gov — check if a bulk entity export is available;
 *      then keyword-filter entityname for pawn/auction/consign (same pattern as CO SOS scraper).
 *   3. Albuquerque city business licenses: https://data.cabq.gov — check for Socrata datasets
 *      with license type columns covering pawnbroker/secondhand dealer.
 *   4. NM RLD may have a licensee lookup at https://www.rld.nm.gov/licensing/ — probe for
 *      hidden form endpoints or XHR calls via DevTools.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const LIVE_ENDPOINT_AVAILABLE = false;

// Placeholder — replace with confirmed NM RLD endpoint once available
const NM_SEARCH_URL = 'https://www.rld.nm.gov/financial-institutions/';

interface NmLicenseRecord {
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

async function fetchAllRecords(): Promise<NmLicenseRecord[]> {
  /**
   * TODO: Implement once NM RLD endpoint or public records dataset is confirmed.
   *
   * Option A — CSV from public records response:
   *   Parse rows with a line-by-line CSV reader (no external dep needed for simple CSVs):
   *   const lines = csvText.split('\n').slice(1); // skip header
   *   return lines.filter(Boolean).map((line) => {
   *     const [businessName, licenseNumber, city, address, phone] = line.split(',').map(s => s.trim());
   *     return { businessName, licenseNumber, city, address, phone };
   *   });
   *
   * Option B — HTML table from RLD portal (if endpoint is discovered):
   *   const res = await fetch(NM_SEARCH_URL, {
   *     method: 'POST',
   *     headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': getRandomUserAgent() },
   *     body: 'licenseType=PAWNBROKER&status=Active',
   *     signal: AbortSignal.timeout(30000),
   *   });
   *   const html = await res.text();
   *   // parse <tr>/<td> rows with extractText()
   */
  return [];
}

async function upsertRecord(record: NmLicenseRecord): Promise<boolean> {
  const { businessName, licenseNumber, city, address, phone } = record;
  if (!businessName || !licenseNumber) return false;

  const dedupeKey = `NM-PAWN-${licenseNumber}`;
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
    .replace(/-$/, '');
  const citySlug = (city || 'nm')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 20);

  const existing = await prisma.organizer.findFirst({
    where: {
      OR: [
        { licenseNumber: dedupeKey },
        {
          businessName: { equals: businessName, mode: 'insensitive' },
          licenseState: 'NM',
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
        licenseState: 'NM',
        isStateLicensed: true,
        directoryMostRecentSource: 'NewMexicoPhase2',
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
      address: address ?? (city ? `${city}, NM` : 'New Mexico'),
      city: city || null,
      bio: `Licensed pawnbroker in ${city || 'New Mexico'}.`,
      isClaimed: false,
      isUnmanagedListing: true,
      licenseNumber: dedupeKey,
      licenseState: 'NM',
      isStateLicensed: true,
      businessCategory: 'PAWN_SHOP',
      directoryMostRecentSource: 'NewMexicoPhase2',
      directoryMostRecentAt: new Date(),
      user: {
        create: {
          email: `scraper+${slug}-${citySlug}-nm-nmphase2@system.finda.sale`,
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

export async function runNewMexicoPhase2Scraper(): Promise<void> {
  console.log('[NewMexicoPhase2] Starting pawnbroker license scraper');

  if (!LIVE_ENDPOINT_AVAILABLE) {
    console.warn(
      '[NewMexicoPhase2] STUB MODE: NM RLD has no scrapable licensee database — ' +
        'verify-a-license page is UI-only with no embedded API. ' +
        'See scraper header comments for unblocking options (public records request recommended). ' +
        'Set LIVE_ENDPOINT_AVAILABLE = true and implement fetchAllRecords() once data source is confirmed.'
    );
    console.log('[NewMexicoPhase2] Scraper exited (stub mode) — 0 records processed');
    return;
  }

  const domain = new URL(NM_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    await defaultRateLimiter.waitBeforeRequest(domain);
    const records = await fetchAllRecords();
    console.log(`[NewMexicoPhase2] Fetched ${records.length} records`);

    for (const record of records) {
      try {
        const created = await upsertRecord(record);
        if (created) createdOrganizers++;
        totalRecords++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[NewMexicoPhase2] Progress: ${totalRecords} processed, ${createdOrganizers} created`
          );
        }

        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        console.error(`[NewMexicoPhase2] Error processing ${record.businessName}:`, err);
      }
    }

    console.log(
      `[NewMexicoPhase2] Scraper completed: ${totalRecords} records processed, ${createdOrganizers} organizers created`
    );
  } catch (error) {
    console.error('[NewMexicoPhase2] Scraper error:', error);
    throw error;
  }
}
