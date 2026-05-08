/**
 * Louisiana Auctioneer Licensing Board — Auctioneer License Scraper
 * Scrapes licensed auctioneers from LALB public search directory
 * Source: https://www.lalb.com/search/
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const LALB_BASE_URL = 'https://www.lalb.com';
const LALB_SEARCH_URL = 'https://www.lalb.com/search/';

function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) return { city: address, zip: '' };
  const cityPart = parts[0];
  const stateZip = parts.slice(1).join(',');
  const zipMatch = stateZip.match(/\d{5}/);
  return { city: cityPart, zip: zipMatch ? zipMatch[0] : '' };
}

export async function runLouisianaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(LALB_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[LouisianaLicensing] Starting auctioneer license scraper');
    await rateLimiter.waitBeforeRequest(domain);

    const searchPageResponse = await fetch(LALB_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!searchPageResponse.ok) throw new Error(`Failed to fetch: ${searchPageResponse.status}`);
    const html = await searchPageResponse.text();

    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];
    let records: Array<{ name: string; licenseNum: string; address: string; status: string }> = [];

    if (rows.length > 0) {
      console.log(`[LouisianaLicensing] Found ${rows.length} table rows`);
      for (const row of rows) {
        const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
        const cells = row.match(cellRegex) || [];
        if (cells.length < 3) continue;
        const extractText = (h: string) => h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
        const name = extractText(cells[0]);
        const licenseNum = cells.length > 1 ? extractText(cells[1]) : '';
        const addressFull = cells.length > 2 ? extractText(cells[2]) : '';
        const status = cells.length > 3 ? extractText(cells[3]) : 'Active';
        if (!name || !licenseNum) continue;
        records.push({ name, licenseNum, address: addressFull, status });
      }
    }

    console.log(`[LouisianaLicensing] Extracted ${records.length} licensee records`);

    for (const record of records) {
      const { name, licenseNum, address, status } = record;
      if (!name || !licenseNum) continue;
      totalRecords++;
      const { city } = parseAddress(address);
      if (status !== 'Active' && status.toLowerCase() !== 'active') {
        console.log(`[LouisianaLicensing] Skipping ${name}: status=${status}`);
        continue;
      }
      const organizerId = await getOrCreateScrapedOrganizer(
        name, 'LouisianaLicensing', city || 'Louisiana', 'LA',
        undefined, undefined, undefined, undefined, 'AUCTION_HOUSE', undefined
      );
      if (organizerId) {
        await prisma.organizer.update({
          where: { id: organizerId },
          data: { licenseNumber: licenseNum, licenseState: 'LA', isStateLicensed: true },
        });
        createdOrganizers++;
        if (totalRecords % 50 === 0) console.log(`[LouisianaLicensing] Progress: ${totalRecords}/${createdOrganizers}`);
      }
    }
    console.log(`[LouisianaLicensing] Complete: ${totalRecords} processed, ${createdOrganizers} created/updated`);
  } catch (error) {
    console.error('[LouisianaLicensing] Scraper error:', error);
    throw error;
  }
}
