/**
 * Oregon Division of Financial Regulation (DFR) — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Oregon DFR licensee database
 * Primary: https://dfr.oregon.gov/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in OR)
 *
 * OR DFR has known bot-protection concerns. This scraper:
 * 1. Attempts the DFR licensee search with conservative rate limiting
 * 2. Checks for downloadable CSV/Excel licensee lists as primary fallback
 * 3. Stubs gracefully with TODO if all approaches are blocked
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const OR_DFR_BASE_URL = 'https://dfr.oregon.gov';
// Oregon DFR licensee search for pawnbrokers
const OR_DFR_SEARCH_URL = 'https://dfr.oregon.gov/business/register/Pages/pawnbrokers.aspx';
// OR DFR sometimes posts downloadable Excel licensee lists
const OR_DFR_LICENSEE_EXCEL_URL = 'https://dfr.oregon.gov/business/register/Documents/pawnbroker-licensees.xlsx';
const OR_DFR_LICENSEE_CSV_URL = 'https://dfr.oregon.gov/business/register/Documents/pawnbroker-licensees.csv';
const RATE_DELAY_MS = 3000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrape Oregon DFR pawnbroker licenses.
 * Attempts HTML page parse first, then downloadable file fallback.
 * Exits gracefully with TODO if portal is bot-protected.
 */
export async function runOregonPhase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(OR_DFR_BASE_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[OregonPhase2] Starting Oregon DFR pawnbroker license scraper');

    // Step 1: Attempt direct pawnbroker page
    await rateLimiter.waitBeforeRequest(domain);

    const pageResponse = await fetch(OR_DFR_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!pageResponse.ok) {
      console.warn(`[OregonPhase2] DFR pawnbroker page failed: ${pageResponse.status}`);
      if (pageResponse.status === 403) {
        console.warn(
          '[OregonPhase2] 403 Forbidden — bot protection active. ' +
          'TODO: Oregon DFR blocks server-side requests. Options: ' +
          '1. Check https://dfr.oregon.gov/business/register/Pages/pawnbrokers.aspx for downloadable list links. ' +
          '2. Try https://dfr.oregon.gov/business/register/Documents/pawnbroker-licensees.xlsx directly. ' +
          '3. Contact OR DFR at dfr.insuranceconsumer@oregon.gov to request bulk data.'
        );
        // Still try the downloadable file — direct file downloads bypass bot protection more often
        await sleep(RATE_DELAY_MS);
        const downloaded = await tryDownloadableFile(domain, rateLimiter, createdOrganizers, totalRecords);
        if (!downloaded) {
          console.warn('[OregonPhase2] All approaches blocked. Exiting gracefully.');
        }
        return;
      }
      return;
    }

    const html = await pageResponse.text();
    console.log(`[OregonPhase2] DFR page fetched (${html.length} bytes)`);

    // Check for captcha/bot protection
    if (
      html.includes('captcha') ||
      html.includes('CAPTCHA') ||
      html.includes('Cloudflare') ||
      html.includes('cf-browser-verification') ||
      html.length < 500
    ) {
      console.warn(
        '[OregonPhase2] Bot protection detected on DFR portal. ' +
        'TODO: Oregon DFR uses Cloudflare or similar protection. ' +
        'Try downloading the licensee Excel file directly: ' +
        `${OR_DFR_LICENSEE_EXCEL_URL}`
      );
      await sleep(RATE_DELAY_MS);
      await tryDownloadableFile(domain, rateLimiter, createdOrganizers, totalRecords);
      return;
    }

    // Check if page contains a downloadable file link — prefer that over HTML parsing
    const xlsxMatch = html.match(/href="([^"]*\.xlsx[^"]*)"/i);
    const csvMatch = html.match(/href="([^"]*\.csv[^"]*)"/i);
    const pdfMatch = html.match(/href="([^"]*pawnbroker[^"]*\.pdf[^"]*)"/i);

    if (xlsxMatch || csvMatch) {
      const fileUrl = xlsxMatch
        ? (xlsxMatch[1].startsWith('http') ? xlsxMatch[1] : `${OR_DFR_BASE_URL}${xlsxMatch[1]}`)
        : (csvMatch![1].startsWith('http') ? csvMatch![1] : `${OR_DFR_BASE_URL}${csvMatch![1]}`);
      console.log(`[OregonPhase2] Found downloadable licensee file: ${fileUrl}`);

      // TODO: Implement XLSX/CSV parsing for Oregon DFR downloadable licensee list.
      // The file at ${fileUrl} likely contains columns: Business Name, License Number, City, Status.
      // Use a CSV parser or xlsx library (already available in the project) to parse and upsert.
      // For now, log the URL and return — implement file parsing in next iteration.
      console.warn(
        `[OregonPhase2] Downloadable file found but XLSX/CSV parsing not yet implemented. ` +
        `TODO: Add xlsx parsing to process ${fileUrl}`
      );
      return;
    }

    // Parse HTML table rows from the page
    const extractText = (cellHtml: string): string => {
      return cellHtml
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    };

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(extractText(cellMatch[1]));
      }

      if (cells.length < 2) continue;

      const licenseNumber = cells[0];
      const businessName = cells[1];
      const city = cells.length > 2 ? cells[2] : '';

      if (!licenseNumber || !businessName || licenseNumber === 'License Number' || licenseNumber === 'License #') continue;

      totalRecords++;

      console.log(`[OregonPhase2] Processing: ${businessName} (${licenseNumber}) in ${city || 'OR'}`);

      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'OR',
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'OR',
              isStateLicensed: true,
              directoryMostRecentSource: 'OregonPhase2',
              directoryMostRecentAt: new Date(),
            },
          });
        } else {
          const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
          const citySlug = (city || 'or').toLowerCase().replace(/[^a-z0-9]/g, '-');
          await prisma.organizer.create({
            data: {
              businessName,
              phone: null,
              address: city ? `${city}, OR` : 'Oregon',
              city: city || 'Oregon',
              state: 'OR',
              bio: `Licensed pawnbroker in ${city || 'Oregon'}.`,
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'OR',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'OregonPhase2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: `scraper+${slug}-${citySlug}-or-orphase2@system.finda.sale`,
                  name: businessName,
                  password: null,
                  role: 'ORGANIZER',
                  roles: ['ORGANIZER'],
                },
              },
            },
          });
          createdOrganizers++;
        }

        if (totalRecords % 50 === 0) {
          console.log(
            `[OregonPhase2] Progress: ${totalRecords} records processed, ${createdOrganizers} created`
          );
        }

        await sleep(RATE_DELAY_MS);
      } catch (err) {
        console.error(`[OregonPhase2] Error processing ${businessName}:`, err);
      }
    }

    console.log(
      `[OregonPhase2] Scraper completed: ${totalRecords} records processed, ${createdOrganizers} created`
    );
  } catch (error) {
    console.error('[OregonPhase2] Scraper error:', error);
    throw error;
  }
}

/**
 * Attempt to download the Oregon DFR pawnbroker licensee file directly.
 * Direct file downloads (xlsx/csv) often bypass bot protection that affects HTML page requests.
 */
async function tryDownloadableFile(
  domain: string,
  rateLimiter: typeof defaultRateLimiter,
  createdOrganizers: number,
  totalRecords: number
): Promise<boolean> {
  for (const fileUrl of [OR_DFR_LICENSEE_EXCEL_URL, OR_DFR_LICENSEE_CSV_URL]) {
    console.log(`[OregonPhase2] Attempting direct file download: ${fileUrl}`);
    await rateLimiter.waitBeforeRequest(domain);

    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: '*/*',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('spreadsheet') || contentType.includes('excel') || contentType.includes('csv') || contentType.includes('octet-stream')) {
        console.warn(
          `[OregonPhase2] Downloadable file available at ${fileUrl}. ` +
          'TODO: XLSX/CSV parsing not yet implemented. ' +
          'Add xlsx library parsing here to extract: businessName, licenseNumber, city columns.'
        );
        return true;
      }
    } else {
      console.warn(`[OregonPhase2] File download failed for ${fileUrl}: ${response.status}`);
    }
  }

  return false;
}
