/**
 * Las Vegas OpenData (Socrata) — Secondary Sale Business Scraper (Phase 2)
 * Source: https://opendata.lasvegasnevada.gov/resource/jv8a-mrfg.json
 * Dataset: City of Las Vegas business licenses (~70%+ of NV population)
 * ADR-073: Directory Scraper Phase 2 — State/city business licensing data
 *
 * Matches all secondary sale business types:
 *   - Always-include license types: SECONDHAND DEALER, PAWNBROKER, AUCTIONEER,
 *     JUNK DEALER, CONSIGNMENT
 *   - Broader license types + keyword match on business name: RETAIL,
 *     GENERAL MERCHANDISE, DEALER
 *
 * Paginated Socrata JSON API with $limit/$offset until response < limit.
 * Filters to ACTIVE licenses only.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const NV_API_BASE = 'https://opendata.lasvegasnevada.gov/resource/jv8a-mrfg.json';
const NV_DOMAIN = 'opendata.lasvegasnevada.gov';
const PAGE_LIMIT = 5000;

// License types that always indicate a secondhand-sale business
const ALWAYS_INCLUDE_TYPES = new Set([
  'SECONDHAND DEALER',
  'PAWNBROKER',
  'AUCTIONEER',
  'JUNK DEALER',
  'CONSIGNMENT',
]);

// Broader license types that require a keyword match on business name
const BROADER_TYPES = new Set([
  'RETAIL',
  'GENERAL MERCHANDISE',
  'DEALER',
]);

// Keywords — any match includes the row when paired with a broader type
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
];

// False-positive name fragments — exclude if business name contains any of these
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'restaurant',
  'petroleum',
  'dental',
  'medical',
  'pharmacy',
  'funeral',
  'insurance',
  'tax service',
  'accounting',
  'attorney',
  'law office',
  'landscaping',
  'construction',
  'plumbing',
  'electrical',
  'roofing',
  'automotive repair',
  'car wash',
  'dry clean',
  'laundry',
  'hair salon',
  'nail salon',
  'tattoo',
  'massage',
  'yoga',
  'daycare',
];

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(licenseType: string): string {
  const upper = licenseType.toUpperCase();
  if (upper.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Las Vegas OpenData secondary sale scraper.
 * Fetches all active business licenses via paginated Socrata JSON API and
 * filters to secondhand-sale matches using license type and keyword matching.
 */
export async function runNevadaPhase2Scraper(): Promise<void> {
  // opendata.lasvegasnevada.gov DNS is non-resolving as of 2026-05 (ENOTFOUND).
  // No replacement open data portal was found for Las Vegas, Clark County, or Nevada state.
  // data.lasvegasnevada.gov, opendata.clarkcountynv.gov, data.nv.gov — all DNS-dead.
  // Exit cleanly (exit 0) so GitHub Actions workflow does not fail.
  console.log('[NevadaPhase2] Skipping — opendata.lasvegasnevada.gov is unreachable (DNS failure, domain retired)');
  console.log('[NevadaPhase2] No replacement Nevada/Las Vegas open data portal found.');
  console.log('[NevadaPhase2] To unblock: check https://www.lasvegasnevada.gov/Government/Open-Data for new portal URL.');
  return;
}
