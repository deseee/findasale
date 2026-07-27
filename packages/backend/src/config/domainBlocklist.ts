/**
 * domainBlocklist.ts — Single source of truth for website-domain blocking and social-host
 * classification. Shared by the ingest gates, scrapers, and the email-provenance guard so
 * the "which domains do we reject / classify" rules can never drift across the codebase.
 *
 * This module holds the RAW base sets (SOCIAL_DOMAINS + AGGREGATOR_DOMAINS). emailProvenance
 * imports those two sets to build FAMOUS_UNRELATED_DOMAINS, so the mega-brand denylist and the
 * social/aggregator denylist stay unified.
 *
 * Circular-import safety: emailProvenance reads our raw sets at MODULE-LOAD time (to construct
 * FAMOUS_UNRELATED_DOMAINS), while we only need emailProvenance's helpers at CALL time. To avoid
 * a load-order initialization hazard we reach into emailProvenance LAZILY via require() inside
 * function bodies rather than a top-level import. That guarantees SOCIAL_DOMAINS/AGGREGATOR_DOMAINS
 * are always fully defined before emailProvenance evaluates, regardless of which module Node
 * loads first.
 */

// ---------------------------------------------------------------------------
// Raw base sets — the single source of truth for social + aggregator domains.
// ---------------------------------------------------------------------------

/**
 * Social / link-in-bio hosts. A stored "website" pointing at one of these is NOT an
 * organizer's real business site — it belongs in a dedicated social column (see
 * classifySocialHost) and must never be fetched as a website or mined for a contact email.
 */
export const SOCIAL_DOMAINS: ReadonlySet<string> = new Set([
  'facebook.com',
  'm.facebook.com',
  'fb.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'pinterest.com',
  'youtube.com',
  'youtu.be',
  'linkedin.com',
  'etsy.com',
  'nextdoor.com',
  'linktr.ee',
]);

/**
 * Aggregator / directory / marketplace hosts. These are third-party listing sites and
 * mega-directories — never an organizer's own domain. Rejected as website/email sources
 * and suppressed as email-send targets (see suppressionService.BLOCKED_DOMAINS).
 */
export const AGGREGATOR_DOMAINS: ReadonlySet<string> = new Set([
  'bid13.com',
  'propertyroom.com',
  'publicsurplus.com',
  'estatesales.net',
  'estatesales.org',
  'estatesale.com',
  'estatesales.com',
  'garagesalefinder.com',
  'foursquare.com',
  'here.com',
  'auctionzip.com',
  'hibid.com',
  'invaluable.com',
  'liveauctioneers.com',
  'maxsold.com',
  'ctbids.com',
  'bidrush.com',
  'auctionninja.com',
  'gsalr.com',
  'craigslist.org',
  'shopgoodwill.com',
  'proxibid.com',
  'bidspotter.com',
  'storagetreasures.com',
  'storageauctions.com',
  'lockerfox.com',
  'municibid.com',
  'govdeals.com',
  'ebay.com',
  'yelp.com',
  'google.com',
  'maps.google.com',
  'garagesaletracker.com', // Garage Sale Tracker — direct competitor (findasale-competitor watchlist)
  'offerup.com', // OfferUp — resale marketplace competitor
  'bidsquare.com', // Bidsquare — online auction competitor
]);

// ---------------------------------------------------------------------------
// Lazy bridge to emailProvenance (breaks the circular-init hazard).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-var-requires
function ep(): typeof import('../services/emailProvenance') {
  return require('../services/emailProvenance');
}

/**
 * Re-export of the canonical registrable-domain extractor so callers have a single import
 * surface for domain logic. Delegates lazily to emailProvenance (identical behavior).
 */
export function registrableDomain(input: string | null | undefined): string | null {
  return ep().registrableDomain(input);
}

/**
 * Extract the bare hostname (lowercased, leading "www." stripped) from a URL or hostname.
 * Self-contained (no emailProvenance dependency) so it is safe to call at any load stage.
 * Returns null when there is nothing host-like to extract. Never throws.
 */
function extractHost(input: string): string | null {
  try {
    const u = new URL(input.startsWith('http') ? input : `https://${input}`);
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    return h.includes('.') ? h : null;
  } catch {
    const h = input.trim().toLowerCase().replace(/^www\./, '');
    return h.includes('.') ? h : null;
  }
}

// ---------------------------------------------------------------------------
// Fallback fuzzy substring match (defense-in-depth for isBlockedWebsiteDomain).
// Derived from SOCIAL_DOMAINS ∪ AGGREGATOR_DOMAINS so there is never a second
// hardcoded brand list to drift out of sync with the primary sets above.
//
// IMPORTANT — boundary-aware, not a plain substring match. A live production-DB check
// (S1135 backfill) proved plain substring matching is unusable at scale: 'estatesales.com'
// alone false-positived on 2,976 legitimate organizer domains (e.g. "sterling-estatesales.com",
// "ruftopestatesales.com" — real businesses whose own domain happens to END with that
// aggregator's name), and 'x.com' hit 124 more (e.g. "ten-x.com"). Requiring the brand to be
// preceded by a URL-structural boundary character — start of string, '.', '/', or ':' — and
// never by a hyphen or other domain-label character cuts those to zero while still catching
// every known malformed case, because a hostname label boundary in a real URL is always one of
// those four positions, never a hyphen.
// ---------------------------------------------------------------------------
const KNOWN_BRAND_SUBSTRINGS: readonly string[] = [...SOCIAL_DOMAINS, ...AGGREGATOR_DOMAINS];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KNOWN_BRAND_PATTERNS: readonly RegExp[] = KNOWN_BRAND_SUBSTRINGS.map(
  (brand) => new RegExp(`(?:^|[./:])${escapeRegExp(brand)}`)
);

/**
 * Return true if the raw (already-lowercased) input string contains a known social or
 * aggregator brand domain as a boundary-anchored substring. This is a fuzzier, last-resort
 * fallback for malformed URLs that defeat precise hostname parsing (see call site in
 * isBlockedWebsiteDomain for examples and the residual false-positive tradeoff). Strips
 * whitespace first because some scraped "website" values have stray spaces injected around
 * dots (e.g. "http://www. facebook. com/pages/..."), which would otherwise defeat the match.
 * Never throws.
 */
function containsKnownBrandDomain(rawLowered: string): boolean {
  const compact = rawLowered.replace(/\s+/g, '');
  return KNOWN_BRAND_PATTERNS.some((pattern) => pattern.test(compact));
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Return true if the given URL's domain should be BLOCKED as an organizer "website"
 * (social host, aggregator/directory, or famous-unrelated mega-brand). Checks both the
 * registrable domain and the exact host against SOCIAL ∪ AGGREGATOR ∪ FAMOUS_UNRELATED.
 *
 * null / empty / malformed input -> false (nothing to block). Never throws.
 */
export function isBlockedWebsiteDomain(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  let reg: string | null = null;
  try {
    reg = ep().registrableDomain(trimmed);
  } catch {
    reg = null;
  }
  const host = extractHost(trimmed);

  let famous: ReadonlySet<string>;
  try {
    famous = ep().FAMOUS_UNRELATED_DOMAINS;
  } catch {
    famous = new Set<string>();
  }

  for (const candidate of [reg, host]) {
    if (!candidate) continue;
    if (SOCIAL_DOMAINS.has(candidate) || AGGREGATOR_DOMAINS.has(candidate) || famous.has(candidate)) {
      return true;
    }
  }

  // Defense-in-depth fallback: the precise host/registrable-domain checks above missed a
  // match. Some malformed input strings break new URL() hostname parsing entirely or fold
  // garbage into the hostname — e.g. a missing slash before the path
  // ("https://www.facebook.comjameswoodward3720190" parses to hostname
  // "facebook.comjameswoodward3720190", which never equals "facebook.com") or a stray slash
  // where a dot belongs ("https://www/facebook.com/trophyestatesales" parses to hostname
  // "www", losing "facebook.com" into the path entirely). As a last-resort catch, check
  // whether the raw lowercased input contains a known social/aggregator brand as a
  // boundary-anchored substring (see containsKnownBrandDomain for why boundary-anchoring is
  // required — plain substring matching was measured against the live production DB and
  // false-positived on thousands of legitimate organizer domains). This is intentionally
  // broader/fuzzier than the exact host match above, so it is used ONLY as a fallback here —
  // never as a replacement for the precise check, and never reused by
  // isAggregatorDomain/classifySocialHost, which need precise host matches.
  // Residual false-positive risk: a legitimate organizer site whose own path or query string
  // happens to contain "/facebook.com" or "?utm_source=facebook.com" etc. immediately after a
  // structural boundary would still match (e.g. a tracking param literally reading
  // "ref=facebook.com" preceded by '='  would NOT match since '=' isn't a boundary char, but
  // "ref=/facebook.com" would). Measured against all 24,333 organizers with a website set
  // (S1135 backfill, 2026-07-18): zero false positives found with this boundary-anchored
  // design — the only fallback matches were the 3 known malformed-URL organizers plus
  // genuine linktr.ee links (correctly classified). Re-run the backfill query if this fallback
  // is ever extended to more brands or a broader scrape source.
  if (containsKnownBrandDomain(trimmed.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Return true if the given URL's domain is a known AGGREGATOR / directory / marketplace host
 * (bid13, propertyroom, publicsurplus, estatesales.*, etc.). These are third-party listing
 * pages — never an organizer's own site — and belong in Organizer.listingUrl, never in
 * Organizer.website (which the enrichment/re-fetch pipelines would then fetch). Checks both the
 * registrable domain and the exact host. null / empty / malformed input -> false. Never throws.
 */
export function isAggregatorDomain(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  let reg: string | null = null;
  try {
    reg = ep().registrableDomain(trimmed);
  } catch {
    reg = null;
  }
  const host = extractHost(trimmed);

  for (const candidate of [reg, host]) {
    if (!candidate) continue;
    if (AGGREGATOR_DOMAINS.has(candidate)) return true;
  }
  return false;
}

/**
 * Map a social host to the correct EXISTING Organizer social column. Verified against
 * packages/database/prisma/schema.prisma (Organizer model): facebook, instagram, etsy,
 * twitterUrl, tiktokUrl, youtubeUrl, pinterestUrl, linkedInUrl. Hosts with no matching
 * column (nextdoor.com, linktr.ee) return null so callers never write a nonexistent field.
 */
const SOCIAL_HOST_FIELD_MAP: Readonly<Record<string, string>> = {
  'facebook.com': 'facebook',
  'm.facebook.com': 'facebook',
  'fb.com': 'facebook',
  'instagram.com': 'instagram',
  'twitter.com': 'twitterUrl',
  'x.com': 'twitterUrl',
  'tiktok.com': 'tiktokUrl',
  'pinterest.com': 'pinterestUrl',
  'youtube.com': 'youtubeUrl',
  'youtu.be': 'youtubeUrl',
  'linkedin.com': 'linkedInUrl',
  'etsy.com': 'etsy',
  // nextdoor.com and linktr.ee intentionally omitted — no Organizer column exists for them.
};

/**
 * Classify a URL as a known social host and return the Organizer column + value to store.
 * Returns null when the URL is not a mapped social host, when the target column does not
 * exist (nextdoor/linktr.ee), or on null/empty/malformed input. Never throws.
 */
export function classifySocialHost(url?: string | null): { field: string; value: string } | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const host = extractHost(trimmed);
  let reg: string | null = null;
  try {
    reg = ep().registrableDomain(trimmed);
  } catch {
    reg = null;
  }

  const key =
    (host && SOCIAL_HOST_FIELD_MAP[host] ? host : null) ??
    (reg && SOCIAL_HOST_FIELD_MAP[reg] ? reg : null);
  if (!key) return null;

  return { field: SOCIAL_HOST_FIELD_MAP[key], value: trimmed };
}
