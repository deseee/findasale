/**
 * HTML Parser for extracting sale data from various sources
 */

import * as cheerio from 'cheerio';

export interface ParsedListing {
  title: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  startDate: Date;
  endDate: Date;
  // Bug fix (566-row TODAY/Live badge bug, S1130 diagnostic): directory-style listings
  // (Foursquare/HERE Places) are always-live business listings, not dated events.
  // isOngoing mirrors Sale.isOngoing (permanent-storefront model) — when true, the
  // frontend suppresses the start/end date range and downstream create-only rescrape
  // logic treats the sale as always current regardless of the frozen scrape-time dates.
  isOngoing?: boolean;
  organizerName?: string;
  organizerEmail?: string;
  organizerPhone?: string;   // scraped phone — fills organizer.phone only if currently null
  organizerWebsite?: string; // scraped website — fills organizer.website only if currently null
  description?: string;
  photoUrls?: string[];
  saleType?: string; // ESTATE | YARD | AUCTION | FLEA_MARKET | RETAIL | DORM_DASH
  saleSubtype?: string; // ADR-023: estate | yard | moving | auction | storage | flea | popup | downsizing | liquidation | swap_meet | storefront | consignment
  esnOrgId?: number; // EstateSales.NET numeric company ID
  googlePlaceId?: string; // ADR-077: Google Places ID — dedup key for business directory listings
  foursquareVenueId?: string; // ADR-077 Phase 2: Foursquare venue ID — cross-source dedup
  hereBusinessId?: string; // ADR-077 Phase 2: HERE business ID — cross-source dedup
  businessCategory?: string; // ADR-077: business type for Google Places-sourced organizers
}

/**
 * Parse EstateSales.NET listing HTML
 */
export function parseEstateSalesNetListing(html: string): Partial<ParsedListing> | null {
  try {
    const $ = cheerio.load(html);

    const title = $('h1.sale-title').text().trim();
    const addressText = $('[data-address]').text().trim();
    const dateText = $('[data-dates]').text().trim();
    const contactEmail = $('a[href^="mailto:"]').attr('href')?.replace('mailto:', '');
    const contactName = $('[data-contact-name]').text().trim();

    if (!title || !addressText) return null;

    const addressMatch = addressText.match(
      /^(.+?),\s*(.+?),\s*([A-Z]{2})\s*(\d{5})(-\d{4})?$/
    );
    if (!addressMatch) return null;

    const [, street, city, state, zip] = addressMatch;

    const dateMatch = dateText.match(/(\w+\s+\w+\s+\d+).*?(\w+\s+\w+\s+\d+,\s*\d{4})/);
    if (!dateMatch) return null;

    const [, startStr, endStr] = dateMatch;
    // Derive year dynamically from endDate (which already carries a full year from the regex).
    // Handles cross-year sales (e.g. Dec 31 → Jan 2) by stepping back one year if startDate
    // would otherwise fall after endDate.
    const endDate = new Date(endStr);
    const endYear = endDate.getFullYear();
    const startAttempt = new Date(`${startStr}, ${endYear}`);
    const startDate = startAttempt > endDate
      ? new Date(`${startStr}, ${endYear - 1}`)
      : startAttempt;

    const photoUrls: string[] = [];
    $('img.sale-photo').each((_, el) => {
      const src = $(el).attr('src');
      if (src) photoUrls.push(src);
    });

    return {
      title,
      address: street,
      city,
      state,
      zip,
      startDate,
      endDate,
      organizerName: contactName || undefined,
      organizerEmail: contactEmail || undefined,
      description: $('[data-description]').text().trim() || undefined,
      photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      saleType: 'ESTATE',
    };
  } catch (error) {
    console.error('Error parsing EstateSales.NET listing:', error);
    return null;
  }
}

/**
 * Parse GarageSaleFinder.com listing HTML
 *
 * Handles two address formats:
 *  1. Full:    "921 Covell Ave NW, Grand Rapids, MI 49504"
 *  2. Hidden:  "Pasadena, CA 91107 *Address hidden until May 13, 2026..."
 *              (GarageSaleFinder hides street until sale day for some listings)
 */
export function parseGarageSalesFinderListing(html: string): Partial<ParsedListing> | null {
  try {
    const $ = cheerio.load(html);

    const title = $('h2[itemprop="name"]').text().trim();
    // Strip HTML tags from address block before text extraction (hidden-address notice uses <br><small>)
    const addressRaw = $('[itemprop="address"]').text().trim().replace(/\s+/g, ' ');
    // Strip "* Address hidden..." notice so it doesn't pollute parsing
    const addressText = addressRaw.replace(/\*?\s*Address hidden[^.]*.\s*/i, '').trim();
    const startDateStr = $('meta[itemprop="startDate"]').attr('content') ?? '';
    const endDateStr = $('meta[itemprop="endDate"]').attr('content') ?? '';

    if (!title || !addressText) return null;

    let street: string = '';
    let city: string;
    let state: string;
    let zip: string | undefined;

    // Try full address first: "Street, City, ST 12345"
    const fullMatch = addressText.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5})/);
    if (fullMatch) {
      [, street, city, state, zip] = fullMatch;
    } else {
      // Fallback: hidden/partial address "City, ST 12345" (no street)
      const partialMatch = addressText.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5})/);
      if (!partialMatch) return null;
      [, city, state, zip] = partialMatch;
      // city value may still have trailing noise — trim it
      city = city.trim();
    }

    if (!startDateStr || !endDateStr) return null;
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;

    const photoUrls: string[] = $('img[itemprop="image"]')
      .map((_, el) => $(el).attr('src'))
      .get()
      .filter((src): src is string => !!src);

    return {
      title,
      address: street,   // empty string for hidden-address listings — allowed by ingestScrapedListing
      city,
      state,
      zip,
      startDate,
      endDate,
      description: $('[itemprop="description"].description').text().trim() || undefined,
      photoUrls: photoUrls.length > 0 ? photoUrls.slice(0, 5) : undefined,
      saleType: 'YARD',
    };
  } catch (error) {
    console.error('Error parsing GarageSaleFinder listing:', error);
    return null;
  }
}

/**
 * Parse a GarageSaleFinder gallery page to extract full-size images.
 * Gallery pages serve w700-h500 JPEGs in static HTML — no JS needed.
 */
export function parseGarageSalesFinderGallery(html: string): string[] {
  const $ = cheerio.load(html);
  const photos: string[] = [];
  $('img[src*="w700-h500"]').each((_, el) => {
    const src = $(el).attr('src');
    if (src && (src.includes('tlstatic.com') || src.includes('tlcdn'))) {
      photos.push(src);
    }
  });
  return photos.slice(0, 5);
}

/**
 * Extract email addresses from text (for organizer contact)
 */
export function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return text.match(emailRegex) || [];
}

/**
 * Extract phone numbers from text
 */
export function extractPhones(text: string): string[] {
  const phoneRegex = /\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;
  const matches: string[] = [];
  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    matches.push(`${match[1]}-${match[2]}-${match[3]}`);
  }
  return matches;
}
