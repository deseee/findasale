/**
 * AuctionNinja scraper adapter
 * Source: https://www.auctionninja.com
 * Public estate sale company listings by location.
 * Rate limit strictly — 3-4 second delays.
 * Do NOT store: images, full profile text, pricing data (legal caution).
 * Do NOT use ?keyword=, ?sort= or ?start= query params (robots.txt advisory).
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const AUCTION_NINJA_BASE_URL = 'https://www.auctionninja.com';

interface AuctionNinjaCompany {
  name: string;
  city: string;
  state: string;
  website?: string;
}

/**
 * Convert metro slug to a state abbreviation for directory browsing.
 * "grand-rapids-mi" → "MI"
 */
function metroToState(metro: string): string {
  const parts = metro.split('-');
  return parts[parts.length - 1].toUpperCase();
}

/**
 * Fetch the AuctionNinja company directory for a given state.
 * No query params that violate robots.txt (?keyword=, ?sort=, ?start= are excluded).
 */
async function fetchAuctionNinjaCompanies(
  state: string,
  rateLimiter: RateLimiter
): Promise<AuctionNinjaCompany[]> {
  const domain = new URL(AUCTION_NINJA_BASE_URL).hostname;
  const companies: AuctionNinjaCompany[] = [];

  const pathsToTry = [
    `/company-directory/${state.toLowerCase()}`,
    `/companies/${state.toLowerCase()}`,
    `/estate-sale-companies/${state.toLowerCase()}`,
  ];

  for (const path of pathsToTry) {
    const url = `${AUCTION_NINJA_BASE_URL}${path}`;

    await rateLimiter.waitBeforeRequest(domain);

    let html: string;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(20000),
      });

      if (response.status === 404) continue;

      if (!response.ok) {
        console.warn(`[AuctionNinja] HTTP ${response.status} for ${url}`);
        return companies;
      }

      html = await response.text();
    } catch (err) {
      console.warn(`[AuctionNinja] Fetch failed for ${url}:`, err);
      return companies;
    }

    const $ = cheerio.load(html);

    const cardSelectors = [
      '.company-card',
      '.company-listing',
      '.seller-card',
      '.auction-company',
      '.directory-item',
      'article.company',
      '.search-result',
    ];

    let cards = $();
    for (const sel of cardSelectors) {
      cards = $(sel);
      if (cards.length > 0) break;
    }

    if (cards.length === 0) {
      console.log(`[AuctionNinja] No company cards found at ${url} — site may have blocked or changed markup`);
      return companies;
    }

    cards.each((_i, el) => {
      const card = $(el);

      const name = card.find('h2, h3, h4, .company-name, .name').first().text().trim();
      if (!name) return;

      const locationText =
        card.find('.location, .city-state, .address').first().text().trim() ||
        card.find('p').filter((_i, el) => /,\s*[A-Z]{2}/.test($(el).text())).first().text().trim();

      const locationMatch = locationText.match(/([^,]+),\s*([A-Z]{2})/);
      const city = locationMatch?.[1]?.trim() ?? '';
      const companyState = locationMatch?.[2]?.trim() ?? state;

      if (!city) return;

      // External link only — not AuctionNinja profile link
      const websiteHref = card
        .find('a[href*="http"]')
        .not('[href*="auctionninja.com"]')
        .attr('href');

      companies.push({
        name,
        city,
        state: companyState,
        website: websiteHref ?? undefined,
      });
    });

    if (companies.length > 0) break;
  }

  return companies;
}

/**
 * Main entry point for AuctionNinja scraper.
 * Operates in metro-loop mode — derives state from metro slug.
 */
export async function scrapeAuctionNinja(
  metro: string,
  _organizerId: string,
  rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  const stats: ScrapeStats = {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };

  const state = metroToState(metro);
  console.log(`[AuctionNinja] Scraping metro ${metro} → state ${state}`);

  await rateLimiter.loadRobotsTxt(AUCTION_NINJA_BASE_URL);

  let companies: AuctionNinjaCompany[];
  try {
    companies = await fetchAuctionNinjaCompanies(state, rateLimiter);
  } catch (err) {
    console.error(`[AuctionNinja] Failed to fetch companies for ${metro}:`, err);
    // Graceful return — site may block, that's expected
    return stats;
  }

  stats.itemsFound = companies.length;

  for (const company of companies) {
    try {
      const orgId = await getOrCreateScrapedOrganizer(
        company.name,
        'AuctionNinja',
        company.city,
        company.state,
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'AUCTION_HOUSE',
        undefined, // contactEmail — not stored (legal caution)
        undefined, // phone — not stored (legal caution)
        company.website,
        undefined, // lat
        undefined  // lng
      );

      if (orgId === null) {
        stats.itemsSkipped++;
      } else {
        stats.itemsCreated++;
      }
    } catch (err) {
      console.error(`[AuctionNinja] Failed to ingest ${company.name} (${company.city}, ${company.state}):`, err);
      stats.itemsFailed++;
    }

    // Strict rate limit: 3-4 second delays between requests
    await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 1000));
  }

  console.log(
    `[AuctionNinja] ${metro} complete — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`
  );

  return stats;
}
