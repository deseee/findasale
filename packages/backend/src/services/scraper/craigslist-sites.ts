/**
 * Craigslist metro sites list for national scraping
 * Format: { subdomain: string, label: string, state: string }
 *
 * ADR-073: Directory Scraper Phase 2 — Craigslist
 * Covers top ~80 US metros with measurable yard/estate sale activity.
 * To expand: craigslist.org/about/sites has the full list; add metros where
 * garage/estate/yard sale listings are active (gms, est categories non-empty).
 */

export interface CraigslistSite {
  subdomain: string;
  label: string;
  state: string;
}

export const CRAIGSLIST_SITES: CraigslistSite[] = [
  // Northeast
  { subdomain: 'boston', label: 'Boston, MA', state: 'MA' },
  { subdomain: 'newyork', label: 'New York, NY', state: 'NY' },
  { subdomain: 'buffalo', label: 'Buffalo, NY', state: 'NY' },
  { subdomain: 'philadelphia', label: 'Philadelphia, PA', state: 'PA' },
  { subdomain: 'pittsburgh', label: 'Pittsburgh, PA', state: 'PA' },
  { subdomain: 'baltimore', label: 'Baltimore, MD', state: 'MD' },
  { subdomain: 'washingtondc', label: 'Washington, DC', state: 'DC' },
  { subdomain: 'richmond', label: 'Richmond, VA', state: 'VA' },

  // Mid-Atlantic / South
  { subdomain: 'charlotte', label: 'Charlotte, NC', state: 'NC' },
  { subdomain: 'raleigh', label: 'Raleigh, NC', state: 'NC' },
  { subdomain: 'atlanta', label: 'Atlanta, GA', state: 'GA' },
  { subdomain: 'miami', label: 'Miami, FL', state: 'FL' },
  { subdomain: 'orlando', label: 'Orlando, FL', state: 'FL' },
  { subdomain: 'tampa', label: 'Tampa, FL', state: 'FL' },
  { subdomain: 'jacksonville', label: 'Jacksonville, FL', state: 'FL' },
  { subdomain: 'memphis', label: 'Memphis, TN', state: 'TN' },
  { subdomain: 'nashville', label: 'Nashville, TN', state: 'TN' },
  { subdomain: 'louisville', label: 'Louisville, KY', state: 'KY' },

  // Midwest
  { subdomain: 'chicago', label: 'Chicago, IL', state: 'IL' },
  { subdomain: 'detroit', label: 'Detroit, MI', state: 'MI' },
  { subdomain: 'grandrapids', label: 'Grand Rapids, MI', state: 'MI' },
  { subdomain: 'cleveland', label: 'Cleveland, OH', state: 'OH' },
  { subdomain: 'columbus', label: 'Columbus, OH', state: 'OH' },
  { subdomain: 'cincinnati', label: 'Cincinnati, OH', state: 'OH' },
  { subdomain: 'indianapolis', label: 'Indianapolis, IN', state: 'IN' },
  { subdomain: 'milwaukee', label: 'Milwaukee, WI', state: 'WI' },
  { subdomain: 'minneapolis', label: 'Minneapolis, MN', state: 'MN' },
  { subdomain: 'stlouis', label: 'St. Louis, MO', state: 'MO' },
  { subdomain: 'kansascity', label: 'Kansas City, MO', state: 'MO' },

  // Plains / Mountain West
  { subdomain: 'denver', label: 'Denver, CO', state: 'CO' },
  { subdomain: 'bouldercolo', label: 'Boulder, CO', state: 'CO' },
  { subdomain: 'fort-collins', label: 'Fort Collins, CO', state: 'CO' },
  { subdomain: 'cosprings', label: 'Colorado Springs, CO', state: 'CO' },
  { subdomain: 'albuquerque', label: 'Albuquerque, NM', state: 'NM' },
  { subdomain: 'phoenix', label: 'Phoenix, AZ', state: 'AZ' },
  { subdomain: 'tucson', label: 'Tucson, AZ', state: 'AZ' },
  { subdomain: 'saltlakecity', label: 'Salt Lake City, UT', state: 'UT' },
  { subdomain: 'lasvegas', label: 'Las Vegas, NV', state: 'NV' },

  // Pacific / West Coast
  { subdomain: 'seattle', label: 'Seattle, WA', state: 'WA' },
  { subdomain: 'spokane', label: 'Spokane, WA', state: 'WA' },
  { subdomain: 'portland', label: 'Portland, OR', state: 'OR' },
  { subdomain: 'eugene', label: 'Eugene, OR', state: 'OR' },
  { subdomain: 'sfbay', label: 'San Francisco, CA', state: 'CA' },
  { subdomain: 'losangeles', label: 'Los Angeles, CA', state: 'CA' },
  { subdomain: 'sandiego', label: 'San Diego, CA', state: 'CA' },
  { subdomain: 'sacramento', label: 'Sacramento, CA', state: 'CA' },
  { subdomain: 'fresno', label: 'Fresno, CA', state: 'CA' },

  // Texas
  { subdomain: 'dallas', label: 'Dallas, TX', state: 'TX' },
  { subdomain: 'houston', label: 'Houston, TX', state: 'TX' },
  { subdomain: 'austin', label: 'Austin, TX', state: 'TX' },
  { subdomain: 'sanantonio', label: 'San Antonio, TX', state: 'TX' },

  // Additional major metros
  { subdomain: 'omaha', label: 'Omaha, NE', state: 'NE' },
  { subdomain: 'oklahomacity', label: 'Oklahoma City, OK', state: 'OK' },
  { subdomain: 'neworleans', label: 'New Orleans, LA', state: 'LA' },
];
