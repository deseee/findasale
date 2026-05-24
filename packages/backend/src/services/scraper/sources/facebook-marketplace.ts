/**
 * Facebook Marketplace GraphQL scraper adapter
 * Public GraphQL endpoint — no login required
 * ADR-073: Directory Scraper Phase 1
 */

import axios from 'axios';
import { RateLimiter } from '../rateLimiter';
import { ingestScrapedListing, ScrapedItem } from '../index';
import { jitterDelay, getRandomUserAgent, getRandomReferer } from '../userAgents';

const FB_GRAPHQL_ENDPOINT = 'https://www.facebook.com/api/graphql/';
const FB_DOC_ID = '7111939778879383';

interface FBGraphQLVariable {
  count: number;
  params: {
    bqf: {
      callsite: string;
      query: string;
    };
    browse_request_params: {
      commerce_enable_local_pickup: boolean;
      commerce_enable_shipping: boolean;
      commerce_search_and_rp_available: boolean;
      commerce_search_and_rp_condition: null;
      commerce_search_and_rp_ctime_days: null;
      filter_location_latitude: number;
      filter_location_longitude: number;
      filter_price_lower_bound: number;
      filter_price_upper_bound: number;
      filter_radius_km: number;
    };
    custom_request_params: {
      surface: string;
    };
  };
}

interface FBListingNode {
  __typename?: string;
  listing?: {
    id?: string;
    marketplace_listing_title?: string;
    listing_price?: {
      formatted_amount?: string;
    };
    location?: {
      reverse_geocode?: {
        city_page?: {
          display_name?: string;
        };
      };
    };
    is_pending?: boolean;
  };
}

interface FBGraphQLResponse {
  data?: {
    marketplace_search?: {
      feed_units?: {
        edges?: Array<{
          node?: FBListingNode;
        }>;
      };
    };
  };
}

/**
 * Get approximate lat/lng for a metro slug (city-state format)
 * Returns center coordinates for rough geolocation
 */
function getMetroCoordinates(metro: string): { lat: number; lng: number } {
  // Sample metro coordinates (expanded for national coverage)
  const metroCoords: Record<string, { lat: number; lng: number }> = {
    'new-york-ny': { lat: 40.7128, lng: -74.006 },
    'los-angeles-ca': { lat: 34.0522, lng: -118.2437 },
    'chicago-il': { lat: 41.8781, lng: -87.6298 },
    'houston-tx': { lat: 29.7604, lng: -95.3698 },
    'phoenix-az': { lat: 33.4484, lng: -112.074 },
    'philadelphia-pa': { lat: 39.9526, lng: -75.1652 },
    'san-antonio-tx': { lat: 29.4241, lng: -98.4936 },
    'san-diego-ca': { lat: 32.7157, lng: -117.1611 },
    'dallas-tx': { lat: 32.7767, lng: -96.797 },
    'san-jose-ca': { lat: 37.3382, lng: -121.8863 },
    'austin-tx': { lat: 30.2672, lng: -97.7431 },
    'jacksonville-fl': { lat: 30.3322, lng: -81.6557 },
    'fort-worth-tx': { lat: 32.7555, lng: -97.3308 },
    'columbus-oh': { lat: 39.9612, lng: -82.9988 },
    'charlotte-nc': { lat: 35.2271, lng: -80.8431 },
    'san-francisco-ca': { lat: 37.7749, lng: -122.4194 },
    'indianapolis-in': { lat: 39.7684, lng: -86.1581 },
    'seattle-wa': { lat: 47.6062, lng: -122.3321 },
    'denver-co': { lat: 39.7392, lng: -104.9903 },
    'washington-dc': { lat: 38.9072, lng: -77.0369 },
    'boston-ma': { lat: 42.3601, lng: -71.0589 },
    'el-paso-tx': { lat: 31.7619, lng: -106.4850 },
    'nashville-tn': { lat: 36.1627, lng: -86.7816 },
    'detroit-mi': { lat: 42.3314, lng: -83.0458 },
    'oklahoma-city-ok': { lat: 35.4676, lng: -97.5164 },
    'memphis-tn': { lat: 35.1495, lng: -90.0490 },
    'new-orleans-la': { lat: 29.9511, lng: -90.2623 },
    'louisville-ky': { lat: 38.2527, lng: -85.7585 },
    'baltimore-md': { lat: 39.2904, lng: -76.6122 },
    'portland-or': { lat: 45.5152, lng: -122.6784 },
    'las-vegas-nv': { lat: 36.1699, lng: -115.1398 },
    'milwaukee-wi': { lat: 43.0389, lng: -87.9065 },
    'albuquerque-nm': { lat: 35.0844, lng: -106.6504 },
    'tucson-az': { lat: 32.2226, lng: -110.9747 },
    'fresno-ca': { lat: 36.7378, lng: -119.7674 },
    'mesa-az': { lat: 33.4152, lng: -111.8313 },
    'sacramento-ca': { lat: 38.5816, lng: -121.4944 },
    'atlanta-ga': { lat: 33.7490, lng: -84.3880 },
    'kansas-city-mo': { lat: 39.0997, lng: -94.5786 },
    'long-beach-ca': { lat: 33.7701, lng: -118.1937 },
    'raleigh-nc': { lat: 35.7796, lng: -78.6382 },
    'miami-fl': { lat: 25.7617, lng: -80.1918 },
    'grand-rapids-mi': { lat: 42.9633, lng: -85.6749 },
  };

  return metroCoords[metro] || { lat: 39.8283, lng: -98.5795 }; // Default to US center
}

/**
 * Parse Facebook Marketplace GraphQL response for listings
 */
function parseFBListings(response: FBGraphQLResponse, metro: string): ScrapedItem[] {
  const items: ScrapedItem[] = [];

  try {
    const edges = response.data?.marketplace_search?.feed_units?.edges ?? [];

    for (const edge of edges) {
      const listing = edge.node?.listing;

      // Only process MarketplaceFeedListingStoryObject nodes
      if (edge.node?.__typename !== 'MarketplaceFeedListingStoryObject') {
        continue;
      }

      // Skip pending listings
      if (listing?.is_pending) {
        continue;
      }

      // Extract required fields
      const id = listing?.id;
      const title = listing?.marketplace_listing_title;
      const priceStr = listing?.listing_price?.formatted_amount;
      const city = listing?.location?.reverse_geocode?.city_page?.display_name;

      if (!id || !title || !city) {
        continue;
      }

      // Parse price (remove $ and commas, convert to number)
      let price: number | null = null;
      if (priceStr) {
        const cleaned = priceStr.replace(/[$,]/g, '');
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed)) {
          price = parsed;
        }
      }

      items.push({
        title,
        address: '', // FB doesn't provide street address in search results
        city,
        state: metro.split('-').pop()?.toUpperCase() ?? '', // Parse state abbreviation from metro slug (e.g. 'grand-rapids-mi' → 'MI')
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days from now
        sourceUrl: `https://www.facebook.com/marketplace/item/${id}/`,
        sourceName: 'FacebookMarketplace',
        sourceItemId: `fb-${id}`,
        saleType: 'RETAIL',
        description: undefined,
        photoUrls: undefined,
        organizerName: undefined,
        organizerEmail: undefined,
        scrapedMetadata: {
          fbListingId: id,
          price,
        },
      });
    }
  } catch (error) {
    console.error('[FacebookMarketplace] Error parsing GraphQL response:', error);
    throw error;
  }

  return items;
}

/**
 * Scrape Facebook Marketplace for a specific metro area.
 * Runs three search queries: "garage sale", "yard sale", "estate sale"
 */
export async function scrapeFacebookMarketplace(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const domain = 'facebook.com';
  const coords = getMetroCoordinates(metro);

  const queries = ['garage sale', 'yard sale', 'estate sale'];

  try {
    console.log(`[FacebookMarketplace] Starting scrape for ${metro} (lat=${coords.lat}, lng=${coords.lng})`);

    for (const query of queries) {
      await rateLimiter.waitBeforeRequest(domain);

      // Add 2-3 second jitter between requests to avoid rate limiting
      await jitterDelay(2000, 3000);

      try {
        console.log(`[FacebookMarketplace] Searching "${query}" in ${metro}`);

        const variables: FBGraphQLVariable = {
          count: 24,
          params: {
            bqf: {
              callsite: 'COMMERCE_MKTPLACE_WWW',
              query,
            },
            browse_request_params: {
              commerce_enable_local_pickup: true,
              commerce_enable_shipping: true,
              commerce_search_and_rp_available: true,
              commerce_search_and_rp_condition: null,
              commerce_search_and_rp_ctime_days: null,
              filter_location_latitude: coords.lat,
              filter_location_longitude: coords.lng,
              filter_price_lower_bound: 0,
              filter_price_upper_bound: 214748364700,
              filter_radius_km: 40,
            },
            custom_request_params: {
              surface: 'SEARCH',
            },
          },
        };

        const response = await axios.post<FBGraphQLResponse>(
          FB_GRAPHQL_ENDPOINT,
          `doc_id=${FB_DOC_ID}&variables=${JSON.stringify(variables)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'sec-fetch-site': 'same-origin',
              'User-Agent': getRandomUserAgent(),
              'Accept': '*/*',
              'Origin': 'https://www.facebook.com',
              'Referer': getRandomReferer() || 'https://www.facebook.com/marketplace/',
              'Accept-Encoding': 'gzip, deflate, br',
            },
            timeout: 20000,
          }
        );

        if (response.status !== 200) {
          console.warn(
            `[FacebookMarketplace] Search "${query}" returned ${response.status} for ${metro}`
          );
          if (response.status === 429) {
            rateLimiter.recordBackoff(domain, 60);
          }
          continue;
        }

        const items = parseFBListings(response.data, metro);
        console.log(
          `[FacebookMarketplace] Found ${items.length} listings for "${query}" in ${metro}`
        );

        // Ingest each item
        for (const item of items) {
          try {
            const result = await ingestScrapedListing(item, organizerId);
            if (result.status === 'created') stats.created++;
            else if (result.status === 'updated') stats.updated++;
            else if (result.status === 'skipped') stats.skipped++;
            else stats.failed++;
          } catch (ingestError) {
            console.error('[FacebookMarketplace] Ingest error:', ingestError);
            stats.failed++;
          }
        }

        rateLimiter.clearBackoff(domain);
      } catch (queryError) {
        console.error(`[FacebookMarketplace] Query error for "${query}":`, queryError);
        stats.failed++;
        if (axios.isAxiosError(queryError) && queryError.response?.status === 429) {
          rateLimiter.recordBackoff(domain, 60);
        }
      }
    }

    console.log(
      `[FacebookMarketplace] Complete for ${metro} — created ${stats.created}, updated ${stats.updated}, skipped ${stats.skipped}, failed ${stats.failed}`
    );
    return stats;
  } catch (error) {
    console.error(`[FacebookMarketplace] Scrape failed for ${metro}:`, error);
    throw error;
  }
}
