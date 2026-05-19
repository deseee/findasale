/**
 * AuctionZip.com Auctioneer Directory Scraper
 *
 * Sources ~25,000 auction houses from the AuctionZip public directory.
 * Scrapes by alphabetical letter page (/Auctioneer-Directory/[A-Z].html),
 * which is NOT disallowed by robots.txt.
 *
 * robots.txt disallows: /cgi-bin/launcher.cgi, /cgi-bin/readinfo.cgi,
 * /search, /search-results, /aboard, /my-account, /login, /bidNow,
 * /cgi-bin/userpanel.cgi, /cgi-bin/azlogin.cgi, /cgi-bin/favpanel.cgi,
 * /azThankYou.html
 *
 * /Auctioneer-Directory/ is explicitly allowed (not listed in Disallow).
 *
 * Rate limiting: 3-second minimum delay between page requests.
 * User-Agent: FindASale-Bot/1.0 (+https://finda.sale)
 * Per-run cap: 500 records to avoid hammering the server in one shot.
 */

import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';

const BASE_URL = 'https://www.auctionzip.com';
const USER_AGENT = 'FindASale-Bot/1.0 (+https://finda.sale)';
const REQUEST_DELAY_MS = 3000; // 3 seconds — conservative, respectful
const MAX_RECORDS_PER_RUN = 500;

// Alphabetical letter pages available in the directory
const DIRECTORY_LETTERS = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
];

// US state two-letter codes — used to filter out Canadian provinces
// AuctionZip includes Canadian auctioneers (ON, BC, AB, etc.) which we skip.
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
]);

interface AuctionZipEntry {
  auctioneerId: string;
  companyName: string;
  city: string;
  state: string;
  profileUrl: string;
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a single URL with proper headers and timeout.
 * Returns the response text on success, null on failure.
 */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[AuctionZip] HTTP ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (err) {
    console.warn(
      `[AuctionZip] Fetch error for ${url}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Parse auctioneer rows from a directory letter page.
 *
 * Each row has the structure:
 *   <div class="... auc-directory__table--table-row">
 *     <div class="auc-directory__table--header--auc--company">
 *       <a class="auc-link" href="/[STATE]-Auctioneers/[ID].html">Company Name</a>
 *     </div>
 *     <div class="auc-directory__table--header--auc--city-state">City, STATE</div>
 *   </div>
 */
function parseDirectoryPage(html: string): AuctionZipEntry[] {
  const entries: AuctionZipEntry[] = [];

  // Match each table row block
  // We extract: profile href, company name, city/state text
  const rowPattern =
    /auc-directory__table--table-row[\s\S]*?auc-directory__table--header--auc--company[^>]*>\s*<a[^>]+href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>[\s\S]*?auc-directory__table--header--auc--city-state[^>]*>([^<]+)</g;

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const href = match[1].trim();
    const companyName = match[2].trim().replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
    const cityStateRaw = match[3].trim();

    // Extract STATE from city/state string "City, ST"
    const csMatch = cityStateRaw.match(/^(.+),\s*([A-Z]{2})\s*$/);
    if (!csMatch) continue;

    const city = csMatch[1].trim();
    const state = csMatch[2].trim();

    // Skip non-US entries (Canadian provinces etc.)
    if (!US_STATES.has(state)) continue;

    // Skip obviously closed entries
    if (companyName.toLowerCase().includes('(closed)')) continue;

    // Extract auctioneer ID from href e.g. /OH-Auctioneers/99797.html
    const idMatch = href.match(/\/(\d+)\.html$/);
    if (!idMatch) continue;
    const auctioneerId = idMatch[1];

    const profileUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    entries.push({ auctioneerId, companyName, city, state, profileUrl });
  }

  return entries;
}

/**
 * Fetch and parse a single alphabetical letter page.
 * Returns all US auction house entries found on that page.
 */
async function scrapeLetterPage(letter: string): Promise<AuctionZipEntry[]> {
  const url = `${BASE_URL}/Auctioneer-Directory/${letter}.html`;
  const html = await fetchPage(url);
  if (!html) return [];

  const entries = parseDirectoryPage(html);
  console.log(`[AuctionZip] Letter ${letter}: ${entries.length} US entries`);
  return entries;
}

/**
 * Main AuctionZip scraper entry point.
 *
 * Iterates A–Z directory pages, extracts company name / city / state,
 * calls getOrCreateScrapedOrganizer() for each record, stops after
 * MAX_RECORDS_PER_RUN to avoid a single massive run.
 *
 * @param letters  Optional subset of letters to scrape (default: all A–Z).
 *                 Pass e.g. ['A','B','C'] to process a range.
 */
export async function runAuctionZipScraper(letters?: string[]): Promise<void> {
  const targetLetters = letters && letters.length > 0 ? letters : DIRECTORY_LETTERS;

  console.log(
    `[AuctionZip] Starting — letters: ${targetLetters.join(',')} — cap: ${MAX_RECORDS_PER_RUN} records/run`
  );

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const seenIds = new Set<string>();

  for (const letter of targetLetters) {
    if (totalProcessed >= MAX_RECORDS_PER_RUN) {
      console.log(`[AuctionZip] Reached ${MAX_RECORDS_PER_RUN}-record cap — stopping`);
      break;
    }

    let entries: AuctionZipEntry[];
    try {
      entries = await scrapeLetterPage(letter);
    } catch (err) {
      console.error(
        `[AuctionZip] Failed to scrape letter ${letter}:`,
        err instanceof Error ? err.message : String(err)
      );
      totalErrors++;
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    for (const entry of entries) {
      if (totalProcessed >= MAX_RECORDS_PER_RUN) break;

      // Deduplicate within this run by auctioneer ID
      if (seenIds.has(entry.auctioneerId)) {
        totalSkipped++;
        continue;
      }
      seenIds.add(entry.auctioneerId);

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          entry.companyName,
          'AuctionZip',
          entry.city,
          entry.state,
          undefined,   // esnOrgId — not available from this source
          undefined,   // googlePlaceId
          undefined,   // foursquareVenueId
          undefined,   // hereBusinessId
          'AUCTION_HOUSE',
          undefined,   // contactEmail — not on directory page
          undefined,   // phone — not on directory page
          undefined    // website — not on directory page
        );

        if (orgId) {
          // Set directoryMostRecentSource and isStateLicensed
          await prisma.organizer.update({
            where: { id: orgId },
            data: {
              directoryMostRecentSource: 'AuctionZip',
              directoryMostRecentAt: new Date(),
              // isStateLicensed: we have no license data from AuctionZip directory
              // Leave it as-is (null/false) — do not override if a licensing scraper set it
            },
          });

          totalCreated++;
          console.log(
            `[AuctionZip] (${totalProcessed + 1}) ${entry.companyName} — ${entry.city}, ${entry.state} → org ${orgId}`
          );
        } else {
          // Rejected by category filter or other reason
          totalSkipped++;
        }
      } catch (err) {
        totalErrors++;
        console.error(
          `[AuctionZip] Error ingesting "${entry.companyName}" (${entry.city}, ${entry.state}):`,
          err instanceof Error ? err.message : String(err)
        );
        // One bad record does not stop the batch — continue
      }

      totalProcessed++;
    }

    // Rate limit: 3 seconds between page requests
    if (letter !== targetLetters[targetLetters.length - 1]) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(
    `[AuctionZip] Complete — processed: ${totalProcessed}, created/merged: ${totalCreated}, skipped: ${totalSkipped}, errors: ${totalErrors}`
  );

  if (totalProcessed === 0) {
    throw new Error('[AuctionZip] Completed with zero results — site may be unavailable or blocking');
  }
}
