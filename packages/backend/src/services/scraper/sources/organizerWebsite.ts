/**
 * Organizer Website Address Scraper
 *
 * For organizers that have a `website` set but `address` empty (or missing
 * components), fetch homepage + /contact + /about and extract the first
 * clean US street address.
 *
 * Extraction strategy (first match wins):
 *  a) schema.org JSON-LD with @type PostalAddress (or Organization.address.PostalAddress)
 *     — PRIMARY. Structured and reliable. Still sanity-checked for length + junk.
 *  b) Visible HTML regex for "<number> <street> <suffix>" — FALLBACK ONLY.
 *     This path is dangerous (it over-matched page nav text and corrupted 36
 *     production rows in S726). Every candidate it produces MUST pass
 *     isValidStreetAddress() before it is accepted.
 *  c) When multiple visible-HTML candidates exist, prefer one co-located with a
 *     US zip + state abbr.
 *
 * Hard guarantee: this module returns null rather than a low-confidence guess.
 * The caller (organizerWebsiteAddressCron.ts) skips the organizer on null and
 * leaves its existing clean "City, ST" address untouched — storing nothing is
 * strictly better than storing garbage.
 *
 * Uses the existing scraper RateLimiter + UA rotation patterns. Per-host
 * concurrency is enforced by the RateLimiter instance (waitBeforeRequest).
 * Between requests the scraper sleeps 5–15s via jitterDelay.
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getRandomUserAgent, jitterDelay } from '../userAgents';

export interface ExtractedAddress {
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface OrganizerWebsiteInput {
  id?: string;
  businessName?: string | null;
  website: string;
  address?: string | null;
}

// US state two-letter abbreviations
const US_STATE_ABBREVIATIONS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

// Bounded US street address regex (case-insensitive at usage sites).
//
// IMPORTANT — why this is bounded the way it is:
// The previous version used `[\w.\s,'-]+?` for the street-name span. That
// character class includes whitespace, so a lazy `+?` still matched across
// hundreds of characters of page navigation text whenever a street-suffix
// word ("St", "Way", "Court", ...) appeared somewhere far downstream. That
// over-match is what wrote 100–700 chars of catalog/nav garbage into
// `Organizer.address`. The fix:
//  - the street-name span is now `(?:[A-Za-z0-9.'-]+ ){0,4}` — at most 4
//    whitespace-separated name words before the suffix, and a single space
//    between words (no runs of whitespace, no newlines, no tabs).
//  - the leading number is 1–6 digits.
//  - there is no permissive trailing `[^<\n]{0,80}` tail anymore — the city /
//    state / zip are picked up separately and validated.
// Every match still has to pass `isValidStreetAddress()` before it is accepted.
const STREET_REGEX =
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+ ){0,4}(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Terrace|Ter|Parkway|Pkwy|Highway|Hwy|Circle|Cir|Trail|Trl|Square|Sq|Suite|Ste|Unit|#)\b\.?/i;

const ZIP_REGEX = /\b(\d{5})(?:-\d{4})?\b/;
const STATE_REGEX = /\b([A-Z]{2})\b/;

// Recognized street-type suffixes — used by the validator to confirm a
// candidate actually ends on a street word.
const STREET_SUFFIX_RE =
  /\b(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Terrace|Ter|Parkway|Pkwy|Highway|Hwy|Circle|Cir|Trail|Trl|Square|Sq|Suite|Ste|Unit)\b\.?/i;

// Words that never appear in a real street address but are extremely common in
// page navigation, e-commerce chrome, and auction-catalog copy. If a candidate
// contains ANY of these (whole-word, case-insensitive) it is rejected outright.
const JUNK_WORDS = [
  'shopping', 'cart', 'login', 'log in', 'logout', 'account', 'welcome',
  'continue', 'auction', 'auctions', 'catalog', 'catalogue', 'bidding', 'bid',
  'register', 'registration', 'click', 'menu', 'search', 'copyright',
  'privacy', 'subscribe', 'newsletter', 'review', 'reviews', 'checkout',
  'wishlist', 'featured', 'upcoming', 'shop', 'browse', 'sign in', 'sign up',
  'home', 'about', 'contact', 'gallery', 'returns', 'shipping', 'faq',
  'terms', 'policy', 'sale', 'sales', 'lot', 'lots', 'estate', 'collection',
  'discount', 'off', 'free', 'million', 'mansion', 'luxury', 'downsizing',
];
const JUNK_WORD_RE = new RegExp(
  `\\b(?:${JUNK_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`,
  'i'
);

// A full single-line address (street + city + state + zip) is virtually never
// longer than this. Anything over the cap is garbage — reject and store nothing.
const MAX_ADDRESS_LEN = 110;

// Trailing-junk cutoff: even a clean street match often has site chrome glued
// on ("...28782 Phone: (828) ... Email: info@... Hours: ..."). Cut from the
// first occurrence of any of these markers onward.
const TRAILING_JUNK_RE =
  /\s*(?:phone|tel|telephone|fax|email|e-mail|hours|copyright|©|\bmon(?:day)?\b|\bopen\b)\b.*$/i;

/**
 * Strip trailing site-chrome ("Phone: ... Email: ...") from a matched address
 * fragment, and collapse/trim whitespace.
 */
function stripTrailingJunk(s: string): string {
  return s
    .replace(TRAILING_JUNK_RE, '')
    .replace(/[\s,;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate a street-address candidate. Returns true only when the string looks
 * like a real, short US street line:
 *  - starts with a 1–6 digit street number
 *  - ends on a recognized street-type suffix (St, Ave, Rd, Blvd, ...)
 *  - is not absurdly long
 *  - contains no obvious page-navigation / e-commerce / auction-catalog words
 *  - has a small word count (a real street line is short)
 * The optional `full` flag applies the absolute length cap to an assembled
 * "street, city, ST zip" string instead of the bare street fragment.
 */
function isValidStreetAddress(candidate: string, full = false): boolean {
  if (!candidate) return false;
  const s = candidate.trim();
  if (s.length < 5) return false;
  if (s.length > MAX_ADDRESS_LEN) return false;

  // Must start with a street number.
  if (!/^\d{1,6}\b/.test(s)) return false;

  // Must contain a recognized street suffix.
  if (!STREET_SUFFIX_RE.test(s)) return false;

  // Reject anything containing obvious non-address words.
  if (JUNK_WORD_RE.test(s)) return false;

  // No newlines / tabs / control chars — a real address line is one clean line.
  if (/[\n\r\t\f\v]/.test(s)) return false;

  // Word-count sanity. The bare street fragment should be short; even a full
  // "street, city, ST zip" line is rarely more than ~10 words.
  const wordCount = s.split(/\s+/).length;
  if (full) {
    if (wordCount > 14) return false;
  } else {
    if (wordCount > 8) return false;
  }

  // Reject if it contains an obvious sentence-y run (lots of lowercase words in
  // a row with no digits/commas) — addresses are terse, not prose. Heuristic:
  // 6+ consecutive all-lowercase alpha words signals a description, not an
  // address.
  if (/(?:\b[a-z]{2,}\b[ ]){6,}/.test(s)) return false;

  return true;
}

/**
 * Normalize a candidate site URL so we can build sub-paths reliably.
 * Returns null if the URL is unparseable.
 */
function normalizeBase(websiteRaw: string): string | null {
  try {
    let raw = websiteRaw.trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Fetch one URL with sane defaults; returns html or null.
 */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('xml') && ct.length > 0) {
      // Skip binary content (PDFs, images, etc.)
      return null;
    }
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Walk a schema.org JSON-LD blob looking for a PostalAddress shape.
 * Supports both `{ @type: PostalAddress }` direct nodes and nested
 * `address` properties (e.g. inside Organization or LocalBusiness).
 */
function findPostalAddressInJsonLd(node: unknown): ExtractedAddress | null {
  if (!node) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPostalAddressInJsonLd(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  // Direct PostalAddress
  const typeField = obj['@type'];
  const types = Array.isArray(typeField) ? typeField : [typeField];
  if (types.some((t) => typeof t === 'string' && t.toLowerCase() === 'postaladdress')) {
    const street = stripTrailingJunk((obj.streetAddress ?? '').toString());
    const city = (obj.addressLocality ?? '').toString().trim();
    const state = (obj.addressRegion ?? '').toString().trim();
    const zip = (obj.postalCode ?? '').toString().trim();
    // JSON-LD is the reliable structured path, but still sanity-check it:
    // some sites stuff their whole footer into streetAddress. Reject anything
    // that fails the length cap or contains obvious junk words.
    if (
      street &&
      (city || state || zip) &&
      street.length <= MAX_ADDRESS_LEN &&
      !JUNK_WORD_RE.test(street) &&
      !/[\n\r\t]/.test(street)
    ) {
      return { address: street, city, state, zip };
    }
  }

  // Nested address property (Organization, LocalBusiness, etc.)
  if (obj.address) {
    const found = findPostalAddressInJsonLd(obj.address);
    if (found) return found;
  }

  // Recurse into all values for nested @graph etc.
  for (const key of Object.keys(obj)) {
    if (key === 'address') continue;
    const found = findPostalAddressInJsonLd(obj[key]);
    if (found) return found;
  }

  return null;
}

/**
 * Parse <script type="application/ld+json"> blocks for PostalAddress.
 */
function extractFromJsonLd($: cheerio.CheerioAPI): ExtractedAddress | null {
  let result: ExtractedAddress | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const found = findPostalAddressInJsonLd(parsed);
      if (found) result = found;
    } catch {
      // Some sites embed invalid JSON-LD — try a best-effort cleanup
      try {
        const cleaned = raw.replace(/[\x00-\x1f]+/g, ' ').trim();
        const parsed2 = JSON.parse(cleaned);
        const found = findPostalAddressInJsonLd(parsed2);
        if (found) result = found;
      } catch {
        // Skip
      }
    }
  });
  return result;
}

/**
 * Visible-HTML fallback extractor (strategy b — the dangerous one).
 *
 * Every candidate produced by the bounded STREET_REGEX is run through
 * `isValidStreetAddress()` BEFORE it is even considered. Among the candidates
 * that pass, the one with the strongest co-located state+zip signal wins.
 * The final assembled "street, city, ST zip" string is length-capped one more
 * time. If nothing passes validation, returns null so the caller skips the org
 * and leaves its existing clean "City, ST" address intact.
 */
function extractFromVisibleHtml(text: string): ExtractedAddress | null {
  // Search the entire text for street-pattern matches; collect candidates.
  const rawCandidates: Array<{ match: string; index: number }> = [];
  const globalRegex = new RegExp(STREET_REGEX.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = globalRegex.exec(text)) !== null) {
    rawCandidates.push({ match: m[0], index: m.index });
    if (rawCandidates.length > 60) break; // safety
  }
  if (rawCandidates.length === 0) return null;

  // Validate every candidate up front. Strip trailing junk, then check it
  // against isValidStreetAddress(). Reject everything that doesn't pass.
  const candidates: Array<{ street: string; index: number; matchLen: number }> = [];
  for (const c of rawCandidates) {
    const street = stripTrailingJunk(c.match);
    if (!isValidStreetAddress(street)) continue;
    candidates.push({ street, index: c.index, matchLen: c.match.length });
  }
  if (candidates.length === 0) return null;

  let best:
    | { score: number; address: string; city: string; state: string; zip: string }
    | null = null;

  for (const c of candidates) {
    // Look at a tight window AFTER the match for city / state / zip. Keeping
    // the window small (60 chars) prevents pulling a distant zip from
    // elsewhere on the page.
    const afterStart = c.index + c.matchLen;
    const window = text.slice(afterStart, afterStart + 60);

    const zipM = window.match(ZIP_REGEX);
    const stateM = window.match(STATE_REGEX);
    const stateCode = stateM && US_STATE_ABBREVIATIONS.has(stateM[1]) ? stateM[1] : '';

    let score = 1;
    if (zipM) score += 2;
    if (stateCode) score += 2;
    if (zipM && stateCode) score += 1;

    // Best-effort city extraction: text immediately after the street match,
    // before the state abbr, stripped of punctuation.
    let city = '';
    if (stateCode) {
      const cityMatch = window.match(/[,\s]+([A-Z][A-Za-z .'-]+?)[,\s]+([A-Z]{2})\b/);
      if (cityMatch) {
        const cityCandidate = cityMatch[1].trim();
        // A real city name is short and contains no junk words.
        if (cityCandidate.length <= 40 && !JUNK_WORD_RE.test(cityCandidate)) {
          city = cityCandidate;
        }
      }
    }

    if (!best || score > best.score) {
      best = {
        score,
        address: c.street,
        city,
        state: stateCode,
        zip: zipM ? zipM[1] : '',
      };
    }
  }

  if (!best) return null;

  // Final hard length cap on the assembled value. If the composed
  // "street, city, ST zip" line is over the cap, reject — store nothing.
  const assembled = [
    best.address,
    [best.city, best.state].filter(Boolean).join(', '),
    best.zip,
  ]
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!isValidStreetAddress(assembled, true)) return null;

  return { address: best.address, city: best.city, state: best.state, zip: best.zip };
}

/**
 * Try to extract an address from a single page's HTML.
 */
function extractAddressFromHtml(html: string): ExtractedAddress | null {
  const $ = cheerio.load(html);

  // (a) JSON-LD
  const fromJsonLd = extractFromJsonLd($);
  if (fromJsonLd) return fromJsonLd;

  // (b) Visible text — strip scripts/styles
  $('script, style, noscript').remove();
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  if (!visibleText) return null;

  return extractFromVisibleHtml(visibleText);
}

/**
 * Main entry point.
 * Fetches homepage, /contact, /about (in order) and returns the first hit.
 * Sleeps 5–15s between pages and respects the RateLimiter for per-host
 * concurrency.
 */
export async function scrapeOrganizerWebsiteAddress(
  organizer: OrganizerWebsiteInput,
  rateLimiter: RateLimiter
): Promise<ExtractedAddress | null> {
  if (!organizer.website) return null;
  const base = normalizeBase(organizer.website);
  if (!base) return null;

  let host: string;
  try {
    host = new URL(base).hostname;
  } catch {
    return null;
  }

  await rateLimiter.loadRobotsTxt(base);

  const paths = ['/', '/contact', '/about', '/contact-us', '/about-us'];

  for (let i = 0; i < paths.length; i++) {
    const url = `${base}${paths[i]}`;

    await rateLimiter.waitBeforeRequest(host);

    if (!rateLimiter.isAllowed(url)) {
      // Robots advisory — proceed anyway, but log once
      console.warn(`[OrganizerWebsite] Robots advisory for ${url}, proceeding`);
    }

    const html = await fetchHtml(url);

    // 5–15s sleep between requests (matches other scrapers' pacing)
    if (i < paths.length - 1) {
      await jitterDelay(5000, 15000);
    }

    if (!html) continue;

    const extracted = extractAddressFromHtml(html);
    if (extracted && extracted.address) {
      console.log(
        `[OrganizerWebsite] Address hit on ${url} for ${organizer.businessName ?? organizer.id ?? '?'}: "${extracted.address}", ${extracted.city || '?'}, ${extracted.state || '?'} ${extracted.zip || '?'}`
      );
      return extracted;
    }
  }

  return null;
}
