/**
 * Tennessee Secretary of State / Auctioneer Commission — License Scraper
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * STATUS (2026-06-01): Tennessee migrated from verify.sos.tn.gov (dead — ENOTFOUND)
 * to search.cloud.commerce.tn.gov, a React SPA that does not serve VIEWSTATE forms.
 * This scraper detects the SPA and returns 0 gracefully; no Sentry error is raised.
 * NOTE (BLOCKED): Rewrite using the search.cloud.commerce.tn.gov REST API or Playwright once
 *       the API endpoint is identified.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// Updated 2026-06-01: verify.sos.tn.gov (ENOTFOUND) -> search.cloud.commerce.tn.gov
const SEARCH_URL = 'https://search.cloud.commerce.tn.gov/';

function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) return { city: address, zip: '' };
  const zipMatch = parts[1].match(/\d{5}/);
  return { city: parts[0], zip: zipMatch ? zipMatch[0] : '' };
}

/**
 * Returns true for network/infra failures: DNS dead, SSL rejected, connect timeout.
 * These are logged as warnings — not thrown to Sentry — because they are site
 * migration issues, not code bugs.
 */
function isInfrastructureError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message ?? '';
  // Node's native fetch wraps network errors as TypeError: fetch failed
  // with the actual ENOTFOUND/ECONNREFUSED on err.cause, not err directly.
  const code = (err as NodeJS.ErrnoException).code ??
    ((err as { cause?: NodeJS.ErrnoException }).cause?.code) ?? '';
  return (
    msg === 'fetch failed' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    err.name === 'ConnectTimeoutError' ||
    msg.includes('Connect Timeout') ||
    msg.includes('SSL') ||
    msg.includes('ssl3_read_bytes') ||
    msg.includes('tlsv1 alert') ||
    msg.includes('ENOTFOUND')
  );
}

export async function runTennesseeLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[TennesseeLicensing] Starting auctioneer license scraper');
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!formPageResponse.ok) {
      console.warn(`[TennesseeLicensing] HTTP ${formPageResponse.status} — site may have moved. Skipping.`);
      return;
    }

    const formHtml = await formPageResponse.text();

    // SPA detection: search.cloud.commerce.tn.gov is a React app — no VIEWSTATE.
    // Gracefully return 0 until a Playwright rewrite is implemented.
    const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    if (!viewStateMatch) {
      console.warn(
        '[TennesseeLicensing] No VIEWSTATE found — site is a JavaScript SPA and ' +
        'cannot be scraped with fetch. Returning 0 results. ' +
        'NOTE (BLOCKED): Rewrite with Playwright or REST API.'
      );
      return;
    }

    const eventValidationMatch = formHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);
    const viewState = viewStateMatch[1];
    const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';

    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState);
    if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseType', 'Auctioneer');
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseStatus', 'Active');
    formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: SEARCH_URL,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) throw new Error(`Search failed: ${searchResponse.status}`);

    const html = await searchResponse.text();
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    console.log(`[TennesseeLicensing] Found ${rows.length} table rows`);

    const extractText = (h: string | undefined) =>
      (h ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

    for (const row of rows) {
      const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
      if (cells.length < 4) continue;

      const name = extractText(cells[0]);
      const licenseNum = extractText(cells[1]);
      const status = extractText(cells[2]);
      const addressFull = extractText(cells[3]);

      if (!name || !licenseNum) continue;
      totalRecords++;

      const { city } = parseAddress(addressFull);
      if (status !== 'Active') continue;

      const organizerId = await getOrCreateScrapedOrganizer(
        name, 'TennesseeLicensing', city || 'Tennessee', 'TN',
        undefined, undefined, undefined, undefined, 'AUCTION_HOUSE', undefined
      );
      if (organizerId) {
        await prisma.organizer.update({
          where: { id: organizerId },
          data: { licenseNumber: licenseNum, licenseState: 'TN', isStateLicensed: true },
        });
        createdOrganizers++;
        if (totalRecords % 50 === 0) {
          console.log(`[TennesseeLicensing] Progress: ${totalRecords} processed, ${createdOrganizers} upserted`);
        }
      }
    }

    console.log(`[TennesseeLicensing] Completed: ${totalRecords} records, ${createdOrganizers} organizers upserted`);
  } catch (error) {
    if (isInfrastructureError(error)) {
      console.warn('[TennesseeLicensing] Infrastructure failure (site moved/unreachable):', (error as Error).message);
      return;
    }
    console.error('[TennesseeLicensing] Scraper error:', error);
    throw error;
  }
}
