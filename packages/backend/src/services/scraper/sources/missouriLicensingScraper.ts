/**
 * Missouri Division of Professional Registration — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Missouri DPOR license database
 * Source: https://mopro.mo.gov/license/s/license-search (updated 2026 — pr.mo.gov connection refused; new portal is Salesforce SPA, needs JS rendering)
 * Public directory with searchable auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import https from 'https';
import axios from 'axios';
import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// Missouri DPS cert chain is missing intermediate — rejectUnauthorized: false required
const moHttpsAgent = new https.Agent({ rejectUnauthorized: false });

// NOTE: pr.mo.gov is connection-refused (decommissioned). Missouri moved professional
// registration to the MOPRO Salesforce portal: https://mopro.mo.gov/license/s/license-search
// That portal is a full JS SPA (Salesforce/Aura) — static HTML fetch returns no data.
// Flagged as needing JS rendering. URL updated to point to the new portal.
const MO_SEARCH_URL = 'https://mopro.mo.gov/license/s/license-search';

export async function runMissouriLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(MO_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[MissouriLicensing] Starting auctioneer license scraper');
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await axios.get<string>(MO_SEARCH_URL, {
      httpsAgent: moHttpsAgent,
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      timeout: 30000,
      responseType: 'text',
    });

    if (searchResponse.status !== 200) throw new Error(`Failed: ${searchResponse.status}`);
    const html = searchResponse.data;

    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];
    console.log(`[MissouriLicensing] Found ${rows.length} table rows`);

    for (const row of rows) {
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];
      if (cells.length < 3) continue;
      const extractText = (h: string | undefined) => (h ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
      const name = extractText(cells[0]);
      const licenseNum = extractText(cells[1]);
      const status = cells.length > 2 ? extractText(cells[2]) : 'Active';
      if (!name || !licenseNum) continue;
      totalRecords++;
      if (status && status.toLowerCase() !== 'active') {
        console.log(`[MissouriLicensing] Skipping ${name}: status=${status}`);
        continue;
      }
      const organizerId = await getOrCreateScrapedOrganizer(
        name, 'MissouriLicensing', 'Missouri', 'MO',
        undefined, undefined, undefined, undefined, 'AUCTION_HOUSE', undefined
      );
      if (organizerId) {
        await prisma.organizer.update({
          where: { id: organizerId },
          data: { licenseNumber: licenseNum, licenseState: 'MO', isStateLicensed: true },
        });
        createdOrganizers++;
        if (totalRecords % 50 === 0) console.log(`[MissouriLicensing] Progress: ${totalRecords}/${createdOrganizers}`);
      }
    }
    console.log(`[MissouriLicensing] Complete: ${totalRecords} processed, ${createdOrganizers} created/updated`);
  } catch (error) {
    console.error('[MissouriLicensing] Scraper error:', error);
    throw error;
  }
}
