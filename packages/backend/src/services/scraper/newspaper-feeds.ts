/**
 * RSS Feed Aggregator — Google News only
 *
 * ADR-077: Classified RSS scraper — national, no auth required
 *
 * DEPRECATED SOURCES:
 * - Oodle: 403 on all GitHub Actions runners (Azure IP block). Deprecated S620.
 * - Eventbrite: /v3/events/search/ requires app approval beyond free API tier. Deprecated S620.
 */

export interface RssFeed {
  name: string;          // Human-readable name for logging/UI
  url: string;           // RSS feed URL
  city: string;          // City for listings parsed from this feed
  state: string;         // 2-letter state code
  category: 'garage_sale' | 'estate_sale' | 'classifieds' | 'mixed';
}

/**
 * NEWSPAPER_FEEDS: 8 Google News RSS feeds (national + top states)
 * Google News works from GitHub Actions. No auth required.
 */
export const NEWSPAPER_FEEDS: RssFeed[] = [
  {
    name: 'Google News - Estate Sales (National)',
    url: 'https://news.google.com/rss/search?q=estate+sale&hl=en-US&gl=US&ceid=US:en',
    city: 'National',
    state: 'US',
    category: 'mixed',
  },
  {
    name: 'Google News - Garage Sales (National)',
    url: 'https://news.google.com/rss/search?q=garage+sale&hl=en-US&gl=US&ceid=US:en',
    city: 'National',
    state: 'US',
    category: 'mixed',
  },
  {
    name: 'Google News - Yard Sales (National)',
    url: 'https://news.google.com/rss/search?q=yard+sale&hl=en-US&gl=US&ceid=US:en',
    city: 'National',
    state: 'US',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Auction (National)',
    url: 'https://news.google.com/rss/search?q=estate+auction&hl=en-US&gl=US&ceid=US:en',
    city: 'National',
    state: 'US',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Sales (Michigan)',
    url: 'https://news.google.com/rss/search?q=estate+sale+Michigan&hl=en-US&gl=US&ceid=US:en',
    city: 'Michigan',
    state: 'MI',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Sales (Ohio)',
    url: 'https://news.google.com/rss/search?q=estate+sale+Ohio&hl=en-US&gl=US&ceid=US:en',
    city: 'Ohio',
    state: 'OH',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Sales (Texas)',
    url: 'https://news.google.com/rss/search?q=estate+sale+Texas&hl=en-US&gl=US&ceid=US:en',
    city: 'Texas',
    state: 'TX',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Sales (California)',
    url: 'https://news.google.com/rss/search?q=estate+sale+California&hl=en-US&gl=US&ceid=US:en',
    city: 'California',
    state: 'CA',
    category: 'mixed',
  },
];
