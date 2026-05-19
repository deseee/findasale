/**
 * Wyoming Banking Division — Pawnbroker/Secondhand Dealer License Scraper
 * Scrapes licensed pawnbrokers from Wyoming Division of Banking
 * Source: https://wyomingbankingdivision.wyo.gov/
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * Wyoming regulates pawnbrokers through the Division of Banking.
 * This scraper fetches the licensee list and ingests active records.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const WYOMING_BANKING_BASE = 'https://wyomingbankingdivision.wyo.gov';

// Paths to try for pawnbroker licensee lists
const LICENSEE_PATHS = [
  '/banks-and-financial-institutions/pawnbrokers',
  '/licensees/pawnbrokers',
  '/regulated-industries/pawnbrokers',
  '/banks-and-financial-institutions/licensed-pawnbrokers',
  '/licensee-lists/pawnbroker',
  '/industry/pawnbrokers',
];

const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'credit union',
  'financial', 'insurance', 'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Extract text content from an HTML string, stripping tags and decoding entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .trim();
}

/**
 * Try to find and parse a table of licensees from an HTML page.
 * Returns parsed rows as arrays of cell text.
 */
function parseTableRows(html: string): string[][] {
  const results: string[][] = [];

  // Find all tables
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRegex) || [];

  for (const table of tables) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(table)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(extractText(cellMatch[1]));
      }
      if (cells.length >= 2) {
        results.push(cells);
      }
    }
  }

  return results;
}

/**
 * Try to extract licensee data from list items or definition lists.
 * Fallback when no table is found.
 */
function parseListItems(html: string): Array<{ name: string; city: string }> {
  const results: Array<{ name: string; city: string }> = [];

  // Try <li> elements
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(html)) !== null) {
    const text = extractText(match[1]);
    // Look for patterns like "Business Name - City" or "Business Name, City, WY"
    const dashSplit = text.split(/\s*[-–—]\s*/);
    const commaSplit = text.split(/\s*,\s*/);

    if (dashSplit.length >= 2 && dashSplit[0].length > 3) {
      results.push({ name: dashSplit[0].trim(), city: dashSplit[1].trim() });
    } else if (commaSplit.length >= 2 && commaSplit[0].length > 3) {
      results.push({ name: commaSplit[0].trim(), city: commaSplit[1].trim() });
    }
  }

  return results;
}

/**
 * Identify which column is which based on header text.
 */
function identifyColumns(headerRow: string[]): {
  nameCol: number;
  cityCol: number;
  statusCol: number;
  licenseCol: number;
} {
  let nameCol = 0;
  let cityCol = -1;
  let statusCol = -1;
  let licenseCol = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i].toLowerCase();
    if (h.includes('name') || h.includes('business') || h.includes('licensee') || h.includes('company')) {
      nameCol = i;
    } else if (h.includes('city') || h.includes('location') || h.includes('address')) {
      cityCol = i;
    } else if (h.includes('status') || h.includes('active') || h.includes('state')) {
      // Avoid matching "state" as in WY — only if it looks like license status
      if (!h.includes('state') || h.includes('status')) {
        statusCol = i;
      }
    } else if (h.includes('license') || h.includes('permit') || h.includes('number') || h.includes('#')) {
      licenseCol = i;
    }
  }

  return { nameCol, cityCol, statusCol, licenseCol };
}

/**
 * Scrape Wyoming Banking Division pawnbroker licensee list.
 * Tries multiple URL paths since the exact page structure may vary.
 * Ingests records into Organizer table with WyomingLicensing source attribution.
 */
export async function runWyomingLicensingScraper(): Promise<void> {
  let totalRecords = 0;
  let createdOrganizers = 0;
  let pageFound = false;

  console.log('[WyomingLicensing] Starting pawnbroker license scraper');
  console.log(`[WyomingLicensing] Base URL: ${WYOMING_BANKING_BASE}`);

  try {
    // Try each potential path for the licensee list
    for (const path of LICENSEE_PATHS) {
      const url = `${WYOMING_BANKING_BASE}${path}`;
      const domain = new URL(url).hostname;

      await defaultRateLimiter.waitBeforeRequest(domain);

      console.log(`[WyomingLicensing] Trying: ${url}`);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': getRandomUserAgent(),
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(30000),
        });
      } catch (fetchErr) {
        console.log(`[WyomingLicensing] Failed to fetch ${url}: ${fetchErr}`);
        continue;
      }

      if (!response.ok) {
        console.log(`[WyomingLicensing] ${url} returned ${response.status}, trying next path`);
        continue;
      }

      const html = await response.text();

      // Check if page content is relevant to pawnbrokers
      const lowerHtml = html.toLowerCase();
      if (!lowerHtml.includes('pawnbroker') && !lowerHtml.includes('pawn') && !lowerHtml.includes('secondhand')) {
        console.log(`[WyomingLicensing] ${url} does not contain pawnbroker content, trying next`);
        continue;
      }

      pageFound = true;
      console.log(`[WyomingLicensing] Found pawnbroker page at ${url}`);

      // Try table parsing first
      const tableRows = parseTableRows(html);

      if (tableRows.length > 1) {
        console.log(`[WyomingLicensing] Found ${tableRows.length} table rows`);

        // First row is likely headers
        const { nameCol, cityCol, statusCol, licenseCol } = identifyColumns(tableRows[0]);
        const dataRows = tableRows.slice(1);

        for (const cells of dataRows) {
          const name = cells[nameCol] || '';
          if (!name || name.length < 3) continue;
          if (nameIsExcluded(name)) continue;

          const city = cityCol >= 0 && cells[cityCol] ? cells[cityCol] : 'Wyoming';
          const status = statusCol >= 0 && cells[statusCol] ? cells[statusCol].toUpperCase() : 'ACTIVE';
          const licenseNum = licenseCol >= 0 && cells[licenseCol] ? cells[licenseCol] : undefined;

          // Skip inactive licenses
          if (status && !['ACTIVE', 'CURRENT', 'ISSUED', 'APPROVED', ''].includes(status)) {
            console.log(`[WyomingLicensing] Skipping ${name}: status=${status}`);
            continue;
          }

          totalRecords++;
          console.log(`[WyomingLicensing] Processing: ${name} in ${city}, WY`);

          const organizerId = await getOrCreateScrapedOrganizer(
            name,
            'WyomingLicensing',
            city,
            'WY',
            undefined,  // esnOrgId
            undefined,  // googlePlaceId
            undefined,  // foursquareVenueId
            undefined,  // hereBusinessId
            'PAWN_SHOP', // businessCategory
            undefined,  // contactEmail
            undefined,  // phone
            undefined,  // website
            undefined,  // lat
            undefined,  // lng
            true,       // isStateLicensed
            'Wyoming',  // licenseState
            licenseNum, // licenseNumber
          );

          if (organizerId) {
            createdOrganizers++;
          }

          if (totalRecords % 25 === 0) {
            console.log(
              `[WyomingLicensing] Progress: ${totalRecords} processed, ${createdOrganizers} upserted`
            );
          }
        }
      } else {
        // Fallback: try list-based parsing
        console.log('[WyomingLicensing] No table found, trying list-based parsing');
        const listItems = parseListItems(html);

        if (listItems.length > 0) {
          console.log(`[WyomingLicensing] Found ${listItems.length} list items`);

          for (const item of listItems) {
            if (!item.name || item.name.length < 3) continue;
            if (nameIsExcluded(item.name)) continue;

            totalRecords++;
            console.log(`[WyomingLicensing] Processing: ${item.name} in ${item.city}, WY`);

            const organizerId = await getOrCreateScrapedOrganizer(
              item.name,
              'WyomingLicensing',
              item.city || 'Wyoming',
              'WY',
              undefined,  // esnOrgId
              undefined,  // googlePlaceId
              undefined,  // foursquareVenueId
              undefined,  // hereBusinessId
              'PAWN_SHOP', // businessCategory
              undefined,  // contactEmail
              undefined,  // phone
              undefined,  // website
              undefined,  // lat
              undefined,  // lng
              true,       // isStateLicensed
              'Wyoming',  // licenseState
              undefined,  // licenseNumber
            );

            if (organizerId) {
              createdOrganizers++;
            }
          }
        }
      }

      // Found the page and processed it — no need to try more paths
      break;
    }

    if (!pageFound) {
      // Try the main page and search for links to pawnbroker content
      const mainDomain = new URL(WYOMING_BANKING_BASE).hostname;
      await defaultRateLimiter.waitBeforeRequest(mainDomain);

      console.log(`[WyomingLicensing] Trying main page: ${WYOMING_BANKING_BASE}`);

      const mainResponse = await fetch(WYOMING_BANKING_BASE, {
        method: 'GET',
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (mainResponse.ok) {
        const mainHtml = await mainResponse.text();

        // Look for links containing pawn/secondhand
        const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*(?:pawn|secondhand|second.hand)[^<]*)<\/a>/gi;
        let linkMatch;
        const pawnLinks: string[] = [];

        while ((linkMatch = linkRegex.exec(mainHtml)) !== null) {
          pawnLinks.push(linkMatch[1]);
        }

        // Also check href attributes for pawn-related paths
        const hrefRegex = /href=["']([^"']*(?:pawn|secondhand)[^"']*)["']/gi;
        while ((linkMatch = hrefRegex.exec(mainHtml)) !== null) {
          if (!pawnLinks.includes(linkMatch[1])) {
            pawnLinks.push(linkMatch[1]);
          }
        }

        if (pawnLinks.length > 0) {
          console.log(`[WyomingLicensing] Found ${pawnLinks.length} pawn-related links on main page`);

          for (const link of pawnLinks.slice(0, 5)) {
            const fullUrl = link.startsWith('http') ? link : `${WYOMING_BANKING_BASE}${link.startsWith('/') ? '' : '/'}${link}`;
            await defaultRateLimiter.waitBeforeRequest(mainDomain);

            console.log(`[WyomingLicensing] Following link: ${fullUrl}`);

            try {
              const linkResponse = await fetch(fullUrl, {
                method: 'GET',
                headers: {
                  'User-Agent': getRandomUserAgent(),
                  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                signal: AbortSignal.timeout(30000),
              });

              if (!linkResponse.ok) continue;

              const linkHtml = await linkResponse.text();
              const rows = parseTableRows(linkHtml);

              if (rows.length > 1) {
                pageFound = true;
                const { nameCol, cityCol, statusCol, licenseCol } = identifyColumns(rows[0]);

                for (const cells of rows.slice(1)) {
                  const name = cells[nameCol] || '';
                  if (!name || name.length < 3) continue;
                  if (nameIsExcluded(name)) continue;

                  const city = cityCol >= 0 && cells[cityCol] ? cells[cityCol] : 'Wyoming';
                  const status = statusCol >= 0 && cells[statusCol] ? cells[statusCol].toUpperCase() : 'ACTIVE';
                  const licenseNum = licenseCol >= 0 && cells[licenseCol] ? cells[licenseCol] : undefined;

                  if (status && !['ACTIVE', 'CURRENT', 'ISSUED', 'APPROVED', ''].includes(status)) continue;

                  totalRecords++;

                  const organizerId = await getOrCreateScrapedOrganizer(
                    name,
                    'WyomingLicensing',
                    city,
                    'WY',
                    undefined, undefined, undefined, undefined,
                    'PAWN_SHOP',
                    undefined, undefined, undefined, undefined, undefined,
                    true, 'Wyoming', licenseNum,
                  );

                  if (organizerId) createdOrganizers++;
                }

                if (totalRecords > 0) break;
              }
            } catch (linkErr) {
              console.log(`[WyomingLicensing] Error following link ${fullUrl}: ${linkErr}`);
            }
          }
        }
      }
    }

    console.log(
      `[WyomingLicensing] Completed — processed: ${totalRecords}, upserted: ${createdOrganizers}`
    );

    if (totalRecords === 0) {
      throw new Error(
        '[WyomingLicensing] Zero records found. Wyoming Banking Division pawnbroker list may have moved or changed structure. ' +
        'Check https://wyomingbankingdivision.wyo.gov/ manually for current pawnbroker licensee page.'
      );
    }
  } catch (error) {
    console.error('[WyomingLicensing] Scraper error:', error);
    throw error;
  }
}
