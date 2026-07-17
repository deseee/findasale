/**
 * emailProvenance.ts — Shared provenance + guard helpers for organizer contact-email discovery.
 *
 * Single source of truth for:
 *  - GENERIC_PATTERNS (info@, admin@, hello@, … — never used as real-person outreach targets)
 *  - calibrateConfidence (domain-mismatch + residential-address penalties)
 *  - registrable-domain extraction
 *  - business-name ↔ domain token-overlap matching
 *  - a famous/unrelated mega-brand domain denylist (Disney/Club33/Amazon/etc.)
 *
 * The "good" discovery path (emailDiscoveryService.ts) and the enrichment path
 * (scraper/enrichment.ts, scraper/index.ts) BOTH import from here so the rules can
 * never drift apart. This module is the fix for the 15–28% bounce incident (Jun 2026)
 * where enrichment stored emails with NO provenance and NO validation.
 */

import { SOCIAL_DOMAINS, AGGREGATOR_DOMAINS } from '../config/domainBlocklist';

/**
 * Internal discovery-source labels used by calibrateConfidence.
 * (Distinct from the schema emailDiscoveryMethod values, which are mapped separately.)
 */
export type DiscoverySource = 'website_scrape' | 'smtp_pattern' | 'whois' | 'sale_description';

/**
 * Generic mailbox prefixes that are never a real-person outreach target.
 * Matched as a substring against the lowercased email (so 'info@' catches 'info@x.com').
 */
export const GENERIC_PATTERNS = [
  'noreply@',
  'no-reply@',
  'donotreply@',
  'do-not-reply@',
  'notification@',
  'notifications@',
  'alerts@',
  'test@',
  'admin@',
  'hello@',
  'info@',
  'contact@',
  'support@',
  'sales@',
  'mailer-daemon@',
  'bounce@',
  'postmaster@',
  'webmaster@',
] as const;

/**
 * Return true if the email uses a generic mailbox prefix (info@, admin@, …).
 */
export function isGenericEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  return GENERIC_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Mega-brand / unrelated domains that famously appear in scraped "website" fields by mistake
 * (e.g. a Disney Club 33 dining page got attached to "Club 33 Estate Sale Services").
 * These should NEVER be accepted as an organizer's website or as the source of a contact email.
 */
export const FAMOUS_UNRELATED_DOMAINS = new Set<string>([
  'disney.com',
  'disneyland.com',
  'disneyworld.com',
  'club33.com',
  'amazon.com',
  'google.com',
  'facebook.com',
  'fb.com',
  'instagram.com',
  'yelp.com',
  'ebay.com',
  'etsy.com',
  'walmart.com',
  'target.com',
  'costco.com',
  'apple.com',
  'microsoft.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'pinterest.com',
  'linkedin.com',
  'craigslist.org',
  'wix.com',
  'squarespace.com',
  'godaddy.com',
  'wordpress.com',
  'shopify.com',
  // Converged base sets (single source of truth: config/domainBlocklist.ts) so the
  // email-provenance domain-match guard also rejects social + aggregator/directory hosts.
  ...SOCIAL_DOMAINS,
  ...AGGREGATOR_DOMAINS,
]);

/**
 * Extract the registrable domain (eTLD+1-ish) from a URL or bare hostname.
 * Strips scheme, path, port, and a leading "www.". Returns lowercase, or null on parse failure.
 *
 * Note: this is a pragmatic approximation, not a full public-suffix-list implementation.
 * It takes the last two labels for common TLDs and the last three for the well-known
 * two-part ccTLDs we actually encounter (.co.uk, .com.au, .co.nz, .gc.ca province domains, etc.).
 */
export function registrableDomain(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  let host: string;
  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    host = url.hostname;
  } catch {
    // Not a parseable URL — treat the raw string as a hostname if it looks like one
    host = input.trim();
  }
  host = host.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.')) return null;

  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return null;

  const TWO_PART_TLDS = new Set([
    'co.uk', 'org.uk', 'me.uk', 'gov.uk', 'ac.uk',
    'com.au', 'net.au', 'org.au',
    'co.nz', 'org.nz',
    'co.za',
    'com.br',
  ]);
  const lastTwo = labels.slice(-2).join('.');
  if (TWO_PART_TLDS.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * Extract the domain portion of an email address (after @), lowercased. Null if malformed.
 */
export function emailDomain(email: string): string | null {
  const atIdx = email.indexOf('@');
  if (atIdx < 0) return null;
  const domain = email.substring(atIdx + 1).toLowerCase().trim();
  return domain.length > 0 ? domain : null;
}

/**
 * Tokenize a business name into meaningful lowercase tokens, dropping common
 * sale-industry stop words and very short tokens. Used for name↔domain matching.
 */
const BUSINESS_STOPWORDS = new Set([
  'the', 'and', 'of', 'for', 'llc', 'inc', 'co', 'company', 'corp', 'ltd',
  'estate', 'estates', 'sale', 'sales', 'services', 'service', 'auction',
  'auctions', 'antique', 'antiques', 'consignment', 'liquidation', 'liquidators',
  'group', 'home', 'house', 'shop', 'store', 'gallery', 'market', 'thrift',
  'vintage', 'resale', 'by', 'at', 'on',
]);

export function businessNameTokens(businessName: string | null | undefined): string[] {
  if (!businessName) return [];
  return businessName
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !BUSINESS_STOPWORDS.has(t));
}

/**
 * Reduce a domain to a comparable alphanumeric core (registrable domain minus the TLD,
 * stripped of non-alphanumerics). e.g. "club-33.com" -> "club33".
 */
function domainCore(domain: string): string {
  const reg = registrableDomain(domain) ?? domain.toLowerCase();
  const withoutTld = reg.split('.')[0] ?? reg;
  return withoutTld.replace(/[^a-z0-9]/g, '');
}

/**
 * Return true if a domain plausibly belongs to the named business — i.e. the domain
 * core shares a meaningful token with the business name (substring match in either
 * direction). Used to gate both website assignment and email storage.
 *
 * Examples:
 *   "Club 33 Estate Sale Services" vs "club33.com"      -> true  ("club33" overlaps)
 *   "Smith Family Estate Sales"    vs "smithestates.com" -> true  ("smith")
 *   "Club 33 Estate Sale Services" vs "disney.com"       -> false (no overlap)
 */
export function domainMatchesBusiness(
  domain: string | null | undefined,
  businessName: string | null | undefined
): boolean {
  if (!domain) return false;
  const core = domainCore(domain);
  if (!core) return false;
  const tokens = businessNameTokens(businessName);
  if (tokens.length === 0) return false;

  for (const token of tokens) {
    if (core.includes(token) || token.includes(core)) return true;
  }
  return false;
}

/**
 * Apply confidence penalties based on discovery context.
 * (Shared with emailDiscoveryService — keep behavior identical.)
 *
 * baseConfidence:    starting confidence for the source
 * source:            how the email was found
 * emailDom:          domain of the discovered email (lowercase)
 * organizerDomain:   registrable domain from organizer.website (null if unknown)
 * organizerAddress:  raw address string (used to detect residential patterns)
 */
export function calibrateConfidence(
  baseConfidence: number,
  source: DiscoverySource,
  emailDom: string,
  organizerDomain: string | null,
  organizerAddress: string | null
): number {
  let score = baseConfidence;

  // Pattern permutation only (not scraped from the actual site) — cap at 0.70
  if (source === 'smtp_pattern') {
    score = Math.min(score, 0.70);
  }

  // Email domain doesn't match the organizer's known website domain
  if (organizerDomain && emailDom !== organizerDomain) {
    score -= 0.10;
  }

  // Residential address pattern (no suite/unit — just a plain street address)
  if (organizerAddress) {
    const hasSuite = /\b(suite|ste|unit|apt|#|floor|fl)\b/i.test(organizerAddress);
    if (!hasSuite) {
      score -= 0.05;
    }
  }

  // Floor at 0.10
  return Math.max(score, 0.10);
}
