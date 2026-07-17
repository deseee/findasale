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
