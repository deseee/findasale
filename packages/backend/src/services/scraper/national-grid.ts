/**
 * ADR-073: National coordinate grid for API-based scraping
 * Covers continental US + AK/HI with overlapping 250-mile radii
 * Replaces the city-slug metro list approach for broader coverage
 */

export interface CoordinateCenter {
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
}

/**
 * National grid of ~40 coordinate centers covering US
 * Each center has a 250-mile search radius
 * Overlaps handle border regions; deduplication by sale ID in the ingest layer
 */
export const NATIONAL_GRID: CoordinateCenter[] = [
  // Northeast — New York area
  { label: 'new-york-metro', lat: 40.7128, lng: -74.006, radiusMiles: 250 },

  // Northeast — Boston area
  { label: 'boston-metro', lat: 42.3601, lng: -71.0589, radiusMiles: 250 },

  // Mid-Atlantic — Philadelphia area
  { label: 'philadelphia-metro', lat: 39.9526, lng: -75.1652, radiusMiles: 250 },

  // Mid-Atlantic — Washington DC area
  { label: 'washington-dc-metro', lat: 38.9072, lng: -77.0369, radiusMiles: 250 },

  // Southeast — Atlanta area
  { label: 'atlanta-metro', lat: 33.749, lng: -84.388, radiusMiles: 250 },

  // Southeast — Charlotte area
  { label: 'charlotte-metro', lat: 35.2271, lng: -80.8431, radiusMiles: 250 },

  // Southeast — Miami area
  { label: 'miami-metro', lat: 25.7617, lng: -80.1918, radiusMiles: 250 },

  // Southeast — Nashville area
  { label: 'nashville-metro', lat: 36.1627, lng: -86.7816, radiusMiles: 250 },

  // Southeast — New Orleans area
  { label: 'new-orleans-metro', lat: 29.9511, lng: -90.2623, radiusMiles: 250 },

  // Midwest — Chicago area
  { label: 'chicago-metro', lat: 41.8781, lng: -87.6298, radiusMiles: 250 },

  // Midwest — Detroit area
  { label: 'detroit-metro', lat: 42.3314, lng: -83.0458, radiusMiles: 250 },

  // Midwest — Cleveland area
  { label: 'cleveland-metro', lat: 41.4925, lng: -81.6204, radiusMiles: 250 },

  // Midwest — Columbus area
  { label: 'columbus-metro', lat: 39.9612, lng: -82.999, radiusMiles: 250 },

  // Midwest — Indianapolis area
  { label: 'indianapolis-metro', lat: 39.7684, lng: -86.1581, radiusMiles: 250 },

  // Midwest — St. Louis area
  { label: 'st-louis-metro', lat: 38.6270, lng: -90.1994, radiusMiles: 250 },

  // Midwest — Minneapolis area
  { label: 'minneapolis-metro', lat: 44.9778, lng: -93.2650, radiusMiles: 250 },

  // Midwest — Milwaukee area
  { label: 'milwaukee-metro', lat: 43.0389, lng: -87.9065, radiusMiles: 250 },

  // Southwest — Dallas area
  { label: 'dallas-metro', lat: 32.7767, lng: -96.797, radiusMiles: 250 },

  // Southwest — Houston area
  { label: 'houston-metro', lat: 29.7604, lng: -95.3698, radiusMiles: 250 },

  // Southwest — Austin area
  { label: 'austin-metro', lat: 30.2672, lng: -97.7431, radiusMiles: 250 },

  // Southwest — San Antonio area
  { label: 'san-antonio-metro', lat: 29.4241, lng: -98.4936, radiusMiles: 250 },

  // Southwest — Phoenix area
  { label: 'phoenix-metro', lat: 33.4484, lng: -112.074, radiusMiles: 250 },

  // Southwest — Denver area
  { label: 'denver-metro', lat: 39.7392, lng: -104.9903, radiusMiles: 250 },

  // Southwest — Las Vegas area
  { label: 'las-vegas-metro', lat: 36.1699, lng: -115.1398, radiusMiles: 250 },

  // Southwest — Salt Lake City area
  { label: 'salt-lake-city-metro', lat: 40.7608, lng: -111.891, radiusMiles: 250 },

  // West Coast — Los Angeles area
  { label: 'los-angeles-metro', lat: 34.0522, lng: -118.2437, radiusMiles: 250 },

  // West Coast — San Diego area
  { label: 'san-diego-metro', lat: 32.7157, lng: -117.1611, radiusMiles: 250 },

  // West Coast — San Francisco Bay area
  { label: 'san-francisco-metro', lat: 37.7749, lng: -122.4194, radiusMiles: 250 },

  // West Coast — Seattle area
  { label: 'seattle-metro', lat: 47.6062, lng: -122.3321, radiusMiles: 250 },

  // West Coast — Portland area
  { label: 'portland-metro', lat: 45.5152, lng: -122.6784, radiusMiles: 250 },

  // Pacific — Honolulu
  { label: 'honolulu-metro', lat: 21.3099, lng: -157.8581, radiusMiles: 250 },

  // Pacific — Anchorage
  { label: 'anchorage-metro', lat: 61.2181, lng: -149.9003, radiusMiles: 250 },

  // Central — Kansas City area (fills gap between Chicago/Denver/Dallas)
  { label: 'kansas-city-metro', lat: 39.0997, lng: -94.5786, radiusMiles: 250 },

  // Central — Omaha area (fills gap between Chicago/Denver)
  { label: 'omaha-metro', lat: 41.2565, lng: -95.9345, radiusMiles: 250 },

  // Southeast — Memphis area (fills gap)
  { label: 'memphis-metro', lat: 35.1495, lng: -90.0490, radiusMiles: 250 },

  // Southeast — Birmingham area (fills gap)
  { label: 'birmingham-metro', lat: 33.5186, lng: -86.8104, radiusMiles: 250 },

  // Midwest — Green Bay area (fills gap)
  { label: 'green-bay-metro', lat: 44.5159, lng: -88.0133, radiusMiles: 250 },

  // Gap-fillers identified by direct API coverage probe — three regions
  // outside any 250mi circle that still have non-zero EstateSalesNet inventory.
  // Mountain West rural (MT/WY/ND) confirmed empty so no fillers needed there.
  { label: 'albuquerque-metro', lat: 35.0844, lng: -106.6504, radiusMiles: 250 },
  { label: 'el-paso-metro', lat: 31.7619, lng: -106.4850, radiusMiles: 250 },
  { label: 'boise-metro', lat: 43.6150, lng: -116.2023, radiusMiles: 250 },

  // Canada — Phase 1 (ON, BC, AB, MB, SK)
  // 250-mile radius covers full province clusters with overlap dedup in ingest layer
  { label: 'toronto-metro',    lat: 43.6532, lng: -79.3832,  radiusMiles: 250 },
  { label: 'ottawa-metro',     lat: 45.4215, lng: -75.6972,  radiusMiles: 250 },
  { label: 'vancouver-metro',  lat: 49.2827, lng: -123.1207, radiusMiles: 250 },
  { label: 'calgary-metro',    lat: 51.0447, lng: -114.0719, radiusMiles: 250 },
  { label: 'edmonton-metro',   lat: 53.5461, lng: -113.4938, radiusMiles: 250 },
  { label: 'winnipeg-metro',   lat: 49.8951, lng: -97.1384,  radiusMiles: 250 },
  { label: 'saskatoon-metro',  lat: 52.1332, lng: -106.6700, radiusMiles: 250 },

  // Canada — Phase 2 (Atlantic + Quebec — defer until French localization complete)
  { label: 'montreal-metro',   lat: 45.5017, lng: -73.5673,  radiusMiles: 250 },
  { label: 'halifax-metro',    lat: 44.6488, lng: -63.5752,  radiusMiles: 250 },
];
