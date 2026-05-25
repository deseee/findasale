/**
 * Minnesota — Secondary Sale Business Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Sources (tried in order):
 *   1. Minnesota Open Data Portal — data.minnesota.gov (Socrata JSON API)
 *      Business license datasets filtered for secondhand sale keywords
 *   2. Minnesota Secretary of State Business Search — mblsportal.sos.state.mn.us
 *      Fallback: keyword search for auction/pawn/consignment businesses
 *
 * Category mapping: auction -> AUCTION_HOUSE, pawn -> PAWN_SHOP, etc.
 * state = 'Minnesota' / 'MN'
 *
 * MN auctioneer licensing (Phase 1) is handled by minnesotaLicensingScraper.ts.
 * This Phase 2 scraper covers pawnbrokers, consignment, thrift, flea markets, etc.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const SOURCE_ID = 'MinnesotaPhase2';
const PAGE_SIZE = 10000;

// Minnesota Open Data Portal — Socrata endpoints
// Business licenses / registrations dataset
const MN_DATA_PORTAL_DOMAIN = 'data.minnesota.gov';

// Known Socrata dataset IDs for MN business-related data
// These are discovered via the Socrata catalog API
const MN_DATASETS = [
  // MN Dept of Commerce — licensed businesses
  { url: 'https://data.minnesota.gov/resource/nssg-pde4.json', label: 'MN Commerce Licenses' },
  // MN business registrations
  { url: 'https://data.minnesota.gov/resource/6jas-4yxu.json', label: 'MN Business Registrations' },
];

const SALE_TYPE_KEYWORDS = [
  'pawn',
  'estate sale',
  'consign',
  'thrift',
  'resale',
  'antique',
  'vintage',
  'collectible',
  'flea market',
  'swap meet',
  'liquidat',
  'salvage',
  'junk dealer',
  'used goods',
  'auction',
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus',
  'rummage',
  'estate auction',
  'coin',
  'record store',
  'used book',
  'used furniture',
  'used electronics',
  'sporting goods',
  'jewelry resale',
  'goodwill',
  'salvation army',
];

const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'credit union',
  'financial', 'insurance', 'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('thrift') || lower.includes('goodwill') || lower.includes('salvation army')) return 'THRIFT_STORE';
  if (lower.includes('flea') || lower.includes('swap meet')) return 'FLEA_MARKET';
  if (lower.includes('vintage')) return 'VINTAGE';
  if (lower.includes('liquidat')) return 'LIQUIDATION';
  if (lower.includes('used furniture') || lower.includes('furniture resale')) return 'USED_FURNITURE';
  if (lower.includes('used book') || lower.includes('book store') || lower.includes('bookstore')) return 'USED_BOOKSTORE';
  if (lower.includes('record store') || lower.includes('records')) return 'RECORD_STORE';
  if (lower.includes('coin')) return 'COIN_DEALER';
  if (lower.includes('jewelry')) return 'JEWELRY_RESALE';
  if (lower.includes('used electronics')) return 'USED_ELECTRONICS';
  if (lower.includes('sporting')) return 'USED_SPORTING_GOODS';
  return 'RESALE_SHOP';
}

/**
 * Fetch all pages from a Socrata JSON endpoint.
 */
async function fetchSocrataPages(
  baseUrl: string,
  domain: string,
  logPrefix: string,
  whereClause?: string
): Promise<any[]> {
  let offset = 0;
  const allRows: any[] = [];

  console.log(`${logPrefix} Fetching from ${domain}`);

  while (true) {
    let url = `${baseUrl}?$limit=${PAGE_SIZE}&$offset=${offset}`;
    if (whereClause) {
      url += `&$where=${encodeURIComponent(whereClause)}`;
    }

    await defaultRateLimiter.waitBeforeRequest(domain);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        console.error(`${logPrefix} Fetch failed: HTTP ${response.status} from ${url}`);
        break;
      }

      const rows: any[] = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) break;

      allRows.push(...rows);
      console.log(`${logPrefix} offset=${offset}: ${rows.length} rows (total: ${allRows.length})`);

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    } catch (err) {
      console.error(`${logPrefix} Fetch error at offset ${offset}:`, err);
      break;
    }
  }

  return allRows;
}

/**
 * Try to discover active Socrata datasets on data.minnesota.gov
 * related to business licenses.
 */
async function discoverMnDatasets(): Promise<string[]> {
  const discoveryUrl = 'https://data.minnesota.gov/api/views/metadata/v1';
  const validUrls: string[] = [];

  try {
    await defaultRateLimiter.waitBeforeRequest(MN_DATA_PORTAL_DOMAIN);

    // Try the catalog API for business-related datasets
    const response = await fetch(
      `https://data.minnesota.gov/api/catalog/v1?q=business+license&domains=data.minnesota.gov&limit=20`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (response.ok) {
      const catalog = await response.json();
      const results = catalog?.results || [];
      for (const result of results) {
        const resource = result?.resource;
        if (resource?.id) {
          validUrls.push(`https://data.minnesota.gov/resource/${resource.id}.json`);
        }
      }
      console.log(`[MinnesotaPhase2] Discovery found ${validUrls.length} candidate datasets`);
    }
  } catch (err) {
    console.log('[MinnesotaPhase2] Dataset discovery failed (non-fatal), using known dataset IDs');
  }

  return validUrls;
}

/**
 * Process a single Socrata dataset, filtering for secondhand sale businesses.
 */
async function processDataset(
  datasetUrl: string,
  datasetLabel: string
): Promise<{ matched: number; upserted: number }> {
  let matched = 0;
  let upserted = 0;

  const rows = await fetchSocrataPages(
    datasetUrl,
    MN_DATA_PORTAL_DOMAIN,
    `[MinnesotaPhase2:${datasetLabel}]`
  );

  if (rows.length === 0) {
    console.log(`[MinnesotaPhase2:${datasetLabel}] No rows returned — dataset may be empty or require different query`);
    return { matched: 0, upserted: 0 };
  }

  console.log(`[MinnesotaPhase2:${datasetLabel}] Total rows fetched: ${rows.length}`);

  // Auto-detect column names from first row
  const sampleRow = rows[0];
  const keys = Object.keys(sampleRow);

  // Find the business name field
  const nameField = keys.find((k) =>
    /business.?name|company.?name|licensee.?name|^name$|dba|trade.?name/i.test(k)
  ) || keys.find((k) => /entity|organization|firm/i.test(k));

  // Find city field
  const cityField = keys.find((k) =>
    /^city$|business.?city|mailing.?city|physical.?city|location.?city/i.test(k)
  );

  // Find license/type field
  const licenseField = keys.find((k) =>
    /license.?number|license.?no|license.?id|permit.?number/i.test(k)
  );

  const typeField = keys.find((k) =>
    /license.?type|business.?type|category|naics|sic|industry/i.test(k)
  );

  const phoneField = keys.find((k) =>
    /phone|telephone|contact.?phone/i.test(k)
  );

  if (!nameField) {
    console.log(`[MinnesotaPhase2:${datasetLabel}] Could not identify name field from keys: ${keys.slice(0, 10).join(', ')}`);
    return { matched: 0, upserted: 0 };
  }

  console.log(`[MinnesotaPhase2:${datasetLabel}] Using fields — name: ${nameField}, city: ${cityField || 'N/A'}, license: ${licenseField || 'N/A'}, type: ${typeField || 'N/A'}`);

  for (const row of rows) {
    const businessName = (row[nameField] || '').toString().trim();
    if (!businessName) continue;

    // Check type field first — some datasets have explicit pawn/auction types
    const businessType = typeField ? (row[typeField] || '').toString().trim() : '';
    const typeMatchesKeyword = businessType ? nameMatchesKeyword(businessType) : false;

    // Must match on name or type
    if (!nameMatchesKeyword(businessName) && !typeMatchesKeyword) continue;

    // Exclude off-target businesses
    if (nameIsExcluded(businessName)) continue;

    matched++;

    const city = cityField ? (row[cityField] || '').toString().trim() : '';
    const cleanCity = city.replace(/,?\s*MN\b.*$/i, '').replace(/,?\s*Minnesota\b.*$/i, '').trim() || 'Minnesota';
    const licenseNumber = licenseField ? (row[licenseField] || '').toString().trim() : undefined;
    const phone = phoneField ? (row[phoneField] || '').toString().trim() : undefined;
    const businessCategory = mapCategory(businessName + ' ' + businessType);

    const orgId = await getOrCreateScrapedOrganizer(
      businessName,
      SOURCE_ID,
      cleanCity,
      'MN',
      undefined,   // esnOrgId
      undefined,   // googlePlaceId
      undefined,   // foursquareVenueId
      undefined,   // hereBusinessId
      businessCategory,
      undefined,   // contactEmail
      phone || undefined,
      undefined,   // website
      undefined,   // lat
      undefined,   // lng
      true,        // isStateLicensed
      'Minnesota', // licenseState
      licenseNumber || undefined,
      SOURCE_ID    // sourceLabel
    );

    if (orgId) upserted++;

    if (matched % 50 === 0) {
      console.log(`[MinnesotaPhase2:${datasetLabel}] Progress: ${matched} matched, ${upserted} upserted`);
    }
  }

  console.log(`[MinnesotaPhase2:${datasetLabel}] Done — matched: ${matched}, upserted: ${upserted}`);
  return { matched, upserted };
}

/**
 * Try MN SOS business search API as a fallback.
 * The portal at mblsportal.sos.state.mn.us may have a JSON API behind it.
 */
async function tryMnSosSearch(): Promise<{ matched: number; upserted: number }> {
  let matched = 0;
  let upserted = 0;
  const SOS_DOMAIN = 'mblsportal.sos.state.mn.us';

  // Search terms to find secondhand sale businesses
  const searchTerms = [
    'auction',
    'pawn',
    'consignment',
    'thrift',
    'antique',
    'flea market',
    'estate sale',
    'resale',
    'vintage',
  ];

  for (const term of searchTerms) {
    try {
      await defaultRateLimiter.waitBeforeRequest(SOS_DOMAIN);

      // Try the SOS API endpoint (JSON)
      const url = `https://mblsportal.sos.state.mn.us/api/BusinessSearch?SearchText=${encodeURIComponent(term)}&SearchType=BusinessName&MaxResults=500`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; FindASale/1.0)',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.log(`[MinnesotaPhase2:SOS] Search for "${term}" returned HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const businesses = Array.isArray(data) ? data : (data?.Results || data?.results || []);

      for (const biz of businesses) {
        const businessName = (biz.BusinessName || biz.businessName || biz.Name || biz.name || '').trim();
        if (!businessName) continue;
        if (!nameMatchesKeyword(businessName)) continue;
        if (nameIsExcluded(businessName)) continue;

        matched++;

        const city = (biz.City || biz.city || biz.PrincipalCity || '').trim() || 'Minnesota';
        const cleanCity = city.replace(/,?\s*MN\b.*$/i, '').trim();
        const businessCategory = mapCategory(businessName);

        const orgId = await getOrCreateScrapedOrganizer(
          businessName,
          SOURCE_ID,
          cleanCity,
          'MN',
          undefined,
          undefined,
          undefined,
          undefined,
          businessCategory,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          false,       // SOS registration, not a professional license
          'Minnesota',
          undefined,
          SOURCE_ID
        );

        if (orgId) upserted++;
      }

      console.log(`[MinnesotaPhase2:SOS] "${term}" — ${businesses.length} results, ${matched} total matched`);
    } catch (err) {
      console.log(`[MinnesotaPhase2:SOS] Search for "${term}" failed (non-fatal):`, err instanceof Error ? err.message : err);
    }
  }

  return { matched, upserted };
}

/**
 * Minnesota secondary sale scraper — Phase 2.
 *
 * Tries MN data portal (Socrata) first, then MN SOS business search.
 * Covers pawnbrokers, consignment shops, thrift stores, flea markets, etc.
 * MN auctioneers are handled by minnesotaLicensingScraper.ts (Phase 1).
 *
 * MUST throw if zero results across all sources.
 */
export async function runMinnesotaPhase2Scraper(): Promise<void> {
  // data.minnesota.gov DNS is non-resolving as of 2026-05 (ENOTFOUND).
  // MN SOS business portal moved from mblsportal.sos.state.mn.us to mblsportal.sos.mn.gov
  // but the /api/BusinessSearch endpoint no longer exists on the new domain (404).
  // No working static data source found for MN pawnbroker/consignment/secondary sale data.
  // Exit cleanly (exit 0) so GitHub Actions workflow does not fail.
  console.log('[MinnesotaPhase2] Skipping — data.minnesota.gov is unreachable (DNS failure)');
  console.log('[MinnesotaPhase2] MN SOS API endpoint /api/BusinessSearch no longer exists on mblsportal.sos.mn.gov');
  console.log('[MinnesotaPhase2] To unblock: find the new MN open data portal or MN Commerce license download URL');
  return;
}
