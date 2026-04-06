// Google Places API service for Treasure Trails stop discovery
// Requires GOOGLE_PLACES_API_KEY environment variable

import axios from 'axios';

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';

export interface PlaceResult {
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  phone?: string;
  iconUrl?: string;
}

/**
 * Search nearby places using Google Places API
 * Requires GOOGLE_PLACES_API_KEY env var
 * Returns up to 10 results (Google limit per query)
 */
export async function searchNearbyPlaces(params: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  type?: string;
}): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_PLACES_API_KEY not set — Places search unavailable');
    return [];
  }

  const { latitude, longitude, radiusMeters = 500, type } = params;

  // Map our stop types to Google Places types
  const googleTypeMap: Record<string, string> = {
    resale_shop: 'store',
    cafe: 'cafe',
    landmark: 'tourist_attraction',
    partner: 'establishment',
  };

  const googleType = type ? googleTypeMap[type] || 'establishment' : 'establishment';

  try {
    const response = await axios.get(`${PLACES_API_BASE}/nearbysearch/json`, {
      params: {
        location: `${latitude},${longitude}`,
        radius: radiusMeters,
        type: googleType,
        key: apiKey,
      },
      timeout: 10000, // 10s timeout
    });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error('Places API error:', response.data.status, response.data.error_message);
      return [];
    }

    return (response.data.results || []).slice(0, 10).map((place: any) => ({
      googlePlaceId: place.place_id,
      name: place.name,
      address: place.vicinity || '',
      lat: place.geometry?.location?.lat || 0,
      lng: place.geometry?.location?.lng || 0,
      rating: place.rating,
      phone: place.formatted_phone_number,
      iconUrl: place.icon,
    }));
  } catch (err) {
    console.error('Places API request failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Haversine formula: calculate distance between two lat/lng points
 * Returns distance in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Completion bonus XP based on stop count
 */
export function completionBonus(stopCount: number): number {
  const bonuses: Record<number, number> = {
    3: 40,
    4: 50,
    5: 60,
    6: 70,
    7: 80,
  };
  return bonuses[Math.min(stopCount, 7)] ?? 40;
}
