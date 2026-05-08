/**
 * Texas Department of Licensing and Regulation — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Texas Socrata API
 * Source: https://data.texas.gov/resource/7358-krk7.json
 * Public API endpoint with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const SOCRATA_API_URL = 'https://data.texas.gov/resource/7358-krk7.json';
const PAGE_SIZE = 1000;

interface SocrataRecord {
  license_holder_name?: string;
  license_number?: string;
  city_name?: string;
  city?: string;
  status?: string;
  expiration_date?: string;
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

    // Pagination loop
    let hasMore = true;
    while (hasMore) {
      // Build query URL with pagination and filters
      const queryParams = new URLSearchParams();
      queryParams.append('license_type', 'Auctioneer');
      queryParams.append('status', 'Active');
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

      // Process each record
      for (const record of records) {
        const name = record.license_holder_name?.trim();
        const licenseNum = record.license_number?.trim();
        const city = (record.city_name || record.city || 'Texas').trim();
        const status = record.status?.trim() || 'Active';

        if (!name || !licenseNum) {
          continue;
        }

        totalRecords++;

        // Double-check status is Active (should be filtered by API, but verify)
        if (status !== 'Active') {
          console.log(
            `[TexasLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
          );
          continue;
        }

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
          undefined
        );

        if (organizerId) {
          await prisma.organizer.update({
            where: { id: organizerId },
            data: {
              licenseNumber: licenseNum,
              licenseState: 'TX',
              isStateLicensed: true,
            },
          });

          createdOrganizers++;

          if (totalRecords % 50 === 0) {
            console.log(
              `[TexasLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
            );
          }
        }
      }

      // Update offset for next iteration
      offset += PAGE_SIZE;

      // If we got fewer than PAGE_SIZE records, we've reached the end
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
