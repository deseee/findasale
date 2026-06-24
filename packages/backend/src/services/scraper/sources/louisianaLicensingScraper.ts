/**
 * Louisiana Auctioneers Licensing Board — Auction Business License Scraper
 * ADR-073: Directory Scraper Phase 1 — State auctioneer licensing data
 *
 * Source: https://www.lalb.org/all_auctioneer-bus.php
 * Method: POST with body `submit=1` (form-encoded) — returns full HTML table, no JS rendering required
 * Expected: ~76 active licensed auction businesses in Louisiana
 *
 * LA pawnbroker data (Phase 2): handled by louisianaPhase2Scraper.ts (data.nola.gov + data.brla.gov).
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const LALB_URL = 'https://www.lalb.org/all_auctioneer-bus.php';
const SOURCE_ID = 'LouisianaLALB';

export async function runLouisianaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(LALB_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[LouisianaLicensing] Starting auction business license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const response = await axios.post<string>(LALB_URL, 'submit=1', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      timeout: 30000,
      responseType: 'text',
    });

    if (response.status !== 200) {
      throw new Error(`[LouisianaLicensing] Unexpected HTTP status: ${response.status}`);
    }

    const $ = cheerio.load(response.data);

    // Find all table rows — skip header row(s)
    const rows = $('table tr').toArray();
    console.log(`[LouisianaLicensing] Found ${rows.length} table rows`);

    for (const row of rows) {
      const cells = $(row).find('td').toArray();
      if (cells.length < 1) continue;

      const getText = (el: any) =>
        $(el).text().replace(/\s+/g, ' ').trim();

      // Column layout (best-effort — adapt to whatever the table actually provides):
      // col 0: business name, col 1: city or address, col 2: phone (optional)
      const businessName = getText(cells[0]);
      if (!businessName) continue;

      const cityRaw = cells.length > 1 ? getText(cells[1]) : '';
      const phone = cells.length > 2 ? getText(cells[2]) : undefined;

      // Normalise city — strip trailing state/zip if present ("Baton Rouge, LA 70801" → "Baton Rouge")
      const city = cityRaw.replace(/,?\s*LA\b.*$/i, '').trim() || 'Louisiana';

      totalRecords++;

      const organizerId = await getOrCreateScrapedOrganizer(
        businessName,
        SOURCE_ID,
        city,
        'LA',
        undefined,   // esnOrgId
        undefined,   // googlePlaceId
        undefined,   // foursquareVenueId
        undefined,   // hereBusinessId
        'AUCTION_HOUSE',
        undefined,   // contactEmail
        phone || undefined,
        undefined,   // website
        undefined,   // lat
        undefined,   // lng
        true,        // isStateLicensed
        'LA',        // licenseState
        undefined,   // licenseNumber
        SOURCE_ID    // sourceLabel
      );

      if (organizerId) {
        createdOrganizers++;
      }

      if (totalRecords % 25 === 0) {
        console.log(`[LouisianaLicensing] Progress: ${totalRecords} processed, ${createdOrganizers} created/updated`);
      }
    }

    console.log(
      `[LouisianaLicensing] Complete: ${totalRecords} records processed, ${createdOrganizers} organizers created/updated`
    );
  } catch (error) {
    console.error('[LouisianaLicensing] Scraper error:', error);
    throw error;
  }
}
