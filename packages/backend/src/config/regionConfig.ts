/**
 * Region Configuration
 *
 * Centralizes all region-specific settings (city, state, coordinates, timezones, etc.)
 * Loaded from environment variables with Grand Rapids as defaults.
 *
 * This allows the app to serve any region by changing env vars at deployment time.
 */

export interface RegionConfig {
  city: string;
  state: string;
  stateAbbrev: string;
  centerLat: number;
  centerLng: number;
  defaultSearchRadius: number; // miles
  county?: string;
  timeZone?: string; // e.g., 'America/Detroit'
}

const parseEnv = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

const parseFloat_ = (key: string, defaultValue: number): number => {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Global region configuration
 * Defaults to Grand Rapids, MI so existing deployments don't break
 */
export const regionConfig: RegionConfig = {
  city: parseEnv('DEFAULT_CITY', 'Grand Rapids'),
  state: parseEnv('DEFAULT_STATE', 'Michigan'),
  stateAbbrev: parseEnv('DEFAULT_STATE_ABBREV', 'MI'),
  centerLat: parseFloat_('DEFAULT_LAT', 42.9619),
  centerLng: parseFloat_('DEFAULT_LNG', -85.6789),
  defaultSearchRadius: parseFloat_('DEFAULT_RADIUS_MILES', 25),
  county: parseEnv('DEFAULT_COUNTY', 'Kent County'),
  timeZone: parseEnv('DEFAULT_TIMEZONE', 'America/Detroit'),
};

/**
 * Logging (non-sensitive) — helpful for debugging multi-region deployments
 */
if (process.env.NODE_ENV !== 'test') {
  console.log(
    `[RegionConfig] Initialized for: ${regionConfig.city}, ${regionConfig.state} (${regionConfig.stateAbbrev})`
  );
}
