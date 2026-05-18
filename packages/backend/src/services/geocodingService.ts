/**
 * Geocoding Service — reusable pure function for address → lat/lng resolution.
 * Extracted from geocodeController.ts to be callable outside of HTTP request context.
 *
 * Strategies (in order):
 *   1. Structured Nominatim query (street + city + state + postalcode)
 *   2. Free-text Nominatim query (full address string)
 *   3. US Census Geocoder (authoritative for US addresses)
 *
 * Rate limiting: Nominatim requires ≤1 request per second.
 * The module-level `lastNominatimRequestTime` variable is shared across all callers
 * in the same process, so concurrent callers self-serialize correctly.
 *
 * For high-volume batch operations (>100 addresses), callers MUST add an additional
 * 1100ms delay between calls to avoid breaching Nominatim ToS.
 */

import axios from 'axios';

export interface GeocodedResult {
  lat: number;
  lng: number;
  displayName: string;
  source: 'nominatim-structured' | 'nominatim-freetext' | 'census';
}

// In-memory cache shared with the geocodeController module instance
const geocodeCache = new Map<string, GeocodedResult & { cachedAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Shared rate-limit state for Nominatim (process-scoped)
let lastNominatimRequestTime = 0;
const MIN_NOMINATIM_INTERVAL_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForNominatimSlot(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimRequestTime;
  if (elapsed < MIN_NOMINATIM_INTERVAL_MS) {
    await sleep(MIN_NOMINATIM_INTERVAL_MS - elapsed);
  }
  lastNominatimRequestTime = Date.now();
}

/**
 * Geocode a US address to lat/lng coordinates.
 * Returns null if all three strategies fail.
 *
 * @param address  Street address line (e.g. "123 Main St")
 * @param city     City name
 * @param state    Two-letter state abbreviation
 * @param zip      ZIP code (optional but improves accuracy)
 */
export async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip?: string | null
): Promise<GeocodedResult | null> {
  if (!address || !city || !state) return null;

  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`;
  const cacheKey = fullAddress.toLowerCase().trim();

  // Return cached result if fresh
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    const { cachedAt: _cachedAt, ...result } = cached;
    return result;
  }

  // Strategy 1: Structured Nominatim query
  await waitForNominatimSlot();

  try {
    const response1 = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        street: address,
        city,
        state,
        postalcode: zip || undefined,
        country: 'us',
        format: 'json',
        limit: 1,
      },
      headers: { 'User-Agent': 'FindA.Sale/1.0 (contact@finda.sale)' },
      timeout: 8000,
    });

    if (response1.data?.length > 0) {
      const result: GeocodedResult = {
        lat: parseFloat(response1.data[0].lat),
        lng: parseFloat(response1.data[0].lon),
        displayName: response1.data[0].display_name,
        source: 'nominatim-structured',
      };
      geocodeCache.set(cacheKey, { ...result, cachedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.error('[geocodingService] Strategy 1 (Nominatim structured) error:', err instanceof Error ? err.message : err);
  }

  // Strategy 2: Free-text Nominatim query
  await waitForNominatimSlot();

  try {
    const response2 = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: fullAddress,
        format: 'json',
        limit: 1,
        countrycodes: 'us',
      },
      headers: { 'User-Agent': 'FindA.Sale/1.0 (contact@finda.sale)' },
      timeout: 8000,
    });

    if (response2.data?.length > 0) {
      const result: GeocodedResult = {
        lat: parseFloat(response2.data[0].lat),
        lng: parseFloat(response2.data[0].lon),
        displayName: response2.data[0].display_name,
        source: 'nominatim-freetext',
      };
      geocodeCache.set(cacheKey, { ...result, cachedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.error('[geocodingService] Strategy 2 (Nominatim free-text) error:', err instanceof Error ? err.message : err);
  }

  // Strategy 3: US Census Geocoder
  try {
    const censusResponse = await axios.get('https://geocoding.geo.census.gov/geocoder/locations/address', {
      params: {
        street: address,
        city,
        state,
        zip: zip || undefined,
        benchmark: 'Public_AR_Current',
        format: 'json',
      },
      timeout: 8000,
    });

    const matches = censusResponse.data?.result?.addressMatches;
    if (matches?.length > 0) {
      const match = matches[0];
      const result: GeocodedResult = {
        lat: match.coordinates.y,
        lng: match.coordinates.x,
        displayName: match.matchedAddress,
        source: 'census',
      };
      geocodeCache.set(cacheKey, { ...result, cachedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.error('[geocodingService] Strategy 3 (Census) error:', err instanceof Error ? err.message : err);
  }

  // All strategies failed
  return null;
}
