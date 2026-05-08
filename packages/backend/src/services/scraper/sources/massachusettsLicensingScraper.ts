/**
 * Massachusetts Auctioneer License Scraper
 * Scrapes licensed auctioneers from Massachusetts Office of Consumer Affairs and Business Regulation API
 * Source: https://openapi.oca.state.ma.us/api/v1/professional-licenses?lictype=AUCTNR
 * Public API endpoint with auctioneer license records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const MASSACHUSETTS_API_URL =
  'https://openapi.oca.state.ma.us/api/v1/professional-licenses?lictype=AUCTNR';

/**
 * Parse an address string into city and zip components
 */
function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    return { city: address, zip: '' };
  }
  const cityPart = parts[0];
  const stateZip = parts[1];
  const zipMatch = stateZip.match(/\d{5}/);
  const zip = zipMatch ? zipMatch[0] : '';
  return { city: cityPart, zip };
}

/**
 * Scrape Massachusetts auctioneer licenses from OCA professional licenses API.
 * Public API — no authentication required.
 * Ingests records into Organizer table with MassachusettsLicensing source attribution.
 */
export async function runMassachusettsLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(MASSACHUSETTS_API_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[MassachusettsLicensing] Starting auctioneer license scraper');

    // Fetch API endpoint
    await rateLimiter.waitBeforeRequest(domain);

    const apiResponse = await fetch(MASSACHUSETTS_API_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!apiResponse.ok) {
      throw new Error(`Failed to fetch Massachusetts auctioneer licenses: ${apiResponse.status}`);
    }

    const data = await apiResponse.json() as unknown;

    // Safely extract records array
    let records: unknown[] = [];
    if (data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>;
      if (Array.isArray(dataObj.records)) {
        records = dataObj.records;
      } else if (Array.isArray(dataObj.licenses)) {
        records = dataObj.licenses;
      } else if (Array.isArray(data)) {
        records = data;
      }
    }

    console.log(`[MassachusettsLicensing] Found ${records.length} auctioneer licenses`);

    for (const record of records) {
      if (typeof record !== 'object' || record === null) {
        continue;
      }

      const rec = record as Record<string, unknown>;
      const name = String(rec.name || rec.licensee || '').trim();
      const licenseNum = String(rec.license_number || rec.licenseNumber || '').trim();
      const status = String(rec.status || rec.license_status || '').trim();
      const addressFull = String(rec.address || rec.city || '').trim();

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      // Only ingest active licenses
      if (status.toLowerCase() !== 'active') {
        console.log(
          `[MassachusettsLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      const { city, zip } = parseAddress(addressFull);

      console.log(
        `[MassachusettsLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, MA`
      );

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'MassachusettsLicensing',
        city || 'Massachusetts',
        'MA',
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
            licenseState: 'MA',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[MassachusettsLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[MassachusettsLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[MassachusettsLicensing] Scraper error:', error);
    throw error;
  }
}
