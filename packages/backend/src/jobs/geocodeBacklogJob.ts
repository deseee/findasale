/**
 * Geocode Backlog Cron — Automatically geocode published sales with missing lat/lng
 *
 * Runs every 2 hours. Fetches up to 200 PUBLISHED sales with lat IS NULL and
 * attempts geocoding via Nominatim (OSM) → US Census fallback strategy.
 *
 * Nominatim ToS: 1 request/sec max. This job enforces 1,100ms between requests.
 * Google Maps API is intentionally NOT used (billing lockdown — see project docs).
 *
 * Wired in: packages/backend/src/index.ts alongside scheduleGeocodingAuditCron
 */

import cron from 'node-cron';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';

const BATCH_SIZE = 200;
const MIN_REQUEST_INTERVAL_MS = 1100; // Nominatim requires 1 req/sec; 1,100ms is safe

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Module-level rate limit tracker shared within this job's run
let lastNominatimRequestTime = 0;

/**
 * Rate-limit-aware Nominatim GET with automatic delay enforcement.
 */
async function nominatimGet(params: Record<string, string | undefined>): Promise<any[]> {
  const now = Date.now();
  const elapsed = now - lastNominatimRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastNominatimRequestTime = Date.now();

  const response = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: {
      ...params,
      format: 'json',
      limit: 1,
      countrycodes: 'us',
    },
    headers: {
      'User-Agent': 'FindA.Sale/1.0 (contact@finda.sale)',
    },
    timeout: 8000,
  });

  return Array.isArray(response.data) ? response.data : [];
}

interface GeoResult {
  lat: number;
  lng: number;
}

/**
 * Geocode a single address using the same 3-strategy chain as geocodeController.ts:
 *   Strategy 1: Nominatim structured query (street + city + state + zip)
 *   Strategy 2: Nominatim free-text fallback
 *   Strategy 3: US Census Geocoder (authoritative for US addresses)
 *
 * Returns null if all strategies fail.
 */
async function geocodeSaleAddress(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<GeoResult | null> {
  // Strategy 1: Structured Nominatim query
  try {
    const results = await nominatimGet({
      street: address || undefined,
      city,
      state,
      postalcode: zip || undefined,
      country: 'us',
    });

    if (results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    }
  } catch (err) {
    console.warn('[geocodeBacklog] Strategy 1 (Nominatim structured) error:', (err as Error).message);
  }

  // Strategy 2: Nominatim free-text fallback
  const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');
  try {
    const results = await nominatimGet({
      q: fullAddress,
    });

    if (results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    }
  } catch (err) {
    console.warn('[geocodeBacklog] Strategy 2 (Nominatim free-text) error:', (err as Error).message);
  }

  // Strategy 3: US Census Geocoder
  try {
    const censusResponse = await axios.get(
      'https://geocoding.geo.census.gov/geocoder/locations/address',
      {
        params: {
          street: address || undefined,
          city,
          state,
          zip: zip || undefined,
          benchmark: 'Public_AR_Current',
          format: 'json',
        },
        timeout: 8000,
      }
    );

    const matches = censusResponse.data?.result?.addressMatches;
    if (Array.isArray(matches) && matches.length > 0) {
      const match = matches[0];
      return {
        lat: match.coordinates.y,
        lng: match.coordinates.x,
      };
    }
  } catch (err) {
    console.warn('[geocodeBacklog] Strategy 3 (US Census) error:', (err as Error).message);
  }

  return null;
}

/**
 * Main backlog geocoding function.
 * Fetches up to BATCH_SIZE PUBLISHED sales with null lat, geocodes each,
 * and writes lat/lng back via Prisma.
 */
async function runGeocodeBacklog(): Promise<void> {
  // Reset rate limit clock at the start of each run
  lastNominatimRequestTime = 0;

  // Fetch sales missing coordinates — same filter as internalGeocodingController
  const sales = await prisma.sale.findMany({
    where: {
      lat: null,
      status: 'PUBLISHED',
      city: { not: '' },
      state: { not: '' },
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      sourceName: true,
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    take: BATCH_SIZE,
  });

  if (sales.length === 0) {
    console.log('[geocodeBacklog] No ungeocoded PUBLISHED sales found — backlog clear.');
    return;
  }

  console.log(`[geocodeBacklog] Processing ${sales.length} ungeocoded sales.`);

  let succeeded = 0;
  let failed = 0;

  for (const sale of sales) {
    try {
      const result = await geocodeSaleAddress(
        sale.address ?? '',
        sale.city ?? '',
        sale.state ?? '',
        sale.zip ?? ''
      );

      if (result) {
        // Only write if still null (guard against concurrent updates)
        const updated = await prisma.sale.updateMany({
          where: { id: sale.id, lat: null },
          data: { lat: result.lat, lng: result.lng },
        });

        if (updated.count > 0) {
          succeeded++;
        } else {
          // Race condition: another process already geocoded this sale — skip silently
          console.log(`[geocodeBacklog] Sale ${sale.id} already geocoded by another process — skipping.`);
        }
      } else {
        failed++;
        console.log(
          `[geocodeBacklog] Failed to geocode sale ${sale.id} ` +
            `(${sale.city}, ${sale.state}) source=${sale.sourceName ?? 'unknown'}`
        );
      }
    } catch (err) {
      // Per-sale errors must not stop the batch
      failed++;
      console.error(
        `[geocodeBacklog] Unexpected error for sale ${sale.id}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  console.log(
    `[geocodeBacklog] Run complete — geocoded: ${succeeded}, failed: ${failed}, total processed: ${sales.length}`
  );
}

/**
 * Schedule the geocode backlog cron — every 2 hours.
 * Called during app startup (index.ts) alongside scheduleGeocodingAuditCron.
 */
export function scheduleGeocodeBacklogCron(): void {
  cron.schedule('0 */2 * * *', cronGuard({ jobName: 'geocodeBacklog' }, runGeocodeBacklog));
  console.log('[geocodeBacklog] Scheduled — runs every 2 hours');
}
