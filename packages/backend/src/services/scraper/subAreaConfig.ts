/**
 * SubAreaConfig - Pre-seeded metro and sub-area configurations
 * 
 * Tier 1 US: NYC, LA, Chicago, Dallas-FW, Houston, DC, Philadelphia
 * Tier 2 US: Miami, Atlanta, Phoenix, SF Bay, Boston, Seattle, Denver, Minneapolis, San Diego, St. Louis
 * Canada: Toronto, Vancouver, Calgary
 * 
 * Each metro gets sub-areas seeded with queryType values appropriate to local geography
 */

import { SeedEntry } from './crawlQueueManager';

// Query types covered by directory sources
export type DirectoryQueryType =
  | 'antique_mall'
  | 'consignment_shop'
  | 'estate_sale_company'
  | 'thrift_store'
  | 'flea_market'
  | 'auction_house';

/**
 * Query type to search terms (used by GooglePlaces, HERE, etc.)
 */
export const QUERY_TYPE_TO_SEARCH: Record<DirectoryQueryType, string> = {
  antique_mall: 'antique mall',
  consignment_shop: 'consignment shop',
  estate_sale_company: 'estate sale company',
  thrift_store: 'thrift store',
  flea_market: 'flea market',
  auction_house: 'auction house',
};

/**
 * Budget limits per API (monthly or daily equivalent)
 */
const BUDGETS = {
  GOOGLE: 5000,      // Google Places: $0.032/request, ~5000/month free tier
  HERE: 250000,      // HERE: 250k/month free tier
  FOURSQUARE: 30000, // Foursquare: ~1000/day ≈ 30000/month
  OSM: 999999,       // OSM Overpass: effectively unlimited (self-hosted)
};

// ==============================================================================
// TIER 1 US METROS (7)
// ==============================================================================

const NYC: SeedEntry[] = [
  // Manhattan, Brooklyn, Queens, Bronx, Staten Island sub-areas
  ...['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'New York, NY',
      subArea,
      country: 'US',
      sourceName: 'GooglePlaces',
      queryType,
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 100,
    }))
  ),
  // HERE for each sub-area
  ...['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'New York, NY',
      subArea,
      country: 'US',
      sourceName: 'HEREPlaces',
      queryType,
      requestsBudgetMax: BUDGETS.HERE,
      priority: 95,
    }))
  ),
];

const LA: SeedEntry[] = [
  // Los Angeles, Santa Monica, Long Beach, Pasadena, Burbank
  ...['Los Angeles', 'Santa Monica', 'Long Beach', 'Pasadena', 'Burbank'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Los Angeles, CA',
      subArea,
      country: 'US',
      sourceName: 'GooglePlaces',
      queryType,
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 100,
    }))
  ),
  ...['Los Angeles', 'Santa Monica', 'Long Beach', 'Pasadena', 'Burbank'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Los Angeles, CA',
      subArea,
      country: 'US',
      sourceName: 'HEREPlaces',
      queryType,
      requestsBudgetMax: BUDGETS.HERE,
      priority: 95,
    }))
  ),
];

const CHICAGO: SeedEntry[] = [
  // Chicago, Oak Park, Evanston, Schaumburg, Des Plaines
  ...['Chicago', 'Oak Park', 'Evanston', 'Schaumburg', 'Des Plaines'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Chicago, IL',
      subArea,
      country: 'US',
      sourceName: 'GooglePlaces',
      queryType,
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 100,
    }))
  ),
  ...['Chicago', 'Oak Park', 'Evanston', 'Schaumburg', 'Des Plaines'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Chicago, IL',
      subArea,
      country: 'US',
      sourceName: 'HEREPlaces',
      queryType,
      requestsBudgetMax: BUDGETS.HERE,
      priority: 95,
    }))
  ),
];

const DALLAS_FW: SeedEntry[] = [
  // Dallas, Fort Worth, Arlington, Irving, Plano
  ...['Dallas', 'Fort Worth', 'Arlington', 'Irving', 'Plano'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Dallas, TX',
      subArea,
      country: 'US',
      sourceName: 'GooglePlaces',
      queryType,
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 100,
    }))
  ),
  ...['Dallas', 'Fort Worth', 'Arlington', 'Irving', 'Plano'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Dallas, TX',
      subArea,
      country: 'US',
      sourceName: 'HEREPlaces',
      queryType,
      requestsBudgetMax: BUDGETS.HERE,
      priority: 95,
    }))
  ),
];

const HOUSTON: SeedEntry[] = [
  // Houston, Spring, Pasadena, Baytown, Pearland
  ...['Houston', 'Spring', 'Pasadena', 'Baytown', 'Pearland'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Houston, TX',
      subArea,
      country: 'US',
      sourceName: 'GooglePlaces',
      queryType,
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 100,
    }))
  ),
  ...['Houston', 'Spring', 'Pasadena', 'Baytown', 'Pearland'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Houston, TX',
      subArea,
      country: 'US',
      sourceName: 'HEREPlaces',
      queryType,
      requestsBudgetMax: BUDGETS.HERE,
      priority: 95,
    }))
  ),
];

const DC: SeedEntry[] = [
  // Washington DC, Arlington VA, Bethesda MD, Alexandria VA, Rockville MD
  ...['Washington', 'Arlington', 'Bethesda', 'Alexandria', 'Rockville'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Washington, DC',
      subArea,
      country: 'US',
      sourceName: 'GooglePlaces',
      queryType,
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 100,
    }))
  ),
  ...['Washington', 'Arlington', 'Bethesda', 'Alexandria', 'Rockville'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Washington, DC',
      subArea,
      country: 'US',
      sourceName: 'HEREPlaces',
      queryType,
      requestsBudgetMax: BUDGETS.HERE,
      priority: 95,
    }))
  ),
];

const PHILADELPHIA: SeedEntry[] = [
  // Philadelphia, Cheltenham, Chester, Upper Darby, Bensalem
  ...['Philadelphia', 'Cheltenham', 'Chester', 'Upper Darby', 'Bensalem'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Philadelphia, PA',
      subArea,
      country: 'US',
      sourceName: 'GooglePlaces',
      queryType,
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 100,
    }))
  ),
  ...['Philadelphia', 'Cheltenham', 'Chester', 'Upper Darby', 'Bensalem'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Philadelphia, PA',
      subArea,
      country: 'US',
      sourceName: 'HEREPlaces',
      queryType,
      requestsBudgetMax: BUDGETS.HERE,
      priority: 95,
    }))
  ),
];

// ==============================================================================
// TIER 2 US METROS (10)
// ==============================================================================

const TIER2_METROS = [
  { name: 'Miami, FL', subAreas: ['Miami', 'Miami Beach', 'Coral Gables', 'Doral', 'Hialeah'] },
  { name: 'Atlanta, GA', subAreas: ['Atlanta', 'Sandy Springs', 'Marietta', 'Kennesaw', 'Alpharetta'] },
  { name: 'Phoenix, AZ', subAreas: ['Phoenix', 'Scottsdale', 'Tempe', 'Gilbert', 'Chandler'] },
  { name: 'San Francisco, CA', subAreas: ['San Francisco', 'Oakland', 'Berkeley', 'Palo Alto', 'Mountain View'] },
  { name: 'Boston, MA', subAreas: ['Boston', 'Cambridge', 'Brookline', 'Somerville', 'Quincy'] },
  { name: 'Seattle, WA', subAreas: ['Seattle', 'Bellevue', 'Redmond', 'Kirkland', 'Renton'] },
  { name: 'Denver, CO', subAreas: ['Denver', 'Aurora', 'Lakewood', 'Thornton', 'Westminster'] },
  { name: 'Minneapolis, MN', subAreas: ['Minneapolis', 'St. Paul', 'Bloomington', 'Plymouth', 'Edina'] },
  { name: 'San Diego, CA', subAreas: ['San Diego', 'Chula Vista', 'Oceanside', 'Escondido', 'Carlsbad'] },
  { name: 'St. Louis, MO', subAreas: ['St. Louis', 'Clayton', 'Kirkwood', 'Webster Groves', 'Brentwood'] },
];

const TIER2: SeedEntry[] = TIER2_METROS.flatMap(({ name, subAreas }) => [
  ...subAreas.flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: name,
      subArea,
      country: 'US',
      sourceName: 'GooglePlaces',
      queryType,
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 75,
    }))
  ),
  ...subAreas.flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: name,
      subArea,
      country: 'US',
      sourceName: 'HEREPlaces',
      queryType,
      requestsBudgetMax: BUDGETS.HERE,
      priority: 70,
    }))
  ),
]);

// ==============================================================================
// CANADIAN METROS (3)
// ==============================================================================

const TORONTO: SeedEntry[] = [
  // Toronto, North York, Scarborough, Etobicoke, Mississauga
  ...['Toronto', 'North York', 'Scarborough', 'Etobicoke', 'Mississauga'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Toronto, ON',
      subArea,
      country: 'CA',
      province: 'ON',
      sourceName: 'GooglePlaces',
      queryType,
      locale: 'en',
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 90,
    }))
  ),
  ...['Toronto', 'North York', 'Scarborough', 'Etobicoke', 'Mississauga'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Toronto, ON',
      subArea,
      country: 'CA',
      province: 'ON',
      sourceName: 'HEREPlaces',
      queryType,
      locale: 'en',
      requestsBudgetMax: BUDGETS.HERE,
      priority: 85,
    }))
  ),
];

const VANCOUVER: SeedEntry[] = [
  // Vancouver, Burnaby, Surrey, Richmond, Coquitlam
  ...['Vancouver', 'Burnaby', 'Surrey', 'Richmond', 'Coquitlam'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Vancouver, BC',
      subArea,
      country: 'CA',
      province: 'BC',
      sourceName: 'GooglePlaces',
      queryType,
      locale: 'en',
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 80,
    }))
  ),
  ...['Vancouver', 'Burnaby', 'Surrey', 'Richmond', 'Coquitlam'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Vancouver, BC',
      subArea,
      country: 'CA',
      province: 'BC',
      sourceName: 'HEREPlaces',
      queryType,
      locale: 'en',
      requestsBudgetMax: BUDGETS.HERE,
      priority: 75,
    }))
  ),
];

const CALGARY: SeedEntry[] = [
  // Calgary, Airdrie, Okotoks, Canmore (single-area, but include sub-areas for scale)
  ...['Calgary', 'Airdrie', 'Okotoks', 'Canmore'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Calgary, AB',
      subArea,
      country: 'CA',
      province: 'AB',
      sourceName: 'GooglePlaces',
      queryType,
      locale: 'en',
      requestsBudgetMax: BUDGETS.GOOGLE,
      priority: 70,
    }))
  ),
  ...['Calgary', 'Airdrie', 'Okotoks', 'Canmore'].flatMap((subArea) =>
    Object.keys(QUERY_TYPE_TO_SEARCH).map((queryType) => ({
      metro: 'Calgary, AB',
      subArea,
      country: 'CA',
      province: 'AB',
      sourceName: 'HEREPlaces',
      queryType,
      locale: 'en',
      requestsBudgetMax: BUDGETS.HERE,
      priority: 65,
    }))
  ),
];

// ==============================================================================
// Full seed list
// ==============================================================================

export const FULL_SEED_CONFIG: SeedEntry[] = [
  // Tier 1 US
  ...NYC,
  ...LA,
  ...CHICAGO,
  ...DALLAS_FW,
  ...HOUSTON,
  ...DC,
  ...PHILADELPHIA,
  // Tier 2 US
  ...TIER2,
  // Canada
  ...TORONTO,
  ...VANCOUVER,
  ...CALGARY,
];
