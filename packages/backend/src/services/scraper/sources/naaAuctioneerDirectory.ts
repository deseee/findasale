/**
 * NAA Find an Auctioneer directory scraper
 * Source: https://www.auctioneers.org/find-an-auctioneer
 * Public member directory — no ToS prohibition found.
 * Run mode: national-once (iterates all US states, metro param is unused).
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const NAA_BASE_URL = 'https://www.auctioneers.org';
const NAA_DIRECTORY_URL = `${NAA_BASE_URL}/find-an-auctioneer`;

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

interface NAAMember {
  name: string;
  city: string;
  state: string;
  website?: string;
  specialties?: string[];
}

/**
 * Fetch one state page from the NAA directory.
 * Returns parsed member records from the HTML.
 */
async function fetchStateMembers(
  state: string,
  rateLimiter: RateLimiter
): Promise<NAAMember[]> {
  const url = `${NAA_DIRECTORY_URL}?state=${state}`;
  const domain = new URL(NAA_BASE_URL).hostname;

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

    if (!response.ok) {
      console.warn(`[NAADirectory] HTTP ${response.status} for state ${state}`);
      return [];
    }

    html = await response.text();
  } catch (err) {
    console.warn(`[NAADirectory] Fetch failed for state ${state}:`, err);
    return [];
  }

  const members: NAAMember[] = [];
  const $ = cheerio.load(html);

  // NAA directory renders member cards — adapt selectors to actual HTML structure.
  // Try multiple selectors to be resilient to markup changes.
  const cardSelectors = [
    '.member-card',
    '.directory-listing',
    '.search-result-item',
    '.member-result',
    'article.member',
    '.views-row',
    '.field-content .member',
  ];

  let cards = $();
  for (const sel of cardSelectors) {
    cards = $(sel);
    if (cards.length > 0) break;
  }

  if (cards.length === 0) {
    console.log(`[NAADirectory] No member cards found for ${state} — site may have changed markup`);
    return members;
  }

  cards.each((_i, el) => {
    const card = $(el);

    const name = (
      card.find('h2, h3, h4, .member-name, .name, .title').first().text().trim() ||
      card.find('strong').first().text().trim()
    );
    if (!name) return;

    const locationText =
      card.find('.location, .city-state, .member-location, .address').first().text().trim() ||
      card.find('p').filter((_i, el) => {
        const t = $(el).text();
        return /,\s*[A-Z]{2}/.test(t);
      }).first().text().trim();

    const locationMatch = locationText.match(/([^,]+),\s*([A-Z]{2})/);
    const city = locationMatch?.[1]?.trim() ?? '';
    const memberState = locationMatch?.[2]?.trim() ?? state;

    if (!city) return;

    const websiteHref = card.find('a[href*="http"]').not('[href*="auctioneers.org"]').attr('href');

    const specialties: string[] = [];
    card.find('.specialty, .tag, .category, .badge').each((_i, tagEl) => {
      const tag = $(tagEl).text().trim();
      if (tag) specialties.push(tag);
    });

    members.push({ name, city, state: memberState, website: websiteHref ?? undefined, specialties });
  });

  return members;
}

/**
 * Main entry point for NAA directory scrape.
 * metro param is unused — this is a national-once source.
 */
export async function scrapeNAADirectory(
  _metro: string,
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

  console.log('[NAADirectory] Starting national auctioneer directory scrape');

  await rateLimiter.loadRobotsTxt(NAA_BASE_URL);

  for (const state of US_STATES) {
    console.log(`[NAADirectory] Scraping state: ${state}`);

    let members: NAAMember[];
    try {
      members = await fetchStateMembers(state, rateLimiter);
    } catch (err) {
      console.error(`[NAADirectory] Failed to fetch state ${state}:`, err);
      stats.itemsFailed++;
      continue;
    }

    stats.itemsFound += members.length;

    for (const member of members) {
      try {
        const orgId = await getOrCreateScrapedOrganizer(
          member.name,
          'NAAFindAnAuctioneer',
          member.city,
          member.state,
          undefined, // esnOrgId
          undefined, // googlePlaceId
          undefined, // foursquareVenueId
          undefined, // hereBusinessId
          'AUCTION_HOUSE',
          undefined, // contactEmail
          undefined, // phone
          member.website,
          undefined, // lat
          undefined  // lng
        );

        if (orgId === null) {
          stats.itemsSkipped++;
        } else {
          stats.itemsCreated++;
        }
      } catch (err) {
        console.error(`[NAADirectory] Failed to ingest ${member.name} (${member.city}, ${member.state}):`, err);
        stats.itemsFailed++;
      }

      // Respectful crawl rate: 2-3 second delay between member ingests
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 1000));
    }

    // Additional delay between states
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log(
    `[NAADirectory] Complete — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`
  );

  return stats;
}
