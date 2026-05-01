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
  organizerName?: string;
  organizerEmail?: string;
  description?: string;
  photoUrls?: string[];
  saleType?: string; // ESTATE | YARD | AUCTION | FLEA_MARKET
}

/**
 * Parse EstateSales.NET listing HTML
 */
export function parseEstateSalesNetListing(html: string): Partial<ParsedListing> | null {
  try {
    const $ = cheerio.load(html);

    // EstateSales.NET specific selectors (may need adjustment based on actual HTML)
    const title = $('h1.sale-title').text().trim();
    const addressText = $('[data-address]').text().trim();
    const dateText = $('[data-dates]').text().trim();
    const contactEmail = $('a[href^="mailto:"]').attr('href')?.replace('mailto:', '');
    const contactName = $('[data-contact-name]').text().trim();

    if (!title || !addressText) return null;

    // Parse address (format: "123 Main St, Grand Rapids, MI 49503")
    const addressMatch = addressText.match(
      /^(.+?),\s*(.+?),\s*([A-Z]{2})\s*(\d{5})(-\d{4})?$/
    );
    if (!addressMatch) return null;

    const [, street, city, state, zip] = addressMatch;

    // Parse dates (format: "Fri May 10 - Sun May 12, 2026")
    const dateMatch = dateText.match(/(\w+\s+\w+\s+\d+).*?(\w+\s+\w+\s+\d+,\s*\d{4})/);
    if (!dateMatch) return null;

    const [, startStr, endStr] = dateMatch;
    const startDate = new Date(`${startStr}, 2026`);
    const endDate = new Date(endStr);

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
 */
export function parseGarageSalesFinderListing(html: string): Partial<ParsedListing> | null {
  try {
    const $ = cheerio.load(html);

    // GarageSaleFinder specific selectors (generic fallback)
    const title = $('.sale-title, h1').first().text().trim();
    const addressText = $('.address, [data-address]').text().trim();
    const dateText = $('.dates, [data-dates]').text().trim();

    if (!title || !addressText) return null;

    // Simple address parsing for yard sales
    const addressMatch = addressText.match(
      /^(.+?),\s*(.+?),\s*([A-Z]{2})\s*(\d{5})/
    );
    if (!addressMatch) return null;

    const [, street, city, state, zip] = addressMatch;

    // Parse date (flexible format)
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const photoUrls: string[] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && (src.includes('sale') || src.includes('garage'))) {
        photoUrls.push(src);
      }
    });

    return {
      title,
      address: street,
      city,
      state,
      zip,
      startDate,
      endDate,
      description: $('.description').text().trim() || undefined,
      photoUrls: photoUrls.length > 0 ? photoUrls.slice(0, 5) : undefined,
      saleType: 'YARD',
    };
  } catch (error) {
    console.error('Error parsing GarageSaleFinder listing:', error);
    return null;
  }
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
