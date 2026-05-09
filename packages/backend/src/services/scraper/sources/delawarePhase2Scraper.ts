/**
 * Delaware Office of the State Bank Commissioner — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Delaware Banking monthly Non-Depository Institutions PDF list
 * Source: https://banking.delaware.gov/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * NOTE: Delaware publishes a monthly PDF of non-depository licensees.
 * PDF URL discovery is attempted; if not found or parsing too complex, stub returns early.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const DE_BANKING_URL = 'https://banking.delaware.gov/';
const DE_LICENSEE_LIST_URL = 'https://banking.delaware.gov/divisions/non-depository-institutions/licensed-non-depository-institutions/';

/**
 * Scrape Delaware pawnbroker licenses from DE Office of State Bank Commissioner.
 * Attempts to fetch the non-depository institutions PDF and parse pawnbroker entries.
 */
export async function runDelawarePhase2Scraper(): Promise<void> {
  const domain = new URL(DE_BANKING_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  console.log('[Delaware Phase2] Starting pawnbroker license scraper');

  try {
    // Step 1: Fetch the licensee list page to find the PDF link
    await defaultRateLimiter.waitBeforeRequest(domain);

    const pageResponse = await fetch(DE_LICENSEE_LIST_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!pageResponse.ok) {
      console.warn(
        `[Delaware Phase2] Portal blocked — TODO: Playwright/headless browser. HTTP ${pageResponse.status} from ${DE_LICENSEE_LIST_URL}`
      );
      return;
    }

    const html = await pageResponse.text();

    // Step 2: Find PDF link for the pawnbroker / non-depository institutions list
    const pdfLinkMatch = html.match(/href="([^"]*\.pdf[^"]*)"/gi);

    if (!pdfLinkMatch || pdfLinkMatch.length === 0) {
      console.warn(
        '[Delaware Phase2] Portal blocked — TODO: Playwright/headless browser. No PDF links found on licensee page — page may require JS rendering'
      );
      return;
    }

    // Look for pawnbroker-related PDF links
    const pawnPdfLinks = pdfLinkMatch.filter(
      (link) =>
        link.toLowerCase().includes('pawn') ||
        link.toLowerCase().includes('non-dep') ||
        link.toLowerCase().includes('nondep') ||
        link.toLowerCase().includes('licensee')
    );

    console.log(
      `[Delaware Phase2] Found ${pdfLinkMatch.length} PDF links, ${pawnPdfLinks.length} potentially pawnbroker-related`
    );

    if (pawnPdfLinks.length === 0) {
      console.warn(
        '[Delaware Phase2] Portal blocked — TODO: Playwright/headless browser. Could not identify pawnbroker PDF — manual URL inspection required'
      );
      return;
    }

    // Extract the href URL from the first matching link
    const hrefMatch = pawnPdfLinks[0].match(/href="([^"]+)"/i);
    if (!hrefMatch) {
      console.warn('[Delaware Phase2] Portal blocked — TODO: Playwright/headless browser. Could not parse PDF URL');
      return;
    }

    let pdfUrl = hrefMatch[1];
    if (pdfUrl.startsWith('/')) {
      pdfUrl = `https://banking.delaware.gov${pdfUrl}`;
    }

    console.log(`[Delaware Phase2] Attempting to fetch PDF: ${pdfUrl}`);

    // Step 3: Fetch the PDF — binary fetch for text parsing
    await defaultRateLimiter.waitBeforeRequest(domain);

    const pdfResponse = await fetch(pdfUrl, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'application/pdf,*/*',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!pdfResponse.ok) {
      console.warn(`[Delaware Phase2] Portal blocked — TODO: Playwright/headless browser. PDF fetch failed: HTTP ${pdfResponse.status}`);
      return;
    }

    const contentType = pdfResponse.headers.get('content-type') || '';
    if (!contentType.includes('pdf')) {
      console.warn(
        `[Delaware Phase2] Portal blocked — TODO: Playwright/headless browser. Unexpected content type: ${contentType}. PDF binary parsing requires pdf-parse library.`
      );
      return;
    }

    // PDF binary parsing requires a library like pdf-parse which is not available in this runtime.
    // TODO: Install pdf-parse, extract text, then parse pawnbroker lines matching pattern:
    //   "PAWNBROKER" license type with business name, address, city fields
    console.warn(
      '[Delaware Phase2] Portal blocked — TODO: Playwright/headless browser. PDF found but binary parsing requires pdf-parse library. Install pdf-parse and implement text extraction.'
    );
    return;
  } catch (err) {
    console.warn('[Delaware Phase2] Portal blocked — TODO: Playwright/headless browser', err);
    return;
  }
}
