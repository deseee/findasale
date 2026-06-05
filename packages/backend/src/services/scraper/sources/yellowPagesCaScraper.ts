/**
 * YellowPages.ca — Canadian Secondary Sale Business Directory Scraper
 * Replaces the dead Canada411 scraper (Canada411 /search/si/ route permanently removed).
 *
 * YellowPages.ca serves structured JSON-LD data on search result pages.
 * Search URL pattern:
 *   https://www.yellowpages.ca/search/si/{page}/{encoded-keyword}/{province}/
 *
 * Pagination: page-based (1, 2, 3...). Stops when a page returns 0 results.
 *
 * Data extracted from <script type="application/ld+json"> blocks:
 *   @type: LocalBusiness — name, address, telephone, url
 *
 * Canadian orgs are gated by OUTREACH_CANADA_ENABLED at the outreach layer.
 * Scraping always runs — data collection is separate from outreach eligibility.
 *
 * ADR-073: Directory Scraper — YellowPages.ca (replaces Canada411)
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const YP_BASE = 'https://www.yellowpages.ca';
const MAX_PAGES = 30; // safety ceiling per keyword+province combo

// All 10 Canadian provinces
const PROVINCES = ['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'PE', 'NL'] as const;
type Province = (typeof PROVINCES)[number];

const PROVINCE_NAMES: Record<Province, string> = {
  ON: 'Ontario',
  BC: 'British Columbia',
  AB: 'Alberta',
  QC: 'Quebec',
  MB: 'Manitoba',
  SK: 'Saskatchewan',
  NS: 'Nova Scotia',
  NB: 'New Brunswick',
  PE: 'Prince Edward Island',
  NL: 'Newfoundland and Labrador',
};

// Reverse lookup: full province name (uppercased) → province code
const PROVINCE_NAME_TO_CODE: Record<string, Province> = Object.fromEntries(
  (Object.entries(PROVINCE_NAMES) as [Province, string][]).map(([code, name]) => [
    name.toUpperCase(),
    code,
  ])
) as Record<string, Province>;

const KEYWORDS = [
  'estate sale',
  'auction house',
  'estate auction',
  'consignment',
  'antique dealer',
  'yard sale organizer',
] as const;

// Name fragments that indicate false positives
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
  return EXCLUDE_FRAGMENTS.some((f) => lower.includes(f));
}

function mapCategory(name: string, keyword: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('auction')) return 'auctioneer';
  if (lower.includes('estate sale')) return 'estate_sale';
  if (lower.includes('consign')) return 'consignment';
  if (lower.includes('antique')) return 'antique_dealer';
  if (keyword.includes('auction')) return 'auctioneer';
  if (keyword.includes('estate')) return 'estate_sale';
  if (keyword.includes('consign')) return 'consignment';
  return 'secondary_sale';
}

interface YPListing {
  name: string;
  city: string;
  province: Province;
  phone?: string;
  website?: string;
  streetAddress?: string;
  postalCode?: string;
}

function extractJsonLd(html: string): YPListing[] {
  const results: YPListing[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      const items: unknown[] = Array.isArray(json)
        ? json
        : json['@graph']
          ? json['@graph']
          : [json];

      // Flatten ItemList → itemListElement[].item into the items array
      const flattened: unknown[] = [];
      for (const raw of items) {
        const entry = raw as Record<string, unknown>;
        if (!entry || typeof entry !== 'object') continue;
        const entryType = entry['@type'];
        if (
          entryType === 'ItemList' ||
          (Array.isArray(entryType) && entryType.includes('ItemList'))
        ) {
          const elements = entry['itemListElement'];
          if (Array.isArray(elements)) {
            for (const el of elements) {
              const listItem = el as Record<string, unknown>;
              if (listItem?.['item'] && typeof listItem['item'] === 'object') {
                flattened.push(listItem['item']);
              }
            }
          }
        } else {
          flattened.push(entry);
        }
      }

      for (const item of flattened) {
        const obj = item as Record<string, unknown>;
        if (!obj || typeof obj !== 'object') continue;

        const type = obj['@type'];
        const isLocalBusiness =
          type === 'LocalBusiness' ||
          (Array.isArray(type) && type.includes('LocalBusiness'));
        if (!isLocalBusiness) continue;

        const name = typeof obj['name'] === 'string' ? obj['name'].trim() : '';
        if (!name) continue;

        const addr = obj['address'] as Record<string, unknown> | undefined;
        const city =
          typeof addr?.['addressLocality'] === 'string'
            ? (addr['addressLocality'] as string).trim()
            : '';
        const region =
          typeof addr?.['addressRegion'] === 'string'
            ? (addr['addressRegion'] as string).trim().toUpperCase()
            : '';
        const street =
          typeof addr?.['streetAddress'] === 'string'
            ? (addr['streetAddress'] as string).trim()
            : undefined;
        const postal =
          typeof addr?.['postalCode'] === 'string'
            ? (addr['postalCode'] as string).trim()
            : undefined;
        const phone =
          typeof obj['telephone'] === 'string' ? (obj['telephone'] as string).trim() : undefined;
        const website =
          typeof obj['url'] === 'string' ? (obj['url'] as string).trim() : undefined;

        if (!city) continue;

        // Normalize province: YP may return full name ("Ontario") or code ("ON")
        const normalizedRegion = PROVINCE_NAME_TO_CODE[region] ?? region;
        const prov = normalizedRegion as Province;
        if (!PROVINCES.includes(prov)) continue;

        results.push({ name, city, province: prov, phone, website, streetAddress: street, postalCode: postal });
      }
    } catch {
      // Malformed JSON-LD block — skip
    }
  }

  return results;
}

async function fetchPage(
  keyword: string,
  province: Province,
  page: number
): Promise<{ listings: YPListing[]; hasMore: boolean }> {
  const url = `${YP_BASE}/search/si/${page}/${encodeURIComponent(keyword)}/${province}/`;

  await defaultRateLimiter.waitBeforeRequest('www.yellowpages.ca');

  const res = await fetch(url, {
    headers: {
      'User-Agent': getRandomUserAgent(),
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-CA,en;q=0.9',
    },
  });

  if (!res.ok) {
    if (res.status === 404) return { listings: [], hasMore: false };
    throw new Error(`YellowPagesCA HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const listings = extractJsonLd(html);

  // YP paginates — if we got results it's worth checking the next page
  const hasMore = listings.length > 0;
  return { listings, hasMore };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runYellowPagesCaScraper(): Promise<{ fetched: number; matched: number; upserted: number }> {
  console.log('[YellowPagesCA] Starting YellowPages.ca directory scraper');
  console.log(`[YellowPagesCA] Provinces: ${PROVINCES.join(', ')}`);
  console.log(`[YellowPagesCA] Keywords: ${KEYWORDS.join(', ')}`);

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  const seenKey = new Set<string>();

  try {
    for (const province of PROVINCES) {
      for (const keyword of KEYWORDS) {
        console.log(`[YellowPagesCA] Searching: keyword="${keyword}" province=${province}`);

        let page = 1;

        while (page <= MAX_PAGES) {
          const { listings, hasMore } = await fetchPage(keyword, province, page);

          console.log(
            `[YellowPagesCA] Page ${page}: ${listings.length} listings — keyword="${keyword}" province=${province}`
          );

          for (const listing of listings) {
            totalFetched++;

            if (nameIsExcluded(listing.name)) {
              console.log(`[YellowPagesCA] Excluded: "${listing.name}"`);
              continue;
            }

            const dedupeKey = `${listing.name.toLowerCase()}:${listing.city.toLowerCase()}:${listing.province}`;
            if (seenKey.has(dedupeKey)) continue;
            seenKey.add(dedupeKey);

            totalMatched++;
            const category = mapCategory(listing.name, keyword);
            const provinceName = PROVINCE_NAMES[listing.province];

            console.log(
              `[YellowPagesCA] Matched: "${listing.name}" — ${listing.city}, ${listing.province} [${category}]`
            );

            try {
              const orgId = await getOrCreateScrapedOrganizer(
                listing.name,
                'YellowPagesCA',
                listing.city,
                provinceName,
                undefined,
                undefined,
                undefined,
                undefined,
                category,
                undefined,
                listing.phone,
                listing.website,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                'YellowPages.ca'
              );
              if (orgId) totalUpserted++;
            } catch (upsertErr) {
              console.error(`[YellowPagesCA] Upsert error for "${listing.name}":`, upsertErr);
            }
          }

          if (!hasMore) break;
          page++;
        }

        console.log(
          `[YellowPagesCA] Completed keyword="${keyword}" province=${province} — pages=${page}, matched so far=${totalMatched}`
        );

        // Pause between keyword+province combos — avoids triggering rate limiting
        // on successive searches against the same YP.ca endpoint
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(
      `[YellowPagesCA] Scraper completed: fetched=${totalFetched}, matched=${totalMatched}, upserted=${totalUpserted}`
    );

    if (totalFetched === 0) {
      throw new Error(
        '[YellowPagesCA] Zero results across all provinces and keywords. ' +
          'YellowPages.ca may have changed its page structure or is blocking requests.'
      );
    }

    return { fetched: totalFetched, matched: totalMatched, upserted: totalUpserted };
  } catch (error) {
    console.error('[YellowPagesCA] Scraper error:', error);
    throw error;
  }
}
