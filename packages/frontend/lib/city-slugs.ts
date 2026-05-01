import citiesData from '@/data/us-cities-3000.json';

export interface CityInfo {
  name: string;
  state: string;
  slug: string;
  population: number;
  lat: number;
  lng: number;
  zipCodes: string[];
}

// Build a slug-to-city map for O(1) lookups
// Cast via `any` so the map works whether or not the JSON was generated
// with the `zipCodes` field (it's added by the full generate script;
// the stub 13-city JSON omits it).
const slugToCityMap = new Map<string, CityInfo>();
(citiesData as any[]).forEach((city) => {
  slugToCityMap.set((city.slug as string).toLowerCase(), {
    name: city.name,
    state: city.state,
    slug: city.slug,
    population: city.population,
    lat: city.lat,
    lng: city.lng,
    zipCodes: city.zipCodes ?? [],
  });
});

export function getCityFromSlug(slug: string): CityInfo | null {
  return slugToCityMap.get(slug.toLowerCase()) || null;
}

export function getAllCitySlugs(): string[] {
  return (citiesData as any[]).map((city) => city.slug as string);
}

export function getAllCities(): CityInfo[] {
  return (citiesData as any[]) as CityInfo[];
}

/**
 * Calculate distance between two coordinates using Haversine formula (miles)
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get N nearest cities by distance from a given city
 */
export function getNearestCities(
  slug: string,
  count: number = 5
): CityInfo[] {
  const city = getCityFromSlug(slug);
  if (!city) return [];

  const distances = (citiesData as any[]).map((otherCity) => ({
    city: otherCity as CityInfo,
    distance: haversineDistance(
      city.lat,
      city.lng,
      otherCity.lat,
      otherCity.lng
    ),
  }));

  return distances
    .sort((a, b) => a.distance - b.distance)
    .slice(1, count + 1) // Skip the city itself (index 0)
    .map((d) => d.city);
}

/**
 * Get top categories for a city (stub for now — will be computed from eBay data in backend)
 */
export function getTopCategoriesForCity(slug: string): string[] {
  // This will be enhanced in Phase 2 with real eBay data
  return ['Furniture', 'Vintage', 'Collectibles', 'Art', 'Home & Garden'];
}
