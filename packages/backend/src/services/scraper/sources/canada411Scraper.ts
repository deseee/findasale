/**
 * Canada411.ca — Secondary Sale Business Directory Scraper
 * Targets estate sale, auction, consignment, and antique dealer businesses
 * in Ontario (ON), British Columbia (BC), and Alberta (AB).
 *
 * Canada411.ca serves static HTML. Search URL pattern:
 *   https://www.canada411.ca/search/si/{offset}/kw/{encoded-keyword}/prov/{province}/
 *
 * Pagination: offset increments by 20 per page (0-based). Scraper stops when
 * a page returns fewer results than the page size (last page detected).
 *
 * Note: Canadian orgs are suppressed from outreach automatically by the
 * outreach cron's province-exclusion pattern. No suppressOutreach needed here.
 *
 * ADR-073: Directory Scraper — Canada411 directory data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const CANADA411_DOMAIN = 'www.canada411.ca';
const PAGE_SIZE = 20;
const MAX_PAGES = 50; // safety ceiling per keyword+province combo (~1,000 records max)

// Provinces to target
const PROVINCES = ['ON', 'BC', 'AB'] as const;
type Province = (typeof PROVINCES)[number];

// Keywords to search
const KEYWORDS = [
  'estate sale',
  'auction house',
  'consignment',
  'antique dealer',
] as const;

// Name fragments that indicate false positives — skip these
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'mortgage',
  'bank',
  'credit union',
  'financial',
  'insurance',
  'law office',
  'attorney',
  'lawyer',
  'dental',
  'dentist',
  'medical',
  'clinic',
  'pharmacy',
  'hospital',
  'restaurant',
  'hotel',
  'motel',
  'petroleum',
  'gas station',
  'automotive',
  'car wash',
  'daycare',
  'school',
  'church',
  'funeral',
  'landscaping',
  'construction',
  'plumbing',
  'electrical',
  'roofing',
  'hair salon',
  'nail salon',
  'tattoo',
  'massage',
  'yoga',
  'gym',
  'grocery',
  'supermarket',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Map keyword + business name to a valid VALID_CATEGORIES value.
 */
function mapCategory(businessName: string, keyword: string): string {
  const lower = businessName.toLowerCase();
  const kw = keyword.toLowerCase();

  if (lower.includes('auction') || kw.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('consignment') || kw.includes('consignment')) return 'CONSIGNMENT';
  if (lower.includes('antique') || kw.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('estate sale') || kw.includes('estate sale')) return 'ESTATE_SALE_CO';
  if (lower.includes('vintage')) return 'VINTAGE';
  if (lower.includes('thrift')) return 'THRIFT_STORE';
  if (lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('flea market')) return 'FLEA_MARKET';
  return 'RESALE_SHOP';
}

/**
 * Strip HTML tags and decode basic entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Canada411Listing {
  name: string;
  city: string;
  phone?: string;
}

/**
 * Build the Canada411 search URL for a given keyword, province, and page offset.
 * URL pattern: https://www.canada411.ca/search/si/{offset}/kw/{keyword}/prov/{province}/
 */
function buildSearchUrl(keyword: string, province: Province, offset: number): string {
  const encodedKeyword = encodeURIComponent(keyword).replace(/%20/g, '+');
  return `https://www.canada411.ca/search/si/${offset}/kw/${encodedKeyword}/prov/${province}/`;
}

/**
 * Fetch one page of Canada411 results and parse listings.
 * Returns parsed listings and whether there are more pages.
 */
async function fetchPage(
  keyword: string,
  province: Province,
  offset: number
): Promise<{ listings: Canada411Listing[]; hasMore: boolean }> {
  const url = buildSearchUrl(keyword, province, offset);

  try {
    await defaultRateLimiter.waitBeforeRequest(CANADA411_DOMAIN);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-CA,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: 'https://www.canada411.ca/',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(
        `[Canada411] HTTP ${response.status} for keyword="${keyword}" province=${province} offset=${offset}`
      );
      return { listings: [], hasMore: false };
    }

    const html = await response.text();

    // Detect "no results" pages
    if (
      html.includes('No results found') ||
      html.includes('no results') ||
      html.includes('0 results') ||
      html.includes("couldn't find any") ||
      html.includes('Aucun résultat')
    ) {
      return { listings: [], hasMore: false };
    }

    const listings = parseListings(html, province);

    // If we got fewer than PAGE_SIZE results, this is the last page
    const hasMore = listings.length >= PAGE_SIZE;

    return { listings, hasMore };
  } catch (err) {
    console.warn(
      `[Canada411] Fetch error for keyword="${keyword}" province=${province} offset=${offset}:`,
      err
    );
    return { listings: [], hasMore: false };
  }
}

/**
 * Parse business listing elements from a Canada411 search results page.
 *
 * Canada411 wraps each result in a <div class="listing"> or <li> element.
 * The business name appears in an <a> or <h2>/<h3> tag with class "listing-name"
 * or similar. The city appears near the address block.
 *
 * We use a broad regex pass over the HTML to extract name + city pairs
 * from the listing blocks, then clean them up. Two strategies are tried:
 *
 * Strategy 1 — structured listing blocks (class="listing...")
 * Strategy 2 — fallback flat scan for /bus/ href links
 */
function parseListings(html: string, province: Province): Canada411Listing[] {
  const results: Canada411Listing[] = [];
  const seenNames = new Set<string>();

  // Strategy 1: match structured listing divs
  const blockRegex =
    /class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)(?=class="[^"]*listing[^"]*"|<\/ul>|<\/div>\s*<\/div>\s*<\/div>|$)/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];

    // Extract business name
    const namePatterns = [
      /<a[^>]+class="[^"]*listing-name[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
      /<span[^>]+class="[^"]*business-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      /<h[23][^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/i,
      /<strong[^>]*>([\s\S]*?)<\/strong>/i,
      /<a[^>]+href="[^"]*\/bus\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    ];

    let name = '';
    for (const pattern of namePatterns) {
      const m = block.match(pattern);
      if (m) {
        name = extractText(m[1]);
        if (name.length > 2) break;
      }
    }

    if (!name || name.length < 2) continue;
    if (seenNames.has(name.toLowerCase())) continue;

    // Extract city
    const cityPatterns = [
      /<span[^>]+class="[^"]*[Cc]ity[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      /class="[^"]*address[^"]*"[^>]*>[\s\S]*?<\/[^>]+>\s*([A-Z][a-zA-Z\s\-']+),\s*(?:ON|BC|AB)/,
      /([A-Z][a-zA-Z\s\-']{2,30}),\s*(?:ON|BC|AB)/,
    ];

    let city = '';
    for (const pattern of cityPatterns) {
      const m = block.match(pattern);
      if (m) {
        city = extractText(m[1])
          .replace(/,\s*(ON|BC|AB).*$/, '')
          .trim();
        if (city.length > 1) break;
      }
    }

    if (!city) {
      city =
        province === 'ON'
          ? 'Ontario'
          : province === 'BC'
            ? 'British Columbia'
            : 'Alberta';
    }

    // Extract phone (optional)
    const phoneMatch = block.match(/(\(?\d{3}\)?[\s\-]\d{3}[\s\-]\d{4})/);
    const phone = phoneMatch ? phoneMatch[1].trim() : undefined;

    seenNames.add(name.toLowerCase());
    results.push({ name, city, phone });
  }

  // Strategy 2: fallback flat scan for /bus/ href links
  if (results.length === 0) {
    const busLinkRegex = /<a[^>]+href="\/bus\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = busLinkRegex.exec(html)) !== null) {
      const name = extractText(linkMatch[2]);
      if (!name || name.length < 2) continue;
      if (seenNames.has(name.toLowerCase())) continue;

      // Find city in surrounding context
      const surroundStart = Math.max(0, linkMatch.index - 100);
      const surroundEnd = Math.min(html.length, linkMatch.index + linkMatch[0].length + 400);
      const surround = html.slice(surroundStart, surroundEnd);

      const cityMatch = surround.match(/([A-Z][a-zA-Z\s\-']{2,30}),\s*(?:ON|BC|AB)/);
      const city = cityMatch
        ? cityMatch[1].trim()
        : province === 'ON'
          ? 'Ontario'
          : province === 'BC'
            ? 'British Columbia'
            : 'Alberta';

      seenNames.add(name.toLowerCase());
      results.push({ name, city });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Canada411.ca directory scraper.
 * Searches for estate sale, auction, consignment, and antique dealer businesses
 * in Ontario (ON), British Columbia (BC), and Alberta (AB).
 */
export async function runCanada411Scraper(): Promise<void> {
  console.log('[Canada411] Starting Canada411.ca directory scraper');
  console.log(`[Canada411] Provinces: ${PROVINCES.join(', ')}`);
  console.log(`[Canada411] Keywords: ${KEYWORDS.join(', ')}`);

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  // Cross-dedup: avoid re-processing the same business name+city combo across keyword passes
  const seenKey = new Set<string>();

  try {
    for (const province of PROVINCES) {
      for (const keyword of KEYWORDS) {
        console.log(`[Canada411] Searching: keyword="${keyword}" province=${province}`);

        let offset = 0;
        let pageCount = 0;

        while (pageCount < MAX_PAGES) {
          const { listings, hasMore } = await fetchPage(keyword, province, offset);

          console.log(
            `[Canada411] Page ${pageCount + 1} (offset=${offset}): ${listings.length} listings — keyword="${keyword}" province=${province}`
          );

          for (const listing of listings) {
            totalFetched++;

            // Name exclusion filter
            if (nameIsExcluded(listing.name)) {
              console.log(`[Canada411] Excluded: "${listing.name}"`);
              continue;
            }

            // Cross-keyword dedup
            const dedupeKey = `${listing.name.toLowerCase()}:${listing.city.toLowerCase()}:${province}`;
            if (seenKey.has(dedupeKey)) {
              console.log(
                `[Canada411] Dedup skip: "${listing.name}" in ${listing.city}, ${province}`
              );
              continue;
            }
            seenKey.add(dedupeKey);

            totalMatched++;
            const category = mapCategory(listing.name, keyword);

            console.log(
              `[Canada411] Matched: "${listing.name}" — ${listing.city}, ${province} [${category}]`
            );

            try {
              const orgId = await getOrCreateScrapedOrganizer(
                listing.name, // businessName
                'Canada411', // sourceName
                listing.city, // city
                province, // state (province abbreviation)
                undefined, // esnOrgId
                undefined, // googlePlaceId
                undefined, // foursquareVenueId
                undefined, // hereBusinessId
                category, // businessCategory
                undefined, // contactEmail
                listing.phone, // phone
                undefined, // website
                undefined, // lat
                undefined, // lng
                undefined, // isStateLicensed (directory — not a license source)
                undefined, // licenseState
                undefined, // licenseNumber
                'Canada411' // sourceLabel
              );
              if (orgId) totalUpserted++;
            } catch (upsertErr) {
              console.error(`[Canada411] Upsert error for "${listing.name}":`, upsertErr);
            }
          }

          if (!hasMore || listings.length === 0) break;

          offset += PAGE_SIZE;
          pageCount++;
        }

        console.log(
          `[Canada411] Completed keyword="${keyword}" province=${province} — pages=${pageCount + 1}, matched so far=${totalMatched}`
        );
      }
    }

    console.log(
      `[Canada411] Scraper completed: fetched=${totalFetched}, matched=${totalMatched}, upserted=${totalUpserted}`
    );
  } catch (error) {
    console.error('[Canada411] Scraper error:', error);
    throw error;
  }
}
