/**
 * Illinois IDFPR — Auctioneer License Scraper
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * DATA SOURCE: Illinois Socrata Open Data API
 * Endpoint: https://data.illinois.gov/resource/pzzh-kp68.json
 * Dataset:  Illinois IDFPR Professional Licensing (1.2M+ records, updated daily)
 * Filter:   license_type='AUCTIONEER' AND license_status='ACTIVE'
 * Records:  ~1,260 active licensed auctioneers
 *
 * NOTE: As of Jan 1 2026 Illinois requires estate sale companies to hold
 * auctioneer licenses (Illinois Auction License Act) — this dataset is growing.
 *
 * Previous approach (www.idfpr.com VIEWSTATE form) broke when IDFPR migrated
 * domains (SSL alert 80). Socrata is the authoritative public API — no browser,
 * no VIEWSTATE, simple JSON GET with SoQL pagination.
 */

import axios from 'axios';
import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';

const SOCRATA_BASE_URL = 'https://data.illinois.gov/resource/pzzh-kp68.json';
const PAGE_SIZE = 1000;
// Socrata anonymous quota is generous; 300ms between pages is polite
const PAGE_DELAY_MS = 300;

interface SocrataAuctioneerRecord {
  license_type: string;
  license_number: string;
  license_status: string;
  business_name: string;
  businessdba: string;
  first_name: string;
  last_name: string;
  city: string;
  state: string;
  zip: string;
  county: string;
}

/**
 * Resolve the best display name for an auctioneer record.
 * Business entity names take priority; fall back to individual name.
 */
function resolveOrganizerName(record: SocrataAuctioneerRecord): string {
  const dba = record.businessdba?.trim();
  if (dba) return dba;
  const bizName = record.business_name?.trim();
  if (bizName) return bizName;
  const individual = `${record.first_name ?? ''} ${record.last_name ?? ''}`.trim();
  return individual || 'Unknown';
}

export async function runIllinoisLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  let totalRecords = 0;
  let createdOrganizers = 0;
  let offset = 0;

  try {
    console.log('[IllinoisLicensing] Starting auctioneer license scraper via Socrata API');

    // Paginate until Socrata returns an empty page
    while (true) {
      await rateLimiter.waitBeforeRequest('data.illinois.gov');

      const response = await axios.get<SocrataAuctioneerRecord[]>(SOCRATA_BASE_URL, {
        params: {
          $where: "license_type='AUCTIONEER' AND license_status='ACTIVE'",
          $limit: PAGE_SIZE,
          $offset: offset,
          $order: 'license_number ASC',
        },
        headers: {
          Accept: 'application/json',
          'User-Agent': 'FindA.Sale Directory Scraper (+https://finda.sale)',
        },
        timeout: 30000,
      });

      const records = response.data;

      if (!records || records.length === 0) {
        console.log(`[IllinoisLicensing] No more records at offset ${offset} — done`);
        break;
      }

      console.log(`[IllinoisLicensing] Page offset=${offset}: ${records.length} records`);

      for (const record of records) {
        totalRecords++;

        const name = resolveOrganizerName(record);
        const city = (record.city ?? '').trim() || 'Illinois';
        const licenseNum = (record.license_number ?? '').trim();

        if (!name || !licenseNum) continue;

        const organizerId = await getOrCreateScrapedOrganizer(
          name,
          'IllinoisLicensing',
          city,
          'IL',
          undefined, // esnOrgId
          undefined, // googlePlaceId
          undefined, // foursquareVenueId
          undefined, // hereBusinessId
          'AUCTION_HOUSE',
          undefined, // contactEmail
          undefined, // phone
          undefined, // website
          undefined, // lat
          undefined, // lng
          true,       // isStateLicensed
          'IL',  // licenseState
          licenseNum, // licenseNumber
        );

        if (organizerId) {
          createdOrganizers++;
        }

        if (totalRecords % 100 === 0) {
          console.log(
            `[IllinoisLicensing] Progress: ${totalRecords} processed, ${createdOrganizers} upserted`
          );
        }
      }

      // Socrata returned a full page — advance offset and continue
      if (records.length < PAGE_SIZE) {
        // Partial page = last page
        break;
      }

      offset += PAGE_SIZE;

      // Brief pause between pages to stay within Socrata's anonymous quota
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }

    console.log(
      `[IllinoisLicensing] Completed: ${totalRecords} records processed, ${createdOrganizers} organizers upserted`
    );
  } catch (error: unknown) {
    const err = error as Error & { response?: { status: number } };

    // Infrastructure failures — log as warning, don't throw to Sentry
    const status = err.response?.status;
    if (status === 403 || status === 429) {
      console.warn(
        `[IllinoisLicensing] Socrata returned ${status} — rate limited or blocked. Returning 0 results.`
      );
      return;
    }

    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || err.name === 'ConnectTimeoutError') {
      console.warn('[IllinoisLicensing] Network error reaching Socrata:', err.message);
      return;
    }

    console.error('[IllinoisLicensing] Scraper error:', error);
    throw error;
  }
}
