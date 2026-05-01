/**
 * Generate US cities dataset from public GitHub dataset
 *
 * Source: kelvins/US-Cities-Database (https://github.com/kelvins/US-Cities-Database)
 * License: Public Domain / Attribution-friendly
 * Includes all incorporated places, census-designated places (CDPs), and metro areas
 * with population >= 2,500 (US Census urban-place threshold)
 *
 * Data shape: { name, state, stateFull, slug, lat, lng, population, county, zipCodes? }
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

async function fetchAndProcessCities(): Promise<void> {
  const csvUrl = 'https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv';

  console.log('Fetching US cities data from GitHub...');

  let csvContent: string;
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    csvContent = await response.text();
  } catch (error) {
    console.error(`Failed to fetch from ${csvUrl}:`, error);
    process.exit(1);
  }

  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');

  const cityIndex = headers.indexOf('city');
  const stateIdIndex = headers.indexOf('state_id');
  const stateNameIndex = headers.indexOf('state_name');
  const countyIndex = headers.indexOf('county_name');
  const latIndex = headers.indexOf('latitude');
  const lngIndex = headers.indexOf('longitude');
  const populationIndex = headers.indexOf('population');

  if ([cityIndex, stateIdIndex, stateNameIndex, countyIndex, latIndex, lngIndex, populationIndex].some(i => i === -1)) {
    console.error('CSV headers do not match expected format');
    process.exit(1);
  }

  const cities: ProcessedCity[] = [];
  const cityNameCount = new Map<string, number>();

  // First pass: count duplicate city names
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const fields = lines[i].split(',');
    const cityName = fields[cityIndex]?.trim().replace(/^"|"$/g, '') || '';
    const population = parseInt(fields[populationIndex]?.trim() || '0');

    if (population >= 2500 && cityName) {
      cityNameCount.set(cityName, (cityNameCount.get(cityName) || 0) + 1);
    }
  }

  // Identify which city names are duplicates
  const duplicateNames = new Set<string>();
  cityNameCount.forEach((count, name) => {
    if (count > 1) {
      duplicateNames.add(name);
    }
  });

  // Second pass: process cities
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const fields = lines[i].split(',');

    const cityName = fields[cityIndex]?.trim().replace(/^"|"$/g, '') || '';
    const stateId = fields[stateIdIndex]?.trim().replace(/^"|"$/g, '') || '';
    const stateName = fields[stateNameIndex]?.trim().replace(/^"|"$/g, '') || '';
    const county = fields[countyIndex]?.trim().replace(/^"|"$/g, '') || '';
    const lat = parseFloat(fields[latIndex]?.trim() || '0');
    const lng = parseFloat(fields[lngIndex]?.trim() || '0');
    const population = parseInt(fields[populationIndex]?.trim() || '0');

    // Filter: population >= 2500 and valid coordinates
    if (population >= 2500 && cityName && stateId && lat && lng) {
      const fullStateName = STATE_ID_TO_NAME[stateId] || stateName || stateId;
      const slug = generateSlug(cityName, stateId, county, duplicateNames);

      cities.push({
        name: cityName,
        state: stateId.toUpperCase(),
        stateFull: fullStateName,
        slug,
        population,
        lat,
        lng,
        county,
        zipCodes: [], // Phase 2: populate from Census ZCTA data
      });
    }
  }

  // Sort by population descending (top metros first)
  cities.sort((a, b) => b.population - a.population);

  // Output path
  const outputDir = path.join(process.cwd(), 'data');
  const outputPath = path.join(outputDir, 'us-cities-3000.json');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write JSON with header comment
  const header = `// Generated by scripts/generate-us-cities.ts
// Source: kelvins/US-Cities-Database (https://github.com/kelvins/US-Cities-Database)
// License: Public Domain
// Filter: Cities with population >= 2,500 (US Census urban-place threshold)
// Generated: ${new Date().toISOString()}
// Total cities: ${cities.length}

`;

  fs.writeFileSync(outputPath, header + JSON.stringify(cities, null, 2));

  console.log(`✓ Generated ${cities.length} US cities`);
  console.log(`✓ Written to ${outputPath}`);
  console.log(`✓ Source: kelvins/US-Cities-Database (Public Domain)`);
  console.log(`✓ License: Public Domain`);
  console.log(`\nCity count breakdown:`);
  console.log(`  - Total: ${cities.length}`);
  console.log(`  - Top 10 metros: ${cities.slice(0, 10).map(c => c.name).join(', ')}`);
  console.log(`  - Largest: ${cities[0].name} (pop: ${cities[0].population.toLocaleString()})`);
  console.log(`  - Smallest: ${cities[cities.length - 1].name} (pop: ${cities[cities.length - 1].population.toLocaleString()})`);
}

fetchAndProcessCities().catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});
