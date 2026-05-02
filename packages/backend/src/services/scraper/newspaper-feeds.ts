/**
 * RSS Feed Aggregator — DEPRECATED
 *
 * ADR-077: Classified RSS scraper — national, no auth required
 *
 * DEPRECATED SOURCES:
 * - Oodle: 403 on all GitHub Actions runners (Azure IP block). Deprecated S620.
 * - Eventbrite: /v3/events/search/ requires app approval beyond free API tier. Deprecated S620.
 * - Google News: Returns news ARTICLES about sales, not actual sale listings. Dates are
 *   publish dates of articles (often years old), not sale dates. City/state data is
 *   unreliable (state name stored as city). Deprecated S621 — produced 6000+ junk records.
 */

export interface RssFeed {
  name: string;          // Human-readable name for logging/UI
  url: string;           // RSS feed URL
  city: string;          // City for listings parsed from this feed
  state: string;         // 2-letter state code
  category: 'garage_sale' | 'estate_sale' | 'classifieds' | 'mixed';
}

/**
 * NEWSPAPER_FEEDS: Disabled — all sources deprecated.
 * Next source candidates: EstateSales.NET API, GarageSaleFinder, Craigslist (Puppeteer).
 */
export const NEWSPAPER_FEEDS: RssFeed[] = [];
