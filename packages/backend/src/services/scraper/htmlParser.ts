/**
 * HTML Parser for extracting sale data from various sources
 */

import * as cheerio from 'cheerio';
import {
  padHtmlForTextExtraction,
  sanitizeEmailCandidate,
  isMalformedCandidate,
  extractEmailCandidatesFromText,
} from '../emailProvenance';

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
    // 2026-08-16: decode + structurally validate — an un-decoded `mailto:%20foo@bar.com`
    // href was being stored verbatim as a live outreach address. Shared helper, same as
    // every other extraction path.
    const rawMailto = $('a[href^="mailto:"]').attr('href')?.replace(/^mailto:/i, '').split('?')[0];
    const decodedMailto = rawMailto ? sanitizeEmailCandidate(rawMailto) : undefined;
    const contactEmail =
      decodedMailto && !isMalformedCandidate(decodedMailto) ? decodedMailto : undefined;
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
  return parseGarageSalesFinderListingWithReason(html).listing;
}

const GSF_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Parse a date-like string (ISO date / ISO datetime / "October 31, 2026"); date-only -> UTC midnight. */
function gsfParseDate(raw: string | undefined | null): Date | null {
  const v = (raw || '').trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Fallback date extraction from visible text: weekday-prefixed dates such as
 * "Saturday, October 31, 2026". Returns UTC-midnight dates (the same shape the old
 * date-only microdata produced). Dates more than 31 days after the first match are ignored
 * so a stray "posted"/comment date cannot stretch the range.
 */
export function gsfDatesFromText(text: string): { start: Date; end: Date } | null {
  // No leading \b: cheerio .text() glues adjacent elements ("2:00 pmSunday, ...").
  const re = /(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi;
  const found: Date[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const month = GSF_MONTHS.indexOf(m[1].toLowerCase());
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month < 0 || day < 1 || day > 31) continue;
    found.push(new Date(Date.UTC(year, month, day)));
  }
  if (found.length === 0) return null;
  const first = found[0].getTime();
  const window = found.filter((d) => d.getTime() >= first - 31 * 86400000 && d.getTime() <= first + 31 * 86400000);
  const times = window.map((d) => d.getTime());
  return { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) };
}

/** Pull startDate/endDate out of any JSON-LD block (Event or @graph member). */
function gsfDatesFromJsonLd($: cheerio.CheerioAPI): { start: Date; end: Date } | null {
  let out: { start: Date; end: Date } | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (out) return;
    try {
      const data = JSON.parse($(el).contents().text());
      const nodes: any[] = Array.isArray(data) ? data : data && Array.isArray(data['@graph']) ? data['@graph'] : [data];
      for (const n of nodes) {
        const s = gsfParseDate(n && n.startDate);
        const e = gsfParseDate(n && (n.endDate || n.startDate));
        if (s && e) {
          out = { start: s, end: e };
          return;
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return out;
}

/** Split "Street, City, ST 12345" or "City, ST 12345" into parts; null when it does not match. */
function gsfSplitAddress(text: string): { street: string; city: string; state: string; zip?: string } | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const full = t.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5})/);
  if (full) return { street: full[1].trim(), city: full[2].trim(), state: full[3], zip: full[4] };
  const partial = t.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5})/);
  if (partial) return { street: '', city: partial[1].trim(), state: partial[2], zip: partial[3] };
  return null;
}

/**
 * GarageSaleFinder detail-page parser with a failure reason.
 *
 * 2026-10-30: from the 2026-10-28 06:00 UTC run onward every detail page fetched 2xx but
 * none parsed (itemsFailed = itemsFound on 10-28/29/30, 0 created) and the metro pages
 * stopped exposing img[itemprop="image"] -- GSF removed or changed its schema.org
 * microdata. The microdata selectors stay first (unchanged behaviour when present); each
 * field now has a non-microdata fallback taken from markup the live page was confirmed to
 * carry on 2026-10-30: og:title, the <title> tag ("58 Hyland Ave, East Greenwich, RI
 * 02818 | 21811163 | GarageSaleFinder.com"), og:image/og:description, and visible
 * weekday dates ("Saturday, October 31, 2026"). JSON-LD is also accepted if present.
 */
export function parseGarageSalesFinderListingWithReason(html: string): {
  listing: Partial<ParsedListing> | null;
  reason?: string;
} {
  try {
    const $ = cheerio.load(html);

    const title =
      $('h2[itemprop="name"]').first().text().trim() ||
      ($('meta[property="og:title"]').attr('content') || '').trim() ||
      $('h1').first().text().trim();
    if (!title) return { listing: null, reason: 'no_title' };

    // Address: microdata block first, then the <title> tag's first segment, then body text.
    let addr: ReturnType<typeof gsfSplitAddress> = null;
    const addressRaw = $('[itemprop="address"]').text().trim().replace(/\s+/g, ' ');
    // Strip "* Address hidden..." notice so it doesn't pollute parsing
    const addressText = addressRaw.replace(/\*?\s*Address hidden[^.]*.\s*/i, '').trim();
    if (addressText) addr = gsfSplitAddress(addressText);
    if (!addr) {
      const docTitle = $('title').first().text().trim();
      const firstSeg = docTitle.split('|')[0] || '';
      addr = gsfSplitAddress(firstSeg);
    }
    if (!addr) {
      const bodyText = $('body').text().replace(/\s+/g, ' ');
      const m = bodyText.match(/([A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*){0,4}),\s*([A-Z]{2})\s+(\d{5})\b/);
      if (m) addr = { street: '', city: m[1].trim(), state: m[2], zip: m[3] };
    }
    if (!addr) return { listing: null, reason: 'no_address' };

    // Dates: microdata (meta or element) -> JSON-LD -> visible weekday dates.
    const itemStart =
      $('meta[itemprop="startDate"]').attr('content') ||
      $('[itemprop="startDate"]').attr('content') ||
      $('[itemprop="startDate"]').attr('datetime');
    const itemEnd =
      $('meta[itemprop="endDate"]').attr('content') ||
      $('[itemprop="endDate"]').attr('content') ||
      $('[itemprop="endDate"]').attr('datetime');
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    if (itemStart && itemEnd) {
      startDate = new Date(itemStart);
      endDate = new Date(itemEnd);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return { listing: null, reason: 'bad_microdata_date' };
      }
    } else {
      const ld = gsfDatesFromJsonLd($);
      const fromText = ld ?? gsfDatesFromText($('body').text().replace(/\s+/g, ' '));
      if (fromText) {
        startDate = fromText.start;
        endDate = fromText.end;
      }
    }
    if (!startDate || !endDate) return { listing: null, reason: 'no_dates' };

    let photoUrls: string[] = $('img[itemprop="image"]')
      .map((_, el) => $(el).attr('src'))
      .get()
      .filter((src): src is string => !!src);
    if (photoUrls.length === 0) {
      // 2026-11-01: the detail page itself carries every sale photo as a thumbnail
      // (gsf.tlstatic.com/image/w150-h100/... or EstateSales.org's tlcdn photo CDN, .../s-<id>-...-t.webp), so the
      // separate /gallery fetch is no longer needed (its <img> tags are now lazy spacer.png).
      photoUrls = gsfPhotosFromHtml(html);
    }
    if (photoUrls.length === 0) {
      const og = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (og) photoUrls = [gsfFullSizePhotoUrl(og)];
    }

    const description =
      $('[itemprop="description"].description').text().trim() ||
      ($('meta[property="og:description"]').attr('content') || '').trim() ||
      undefined;

    return {
      listing: {
        title,
        address: addr.street, // empty string for hidden-address listings — allowed by ingestScrapedListing
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        startDate,
        endDate,
        description,
        photoUrls: photoUrls.length > 0 ? photoUrls.slice(0, 5) : undefined,
        saleType: 'YARD',
      },
    };
  } catch (error) {
    console.error('Error parsing GarageSaleFinder listing:', error);
    return { listing: null, reason: 'exception' };
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
  // 2026-11-01: gallery <img> src is now a lazy spacer.png; fall back to any photo URL in
  // the markup (data-src, srcset, links), upgraded to the w700-h500 size.
  if (photos.length === 0) return gsfPhotosFromHtml(html);
  return photos.slice(0, 5);
}

/**
 * GarageSaleFinder photo CDN size segment, e.g. /image/w150-h100/ or /image/w300-c300:300/.
 * The same photo is served at /image/w700-h500/ (the size GSF itself uses in its Pinterest
 * share link, confirmed on a live listing 2026-11-01).
 */
const GSF_SIZE_SEGMENT_RE = /\/image\/w\d+-(?:h\d+|c\d+(?::\d+)?)\//;

/** Upgrade a gsf/ysn tlstatic thumbnail URL to the w700-h500 size; other URLs unchanged. */
export function gsfFullSizePhotoUrl(url: string): string {
  if (!/\.tlstatic\.com\//i.test(url)) return url;
  return url.replace(GSF_SIZE_SEGMENT_RE, '/image/w700-h500/');
}

/**
 * Every sale photo URL in a GarageSaleFinder page, in page order, de-duplicated, max 5.
 * Attribute-agnostic (src, data-src, srcset, href, og:image all match) so a lazy-loading
 * markup change does not lose the photos. Site assets (/images/... logos, social icons,
 * spacer.png) are excluded; only photo paths are kept:
 *   - *.tlstatic.com/image/<size>/...   (GSF-hosted photos; upgraded to w700-h500)
 *   - tlcdn CDN /s-<id>-...           (photos of listings syndicated from EstateSales.org;
 *                                        kept as served, no larger size is confirmed)
 */
export function gsfPhotosFromHtml(html: string): string[] {
  const re = /https?:\/\/[a-z0-9.-]+\.(?:tlstatic\.com|tlcdn\.workers\.dev)\/[^\s"'<>()\\]+?\.(?:jpe?g|png|webp)/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[0].replace(/&amp;/g, '&');
    let path: string;
    try {
      path = new URL(raw).pathname;
    } catch {
      continue;
    }
    const isGsfPhoto = /\.tlstatic\.com$/i.test(new URL(raw).hostname) && GSF_SIZE_SEGMENT_RE.test(path);
    const isEsoPhoto = /\.tlcdn\.workers\.dev$/i.test(new URL(raw).hostname) && /^\/s-\d+-/.test(path);
    if (!isGsfPhoto && !isEsoPhoto) continue;
    const url = gsfFullSizePhotoUrl(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Extract email addresses from text (for organizer contact)
 */
export function extractEmails(text: string): string[] {
  // 2026-08-16: callers pass RAW HTML here (garageSaleFinder.ts, scripts/enrichContactEmails.ts
  // — the latter writes Organizer.contactEmail directly). The old inline regex had neither a
  // tag-padding step nor a boundary guard, so a phone number in the element next to an email
  // glued straight onto the local part, and `%XX`-encoded addresses passed through undecoded.
  // Delegates to the shared extractor used by every other scraped-email path.
  return extractEmailCandidatesFromText(padHtmlForTextExtraction(text));
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
