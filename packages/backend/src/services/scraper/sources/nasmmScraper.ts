/**
 * NASMM.org Senior Move Manager Directory Scraper
 *
 * Source: https://www.nasmm.org/find-a-move-manager/list.cfm?state=XX&country=US
 * Organisation: National Association of Senior Move Managers (~900 US members)
 *
 * robots.txt compliance:
 *   User-agent: *
 *   Crawl-Delay: 10          ← ENFORCED internally (10–12 s between state requests)
 *   Disallow: /admin/
 *   Disallow: /tasks/
 *   Disallow: /requirements/
 *   /find-a-move-manager/ is NOT disallowed — scraping is permitted.
 *
 * HTML structure:
 *   - Server-rendered ColdFusion (.cfm) pages — all results returned in one HTML response.
 *   - Client-side pajinate JS paginates them visually (10/page) but ALL records are in
 *     the raw HTML. No server-side pagination or AJAX needed.
 *   - Each member = <li class="smm-result-card"> with sub-divs for company, location,
 *     phone, email, and website.
 *
 * Relevance: Senior move managers frequently organise or refer estate sales — directly
 * relevant to FindA.Sale organiser discovery.
 *
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const NASMM_BASE_URL = 'https://www.nasmm.org';
const SOURCE_NAME = 'NASMM';

// robots.txt mandates Crawl-Delay: 10 — enforce 10–12 s between state page requests
const CRAWL_DELAY_MS = 10000;
const CRAWL_DELAY_JITTER_MS = 2000;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL',
  'GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
  'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

interface NASMMEntry {
  companyName: string;
  city: string;
  state: string;
  phone?: string;
  email?: string;
  website?: string;
}

/**
 * Enforce the robots.txt Crawl-Delay: 10 between state page fetches.
 * Adds a small random jitter to avoid perfectly regular request timing.
 */
function crawlDelay(): Promise<void> {
  const ms = CRAWL_DELAY_MS + Math.random() * CRAWL_DELAY_JITTER_MS;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a single state page. Returns raw HTML or null on failure.
 */
async function fetchStatePage(state: string): Promise<string | null> {
  const url = `${NASMM_BASE_URL}/find-a-move-manager/list.cfm?state=${state}&country=US`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[NASMM] HTTP ${response.status} for state=${state}`);
      return null;
    }

    return await response.text();
  } catch (err) {
    console.warn(
      `[NASMM] Fetch error for state=${state}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Parse all member cards from a state HTML page.
 *
 * Card structure (server-rendered, all results present — no AJAX needed):
 *
 *   <li class="smm-result-card [is-accredited]">
 *     <div class="smm-rc-body">
 *       <div class="smm-rc-title-row">
 *         <div class="smm-rc-company">Company Name</div>
 *       </div>
 *       <div class="smm-rc-details">
 *         <div class="smm-rc-col">
 *           <div class="smm-rc-detail-row">
 *             <span class="smm-rc-label">Location:</span> City, ST 12345
 *           </div>
 *           <div class="smm-rc-detail-row">
 *             <span class="smm-rc-label">Phone:</span> 555-123-4567
 *           </div>
 *           <div class="smm-rc-detail-row">
 *             <span class="smm-rc-label">Email:</span>
 *             <a href="mailto:name@example.com">name@example.com</a>
 *           </div>
 *         </div>
 *         <div class="smm-rc-col">
 *           <div class="smm-rc-detail-row">
 *             <span class="smm-rc-label">Website:</span>
 *             <a href="http://example.com">http://example.com</a>
 *           </div>
 *         </div>
 *       </div>
 *     </div>
 *   </li>
 */
function parseStatePage(html: string, stateAbbr: string): NASMMEntry[] {
  const $ = cheerio.load(html);
  const entries: NASMMEntry[] = [];

  $('li.smm-result-card').each((_i, el) => {
    const card = $(el);

    // Company name
    const companyName = card.find('.smm-rc-company').first().text().trim();
    if (!companyName) return;

    let city = '';
    let state = stateAbbr;
    let phone: string | undefined;
    let email: string | undefined;
    let website: string | undefined;

    card.find('.smm-rc-detail-row').each((_j, row) => {
      const labelEl = $(row).find('.smm-rc-label');
      const label = labelEl.text().trim().replace(/:$/, '').toLowerCase();

      // Value = full row text minus the label text
      const rowText = $(row).text().trim();
      const labelText = labelEl.text().trim();
      const value = rowText.slice(labelText.length).trim();

      switch (label) {
        case 'location': {
          // Format: "City, ST 12345" — extract city and confirm state
          const locMatch = value.match(/^(.+?),\s*([A-Z]{2})\b/);
          if (locMatch) {
            city = locMatch[1].trim();
            state = locMatch[2]; // use parsed state (should match stateAbbr)
          } else {
            city = value.split(',')[0].trim();
          }
          break;
        }
        case 'phone':
          // Only take the first phone value (ignore 'alt phone')
          if (!phone && value) phone = value;
          break;
        case 'email': {
          const emailHref = $(row).find('a[href^="mailto:"]').attr('href');
          if (emailHref) {
            const addr = emailHref.replace(/^mailto:/i, '').trim();
            if (addr) email = addr;
          }
          break;
        }
        case 'website': {
          const siteHref = $(row).find('a').attr('href');
          if (siteHref && !siteHref.startsWith('mailto:')) {
            const trimmed = siteHref.trim();
            if (trimmed) website = trimmed;
          }
          break;
        }
        // Intentionally ignored: 'alt phone', 'service area', 'member since', 'certified'
      }
    });

    entries.push({ companyName, city, state, phone, email, website });
  });

  return entries;
}

/**
 * Main NASMM scraper entry point.
 *
 * Iterates all 50 US states + DC, fetches the NASMM member directory page for each,
 * parses all member cards (all results are server-rendered in a single HTML response),
 * and upserts each via getOrCreateScrapedOrganizer.
 *
 * robots.txt Crawl-Delay: 10 is enforced with 10–12 s between every state page request.
 *
 * @param _metro       Unused — national-once mode iterates all states internally
 * @param _organizerId Unused
 * @param rateLimiter  Shared rate limiter — waitBeforeRequest called per state fetch
 */
export async function scrapeNASMM(
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

  const domain = 'www.nasmm.org';
  await rateLimiter.loadRobotsTxt(NASMM_BASE_URL);

  console.log(`[NASMM] Starting national scrape — ${US_STATES.length} states`);

  for (let i = 0; i < US_STATES.length; i++) {
    const stateAbbr = US_STATES[i];

    // Combined rate control: shared limiter + robots.txt Crawl-Delay: 10
    await rateLimiter.waitBeforeRequest(domain);
    // Enforce robots.txt Crawl-Delay: 10 between state pages (mandatory — not delegated to rateLimiter)
    if (i > 0) {
      await crawlDelay();
    }

    const html = await fetchStatePage(stateAbbr);
    if (!html) {
      console.warn(`[NASMM] No HTML for state=${stateAbbr} — skipping`);
      stats.itemsFailed++;
      continue;
    }

    const entries = parseStatePage(html, stateAbbr);
    console.log(`[NASMM] ${stateAbbr}: ${entries.length} members found`);
    stats.itemsFound += entries.length;

    for (const entry of entries) {
      try {
        const orgId = await getOrCreateScrapedOrganizer(
          entry.companyName,
          SOURCE_NAME,
          entry.city,
          entry.state,
          undefined,    // esnOrgId
          undefined,    // googlePlaceId
          undefined,    // foursquareVenueId
          undefined,    // hereBusinessId
          'ESTATE_SALE_CO',
          entry.email,
          entry.phone,
          entry.website
        );

        if (orgId) {
          stats.itemsCreated++;
          console.log(
            `[NASMM] + ${entry.companyName} — ${entry.city}, ${entry.state} → ${orgId}`
          );
        } else {
          stats.itemsSkipped++;
        }
      } catch (err) {
        stats.itemsFailed++;
        console.error(
          `[NASMM] Error ingesting "${entry.companyName}" (${entry.city}, ${entry.state}):`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  console.log(
    `[NASMM] Complete — found: ${stats.itemsFound}, created/merged: ${stats.itemsCreated}, skipped: ${stats.itemsSkipped}, failed: ${stats.itemsFailed}`
  );

  if (stats.itemsFound === 0) {
    throw new Error('[NASMM] Completed with zero results — site may be unavailable or blocking');
  }

  return stats;
}
