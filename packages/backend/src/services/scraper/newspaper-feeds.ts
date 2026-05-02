/**
 * Newspaper/Classified RSS Feed Aggregator
 * Curated list of Oodle (newspaper classifieds aggregator) and Google News feeds
 * covering US metros with yard/estate sale activity.
 *
 * ADR-077: Classified RSS scraper — national, no auth required
 * Focus: Oodle classifieds (best quality), supplemented with Google News
 *
 * NOTE: Oodle feeds return HTTP 403 from GitHub Actions runners (Azure IPs blocked).
 * They work from non-GH-Actions environments (local dev, VPS, Railway).
 * Google News feeds work from all environments including GH Actions.
 */

export interface RssFeed {
  name: string;          // Human-readable name for logging/UI
  url: string;           // RSS feed URL
  city: string;          // City for listings parsed from this feed
  state: string;         // 2-letter state code
  category: 'garage_sale' | 'estate_sale' | 'classifieds' | 'mixed';
}

/**
 * NEWSPAPER_FEEDS: 54 Oodle feeds (27 metros × 2 types) + 8 Google News supplemental
 * Oodle aggregates newspaper classified sections nationally with no auth.
 * Most reliable source for structured garage/estate sale listings.
 *
 * Format: https://www.oodle.com/for-sale/{type}/{city-slug}-{state-lower}/rss
 * Types: garage-sale, estate-sale
 */
export const NEWSPAPER_FEEDS: RssFeed[] = [
  // Michigan (2 + 2 = 4)
  {
    name: 'Oodle Grand Rapids - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/grand-rapids-mi/rss',
    city: 'Grand Rapids',
    state: 'MI',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Grand Rapids - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/grand-rapids-mi/rss',
    city: 'Grand Rapids',
    state: 'MI',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Detroit - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/detroit-mi/rss',
    city: 'Detroit',
    state: 'MI',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Detroit - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/detroit-mi/rss',
    city: 'Detroit',
    state: 'MI',
    category: 'estate_sale',
  },

  // Illinois (2)
  {
    name: 'Oodle Chicago - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/chicago-il/rss',
    city: 'Chicago',
    state: 'IL',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Chicago - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/chicago-il/rss',
    city: 'Chicago',
    state: 'IL',
    category: 'estate_sale',
  },

  // Indiana (2)
  {
    name: 'Oodle Indianapolis - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/indianapolis-in/rss',
    city: 'Indianapolis',
    state: 'IN',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Indianapolis - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/indianapolis-in/rss',
    city: 'Indianapolis',
    state: 'IN',
    category: 'estate_sale',
  },

  // Ohio (6)
  {
    name: 'Oodle Cleveland - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/cleveland-oh/rss',
    city: 'Cleveland',
    state: 'OH',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Cleveland - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/cleveland-oh/rss',
    city: 'Cleveland',
    state: 'OH',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Columbus - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/columbus-oh/rss',
    city: 'Columbus',
    state: 'OH',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Columbus - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/columbus-oh/rss',
    city: 'Columbus',
    state: 'OH',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Cincinnati - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/cincinnati-oh/rss',
    city: 'Cincinnati',
    state: 'OH',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Cincinnati - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/cincinnati-oh/rss',
    city: 'Cincinnati',
    state: 'OH',
    category: 'estate_sale',
  },

  // Wisconsin (2)
  {
    name: 'Oodle Milwaukee - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/milwaukee-wi/rss',
    city: 'Milwaukee',
    state: 'WI',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Milwaukee - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/milwaukee-wi/rss',
    city: 'Milwaukee',
    state: 'WI',
    category: 'estate_sale',
  },

  // Minnesota (2)
  {
    name: 'Oodle Minneapolis - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/minneapolis-mn/rss',
    city: 'Minneapolis',
    state: 'MN',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Minneapolis - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/minneapolis-mn/rss',
    city: 'Minneapolis',
    state: 'MN',
    category: 'estate_sale',
  },

  // Missouri (4)
  {
    name: 'Oodle St. Louis - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/st-louis-mo/rss',
    city: 'St. Louis',
    state: 'MO',
    category: 'garage_sale',
  },
  {
    name: 'Oodle St. Louis - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/st-louis-mo/rss',
    city: 'St. Louis',
    state: 'MO',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Kansas City - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/kansas-city-mo/rss',
    city: 'Kansas City',
    state: 'MO',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Kansas City - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/kansas-city-mo/rss',
    city: 'Kansas City',
    state: 'MO',
    category: 'estate_sale',
  },

  // Tennessee (2)
  {
    name: 'Oodle Nashville - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/nashville-tn/rss',
    city: 'Nashville',
    state: 'TN',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Nashville - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/nashville-tn/rss',
    city: 'Nashville',
    state: 'TN',
    category: 'estate_sale',
  },

  // Georgia (2)
  {
    name: 'Oodle Atlanta - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/atlanta-ga/rss',
    city: 'Atlanta',
    state: 'GA',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Atlanta - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/atlanta-ga/rss',
    city: 'Atlanta',
    state: 'GA',
    category: 'estate_sale',
  },

  // North Carolina (4)
  {
    name: 'Oodle Charlotte - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/charlotte-nc/rss',
    city: 'Charlotte',
    state: 'NC',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Charlotte - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/charlotte-nc/rss',
    city: 'Charlotte',
    state: 'NC',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Raleigh - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/raleigh-nc/rss',
    city: 'Raleigh',
    state: 'NC',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Raleigh - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/raleigh-nc/rss',
    city: 'Raleigh',
    state: 'NC',
    category: 'estate_sale',
  },

  // Maryland (2)
  {
    name: 'Oodle Baltimore - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/baltimore-md/rss',
    city: 'Baltimore',
    state: 'MD',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Baltimore - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/baltimore-md/rss',
    city: 'Baltimore',
    state: 'MD',
    category: 'estate_sale',
  },

  // Virginia (2)
  {
    name: 'Oodle Richmond - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/richmond-va/rss',
    city: 'Richmond',
    state: 'VA',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Richmond - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/richmond-va/rss',
    city: 'Richmond',
    state: 'VA',
    category: 'estate_sale',
  },

  // Colorado (4)
  {
    name: 'Oodle Denver - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/denver-co/rss',
    city: 'Denver',
    state: 'CO',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Denver - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/denver-co/rss',
    city: 'Denver',
    state: 'CO',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Boulder - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/boulder-co/rss',
    city: 'Boulder',
    state: 'CO',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Boulder - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/boulder-co/rss',
    city: 'Boulder',
    state: 'CO',
    category: 'estate_sale',
  },

  // Arizona (4)
  {
    name: 'Oodle Phoenix - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/phoenix-az/rss',
    city: 'Phoenix',
    state: 'AZ',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Phoenix - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/phoenix-az/rss',
    city: 'Phoenix',
    state: 'AZ',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Tucson - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/tucson-az/rss',
    city: 'Tucson',
    state: 'AZ',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Tucson - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/tucson-az/rss',
    city: 'Tucson',
    state: 'AZ',
    category: 'estate_sale',
  },

  // Washington (2)
  {
    name: 'Oodle Seattle - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/seattle-wa/rss',
    city: 'Seattle',
    state: 'WA',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Seattle - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/seattle-wa/rss',
    city: 'Seattle',
    state: 'WA',
    category: 'estate_sale',
  },

  // Oregon (2)
  {
    name: 'Oodle Portland - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/portland-or/rss',
    city: 'Portland',
    state: 'OR',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Portland - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/portland-or/rss',
    city: 'Portland',
    state: 'OR',
    category: 'estate_sale',
  },

  // Texas (8)
  {
    name: 'Oodle Dallas - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/dallas-tx/rss',
    city: 'Dallas',
    state: 'TX',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Dallas - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/dallas-tx/rss',
    city: 'Dallas',
    state: 'TX',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Houston - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/houston-tx/rss',
    city: 'Houston',
    state: 'TX',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Houston - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/houston-tx/rss',
    city: 'Houston',
    state: 'TX',
    category: 'estate_sale',
  },
  {
    name: 'Oodle Austin - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/austin-tx/rss',
    city: 'Austin',
    state: 'TX',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Austin - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/austin-tx/rss',
    city: 'Austin',
    state: 'TX',
    category: 'estate_sale',
  },
  {
    name: 'Oodle San Antonio - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/san-antonio-tx/rss',
    city: 'San Antonio',
    state: 'TX',
    category: 'garage_sale',
  },
  {
    name: 'Oodle San Antonio - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/san-antonio-tx/rss',
    city: 'San Antonio',
    state: 'TX',
    category: 'estate_sale',
  },

  // Pennsylvania (2)
  {
    name: 'Oodle Philadelphia - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/philadelphia-pa/rss',
    city: 'Philadelphia',
    state: 'PA',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Philadelphia - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/philadelphia-pa/rss',
    city: 'Philadelphia',
    state: 'PA',
    category: 'estate_sale',
  },

  // Massachusetts (2)
  {
    name: 'Oodle Boston - Garage Sales',
    url: 'https://www.oodle.com/for-sale/garage-sale/boston-ma/rss',
    city: 'Boston',
    state: 'MA',
    category: 'garage_sale',
  },
  {
    name: 'Oodle Boston - Estate Sales',
    url: 'https://www.oodle.com/for-sale/estate-sale/boston-ma/rss',
    city: 'Boston',
    state: 'MA',
    category: 'estate_sale',
  },

  // ===== GOOGLE NEWS SUPPLEMENTAL FEEDS (8) =====
  // Lower quality but captures local news about sales
  {
    name: 'Google News - Estate Sales (National)',
    url: 'https://news.google.com/rss/search?q=estate+sale&hl=en-US&gl=US&ceid=US:en',
    city: 'National',
    state: 'US',
    category: 'mixed',
  },
  {
    name: 'Google News - Garage Sales (National)',
    url: 'https://news.google.com/rss/search?q=garage+sale&hl=en-US&gl=US&ceid=US:en',
    city: 'National',
    state: 'US',
    category: 'mixed',
  },
  {
    name: 'Google News - Yard Sales (National)',
    url: 'https://news.google.com/rss/search?q=yard+sale&hl=en-US&gl=US&ceid=US:en',
    city: 'National',
    state: 'US',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Auction (National)',
    url: 'https://news.google.com/rss/search?q=estate+auction&hl=en-US&gl=US&ceid=US:en',
    city: 'National',
    state: 'US',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Sales (Michigan)',
    url: 'https://news.google.com/rss/search?q=estate+sale+Michigan&hl=en-US&gl=US&ceid=US:en',
    city: 'Michigan',
    state: 'MI',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Sales (Ohio)',
    url: 'https://news.google.com/rss/search?q=estate+sale+Ohio&hl=en-US&gl=US&ceid=US:en',
    city: 'Ohio',
    state: 'OH',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Sales (Texas)',
    url: 'https://news.google.com/rss/search?q=estate+sale+Texas&hl=en-US&gl=US&ceid=US:en',
    city: 'Texas',
    state: 'TX',
    category: 'mixed',
  },
  {
    name: 'Google News - Estate Sales (California)',
    url: 'https://news.google.com/rss/search?q=estate+sale+California&hl=en-US&gl=US&ceid=US:en',
    city: 'California',
    state: 'CA',
    category: 'mixed',
  },
];
