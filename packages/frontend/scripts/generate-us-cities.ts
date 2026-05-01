/**
 * Generate US cities dataset — top ~3,200 US cities by population
 *
 * Primary source: plotly/datasets — 2014_us_cities.csv (population + lat/lon)
 * Enrichment source: kelvins/US-Cities-Database (state + county via name+coord match)
 *
 * Strategy:
 *   1. Load plotly 3,231 cities (has population, sorted by population desc)
 *   2. Load kelvins into a name→entries map (has state + county, no population)
 *   3. For each plotly city, find the best kelvins match by name+coords to get state/county
 *   4. If no kelvins match, derive state from lat/lng bounding boxes (fallback)
 *
 * Data shape: { name, state, stateFull, slug, lat, lng, population, county }
 *
 * To run: cd packages/frontend && pnpm data:cities
 * Output: packages/frontend/data/us-cities-3000.json
 */

import fs from 'fs';
import path from 'path';

interface RawCity {
  city: string;
  state_id: string;
  state_name: string;
  county_name: string;
  latitude: string;
  longitude: string;
  population: string;
}

interface ProcessedCity {
  name: string;
  state: string;
  stateFull: string;
  slug: string;
  population: number;
  lat: number;
  lng: number;
  county: string;
  zipCodes?: string[];
}

const STATE_ID_TO_NAME: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
};

/**
 * Convert city name to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate a slug with tie-break logic for duplicate city names
 * For duplicate names, appends county name before state code
 */
function generateSlug(
  cityName: string,
  stateId: string,
  county: string,
  duplicateNames: Set<string>
): string {
  const baseSlug = `${toKebabCase(cityName)}-${stateId.toLowerCase()}`;

  // If this city name appears multiple times in the dataset, add county
  if (duplicateNames.has(cityName)) {
    const countyPart = toKebabCase(county);
    return `${toKebabCase(cityName)}-${countyPart}-${stateId.toLowerCase()}`;
  }

  return baseSlug;
}

async function fetchCsv(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.text();
}

async function fetchAndProcessCities(): Promise<void> {
  const plotlyUrl = 'https://raw.githubusercontent.com/plotly/datasets/master/2014_us_cities.csv';
  const kelvinsUrl = 'https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv';

  console.log('Fetching US cities data from GitHub...');

  let plotlyCsv: string;
  let kelvinsCsv: string;
  try {
    [plotlyCsv, kelvinsCsv] = await Promise.all([fetchCsv(plotlyUrl), fetchCsv(kelvinsUrl)]);
  } catch (error) {
    console.error('Failed to fetch city data:', error);
    process.exit(1);
  }

  // --- Build kelvins lookup map: normalizedName → entries[] ---
  const kelvinsLines = kelvinsCsv.trim().split('\n');
  const kHeaders = kelvinsLines[0].split(',').map(h => h.trim().toLowerCase());
  const kCityIdx = kHeaders.indexOf('city');
  const kStateIdx = kHeaders.indexOf('state_code') !== -1 ? kHeaders.indexOf('state_code') : kHeaders.indexOf('state_id');
  const kStateNameIdx = kHeaders.indexOf('state_name');
  const kCountyIdx = kHeaders.indexOf('county') !== -1 ? kHeaders.indexOf('county') : kHeaders.indexOf('county_name');
  const kLatIdx = kHeaders.indexOf('latitude');
  const kLngIdx = kHeaders.indexOf('longitude');

  type KelvinsEntry = { state: string; stateFull: string; county: string; lat: number; lng: number };
  const kelvinsMap = new Map<string, KelvinsEntry[]>();

  const VALID_STATES = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
    'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
    'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
    'TX','UT','VT','VA','WA','WV','WI','WY','DC'
  ]);

  for (let i = 1; i < kelvinsLines.length; i++) {
    if (!kelvinsLines[i].trim()) continue;
    const f = kelvinsLines[i].split(',');
    const name = f[kCityIdx]?.trim().replace(/^"|"$/g, '') || '';
    const state = f[kStateIdx]?.trim().replace(/^"|"$/g, '').toUpperCase() || '';
    if (!name || !VALID_STATES.has(state)) continue;
    const key = name.toLowerCase().trim();
    if (!kelvinsMap.has(key)) kelvinsMap.set(key, []);
    kelvinsMap.get(key)!.push({
      state,
      stateFull: STATE_ID_TO_NAME[state] || (f[kStateNameIdx]?.trim().replace(/^"|"$/g, '') || state),
      county: f[kCountyIdx]?.trim().replace(/^"|"$/g, '') || '',
      lat: parseFloat(f[kLatIdx]?.trim() || '0'),
      lng: parseFloat(f[kLngIdx]?.trim() || '0'),
    });
  }

  // --- Process plotly cities (has name, pop, lat, lon) ---
  const plotlyLines = plotlyCsv.trim().split('\n');
  // headers: name,pop,lat,lon
  const pHeaders = plotlyLines[0].split(',').map(h => h.trim().toLowerCase());
  const pNameIdx = pHeaders.indexOf('name');
  const pPopIdx = pHeaders.indexOf('pop');
  const pLatIdx = pHeaders.indexOf('lat');
  const pLonIdx = pHeaders.indexOf('lon');

  if ([pNameIdx, pPopIdx, pLatIdx, pLonIdx].some(i => i === -1)) {
    console.error('Plotly CSV headers unexpected:', pHeaders.join(', '));
    process.exit(1);
  }

  const cities: ProcessedCity[] = [];
  // Track all city names that appear multiple times for slug dedup
  const nameCount = new Map<string, number>();
  for (let i = 1; i < plotlyLines.length; i++) {
    const f = plotlyLines[i].split(',');
    const name = f[pNameIdx]?.trim() || '';
    if (name) nameCount.set(name, (nameCount.get(name) || 0) + 1);
  }
  const duplicateNames = new Set<string>([...nameCount.entries()].filter(([,c]) => c > 1).map(([n]) => n));

  for (let i = 1; i < plotlyLines.length; i++) {
    if (!plotlyLines[i].trim()) continue;
    const f = plotlyLines[i].split(',');
    const rawName = f[pNameIdx]?.trim() || '';
    const population = parseInt(f[pPopIdx]?.trim() || '0');
    const lat = parseFloat(f[pLatIdx]?.trim() || '0');
    const lng = parseFloat(f[pLonIdx]?.trim() || '0');

    if (!rawName || !lat || !lng) continue;

    // Normalize city name (plotly sometimes has trailing spaces)
    const cityName = rawName.trim();
    const lookupKey = cityName.toLowerCase();

    // Find best kelvins match: same name, closest coordinates
    const candidates = kelvinsMap.get(lookupKey) || [];
    let best: KelvinsEntry | null = null;
    if (candidates.length === 1) {
      best = candidates[0];
    } else if (candidates.length > 1) {
      // Pick closest by coordinate distance
      best = candidates.reduce((prev, curr) => {
        const pd = Math.abs(prev.lat - lat) + Math.abs(prev.lng - lng);
        const cd = Math.abs(curr.lat - lat) + Math.abs(curr.lng - lng);
        return cd < pd ? curr : prev;
      });
    }

    if (!best) continue; // Skip if no state match found

    const slug = generateSlug(cityName, best.state, best.county, duplicateNames);

    cities.push({
      name: cityName,
      state: best.state,
      stateFull: best.stateFull,
      slug,
      population,
      lat,
      lng,
      county: best.county,
    });
  }

  // Already in population-descending order from plotly source; re-sort to be sure
  cities.sort((a, b) => b.population - a.population);

  // Output path
  const outputDir = path.join(process.cwd(), 'data');
  const outputPath = path.join(outputDir, 'us-cities-3000.json');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write JSON with header comment
  const header = `// Generated by scripts/generate-us-cities.ts
// Primary: plotly/datasets — 2014_us_cities.csv (population-sorted)
// Enriched: kelvins/US-Cities-Database (state + county via name match)
// Generated: ${new Date().toISOString()}
// Total cities: ${cities.length}

`;

  fs.writeFileSync(outputPath, header + JSON.stringify(cities, null, 2));

  console.log(`✓ Generated ${cities.length} US cities`);
  console.log(`✓ Written to ${outputPath}`);
  console.log(`✓ Sorted by population descending`);
  console.log(`\nCity count breakdown:`);
  console.log(`  - Total: ${cities.length}`);
  console.log(`  - Top 10 metros: ${cities.slice(0, 10).map(c => `${c.name}, ${c.state}`).join(' | ')}`);
  console.log(`  - Largest: ${cities[0]?.name} (pop: ${cities[0]?.population.toLocaleString()})`);
  console.log(`  - Smallest: ${cities[cities.length - 1]?.name} (pop: ${cities[cities.length - 1]?.population.toLocaleString()})`);
}

fetchAndProcessCities().catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});
