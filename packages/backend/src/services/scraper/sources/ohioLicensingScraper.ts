/**
 * Ohio Department of Agriculture — Auctioneer License Scraper
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * STATUS (2026-06-01): license.ohio.gov retired and completely unreachable (connect timeout).
 * Official retirement date: October 16, 2025. New system: elicense.ohio.gov (React SPA).
 * This scraper detects the SPA or timeout and returns 0 gracefully; no Sentry error.
 * TODO: Rewrite for elicense.ohio.gov REST API or Playwright.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// Updated 2026-06-01: license.ohio.gov (retired Oct 2025, connect timeout) -> elicense.ohio.gov
// elicense.ohio.gov is a SPA — this scraper will detect that and return 0 gracefully.
// TODO: Replace with elicense.ohio.gov REST API or Playwright scraper.
const SEARCH_URL = 'https://elicense.ohio.gov/oh_verifylicense';

function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) return { city: address, zip: '' };
  const zipMatch = parts[1].match(/\d{5}/);
  return { city: parts[0], zip: zipMatch ? zipMatch[0] : '' };
}

function isInfrastructureError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message ?? '';
  const code = (err as NodeJS.ErrnoException).code ?? '';
  return (
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

export async function runOhioLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[OhioLicensing] Starting auctioneer license scraper');
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
      console.warn(`[OhioLicensing] HTTP ${formPageResponse.status} — site may have moved. Skipping.`);
      return;
    }

    const formHtml = await formPageResponse.text();

    // SPA detection: elicense.ohio.gov is a React app — no VIEWSTATE.
    // Gracefully return 0 until a Playwright rewrite is implemented.
    const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    if (!viewStateMatch) {
      console.warn(
        '[OhioLicensing] No VIEWSTATE found — elicense.ohio.gov is a JavaScript SPA and ' +
        'cannot be scraped with fetch. Returning 0 results. ' +
        'TODO: Rewrite with Playwright or REST API.'
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
    console.log(`[OhioLicensing] Found ${rows.length} table rows`);

    const extractText = (h: string) =>
      h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

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
        name, 'OhioLicensing', city || 'Ohio', 'OH',
        undefined, undefined, undefined, undefined, 'AUCTION_HOUSE', undefined
      );
      if (organizerId) {
        await prisma.organizer.update({
          where: { id: organizerId },
          data: { licenseNumber: licenseNum, licenseState: 'OH', isStateLicensed: true },
        });
        createdOrganizers++;
        if (totalRecords % 50 === 0) {
          console.log(`[OhioLicensing] Progress: ${totalRecords} processed, ${createdOrganizers} upserted`);
        }
      }
    }

    console.log(`[OhioLicensing] Completed: ${totalRecords} records, ${createdOrganizers} organizers upserted`);
  } catch (error) {
    if (isInfrastructureError(error)) {
      console.warn('[OhioLicensing] Infrastructure failure (site retired/unreachable):', (error as Error).message);
      return;
    }
    console.error('[OhioLicensing] Scraper error:', error);
    throw error;
  }
}
