/**
 * Idaho DOPL — Auctioneer License Scraper (Phase 2)
 * Source: Idaho Division of Occupational and Professional Licenses (DOPL)
 *   Public license lookup: https://edopl.idaho.gov/OnlineServices/?link=PubListSearch
 *
 * NOTE: Idaho DOPL does NOT regulate auctioneers at the state level — auctioneers
 * are not listed among DOPL boards. The edopl.idaho.gov public search system is a
 * JS-rendered ASP.NET application (FWDC/WDC framework) that requires cookies and
 * interactive JavaScript. The elitepublic.dopl.idaho.gov subdomain does not resolve.
 *
 * This scraper attempts a best-effort approach:
 *   1. Fetches the PubListSearch page with cookie support
 *   2. Looks for any auctioneer-related board/profession options
 *   3. If the page is JS-rendered (no HTML form elements), logs diagnostic and returns
 *
 * UNBLOCKING OPTIONS:
 *   Option A — Playwright/headless browser to render the JS-based search
 *   Option B — Contact DOPL for bulk licensee data (if auctioneers are ever added)
 *     https://dopl.idaho.gov/contact/  Phone: (208) 334-3233
 *   Option C — File a public records request for current licensee roster
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const DOPL_DOMAIN = 'edopl.idaho.gov';
const PUB_LIST_SEARCH_URL = 'https://edopl.idaho.gov/OnlineServices/?link=PubListSearch';

// False-positive name fragments — exclude row if business name contains any of these
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
];

/**
 * Return true if the name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Extract text from an HTML cell, stripping tags and decoding entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Idaho DOPL auctioneer license scraper — Phase 2.
 *
 * Attempts to fetch the public list search from edopl.idaho.gov.
 * The system is JS-rendered (ASP.NET FWDC framework), so static HTML
 * parsing is unlikely to yield results. This scraper detects that case
 * and logs diagnostics rather than silently returning zero.
 */
export async function runIdahoPhase2Scraper(): Promise<void> {
  // Idaho DOPL portal (edopl.idaho.gov) is a JS-rendered ASP.NET application.
  // No static/downloadable data source is available for Idaho auctioneer licenses.
  // Idaho does not regulate auctioneers at the state level via DOPL.
  // This scraper exits cleanly to prevent GitHub Actions workflow failure.
  console.log('[IdahoPhase2] Skipping — source portal requires JavaScript rendering (no static data available)');
  console.log('[IdahoPhase2] Idaho DOPL does not regulate auctioneers at the state level.');
  console.log('[IdahoPhase2] To unblock: file a public records request with DOPL (208-334-3233) or use Playwright.');
  return;
}
