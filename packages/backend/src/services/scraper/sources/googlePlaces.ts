/**
 * ADR-077: Google Places Business Directory Scraper
 * Ingests secondhand/resale businesses as unmanaged organizer directory entries.
 * Uses Google Places Text Search API (paginated, up to 3 pages = 60 results per query).
 *
 * Businesses sourced here get:
 * - Organizer record with isUnmanagedListing=true, googlePlaceId, businessCategory
 * - RETAIL (or FLEA_MARKET) Sale record spanning 1 year (auto-renewed by existing RETAIL logic)
 * - Enrichment triggered immediately (rating, phone, website populated from placeId)
 * - Claim email delivered by existing claimEmailService when campaign runs
 */

import { ScrapedItem } from '../index';

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';
/** Google allows up to 3 pages (20 results each = 60 max) per text search */
const MAX_PAGES = 3;
/** Delay between paginated requests — required by Google (next_page_token not immediately valid) */
const PAGE_TOKEN_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Query configuration
// ---------------------------------------------------------------------------

/** Business category values stored on Organizer.businessCategory (ADR-077) */
export type BusinessCategory =
  | 'ANTIQUE_MALL'
  | 'ANTIQUE_DEALER'
  | 'CONSIGNMENT'
  | 'THRIFT_STORE'
  | 'FLEA_MARKET'
  | 'AUCTION_HOUSE'
  | 'VINTAGE'
  | 'ESTATE_SALE_CO'
  | 'LIQUIDATION'
  | 'USED_FURNITURE'
  | 'PAWN_SHOP'
  | 'USED_BOOKSTORE'
  | 'RECORD_STORE'
  | 'USED_ELECTRONICS'
  | 'COIN_DEALER'
  | 'RESALE_SHOP'
  | 'USED_SPORTING_GOODS'
  | 'JEWELRY_RESALE';

interface QueryConfig {
  /** Search term sent to Google Places Text Search */
  query: string;
  /** Category stored on Organizer.businessCategory */
  category: BusinessCategory;
  /** FindA.Sale saleType for the created Sale record */
  saleType: 'RETAIL' | 'FLEA_MARKET';
  /** Optional Google Places type filter to narrow results */
  googleType?: string;
  /** Lowercase name fragments to exclude (fine art auction houses, etc.) */
  blocklist?: string[];
  /** Human-readable category label used in the sale title */
  label: string;
}

/** 29 search queries covering the full secondhand/resale market (ADR-077 Innovation review) */
export const PLACES_QUERIES: QueryConfig[] = [
  { query: 'antique mall', category: 'ANTIQUE_MALL', saleType: 'RETAIL', label: 'Antique Mall' },
  { query: 'antique dealer', category: 'ANTIQUE_DEALER', saleType: 'RETAIL', label: 'Antique Dealer' },
  { query: 'consignment shop', category: 'CONSIGNMENT', saleType: 'RETAIL', label: 'Consignment Shop' },
  {
    query: 'thrift store',
    category: 'THRIFT_STORE',
    saleType: 'RETAIL',
    googleType: 'thrift_store',
    label: 'Thrift Store',
  },
  {
    query: 'flea market',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Flea Market',
  },
  {
    query: 'auction house',
    category: 'AUCTION_HOUSE',
    saleType: 'RETAIL',
    // Exclude fine art auction houses — outside FindA.Sale's market
    blocklist: [
      "sotheby's", 'sothebys', "christie's", 'christies',
      'bonhams', 'phillips', 'heritage auctions', 'fine art auction',
      'freeman', 'cowan', 'skinner', 'doyle', 'rago',
    ],
    label: 'Auction House',
  },
  { query: 'vintage shop', category: 'VINTAGE', saleType: 'RETAIL', label: 'Vintage Shop' },
  { query: 'estate sale company', category: 'ESTATE_SALE_CO', saleType: 'RETAIL', label: 'Estate Sale Company' },
  { query: 'liquidation store', category: 'LIQUIDATION', saleType: 'RETAIL', label: 'Liquidation Store' },
  {
    query: 'swap meet',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Swap Meet / Flea Market',
  },
  {
    query: 'used furniture store',
    category: 'USED_FURNITURE',
    saleType: 'RETAIL',
    googleType: 'furniture_store',
    label: 'Used Furniture Store',
  },
  { query: 'pawn shop', category: 'PAWN_SHOP', saleType: 'RETAIL', label: 'Pawn Shop' },
  { query: 'used bookstore', category: 'USED_BOOKSTORE', saleType: 'RETAIL', label: 'Used Bookstore' },
  { query: 'vinyl record store', category: 'RECORD_STORE', saleType: 'RETAIL', label: 'Record Store' },
  { query: 'used electronics store', category: 'USED_ELECTRONICS', saleType: 'RETAIL', label: 'Used Electronics' },
  { query: 'coin dealer', category: 'COIN_DEALER', saleType: 'RETAIL', label: 'Coin Dealer' },
  { query: 'resale shop', category: 'RESALE_SHOP', saleType: 'RETAIL', label: 'Resale Shop' },
  { query: 'used sporting goods', category: 'USED_SPORTING_GOODS', saleType: 'RETAIL', label: 'Used Sporting Goods' },
  { query: 'jewelry consignment', category: 'JEWELRY_RESALE', saleType: 'RETAIL', label: 'Jewelry Resale' },
  { query: 'moving sale company', category: 'ESTATE_SALE_CO', saleType: 'RETAIL', label: 'Moving Sale Company' },
  { query: 'estate liquidator', category: 'ESTATE_SALE_CO', saleType: 'RETAIL', label: 'Estate Liquidator' },
  { query: 'surplus store', category: 'LIQUIDATION', saleType: 'RETAIL', label: 'Surplus Store' },
  { query: 'salvage store', category: 'LIQUIDATION', saleType: 'RETAIL', label: 'Salvage Store' },
  { query: 'garage sale company', category: 'ESTATE_SALE_CO', saleType: 'RETAIL', label: 'Garage Sale Company' },
  { query: 'yard sale organizer', category: 'ESTATE_SALE_CO', saleType: 'RETAIL', label: 'Yard Sale Organizer' },
  { query: 'tag sale company', category: 'ESTATE_SALE_CO', saleType: 'RETAIL', label: 'Tag Sale Company' },
  {
    query: 'junk removal service',
    category: 'ESTATE_SALE_CO',
    saleType: 'RETAIL',
    // Exclude franchise chains — target independent operators who run estate cleanouts
    blocklist: ['1-800-got-junk', '1800gotjunk', 'junk king', 'junkluggers', 'college hunks'],
    label: 'Junk Removal / Estate Cleanout',
  },
  { query: 'online auction service', category: 'AUCTION_HOUSE', saleType: 'RETAIL', label: 'Online Auction Service' },
  { query: 'buy sell trade store', category: 'RESALE_SHOP', saleType: 'RETAIL', label: 'Buy Sell Trade Store' },
  {
    query: 'antique flea market',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Antique Flea Market',
  },
  {
    query: 'outdoor market',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Outdoor Market',
  },
  {
    query: 'vendor market',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Vendor Market',
  },
  {
    query: 'trade days',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Trade Days',
  },
  {
    query: 'bazaar',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Bazaar',
  },
];

// ---------------------------------------------------------------------------
// 301 US metros — all 50 states + DC, weighted for estate sale density
// (retirement corridors, older housing stock, mid-size markets)
// Updated S695: expanded from 100 population-ranked cities to full coverage
// ---------------------------------------------------------------------------

export const GOOGLE_PLACES_METROS: string[] = [
  // Alabama
  'Birmingham, AL', 'Montgomery, AL', 'Huntsville, AL', 'Mobile, AL', 'Tuscaloosa, AL',
  // Alaska
  'Anchorage, AK',
  // Arizona
  'Phoenix, AZ', 'Tucson, AZ', 'Mesa, AZ', 'Chandler, AZ', 'Scottsdale, AZ',
  'Glendale, AZ', 'Gilbert, AZ', 'Tempe, AZ', 'Peoria, AZ', 'Surprise, AZ',
  'Yuma, AZ', 'Flagstaff, AZ',
  // Arkansas
  'Little Rock, AR', 'Fayetteville, AR', 'Fort Smith, AR',
  // California
  'Los Angeles, CA', 'San Diego, CA', 'San Jose, CA', 'San Francisco, CA',
  'Fresno, CA', 'Sacramento, CA', 'Long Beach, CA', 'Oakland, CA', 'Anaheim, CA',
  'Santa Ana, CA', 'Riverside, CA', 'Bakersfield, CA', 'Stockton, CA', 'Irvine, CA',
  'Modesto, CA', 'San Bernardino, CA', 'Fremont, CA', 'Palm Springs, CA',
  'Santa Barbara, CA', 'Pasadena, CA', 'Thousand Oaks, CA', 'Santa Rosa, CA',
  'Ventura, CA', 'Salinas, CA',
  // Colorado
  'Denver, CO', 'Colorado Springs, CO', 'Aurora, CO', 'Fort Collins, CO',
  'Boulder, CO', 'Pueblo, CO', 'Lakewood, CO',
  // Connecticut
  'Bridgeport, CT', 'New Haven, CT', 'Hartford, CT', 'Stamford, CT',
  'Waterbury, CT', 'Norwalk, CT', 'Greenwich, CT',
  // Delaware
  'Wilmington, DE', 'Dover, DE',
  // Florida — fully expanded (retirement corridors, Gulf Coast, estate sale dense)
  'Jacksonville, FL', 'Miami, FL', 'Tampa, FL', 'Orlando, FL', 'St. Petersburg, FL',
  'Hialeah, FL', 'Port St. Lucie, FL', 'Cape Coral, FL', 'Fort Lauderdale, FL',
  'Pembroke Pines, FL', 'Hollywood, FL', 'Gainesville, FL', 'Coral Springs, FL',
  'West Palm Beach, FL', 'Clearwater, FL', 'Lakeland, FL', 'Tallahassee, FL',
  'Fort Myers, FL', 'Sarasota, FL', 'Bradenton, FL', 'Naples, FL', 'Pensacola, FL',
  'Daytona Beach, FL', 'Boca Raton, FL', 'Delray Beach, FL', 'The Villages, FL',
  'Palm Bay, FL', 'Ocala, FL', 'Bonita Springs, FL', 'Miramar, FL',
  // Georgia
  'Atlanta, GA', 'Augusta, GA', 'Columbus, GA', 'Savannah, GA', 'Athens, GA', 'Macon, GA',
  // Hawaii
  'Honolulu, HI',
  // Idaho
  'Boise, ID', 'Nampa, ID', 'Meridian, ID', 'Idaho Falls, ID', "Coeur d'Alene, ID",
  // Illinois
  'Chicago, IL', 'Rockford, IL', 'Joliet, IL', 'Naperville, IL',
  'Peoria, IL', 'Springfield, IL', 'Elgin, IL',
  // Indiana
  'Indianapolis, IN', 'Fort Wayne, IN', 'Evansville, IN', 'South Bend, IN',
  // Iowa
  'Des Moines, IA', 'Cedar Rapids, IA', 'Davenport, IA', 'Sioux City, IA',
  // Kansas
  'Wichita, KS', 'Overland Park, KS', 'Kansas City, KS', 'Topeka, KS',
  // Kentucky
  'Louisville, KY', 'Lexington, KY', 'Bowling Green, KY', 'Owensboro, KY',
  // Louisiana
  'New Orleans, LA', 'Baton Rouge, LA', 'Shreveport, LA', 'Lafayette, LA', 'Lake Charles, LA',
  // Maine
  'Portland, ME', 'Bangor, ME',
  // Maryland
  'Baltimore, MD', 'Frederick, MD', 'Rockville, MD', 'Annapolis, MD',
  // Massachusetts
  'Boston, MA', 'Worcester, MA', 'Springfield, MA', 'Lowell, MA', 'Cambridge, MA',
  'New Bedford, MA', 'Brockton, MA',
  // Michigan — expanded (Detroit is a major estate sale market)
  'Detroit, MI', 'Grand Rapids, MI', 'Warren, MI', 'Sterling Heights, MI',
  'Ann Arbor, MI', 'Lansing, MI', 'Flint, MI', 'Dearborn, MI',
  'Kalamazoo, MI', 'Livonia, MI', 'Traverse City, MI',
  // Minnesota
  'Minneapolis, MN', 'St. Paul, MN', 'Rochester, MN', 'Duluth, MN',
  // Mississippi
  'Jackson, MS', 'Gulfport, MS', 'Biloxi, MS',
  // Missouri
  'Kansas City, MO', 'St. Louis, MO', 'Springfield, MO', 'Columbia, MO',
  // Montana
  'Billings, MT', 'Missoula, MT', 'Great Falls, MT', 'Bozeman, MT',
  // Nebraska
  'Omaha, NE', 'Lincoln, NE',
  // Nevada
  'Las Vegas, NV', 'Henderson, NV', 'Reno, NV', 'North Las Vegas, NV', 'Sparks, NV',
  // New Hampshire
  'Manchester, NH', 'Nashua, NH', 'Concord, NH',
  // New Jersey
  'Newark, NJ', 'Jersey City, NJ', 'Paterson, NJ', 'Elizabeth, NJ', 'Trenton, NJ', 'Edison, NJ',
  // New Mexico
  'Albuquerque, NM', 'Santa Fe, NM', 'Las Cruces, NM', 'Rio Rancho, NM',
  // New York
  'New York, NY', 'Buffalo, NY', 'Rochester, NY', 'Yonkers, NY', 'Syracuse, NY', 'Albany, NY',
  // North Carolina
  'Charlotte, NC', 'Raleigh, NC', 'Greensboro, NC', 'Durham, NC', 'Winston-Salem, NC',
  'Fayetteville, NC', 'Cary, NC', 'Asheville, NC', 'Wilmington, NC', 'High Point, NC',
  // North Dakota
  'Fargo, ND', 'Bismarck, ND', 'Grand Forks, ND',
  // Ohio — expanded (Cleveland + Dayton are large estate sale markets)
  'Columbus, OH', 'Cleveland, OH', 'Cincinnati, OH', 'Toledo, OH', 'Akron, OH',
  'Dayton, OH', 'Youngstown, OH', 'Canton, OH',
  // Oklahoma
  'Oklahoma City, OK', 'Tulsa, OK', 'Norman, OK', 'Broken Arrow, OK',
  // Oregon — entire state was missing
  'Portland, OR', 'Salem, OR', 'Eugene, OR', 'Bend, OR',
  // Pennsylvania
  'Philadelphia, PA', 'Pittsburgh, PA', 'Allentown, PA', 'Erie, PA',
  'Reading, PA', 'Scranton, PA', 'Bethlehem, PA', 'Lancaster, PA',
  // Rhode Island
  'Providence, RI', 'Warwick, RI',
  // South Carolina — entire state was missing
  'Charleston, SC', 'Columbia, SC', 'Greenville, SC', 'Myrtle Beach, SC',
  'Rock Hill, SC', 'Hilton Head Island, SC',
  // South Dakota
  'Sioux Falls, SD', 'Rapid City, SD',
  // Tennessee
  'Nashville, TN', 'Memphis, TN', 'Knoxville, TN', 'Chattanooga, TN',
  'Clarksville, TN', 'Murfreesboro, TN',
  // Texas
  'Houston, TX', 'San Antonio, TX', 'Dallas, TX', 'Austin, TX', 'Fort Worth, TX',
  'El Paso, TX', 'Arlington, TX', 'Corpus Christi, TX', 'Plano, TX', 'Lubbock, TX',
  'Garland, TX', 'Irving, TX', 'Amarillo, TX', 'McKinney, TX', 'McAllen, TX',
  'Waco, TX', 'Beaumont, TX', 'Midland, TX', 'Denton, TX', 'Laredo, TX',
  // Utah — entire state was missing
  'Salt Lake City, UT', 'West Valley City, UT', 'Provo, UT', 'West Jordan, UT', 'Ogden, UT',
  // Vermont
  'Burlington, VT',
  // Virginia
  'Virginia Beach, VA', 'Norfolk, VA', 'Chesapeake, VA', 'Richmond, VA',
  'Newport News, VA', 'Alexandria, VA', 'Hampton, VA', 'Roanoke, VA',
  // Washington
  'Seattle, WA', 'Spokane, WA', 'Tacoma, WA', 'Vancouver, WA', 'Bellevue, WA',
  'Everett, WA', 'Bellingham, WA',
  // West Virginia — entire state was missing
  'Charleston, WV', 'Huntington, WV', 'Morgantown, WV',
  // Wisconsin
  'Milwaukee, WI', 'Madison, WI', 'Green Bay, WI', 'Kenosha, WI', 'Racine, WI',
  // Wyoming
  'Cheyenne, WY', 'Casper, WY',
  // Washington DC
  'Washington, DC',
];

// ---------------------------------------------------------------------------
// Business name blocklist — comprehensive keyword filtering
// ---------------------------------------------------------------------------

/**
 * Comprehensive blocklist of business name keywords that indicate off-target results.
 * Matches case-insensitively. If a business name includes any of these keywords,
 * it is filtered out regardless of the search query category.
 */
export const BUSINESS_NAME_BLOCKLIST = [
  // Hospitality/lodging
  'hotel', 'motel', 'hilton', 'hyatt', 'marriott', 'westin', 'sheraton', 'hampton inn',
  'holiday inn', 'doubletree', 'embassy suites', 'radisson', 'best western', 'days inn',
  'super 8', 'la quinta', 'comfort inn', 'extended stay',

  // Automotive
  'tire shop', 'tire store', 'auto parts', 'muffler', 'oil change', 'car wash',
  'car dealership', 'auto sale', 'motor company', 'body shop', 'transmission',
  'brake shop', 'exhaust shop', 'rim shop',

  // Food/restaurant (excluding "auction cafe" context)
  'restaurant', 'burger', 'pizza', 'taco', 'subway', 'mcdonald\'s', 'wendy\'s',
  'chick-fil-a', 'starbucks', 'coffee shop', 'diner', 'fast food', 'donut',
  'bar & grill', 'sports bar', 'pizza restaurant',

  // Personal services
  'barber shop', 'hair salon', 'nail salon', 'spa', 'massage', 'tattoo parlor',
  'dry cleaner', 'laundromat', 'nail bar',

  // Government/institutional/chains
  'mta', 'metro transit', 'usps', 'post office', 'workforce solutions', 'ecoatm',
  'dollar general', 'dollar tree', 'family dollar', 'big lots', 'ross store',
  'burlington', 'marshalls', 'tj maxx', 'target', 'walmart', 'costco', 'sam\'s club',
  'cvs', 'walgreens', 'rite aid', 'duane reade', 'petco', 'petsmart',
  'dick\'s sporting goods', 'academy sports', 'spirit halloween', 'columbia sportswear',
  'adidas', 'nike store', 'victoria\'s secret', 'bath & body', 'claire\'s', 'yankee candle',

  // Construction/trades
  'roofing', 'plumbing', 'electrician', 'hvac', 'contractor', 'construction',
  'landscaping', 'lawn care', 'pest control', 'painting company',

  // Medical / optical
  'urgent care', 'clinic', 'hospital', 'dental', 'optometry', 'vision center',
  'chiropractic', 'physical therapy', 'pharmacy',
  'visionworks', 'lenscrafters', 'pearle vision', 'america\'s best contacts', 'optical',
  'eye care', 'eyecare', 'eye doctor', 'eyeglass world',

  // Real estate (different from estate sale companies)
  'real estate group', 'realty', 'realtor', 'property management',

  // Legal / professional services
  'attorney', 'law office', 'law firm', 'lawyer', 'esquire', 'legal services',
  'accountant', 'cpa', 'financial advisor', 'insurance agent',

  // Shopping malls / department stores (catch mall + antique mall query bleed)
  ' mall', 'shopping center', 'shopping plaza', 'outlet mall',
  'nordstrom', 'macy\'s', 'macys', 'jcpenney', 'sears', 'kohl\'s', 'kohls',
  'belk', 'dillard\'s', 'dillards', 'bloomingdale',

  // Beauty / cosmetics (catch jewelry consignment query bleed)
  'makeup counter', 'beauty counter', 'cosmetics', 'sephora', 'ulta',
  'chanel boutique', 'louis vuitton', 'gucci', 'hermes', 'prada',

  // Jewelry retail chains (not resale — new luxury jewelry)
  'kay jewelers', 'zales', 'jared', 'helzberg', 'tiffany', 'pandora',

  // Jewelry repair only (not consignment/resale)
  'watch repair', 'jewelry repair',
];

// ---------------------------------------------------------------------------
// Google Places type validation mapping
// ---------------------------------------------------------------------------

/**
 * Maps each business category to acceptable Google Places types.
 * If a place's types array has no overlap with these acceptable types,
 * the place is filtered out even if the name matches.
 */
export const ACCEPTABLE_GOOGLE_TYPES: Record<BusinessCategory, string[]> = {
  ANTIQUE_MALL: ['antique_store', 'shopping_mall', 'store', 'point_of_interest', 'establishment'],
  ANTIQUE_DEALER: ['antique_store', 'store', 'point_of_interest', 'establishment'],
  CONSIGNMENT: ['consignment', 'clothing_store', 'store', 'shopping_mall', 'point_of_interest', 'establishment'],
  THRIFT_STORE: ['thrift_store', 'used_goods_store', 'clothing_store', 'home_goods_store', 'furniture_store', 'store', 'point_of_interest', 'establishment'],
  FLEA_MARKET: ['flea_market', 'market', 'shopping_mall', 'bazaar', 'point_of_interest', 'establishment'],
  AUCTION_HOUSE: ['auctioneer', 'auction_house', 'store', 'establishment', 'point_of_interest'],
  VINTAGE: ['vintage_store', 'clothing_store', 'store', 'shopping_mall', 'point_of_interest', 'establishment'],
  ESTATE_SALE_CO: ['store', 'point_of_interest', 'establishment'],
  LIQUIDATION: ['liquidation_store', 'store', 'point_of_interest', 'establishment'],
  USED_FURNITURE: ['furniture_store', 'home_goods_store', 'store', 'point_of_interest', 'establishment'],
  PAWN_SHOP: ['pawn_shop', 'store', 'point_of_interest', 'establishment'],
  USED_BOOKSTORE: ['book_store', 'used_goods_store', 'store', 'point_of_interest', 'establishment'],
  RECORD_STORE: ['record_store', 'music_store', 'used_goods_store', 'store', 'point_of_interest', 'establishment'],
  USED_ELECTRONICS: ['electronics_store', 'used_goods_store', 'store', 'point_of_interest', 'establishment'],
  COIN_DEALER: ['coin_dealer', 'store', 'point_of_interest', 'establishment'],
  RESALE_SHOP: ['used_goods_store', 'clothing_store', 'store', 'point_of_interest', 'establishment'],
  USED_SPORTING_GOODS: ['sporting_goods_store', 'used_goods_store', 'store', 'point_of_interest', 'establishment'],
  JEWELRY_RESALE: ['jewelry_store', 'store', 'point_of_interest', 'establishment'],
};

// ---------------------------------------------------------------------------
// Google Places API types
// ---------------------------------------------------------------------------

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  business_status?: string;
  geometry?: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
}

interface PlacesTextSearchResponse {
  results: PlaceResult[];
  next_page_token?: string;
  status: string;
  error_message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch one page of Google Places Text Search results */
async function fetchPlacesPage(
  apiKey: string,
  query: string,
  googleType: string | undefined,
  pageToken?: string
): Promise<PlacesTextSearchResponse | null> {
  try {
    const url = new URL(`${PLACES_API_BASE}/textsearch/json`);
    if (pageToken) {
      // When using pagetoken, only key + pagetoken are allowed
      url.searchParams.set('pagetoken', pageToken);
      url.searchParams.set('key', apiKey);
    } else {
      url.searchParams.set('query', query);
      if (googleType) url.searchParams.set('type', googleType);
      url.searchParams.set('key', apiKey);
    }

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return null;
    return (await response.json()) as PlacesTextSearchResponse;
  } catch {
    return null;
  }
}

/**
 * Parse city and state from a Google formatted_address string.
 * Falls back to the metro query string on parse failure.
 * Input: "Store Name, 123 Main St, Grand Rapids, MI 49503, USA"
 * Output: { city: "Grand Rapids", state: "MI" }
 */
function parseCityState(
  formattedAddress: string | undefined,
  metroFallback: string
): { city: string; state: string } {
  if (formattedAddress) {
    const parts = formattedAddress.split(',').map((p) => p.trim());
    // Work backwards: look for "ST 12345" or bare "ST" before USA
    for (let i = parts.length - 1; i >= 1; i--) {
      const withZip = parts[i].match(/^([A-Z]{2})\s+\d{5}/);
      const bare = parts[i].match(/^([A-Z]{2})$/);
      const match = withZip || bare;
      if (match) {
        return { city: parts[i - 1], state: match[1] };
      }
    }
  }
  // Fallback: parse from metro string "City, ST"
  const fallbackMatch = metroFallback.match(/^(.+),\s*([A-Z]{2})$/);
  if (fallbackMatch) {
    return { city: fallbackMatch[1].trim(), state: fallbackMatch[2] };
  }
  return { city: 'Unknown', state: 'US' };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scrape Google Places for a single query + metro combination.
 * Returns up to 60 results (3 pages × 20).
 * Filters: OPERATIONAL status only; blocklisted names excluded.
 */
export async function scrapeGooglePlacesQuery(
  apiKey: string,
  queryConfig: QueryConfig,
  metro: string
): Promise<ScrapedItem[]> {
  if (!process.env.GOOGLE_MAPS_ENABLED) {
    return [];
  }
  const fullQuery = `${queryConfig.query} in ${metro}`;
  const results: ScrapedItem[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;

  while (pagesFetched < MAX_PAGES) {
    if (pageToken && pagesFetched > 0) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_TOKEN_DELAY_MS));
    }

    const response = await fetchPlacesPage(apiKey, fullQuery, queryConfig.googleType, pageToken);
    if (!response) {
      console.warn(`[GooglePlaces] No response for "${fullQuery}" page ${pagesFetched + 1}`);
      break;
    }
    if (response.status === 'ZERO_RESULTS') break;
    if (response.status !== 'OK') {
      console.warn(
        `[GooglePlaces] API status ${response.status} for "${fullQuery}": ${response.error_message ?? ''}`
      );
      break;
    }

    pagesFetched++;

    for (const place of response.results) {
      // Skip non-operational businesses (temporarily/permanently closed)
      if (place.business_status && place.business_status !== 'OPERATIONAL') continue;

      // Apply global business name blocklist (case-insensitive)
      const nameLower = place.name.toLowerCase();
      if (BUSINESS_NAME_BLOCKLIST.some((block) => nameLower.includes(block))) {
        console.debug(`[GooglePlaces] Filtered by global blocklist: "${place.name}" (${fullQuery})`);
        continue;
      }

      // Apply category-specific name blocklist if provided
      if (queryConfig.blocklist) {
        if (queryConfig.blocklist.some((block) => nameLower.includes(block))) {
          console.debug(`[GooglePlaces] Filtered by category blocklist: "${place.name}" (${fullQuery})`);
          continue;
        }
      }

      // Validate against Google Places type filter (if types are available)
      if (place.types && place.types.length > 0) {
        const acceptableTypes = ACCEPTABLE_GOOGLE_TYPES[queryConfig.category];
        const hasValidType = place.types.some((type) => acceptableTypes.includes(type));
        if (!hasValidType) {
          console.debug(
            `[GooglePlaces] Filtered by type validation: "${place.name}" has types [${place.types.join(', ')}], ` +
            `expected one of [${acceptableTypes.join(', ')}] for ${queryConfig.category} (${fullQuery})`
          );
          continue;
        }
      }

      const { city, state } = parseCityState(place.formatted_address, metro);
      const now = new Date();
      const endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 1);

      const item: ScrapedItem = {
        // Sale fields
        title: `${place.name} — ${queryConfig.label} in ${city}, ${state}`,
        address: '',        // Street address not returned by Text Search
        city,
        state,
        zip: '',
        startDate: now,
        endDate,
        description: null as any,
        saleType: queryConfig.saleType,
        // Organizer fields
        organizerName: place.name,
        googlePlaceId: place.place_id,
        businessCategory: queryConfig.category,
        // Source tracking
        sourceName: 'GooglePlaces',
        sourceUrl: `https://maps.google.com/?cid=${place.place_id}`,
        sourceItemId: place.place_id,  // Primary dedup key
        // Metadata for enrichment pipeline
        scrapedMetadata: {
          businessCategory: queryConfig.category,
          placeId: place.place_id,
          lat: place.geometry?.location.lat ?? null,
          lng: place.geometry?.location.lng ?? null,
          googleRating: place.rating ?? null,
          googleRatingCount: place.user_ratings_total ?? null,
          formattedAddress: place.formatted_address ?? null,
          searchQuery: fullQuery,
        },
      };

      results.push(item);
    }

    pageToken = response.next_page_token;
    if (!pageToken) break;
  }

  return results;
}
