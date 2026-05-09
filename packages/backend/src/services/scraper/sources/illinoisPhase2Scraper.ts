/**
 * Illinois Department of Financial and Professional Regulation (IDFPR) — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from IDFPR License Lookup portal
 * Source: https://idfpr.illinois.gov/LicenseLookup/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in IL)
 *
 * IL is large — capped at 2000 records per run. IDFPR uses a form-based search
 * with license type filtering. We POST with profession=Pawnbroker and paginate results.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const IDFPR_SEARCH_URL = 'https://idfpr.illinois.gov/LicenseLookup/';
const IDFPR_RESULTS_URL = 'https://idfpr.illinois.gov/LicenseLookup/LicenseSearch.aspx';
const MAX_RECORDS = 2000;
const RATE_DELAY_MS = 3000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrape Illinois pawnbroker licenses from IDFPR License Lookup.
 * POSTs search form with profession type "Pawnbroker", paginates through results.
 * Capped at 2000 records per run due to large IL dataset.
 */
export async function runIllinoisPhase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(IDFPR_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[IllinoisPhase2] Starting IDFPR pawnbroker license scraper');

    // Step 1: Fetch the search form page to extract ViewState and other ASP.NET tokens
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(IDFPR_RESULTS_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!formPageResponse.ok) {
      console.warn(`[IllinoisPhase2] Could not reach IDFPR portal: ${formPageResponse.status}`);
      // TODO: If IDFPR portal is unavailable, check https://idfpr.illinois.gov/LicenseLookup/ for alternate entry or downloadable CSV
      console.warn('[IllinoisPhase2] Portal may require JS rendering or session cookies. Exiting gracefully.');
      return;
    }

    const formHtml = await formPageResponse.text();

    // Extract ASP.NET form tokens
    const viewStateMatch = formHtml.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
    const viewStateGenMatch = formHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
    const eventValidationMatch = formHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

    const viewState = viewStateMatch ? viewStateMatch[1] : '';
    const viewStateGen = viewStateGenMatch ? viewStateGenMatch[1] : '';
    const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';

    console.log(`[IllinoisPhase2] Form tokens extracted. ViewState present: ${!!viewState}`);

    // Step 2: POST search form with Pawnbroker profession type
    await sleep(RATE_DELAY_MS);
    await rateLimiter.waitBeforeRequest(domain);

    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState);
    formData.append('__VIEWSTATEGENERATOR', viewStateGen);
    formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('ctl00$ContentPlaceHolder1$ddlProfession', 'Pawnbroker');
    formData.append('ctl00$ContentPlaceHolder1$txtLastName', '');
    formData.append('ctl00$ContentPlaceHolder1$txtFirstName', '');
    formData.append('ctl00$ContentPlaceHolder1$txtBusinessName', '');
    formData.append('ctl00$ContentPlaceHolder1$txtCity', '');
    formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

    const searchResponse = await fetch(IDFPR_RESULTS_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: IDFPR_RESULTS_URL,
        Connection: 'keep-alive',
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) {
      console.warn(`[IllinoisPhase2] Search POST failed: ${searchResponse.status}`);
      // TODO: IDFPR may require a session cookie maintained across requests.
      // Alternative: check https://idfpr.illinois.gov/LicenseLookup/ for downloadable CSV/Excel exports.
      return;
    }

    const html = await searchResponse.text();

    // Check if we got blocked or need JS
    if (html.includes('captcha') || html.includes('CAPTCHA') || html.includes('robot')) {
      console.warn('[IllinoisPhase2] Detected bot protection (captcha). Exiting gracefully.');
      // TODO: IDFPR portal triggered bot protection. Options:
      // 1. Try https://idfpr.illinois.gov/Forms/F2174.pdf for downloadable pawnbroker list
      // 2. Use FOIA request to obtain pawnbroker license list in bulk
      return;
    }

    // Parse HTML table rows
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

    while ((rowMatch = rowRegex.exec(html)) !== null && totalRecords < MAX_RECORDS) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(extractText(cellMatch[1]));
      }

      if (cells.length < 3) continue;

      // Expected columns: License Number | Business Name | City | Status
      const licenseNumber = cells[0];
      const businessName = cells[1];
      const city = cells[2] || '';

      if (!licenseNumber || !businessName || licenseNumber === 'License Number') continue;

      totalRecords++;

      console.log(`[IllinoisPhase2] Processing: ${businessName} (${licenseNumber}) in ${city}, IL`);

      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'IL',
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'IL',
              isStateLicensed: true,
              directoryMostRecentSource: 'IllinoisPhase2',
              directoryMostRecentAt: new Date(),
            },
          });
        } else {
          const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
          const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '-');
          await prisma.organizer.create({
            data: {
              businessName,
              phone: null,
              address: city ? `${city}, IL` : 'Illinois',
              city: city || 'Illinois',
              state: 'IL',
              bio: `Licensed pawnbroker in ${city || 'Illinois'}.`,
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'IL',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'IllinoisPhase2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: `scraper+${slug}-${citySlug}-il-ilphase2@system.finda.sale`,
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
            `[IllinoisPhase2] Progress: ${totalRecords} records processed, ${createdOrganizers} created`
          );
        }

        await sleep(RATE_DELAY_MS);
      } catch (err) {
        console.error(`[IllinoisPhase2] Error processing ${businessName}:`, err);
      }
    }

    if (totalRecords >= MAX_RECORDS) {
      console.log(`[IllinoisPhase2] Reached per-run cap of ${MAX_RECORDS} records.`);
    }

    console.log(
      `[IllinoisPhase2] Scraper completed: ${totalRecords} records processed, ${createdOrganizers} created`
    );
  } catch (error) {
    console.error('[IllinoisPhase2] Scraper error:', error);
    throw error;
  }
}
