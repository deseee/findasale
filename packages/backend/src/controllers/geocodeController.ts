import { Request, Response } from 'express';
import axios from 'axios';

// In-memory cache: key = normalized address string, value = { lat, lng, cachedAt }
interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
  cachedAt: number;
}

const geocodeCache = new Map<string, GeoResult>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Rate limiting: track last Nominatim request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1100; // Nominatim requires 1 req/sec

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const geocodeAddress = async (req: Request, res: Response) => {
  try {
    const { address, city, state, zip } = req.query;

    if (!address || !city || !state) {
      return res.status(400).json({ message: 'address, city, and state are required' });
    }

    const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`;
    const cacheKey = fullAddress.toLowerCase().trim();

    // Return cached result if fresh
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return res.json({ lat: cached.lat, lng: cached.lng, displayName: cached.displayName, fromCache: true });
    }

    // Strategy 1: Structured query (street, city, state, zip)
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    let response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        street: address,
        city: city,
        state: state,
        postalcode: zip || undefined,
        country: 'us',
        format: 'json',
        limit: 1,
      },
      headers: {
        'User-Agent': 'FindA.Sale/1.0 (contact@finda.sale)',
      },
      timeout: 8000,
    });

    // Strategy 2: Free-text fallback if Strategy 1 returns 0 results
    if (!response.data || response.data.length === 0) {
      // Wait for rate limit before second attempt
      const now2 = Date.now();
      const timeSinceLastRequest2 = now2 - lastRequestTime;
      if (timeSinceLastRequest2 < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest2);
      }
      lastRequestTime = Date.now();

      response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: fullAddress,
          format: 'json',
          limit: 1,
          countrycodes: 'us',
        },
        headers: {
          'User-Agent': 'FindA.Sale/1.0 (contact@finda.sale)',
        },
        timeout: 8000,
      });
    }

    // Both strategies failed
    if (!response.data || response.data.length === 0) {
      return res.status(404).json({ message: 'Address not found. Please check the address and try again.' });
    }

    const result = response.data[0];
    const geoResult: GeoResult = {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name,
      cachedAt: Date.now(),
    };

    geocodeCache.set(cacheKey, geoResult);

    return res.json({ lat: geoResult.lat, lng: geoResult.lng, displayName: geoResult.displayName, fromCache: false });
  } catch (error: any) {
    console.error('Geocoding error:', error.message);
    res.status(500).json({ message: 'Geocoding service temporarily unavailable. Please try again.' });
  }
};
