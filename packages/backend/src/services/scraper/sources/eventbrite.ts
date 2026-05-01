/**
 * Eventbrite public events scraper adapter
 * Scrapes secondary-sale events from Eventbrite using the official API
 * ADR-073: Directory Scraper Phase 1 — API-based refactor
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';
import { CoordinateCenter } from '../national-grid';

const EVENTBRITE_API_BASE = 'https://www.eventbriteapi.com/v3/events/search/';

/**
 * Map Eventbrite event title/description to FindA.Sale sale type
 */
function inferSaleTypeFromTitle(title: string): string {
  const lower = title.toLowerCase();

  if (lower.includes('auction')) {
    return 'AUCTION';
  }
  if (lower.includes('estate')) {
    return 'ESTATE';
  }
  if (lower.includes('yard') || lower.includes('garage') || lower.includes('moving')) {
    return 'YARD';
  }

  return 'ESTATE'; // default
}

/**
 * Eventbrite API response type for event
 */
interface EventbriteEvent {
  id: string;
  name: { text: string };
  url: string;
  start: { local: string; timezone: string };
  end: { local: string };
  organizer?: { name: string };
  venue?: {
    address?: {
      address_1?: string;
      city?: string;
      region?: string;      // state abbreviation
      postal_code?: string;
    };
  };
}

/**
 * Eventbrite API response wrapper
 */
interface EventbriteResponse {
  events: EventbriteEvent[];
  pagination: { page_count: number; page_number: number };
}

/**
 * Scrape Eventbrite API for secondary-sale events within a coordinate center.
 * Returns ScrapedItem array without ingesting — used by GitHub Actions workflow.
 */
export async function scrapeEventbriteItems(
  center: CoordinateCenter,
  rateLimiter: RateLimiter,
  apiKey: string
): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const seenIds = new Set<string>(); // Dedup within this center across all queries
  const searchQueries = ['estate sale', 'yard sale', 'garage sale', 'estate auction', 'moving sale'];

  try {
    const { lat, lng, label } = center;
    console.log(
      `[Eventbrite] Scraping ${label}: lat=${lat}, lng=${lng} — searching ${searchQueries.length} queries`
    );

    const now = new Date();
    const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const rangeStart = now.toISOString();
    const rangeEnd = sixtyDaysOut.toISOString();

    // Search for each query term
    for (const query of searchQueries) {
      console.log(`[Eventbrite] Query: "${query}" in ${label}`);

      let pageNum = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const domain = 'www.eventbriteapi.com';
        await rateLimiter.waitBeforeRequest(domain);

        // Build request URL with query params
        const params = new URLSearchParams({
          token: apiKey,
          q: query,
          'location.latitude': String(lat),
          'location.longitude': String(lng),
          'location.within': '200mi',
          'start_date.range_start': rangeStart,
          'start_date.range_end': rangeEnd,
          expand: 'venue,organizer',
          page: String(pageNum),
        });

        const url = EVENTBRITE_API_BASE + '?' + params.toString();

        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': getRandomUserAgent(),
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(30000),
          });

          if (!response.ok) {
            if (response.status === 429) {
              const retryAfter = response.headers.get('Retry-After');
              rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
            }
            console.warn(
              `[Eventbrite] API returned ${response.status} for "${query}" in ${label}, page ${pageNum}`
            );
            break; // Stop pagination for this query
          }

          const data = (await response.json()) as EventbriteResponse;
          rateLimiter.clearBackoff(domain);

          if (!data.events || data.events.length === 0) {
            console.log(
              `[Eventbrite] No events for "${query}" in ${label}, page ${pageNum}`
            );
            hasMorePages = false;
            break;
          }

          // Parse each event to ScrapedItem
          for (const event of data.events) {
            if (seenIds.has(event.id)) continue;

            const item = parseEventToScrapedItem(event, query);
            if (item) {
              seenIds.add(event.id);
              items.push(item);
            }
          }

          // Check pagination
          const { page_count, page_number } = data.pagination;
          if (page_number >= page_count || page_number >= 3) {
            // Cap at page 3 to avoid excessive API calls
            hasMorePages = false;
          } else {
            pageNum++;
            // Jitter between pages to avoid detection
            await jitterDelay(300, 700);
          }
        } catch (error) {
          console.error(
            `[Eventbrite] Request failed for "${query}" in ${label}, page ${pageNum}:`,
            error
          );
          break;
        }
      }
    }

    console.log(`[Eventbrite] Collected ${items.length} total items for ${label}`);
    return items;
  } catch (error) {
    console.error(`[Eventbrite] Scrape failed for ${center.label}:`, error);
    throw error;
  }
}

/**
 * Convert a single Eventbrite event to ScrapedItem
 */
function parseEventToScrapedItem(event: EventbriteEvent, searchQuery: string): ScrapedItem | null {
  try {
    // Validate required fields
    if (!event.name?.text) {
      return null;
    }

    // Venue/address validation — skip if missing
    const venue = event.venue?.address;
    const city = venue?.city;
    const state = venue?.region;

    if (!city) {
      // City is required; skip event
      return null;
    }

    // Parse dates
    const startDate = event.start?.local ? new Date(event.start.local) : null;
    const endDate = event.end?.local ? new Date(event.end.local) : null;

    if (!startDate || !endDate) {
      return null;
    }

    // Eventbrite URL is the source
    const sourceUrl = event.url;

    return {
      title: event.name.text,
      address: venue?.address_1 ?? '',
      city,
      state: state ?? '',
      zip: venue?.postal_code ?? '', // Eventbrite includes real ZIP when available
      startDate,
      endDate,
      description: event.organizer?.name
        ? `Event by ${event.organizer.name}`
        : 'Eventbrite listing',
      organizerName: event.organizer?.name,
      organizerEmail: undefined,
      photoUrls: [],
      saleType: inferSaleTypeFromTitle(event.name.text),
      sourceUrl,
      sourceName: 'Eventbrite',
      sourceItemId: `eventbrite:${event.id}`,
      scrapedMetadata: {
        searchQuery,
        timezone: event.start.timezone,
      },
    };
  } catch (error) {
    console.error(`[Eventbrite] Failed to parse event ${event.id}:`, error);
    return null;
  }
}
