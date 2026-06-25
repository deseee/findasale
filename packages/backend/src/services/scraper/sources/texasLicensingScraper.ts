/**
 * Texas Department of Licensing and Regulation — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Texas Socrata API
 * Source: https://data.texas.gov/resource/7358-krk7.json
 * Public API endpoint with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * Fix (S-Cat3): Removed invalid `status` and `city_name` field filters — those
 * fields do not exist in the dataset. Use $where=license_type='Auctioneer' only.
 * Available fields: license_type, license_number, business_name, owner_name,
 * license_subtype, license_expiration_date_mmddccyy, business_county,
 * mailing_address_county, continuing_education_flag.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const SOCRATA_API_URL = 'https://data.texas.gov/resource/7358-krk7.json';
const PAGE_SIZE = 1000;

interface SocrataRecord {
  license_type?: string;
  license_number?: string;
  business_name?: string;
  owner_name?: string;
  license_subtype?: string;
  license_expiration_date_mmddccyy?: string;
  business_county?: string;
  mailing_address_county?: string;
}

/**
 * Scrape Texas auctioneer licenses from Socrata API.
 * Public API endpoint — no authentication required (optional X-App-Token header).
 * Paginates through all records and ingests into Organizer table with TexasLicensing source attribution.
 */
export async function runTexasLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SOCRATA_API_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;
  let offset = 0;

  try {
    console.log('[TexasLicensing] Starting auctioneer license scraper (Socrata API)');

    const socrataAppToken = process.env.SOCRATA_APP_TOKEN;

    let hasMore = true;
    while (hasMore) {
      // Use $where to filter by license_type — the dataset has no `status` or `city_name` field
      const queryParams = new URLSearchParams();
      queryParams.append('$where', "license_type='Auctioneer'");
      queryParams.append('$limit', PAGE_SIZE.toString());
      queryParams.append('$offset', offset.toString());

      const url = `${SOCRATA_API_URL}?${queryParams.toString()}`;

      await rateLimiter.waitBeforeRequest(domain);

      const headers: Record<string, string> = {
        'User-Agent': getRandomUserAgent(),
        Accept: 'application/json',
      };

      if (socrataAppToken) {
        headers['X-App-Token'] = socrataAppToken;
      }

      console.log(`[TexasLicensing] Fetching records with offset=${offset}`);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Socrata API: ${response.status} ${response.statusText}`);
      }

      const records: SocrataRecord[] = await response.json();

      if (!Array.isArray(records) || records.length === 0) {
        console.log('[TexasLicensing] No more records to fetch');
        hasMore = false;
        break;
      }

      console.log(`[TexasLicensing] Fetched ${records.length} records at offset=${offset}`);

      for (const record of records) {
        const name = (record.business_name || record.owner_name || '').trim();
        const licenseNum = record.license_number?.trim();
        // Use business_county as the city proxy — dataset has no city field
        const county = (record.business_county || record.mailing_address_county || 'Texas').trim();
        const city = county ? `${county} County` : 'Texas';

        if (!name || !licenseNum) {
          continue;
        }

        totalRecords++;

        console.log(`[TexasLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, TX`);

        const organizerId = await getOrCreateScrapedOrganizer(
          name,
          'TexasLicensing',
          city,
          'TX',
          undefined,
          undefined,
          undefined,
          undefined,
          'AUCTION_HOUSE',
          undefined, // contactEmail
          undefined, // phone
          undefined, // website
          undefined, // lat
          undefined, // lng
          true,       // isStateLicensed
          'TX',  // licenseState
          licenseNum, // licenseNumber
        );

        if (organizerId) {

          createdOrganizers++;

          if (totalRecords % 50 === 0) {
            console.log(
              `[TexasLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
            );
          }
        }
      }

      offset += PAGE_SIZE;

      if (records.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    console.log(
      `[TexasLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[TexasLicensing] Scraper error:', error);
    throw error;
  }
}
