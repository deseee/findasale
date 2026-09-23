/**
 * discogsListingConnector.ts — Discogs Marketplace connector (Universal Crosslister,
 * Official-API Tier). Mirrors reverbConnector.ts's structure and posture on the same
 * generalized `MarketplaceAccount` table. See
 * claude_docs/architecture/ADR-discogs-listing-connector-2026-08-24.md for the full
 * design rationale.
 *
 * AUTH MODEL (verified live against discogs.com/developers 2026-08-24, NOT the
 * three-legged OAuth 1.0a the earlier 2026-08-18 research assumed): Discogs's own
 * Authentication docs list a "Personal access token" as valid for authenticated
 * write requests ("Authenticated as user? Yes, for token holder only"), and the
 * Create Marketplace Listing endpoint's own doc line says only "Authentication is
 * required" (not OAuth-specifically). Each organizer generates their own token at
 * discogs.com/settings/developers ("Generate new token") and pastes it into
 * FindA.Sale — same personal-token-paste pattern already shipped for Reverb. No
 * DISCOGS_CONSUMER_KEY/SECRET, no OAuth callback route, no request-token dance.
 *
 * Security note: `MarketplaceAccount.accessToken` is run through tokenCrypto.ts's
 * encryptToken/decryptToken envelope, same as Reverb — never plaintext.
 *
 * TWO REAL, PERMANENT PRODUCT LIMITS (not bugs — surface these in any future UI):
 *   1. Discogs's create/edit-listing API has NO photo field at all. A Discogs
 *      listing shows only the catalog release's own stock thumbnail — never the
 *      organizer's own photos. RE-VERIFIED 2026-09-03 against the current live
 *      official docs (discogs.com/developers/resources/marketplace/listing.html,
 *      POST /marketplace/listings) after Patrick reported Discogs's own WEBSITE now
 *      supports photo uploads on manually-created listings -- confirmed that is a
 *      website-only UI feature, NOT exposed anywhere in the public REST API this
 *      connector uses (full documented param list: release_id, condition,
 *      sleeve_condition, price, comments, allow_offers, status, external_id,
 *      location, weight, format_quantity -- no image/photo field of any kind).
 *      Still a real, permanent ceiling for anything built on this API.
 *   2. Listing creation requires an existing Discogs catalog `release_id` — there
 *      is no API path to submit a new release. An obscure/uncatalogued record
 *      cannot be auto-listed. findDiscogsReleaseId() below is the required
 *      pre-check; callers must treat a null result as "not eligible," not an error.
 *
 * BEST OFFER (2026-09-03): Discogs's own "Allow offers" toggle IS a real, documented
 * API parameter (`allow_offers`, boolean, default false) on the same Create Listing
 * endpoint re-verified above -- added as `DiscogsListingOptions.allowOffers` below,
 * same organizer-opt-in-per-push pattern as the existing `publish` option.
 *
 * LIVE-VERIFIED (2026-08-27): connect + eligibility exercised end-to-end against
 * the real Discogs API with a real organizer personal access token (ArtifactM
 * seller account). Connect round-trip, /oauth/identity parsing, and real catalog
 * search results all confirmed working against live data — no longer CODE-ONLY
 * for the connect/eligibility path. createDiscogsListing (the actual POST that
 * creates a live marketplace listing) has NOT yet been exercised live — that
 * remains CODE-ONLY (CLAUDE.md §9) pending an explicit Patrick go-ahead to push
 * a real Draft listing to his connected seller account.
 */

import { prisma } from '../../lib/prisma';
import { encryptToken, decryptToken } from '../../utils/tokenCrypto';
import type { Item, MarketplaceAccount, Prisma } from '@prisma/client';
import { decodeHtmlEntities } from '../../lib/sanitize';
// ADR-132: release matcher v2 + structured record identity.
import {
  matchDiscogsRelease,
  computeMatchInputHash,
  parseDiscogsReleaseUrl,
  rawFromListingRelease,
  rawFromRelease,
  scoreCandidate,
  MATCHER_VERSION,
} from './discogsReleaseMatcher';
import type { DiscogsCandidate, DiscogsMatchStatus } from './discogsReleaseMatcher';
import {
  deriveRecordIdentityFromText,
  effectiveRecordIdentity,
  applyOrganizerRecordIdentity,
} from './recordIdentity';
import type { RecordIdentitySources, RecordIdentityValues } from './recordIdentity';

const DISCOGS_API_BASE = 'https://api.discogs.com';
const DISCOGS_USER_AGENT = 'FindA.Sale/1.0 +https://finda.sale';

// ── Rate-limit awareness ────────────────────────────────────────────────────
// Discogs docs confirm a 60/min authenticated budget and document
// X-Discogs-Ratelimit-Remaining on every response, but do NOT document whether
// the budget is tracked per-token or per-source-IP. Since each organizer
// authenticates with their OWN token (not a shared app credential), a
// speculative shared cross-organizer queue isn't built here — instead, back off
// reactively whenever a response reports the budget is running low.
let cooldownUntilMs = 0;
const LOW_REMAINING_THRESHOLD = 5;
const COOLDOWN_MS = 2000;

async function discogsRequest(
  path: string,
  accessToken: string | null,
  init: RequestInit = {}
): Promise<{ status: number; text: string; response: Response }> {
  const now = Date.now();
  if (now < cooldownUntilMs) {
    await new Promise(resolve => setTimeout(resolve, cooldownUntilMs - now));
  }

  const headers: Record<string, string> = {
    'User-Agent': DISCOGS_USER_AGENT,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers['Authorization'] = `Discogs token=${accessToken}`;
  }

  const response = await fetch(`${DISCOGS_API_BASE}${path}`, { ...init, headers });
  const remaining = response.headers.get('X-Discogs-Ratelimit-Remaining');
  if (remaining != null && !Number.isNaN(Number(remaining)) && Number(remaining) < LOW_REMAINING_THRESHOLD) {
    cooldownUntilMs = Date.now() + COOLDOWN_MS;
  }

  const text = await response.text();
  return { status: response.status, text, response };
}

export class DiscogsApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'DiscogsApiError';
    this.status = status;
  }
}

/** Thrown when an item has no matching Discogs catalog release_id — a real,
 * permanent ceiling (see file header), not a transient API failure. Callers
 * should surface this as a distinct "not eligible" response, not a generic error. */
export class DiscogsNotEligibleError extends Error {
  constructor(message = 'No matching Discogs catalog release found for this item') {
    super(message);
    this.name = 'DiscogsNotEligibleError';
  }
}

/** ADR-132: base for errors that map straight to an HTTP status + machine-readable code. */
export class DiscogsHttpError extends Error {
  httpStatus: number;
  code: string;
  constructor(httpStatus: number, code: string, message: string) {
    super(message);
    this.name = 'DiscogsHttpError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

/** ADR-132 section 7: push refused until the organizer picks the Discogs release. */
export class DiscogsNeedsSelectionError extends DiscogsHttpError {
  constructor(message = 'Choose the matching Discogs release first') {
    super(409, 'needs_selection', message);
    this.name = 'DiscogsNeedsSelectionError';
  }
}

/** ADR-132: the live Discogs listing uses a different release than the organizer confirmed. */
export class DiscogsListingMismatchError extends DiscogsHttpError {
  constructor(message = 'Your Discogs listing is for a different release than the one you confirmed. Use "Fix Discogs listing" to correct it.') {
    super(409, 'listing_release_mismatch', message);
    this.name = 'DiscogsListingMismatchError';
  }
}

export class DiscogsNotConnectedError extends DiscogsHttpError {
  constructor() {
    super(409, 'not_connected', 'Connect your Discogs account first');
    this.name = 'DiscogsNotConnectedError';
  }
}

function parseDiscogsError(status: number, rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed?.message) return parsed.message;
  } catch {
    // Discogs error shape is a generic {"message": "..."} string; non-JSON bodies
    // fall through to the generic message below.
  }
  return `Discogs API error: ${status}`;
}

// ============================================================================
// Personal Access Token connect
// ============================================================================

/**
 * Connect an organizer's Discogs account using a Personal Access Token they
 * generated themselves (discogs.com/settings/developers -> Generate new token).
 * Validates the token against GET /oauth/identity before persisting.
 */
export async function connectDiscogsAccount(organizerId: string, personalAccessToken: string): Promise<MarketplaceAccount> {
  const trimmedToken = personalAccessToken.trim();
  if (!trimmedToken) {
    throw new Error('[Discogs] Personal Access Token is required');
  }

  const { status, text } = await discogsRequest('/oauth/identity', trimmedToken);
  if (status !== 200) {
    throw new DiscogsApiError(
      status,
      status === 401
        ? 'Invalid or revoked Discogs Personal Access Token'
        : parseDiscogsError(status, text) || 'Could not verify Discogs Personal Access Token'
    );
  }

  let externalUserId: string | null = null;
  try {
    const identity = JSON.parse(text) as any;
    externalUserId = identity?.username != null ? String(identity.username) : identity?.id != null ? String(identity.id) : null;
  } catch {
    // Defensive — identity response shape not independently re-verified this session.
  }

  return prisma.marketplaceAccount.upsert({
    where: { organizerId_platform: { organizerId, platform: 'DISCOGS' } },
    create: {
      organizerId,
      platform: 'DISCOGS',
      status: 'ACTIVE',
      accessToken: encryptToken(trimmedToken),
      refreshToken: null,
      tokenExpiresAt: null,
      externalUserId,
      connectedAt: new Date(),
      lastRefreshedAt: new Date(),
    },
    update: {
      status: 'ACTIVE',
      accessToken: encryptToken(trimmedToken),
      refreshToken: null,
      tokenExpiresAt: null,
      externalUserId,
      lastRefreshedAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
}

/** Delete the organizer's Discogs connection (no documented revoke endpoint — same posture as reverbConnector.ts's disconnect). */
export async function disconnectDiscogsAccount(organizerId: string): Promise<void> {
  await prisma.marketplaceAccount.deleteMany({ where: { organizerId, platform: 'DISCOGS' } });
}

export async function checkDiscogsConnection(organizerId: string): Promise<{
  connected: boolean;
  status?: string;
  externalUserId?: string | null;
  connectedAt?: Date;
  lastRefreshedAt?: Date;
  error?: string | null;
}> {
  const account = await prisma.marketplaceAccount.findUnique({
    where: { organizerId_platform: { organizerId, platform: 'DISCOGS' } },
  });
  if (!account) return { connected: false };
  return {
    connected: account.status === 'ACTIVE',
    status: account.status,
    externalUserId: account.externalUserId,
    connectedAt: account.connectedAt,
    lastRefreshedAt: account.lastRefreshedAt,
    error: account.lastErrorMessage,
  };
}

async function getActiveDiscogsAccount(organizerId: string): Promise<MarketplaceAccount | null> {
  return prisma.marketplaceAccount.findFirst({
    where: { organizerId, platform: 'DISCOGS', status: 'ACTIVE' },
  });
}

function decryptAccessToken(account: MarketplaceAccount): string {
  return decryptToken(account.accessToken);
}

// ============================================================================
// Catalog release lookup (required prerequisite for listing)
// ============================================================================

/**
 * Title cleaning + fuzzy matching (2026-08-27). Root-caused live against the real
 * Discogs API (packages/database prod org, real PAT) after two false "not eligible"
 * results turned out to be matcher bugs, not real absence from Discogs's catalog:
 *
 *   1. FindA.Sale's AI-generated item titles follow an "Artist - Title LP/Vinyl/
 *      Record/Album, Year, Label" pattern. Sending that FULL raw title as Discogs's
 *      free-text search query often returns ZERO results -- the trailing ", Year,
 *      Label" clause and embedded format words are noise Discogs's search chokes on.
 *      Verified: "Kenny Loggins with Jim Messina Sittin' In LP Vinyl Record, 1970s
 *      Columbia" -> 0 results. Cleaned to "Kenny Loggins with Jim Messina Sittin' In"
 *      -> real release 1318188 is the #1 result.
 *   2. Even a cleaned title can miss on a one-character data-entry typo (verified:
 *      item said "Time and Change", Discogs's real catalog has "Time And Chance" --
 *      a FindA.Sale AI-photo-tagging title-accuracy bug, tracked separately, NOT
 *      fixed here). A generic free-text search for the cleaned title doesn't
 *      surface the real release in this case (Discogs's own relevance ranking
 *      puts unrelated tracks first). An artist-scoped search + fuzzy string-score
 *      across ALL candidates DOES find it (release 13685723, dice score 0.87
 *      against the cleaned item title, vs 0.00-0.04 for the wrong candidates the
 *      primary search returned).
 *
 * No fuzzy-matching npm package is installed (checked package.json) -- this hand-
 * rolls a normalized bigram Dice-coefficient scorer rather than adding a new
 * dependency. Thresholds (0.55 primary / 0.45 fallback) were tuned against real
 * API responses this session: true matches scored 1.00/0.87, false candidates
 * scored 0.35/0.04/0.00 -- comfortable separation either side of both cutoffs.
 */

const DISCOGS_FORMAT_WORDS = ['LP', 'Vinyl', 'Record', 'Records', 'Album', 'CD', 'EP', '45', 'Cassette', 'Disc'];
const DISCOGS_FORMAT_WORDS_PATTERN = new RegExp(`\\b(${DISCOGS_FORMAT_WORDS.join('|')})\\b`, 'gi');

/** Drop the ", Year, Label" style trailing clause and standalone format words
 * (LP/Vinyl/Record/etc.) that break Discogs's free-text search. */
function cleanDiscogsSearchTitle(title: string): string {
  let cleaned = title.split(',')[0] ?? '';
  cleaned = cleaned.replace(DISCOGS_FORMAT_WORDS_PATTERN, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/** Best-effort artist guess for the fallback path: text before the first
 * "Artist - Title" style separator, else the first few words. */
function extractLikelyArtist(cleanedTitle: string): string {
  const separatorMatch = cleanedTitle.match(/^(.+?)\s*[-\u2013\u2014:]\s*(.+)$/);
  if (separatorMatch && separatorMatch[1].trim()) return separatorMatch[1].trim();
  const words = cleanedTitle.split(' ').filter(Boolean);
  return words.slice(0, Math.min(3, words.length)).join(' ');
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toBigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Dice coefficient over character bigrams -- tolerant of small typos (e.g. one
 * letter swapped), unlike exact/substring matching. 1.0 = identical, 0.0 = no
 * shared bigrams at all. */
function diceCoefficient(a: string, b: string): number {
  const normA = normalizeForCompare(a);
  const normB = normalizeForCompare(b);
  const bigramsA = toBigrams(normA);
  const bigramsB = toBigrams(normB);
  if (bigramsA.length === 0 || bigramsB.length === 0) return normA === normB ? 1 : 0;
  const remaining = new Map<string, number>();
  for (const bg of bigramsB) remaining.set(bg, (remaining.get(bg) || 0) + 1);
  let matches = 0;
  for (const bg of bigramsA) {
    const count = remaining.get(bg) || 0;
    if (count > 0) {
      matches++;
      remaining.set(bg, count - 1);
    }
  }
  return (2 * matches) / (bigramsA.length + bigramsB.length);
}

const DISCOGS_HIGH_CONFIDENCE_THRESHOLD = 0.55;
const DISCOGS_FUZZY_CONFIDENCE_THRESHOLD = 0.45;

export interface DiscogsMatch {
  releaseId: number;
  /** 'high' = primary cleaned-title search found a confidently-scored match.
   * 'fuzzy' = only the artist-scoped fallback found something above the (lower)
   * fuzzy threshold -- callers should surface this distinction to the organizer
   * rather than presenting it identically to a high-confidence match. */
  matchConfidence: 'high' | 'fuzzy';
  matchedTitle: string;
}

function bestScoringCandidate(
  cleanedItemTitle: string,
  results: any[]
): { id: number; title: string; score: number } | null {
  let best: { id: number; title: string; score: number } | null = null;
  for (const r of results) {
    if (r?.id == null || !r?.title) continue;
    const score = diceCoefficient(cleanedItemTitle, String(r.title));
    if (!best || score > best.score) {
      best = { id: Number(r.id), title: String(r.title), score };
    }
  }
  return best;
}

/**
 * LEGACY (pre-ADR-132) title-only matcher. No push path calls this any more -- pushes use the
 * stored Item.discogsReleaseId (see resolveDiscogsMatch / discogsReleaseMatcher.ts). Kept only
 * for backward compatibility of the export; remove once nothing imports it.
 *
 * Search Discogs's catalog for a release matching this item's title. Returns
 * the best-scoring match (with a confidence tier) or null if nothing cleared
 * the fuzzy threshold -- a null result means the item is NOT eligible to be
 * listed on Discogs (see file header), not that the search failed.
 */
export async function findDiscogsReleaseId(accessToken: string, item: Pick<Item, 'title'>): Promise<DiscogsMatch | null> {
  if (!item.title) return null;
  const cleanedTitle = cleanDiscogsSearchTitle(item.title);
  if (!cleanedTitle) return null;

  // Primary: cleaned-title free-text search, best-scoring result among the top 10.
  const primary = await discogsRequest(
    `/database/search?q=${encodeURIComponent(cleanedTitle)}&type=release`,
    accessToken
  );
  if (primary.status === 200) {
    try {
      const data = JSON.parse(primary.text) as any;
      const results = Array.isArray(data?.results) ? data.results.slice(0, 10) : [];
      const best = bestScoringCandidate(cleanedTitle, results);
      if (best && best.score >= DISCOGS_HIGH_CONFIDENCE_THRESHOLD) {
        return { releaseId: best.id, matchConfidence: 'high', matchedTitle: best.title };
      }
    } catch {
      // Fall through to the fallback path below.
    }
  }

  // Fallback: artist-scoped search, fuzzy-score every candidate against the
  // cleaned item title, accept the best if it clears the (lower) fuzzy threshold.
  const likelyArtist = extractLikelyArtist(cleanedTitle);
  if (!likelyArtist) return null;
  const fallback = await discogsRequest(
    `/database/search?artist=${encodeURIComponent(likelyArtist)}&type=release`,
    accessToken
  );
  if (fallback.status !== 200) return null;
  try {
    const data = JSON.parse(fallback.text) as any;
    const results = Array.isArray(data?.results) ? data.results : [];
    const best = bestScoringCandidate(cleanedTitle, results);
    if (best && best.score >= DISCOGS_FUZZY_CONFIDENCE_THRESHOLD) {
      return { releaseId: best.id, matchConfidence: 'fuzzy', matchedTitle: best.title };
    }
  } catch {
    return null;
  }
  return null;
}

// ============================================================================
// Condition mapping
// ============================================================================

// FindA.Sale Item.condition -> Discogs's fixed condition string enum. Product-decision
// defaults for closest semantic fit (same posture as Reverb's own mapping table) —
// not verified against real Discogs buyer expectations, revisit once a real listing
// exists.
const ITEM_CONDITION_TO_DISCOGS: Record<string, string> = {
  NEW: 'Mint (M)',
  USED: 'Very Good Plus (VG+)',
  REFURBISHED: 'Near Mint (NM or M-)',
  PARTS_OR_REPAIR: 'Poor (P)',
};
const DEFAULT_DISCOGS_CONDITION = 'Good (G)';

function resolveDiscogsCondition(itemCondition: string | null): string {
  return (itemCondition && ITEM_CONDITION_TO_DISCOGS[itemCondition]) || DEFAULT_DISCOGS_CONDITION;
}

// ============================================================================
// Listing create / delete
// ============================================================================

export interface DiscogsListingOptions {
  /** Default false — create as a Draft. Mirrors Reverb's non-auto-publish safety posture. */
  publish?: boolean;
  /** Discogs's own "Allow offers" toggle -- lets buyers submit an offer below the listing
   * price. Real, documented API param (`allow_offers`, boolean, default false) -- see file
   * header. Defaults to false/omitted here too, matching Discogs's own default exactly. */
  allowOffers?: boolean;
}

/**
 * Create a Discogs marketplace listing for a FindA.Sale item. Looks up the
 * organizer's active DISCOGS MarketplaceAccount and POSTs to /marketplace/listings.
 *
 * ADR-132 section 7: the release_id is ONLY the stored, already-decided Item.discogsReleaseId
 * (status auto_high or confirmed). No search happens here. not_in_discogs throws
 * DiscogsNotEligibleError; needs_selection / no match throws DiscogsNeedsSelectionError.
 * A D3 "most-collected pressing" auto-match is always created as a Draft.
 */
export async function createDiscogsListing(
  organizerId: string,
  item: Item,
  options: DiscogsListingOptions = {}
): Promise<any> {
  const account = await getActiveDiscogsAccount(organizerId);
  if (!account) {
    throw new Error('[Discogs] No active Discogs connection for this organizer');
  }
  // Defense-in-depth ownership check — mirrors reverbConnector.ts's createReverbListing.
  if (item.organizerId && item.organizerId !== organizerId) {
    throw new Error('[Discogs] Item does not belong to this organizer');
  }

  const accessToken = decryptAccessToken(account);
  if (item.discogsMatchStatus === 'not_in_discogs') {
    throw new DiscogsNotEligibleError('Marked as not in Discogs');
  }
  if (
    (item.discogsMatchStatus !== 'auto_high' && item.discogsMatchStatus !== 'confirmed') ||
    item.discogsReleaseId == null
  ) {
    throw new DiscogsNeedsSelectionError();
  }
  const publish = options.publish === true && !isDraftOnlyMatch(item);

  const body: Record<string, any> = {
    release_id: item.discogsReleaseId,
    condition: resolveDiscogsCondition(item.condition ?? null),
    price: item.price ?? 0, // Discogs takes a plain decimal in the seller's currency, not cents
    status: publish ? 'For Sale' : 'Draft',
    // 2026-09-23 QA: Discogs renders comments as plain text, so any HTML entities in the
    // description (&#39; &quot; &amp; ...) must be decoded once before sending.
    comments: decodeHtmlEntities(item.description) || undefined,
    external_id: item.id,
    // 2026-09-03: only send allow_offers when explicitly true -- omitting it entirely when
    // false/undefined matches Discogs's own documented default rather than redundantly
    // asserting it.
    ...(options.allowOffers === true ? { allow_offers: true } : {}),
  };

  const { status, text } = await discogsRequest('/marketplace/listings', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (status < 200 || status >= 300) {
    const message = parseDiscogsError(status, text);
    console.error(`[Discogs] Create listing failed for organizer ${organizerId}: ${status} ${text}`);
    await prisma.marketplaceAccount
      .update({
        where: { id: account.id },
        data: { lastErrorAt: new Date(), lastErrorMessage: message.slice(0, 500) },
      })
      .catch(() => {
        /* non-fatal — don't let error-logging itself break the caller's error handling */
      });
    throw new DiscogsApiError(status, message);
  }

  return JSON.parse(text);
}

/**
 * Update an existing Discogs marketplace listing's price. Independently verified against
 * Discogs's own live API docs (discogs.com/developers/resources/marketplace/listing.html,
 * "Edit Listing" section, checked 2026-09-15 for this dispatch): the edit endpoint is
 * `POST /marketplace/listings/{listing_id}` (POST, not PUT/PATCH), and its documented
 * request body is NOT a partial-field patch -- `condition`, `price`, `release_id`, and
 * `status` are all listed as required together even for a price-only change. This
 * function therefore does a GET-then-POST, mirroring the GET-offer-then-PUT-offer shape
 * ebayPriceRevisionService.ts already uses for the same "price-only revision" problem on
 * eBay: fetch the listing's current condition/status/release_id first (GET
 * /marketplace/listings/{listing_id}, confirmed via the same docs pass to return
 * `condition`, `status`, and `release.id` on the listing object), then POST those same
 * values back with only `price` changed. Never throws -- returns a result object so
 * markdownPricePropagationService.ts's pushToDiscogs can wrap it without its own
 * try/catch needing to guess at failure shapes.
 */
export interface DiscogsPriceUpdateResult {
  ok: boolean;
  reason?: 'no-connection' | 'fetch-failed' | 'fetch-parse-failed' | 'incomplete-listing-data' | 'post-failed' | 'threw' | 'release-mismatch';
  detail?: string;
  /** 2026-09-22: raw Discogs HTTP status on fetch-failed/post-failed, so callers can tell a
   * 404 (listing no longer exists on Discogs) apart from any other failure. Additive/optional. */
  httpStatus?: number;
  /** ADR-132: the release_id the live listing uses (from the GET). Additive/optional. */
  listingReleaseId?: number;
  /** ADR-132: the listing's status as read by the GET. Additive/optional. */
  listingStatus?: string;
}

/** 2026-09-22: optional extras for updateDiscogsListingPrice, used by the upsert path below. */
export interface DiscogsListingUpdateOptions {
  /** true: promote a Draft listing to 'For Sale'. Never touches any other status (e.g. Sold). */
  publish?: boolean;
  /** true forces allow_offers on; otherwise the listing's existing allow_offers value is echoed. */
  allowOffers?: boolean;
  /** ADR-132: when set and the live listing's release differs, nothing is POSTed and the result
   * is { ok: false, reason: 'release-mismatch', listingReleaseId }. */
  expectedReleaseId?: number | null;
}

export async function updateDiscogsListingPrice(
  organizerId: string,
  discogsListingId: string,
  newPrice: number,
  updateOptions: DiscogsListingUpdateOptions = {}
): Promise<DiscogsPriceUpdateResult> {
  try {
    const account = await getActiveDiscogsAccount(organizerId);
    if (!account) {
      return { ok: false, reason: 'no-connection' };
    }
    const accessToken = decryptAccessToken(account);

    // Fetch the listing's current condition/status/release_id -- the Edit Listing endpoint
    // requires all three alongside price (see function header); omitting them is not a
    // documented partial-update path.
    const getResp = await discogsRequest(
      `/marketplace/listings/${encodeURIComponent(discogsListingId)}`,
      accessToken
    );
    if (getResp.status < 200 || getResp.status >= 300) {
      return {
        ok: false,
        reason: 'fetch-failed',
        detail: parseDiscogsError(getResp.status, getResp.text),
        httpStatus: getResp.status,
      };
    }

    let current: any;
    try {
      current = JSON.parse(getResp.text);
    } catch {
      return { ok: false, reason: 'fetch-parse-failed' };
    }

    const snap = snapshotDiscogsListing(current);
    const releaseId = snap.releaseId;
    const condition = snap.condition;
    const status = snap.status;
    if (releaseId == null || !condition || !status) {
      return { ok: false, reason: 'incomplete-listing-data' };
    }
    if (updateOptions.expectedReleaseId != null && releaseId !== updateOptions.expectedReleaseId) {
      return {
        ok: false,
        reason: 'release-mismatch',
        detail: `Listing uses release ${releaseId}, expected ${updateOptions.expectedReleaseId}`,
        listingReleaseId: releaseId,
        listingStatus: status,
      };
    }

    // ADR-132 6.3 fix: echo EVERY field the GET returned (comments, sleeve_condition,
    // allow_offers, location, weight, format_quantity, external_id) -- the edit endpoint is not a
    // documented partial update, so omitting them risks clearing them on Discogs.
    const { status: postStatus, text } = await discogsRequest(
      `/marketplace/listings/${encodeURIComponent(discogsListingId)}`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildDiscogsListingBody(snap, {
            releaseId,
            // 2026-09-22: only a Draft is ever promoted, and only on an explicit publish.
            status: updateOptions.publish === true && status === 'Draft' ? 'For Sale' : status,
            price: newPrice,
            allowOffers: updateOptions.allowOffers,
          })
        ),
      }
    );

    if (postStatus < 200 || postStatus >= 300) {
      const message = parseDiscogsError(postStatus, text);
      console.error(`[Discogs] Update listing price failed for organizer ${organizerId}, listing ${discogsListingId}: ${postStatus} ${text}`);
      await prisma.marketplaceAccount
        .update({
          where: { id: account.id },
          data: { lastErrorAt: new Date(), lastErrorMessage: message.slice(0, 500) },
        })
        .catch(() => {
          /* non-fatal -- don't let error-logging itself break the caller's error handling */
        });
      return { ok: false, reason: 'post-failed', detail: message, httpStatus: postStatus, listingReleaseId: releaseId };
    }

    return { ok: true, listingReleaseId: releaseId, listingStatus: status };
  } catch (err) {
    return { ok: false, reason: 'threw', detail: (err as Error).message };
  }
}

// ============================================================================
// Upsert (create-or-update) -- the ONLY sanctioned entry point for pushing an item
// ============================================================================

/**
 * 2026-09-22 (duplicate-listing fix): real items (cmtsyy855007g6p9vwgg9x8hh, cmtk31l0x0eic3bww7vwequob)
 * ended up with TWO live Discogs listings because every push called createDiscogsListing
 * unconditionally and then overwrote Item.discogsListingId, orphaning the first live listing.
 * Every caller that wants "put this item on Discogs" (manual push route, auto-fanout) must go
 * through this function instead of calling createDiscogsListing directly.
 *
 * Behavior:
 *   - Serialized per item id in-process (double clicks / concurrent publish + manual push queue
 *     behind each other instead of racing two creates). Each run re-reads the item fresh from
 *     the DB inside the lock, so the second caller sees the id the first one persisted.
 *   - Item already has discogsListingId: update that listing (price, plus Draft -> For Sale on
 *     publish, plus allow_offers when true). Never creates.
 *   - Update says 404 (listing gone on Discogs): clear the stale id, then create a fresh listing.
 *   - Any other update failure: throws DiscogsApiError. Never falls through to a create.
 *   - No discogsListingId: create, then persist discogsListingId/discogsListedAt.
 */
export interface DiscogsUpsertResult {
  action: 'created' | 'updated';
  listingId: string | null;
  /** Raw Discogs create response (only on action 'created'). */
  listing?: any;
}

const discogsItemLocks = new Map<string, Promise<unknown>>();

async function withDiscogsItemLock<T>(itemId: string, fn: () => Promise<T>): Promise<T> {
  const previous = discogsItemLocks.get(itemId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  discogsItemLocks.set(itemId, tail);
  try {
    return await run;
  } finally {
    // Only clear if nothing queued behind us.
    if (discogsItemLocks.get(itemId) === tail) {
      discogsItemLocks.delete(itemId);
    }
  }
}

export async function upsertDiscogsListingForItem(
  organizerId: string,
  itemId: string,
  options: DiscogsListingOptions = {}
): Promise<DiscogsUpsertResult> {
  return withDiscogsItemLock(itemId, async () => {
    let item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new Error('[Discogs] Item not found');
    }
    // Defense-in-depth ownership check (createDiscogsListing repeats it on the create path).
    if (item.organizerId && item.organizerId !== organizerId) {
      throw new Error('[Discogs] Item does not belong to this organizer');
    }

    // ADR-132 section 7: decide the release from the STORED match (runs matcher v2 only when
    // there is no stored result or its inputs changed). Push never searches on its own.
    const match = await resolveDiscogsMatchForItem(organizerId, item);
    item = (await prisma.item.findUnique({ where: { id: itemId } })) ?? item;
    const pushable = match.canPush;
    // Phase 0 / D3: never promote to For Sale unless the match is auto_high/confirmed and not a
    // "most-collected pressing" auto-pick.
    const publish = options.publish === true && pushable && !match.draftOnly;

    if (item.discogsListingId) {
      // 2026-09-23 QA: a D3 most-collected auto-pick is not a confident pressing decision, so a
      // listing already on another plausible lookalike pressing is not treated as a mismatch.
      const lookalikeListing =
        match.draftOnly && isPlausibleListedRelease(match.candidates, item.discogsListingReleaseId ?? null);
      const result = await updateDiscogsListingPrice(organizerId, item.discogsListingId, item.price ?? 0, {
        publish,
        allowOffers: options.allowOffers,
        expectedReleaseId: pushable && !lookalikeListing ? match.releaseId : null,
      });
      if (result.ok) {
        if (result.listingReleaseId != null && result.listingReleaseId !== item.discogsListingReleaseId) {
          await prisma.item
            .update({ where: { id: itemId }, data: { discogsListingReleaseId: result.listingReleaseId } })
            .catch(e => console.error(`[Discogs] Failed to persist discogsListingReleaseId for item ${itemId}:`, e));
        }
        return { action: 'updated', listingId: item.discogsListingId };
      }
      if (result.reason === 'release-mismatch') {
        const listedReleaseId = result.listingReleaseId ?? null;
        if (match.status === 'confirmed') {
          await prisma.item.update({ where: { id: itemId }, data: { discogsListingReleaseId: listedReleaseId } });
          throw new DiscogsListingMismatchError();
        }
        // auto_high without a human confirm: never auto-correct. Flag for the organizer.
        const env = readCandidatesEnvelope(item.discogsCandidates);
        const listedCandidate: DiscogsCandidate[] =
          listedReleaseId != null && !env.candidates.some(c => c.releaseId === listedReleaseId)
            ? [{
                releaseId: listedReleaseId, masterId: null, artist: '', title: `Release ${listedReleaseId}`, formats: [],
                formatClass: null, labels: [], catno: null, year: null, country: null, thumb: null,
                uri: `https://www.discogs.com/release/${listedReleaseId}`, tier: 0, composite: 0,
                fieldScores: { artist: null, title: null, catno: false, label: null, yearDelta: null },
                vetoes: [], warnings: ['Currently listed'], community: null, currentlyListed: true,
              }]
            : [];
        const candidates = env.candidates.map(c => (c.releaseId === listedReleaseId ? { ...c, currentlyListed: true } : c));
        await prisma.item.update({
          where: { id: itemId },
          data: {
            discogsMatchStatus: 'needs_selection',
            discogsReleaseId: null,
            discogsListingReleaseId: listedReleaseId,
            discogsCandidates: {
              ...env,
              reason: 'listing_release_mismatch',
              candidates: [...candidates, ...listedCandidate].slice(0, MAX_STORED_CANDIDATES),
            } as unknown as Prisma.InputJsonValue,
          },
        });
        throw new DiscogsNeedsSelectionError(
          'Your Discogs listing uses a different release than the one we matched. Choose the right release.'
        );
      }
      if (result.httpStatus !== 404) {
        const status = result.httpStatus && result.httpStatus >= 400 ? result.httpStatus : 502;
        throw new DiscogsApiError(status, result.detail || `Could not update the Discogs listing (${result.reason})`);
      }
      // Listing no longer exists on Discogs: clear the stale id, then fall through to a
      // legitimate re-list below.
      console.warn(`[Discogs] Listing ${item.discogsListingId} for item ${itemId} returned 404, re-listing`);
      await prisma.item.update({
        where: { id: itemId },
        data: { discogsListingId: null, discogsListedAt: null, discogsListingReleaseId: null },
      });
    }

    if (match.status === 'not_in_discogs') {
      throw new DiscogsNotEligibleError('Marked as not in Discogs');
    }
    if (!pushable) {
      throw new DiscogsNeedsSelectionError();
    }
    const listing = await createDiscogsListing(organizerId, item, { ...options, publish });
    // listing_id is Discogs's own documented POST /marketplace/listings response field; the
    // response is untyped, so read it defensively.
    const listingId = listing && listing.listing_id != null ? String(listing.listing_id) : null;
    if (listingId) {
      await prisma.item
        .update({
          where: { id: itemId },
          data: { discogsListingId: listingId, discogsListedAt: new Date(), discogsListingReleaseId: item.discogsReleaseId },
        })
        .catch((e) => {
          // Non-fatal: the real Discogs listing already exists at this point.
          console.error(`[Discogs] Failed to persist discogsListingId for item ${itemId} after a successful create:`, e);
        });
    }
    return { action: 'created', listingId, listing };
  });
}

/** Permanently remove a Discogs listing (DELETE /marketplace/listings/{listing_id}). */
export async function deleteDiscogsListing(organizerId: string, discogsListingId: string): Promise<{ action: 'deleted' }> {
  const account = await getActiveDiscogsAccount(organizerId);
  if (!account) {
    throw new Error('[Discogs] No active Discogs connection for this organizer');
  }
  const accessToken = decryptAccessToken(account);

  const { status, text } = await discogsRequest(
    `/marketplace/listings/${encodeURIComponent(discogsListingId)}`,
    accessToken,
    { method: 'DELETE' }
  );
  if (status < 200 || status >= 300) {
    const message = parseDiscogsError(status, text);
    console.error(`[Discogs] Delete listing failed for organizer ${organizerId}, listing ${discogsListingId}: ${status} ${text}`);
    throw new DiscogsApiError(status, message);
  }
  return { action: 'deleted' };
}

/**
 * Withdraw an item's Discogs listing when it goes SOLD via a non-Discogs channel (e.g. eBay,
 * Shopify, POS, off-platform). Added 2026-09-15 (S-discogs-sold-parity, Patrick-reported item
 * cmtsyyhig007o6p9vlk04ocvh sold on eBay but never delisted from Discogs) -- mirrors
 * endEbayListingIfExists (ebayController.ts) and markShopifyItemSold (shopifyService.ts): it
 * re-queries the item, self-guards on discogsListingId actually being set (no-ops if this item
 * was never pushed to Discogs), and never throws. On a successful delete it clears
 * Item.discogsListingId/discogsListedAt, the same clear-on-delete behavior as the manual
 * organizer-triggered delete in discogsMarketplaceController.ts's removeItemFromDiscogs.
 */
export async function withdrawDiscogsListingIfExists(itemId: string): Promise<void> {
  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        discogsListingId: true,
        sale: { select: { organizerId: true } },
      },
    });

    if (!item || !item.discogsListingId) {
      // Never pushed to Discogs -- nothing to withdraw.
      return;
    }

    const organizerId = item.sale?.organizerId ?? null;
    if (!organizerId) {
      console.warn(`[Discogs] Could not resolve organizerId for item ${itemId} -- skipping withdraw`);
      return;
    }

    await deleteDiscogsListing(organizerId, item.discogsListingId);

    await prisma.item
      .update({
        where: { id: itemId },
        data: { discogsListingId: null, discogsListedAt: null, discogsListingReleaseId: null },
      })
      .catch((e) => {
        console.error(`[Discogs] Failed to clear discogsListingId after withdraw-on-SOLD for item ${itemId}:`, e);
      });
  } catch (error: any) {
    // Log but don't throw -- fire-and-forget, same posture as endEbayListingIfExists/markShopifyItemSold.
    console.error(`[Discogs] withdraw-on-SOLD failed for item ${itemId}:`, error.message);
  }
}

/**
 * Eligibility pre-check (ADR-132 shim for GET /items/:id/eligibility, kept for one release).
 * Uses the stored match (running matcher v2 only when needed). eligible = auto_high|confirmed.
 * matchConfidence is 'high' for those, null otherwise ('fuzzy' no longer exists).
 */
export async function checkDiscogsEligibility(
  organizerId: string,
  item: Item
): Promise<{
  eligible: boolean;
  releaseId: number | null;
  matchConfidence: 'high' | null;
  matchedTitle: string | null;
  matchStatus: DiscogsMatchStatus | null;
  draftOnly: boolean;
}> {
  const view = await resolveDiscogsMatch(organizerId, item.id);
  const sel = view.selected;
  return {
    eligible: view.canPush,
    releaseId: view.canPush ? view.releaseId : null,
    matchConfidence: view.canPush ? 'high' : null,
    matchedTitle: sel ? `${sel.artist} - ${sel.title}` : null,
    matchStatus: view.status,
    draftOnly: view.draftOnly,
  };
}

// ============================================================================
// ADR-132: release matching, persistence, confirmation, correction, sweep
// ============================================================================

const PUSHABLE_MATCH_STATUSES: DiscogsMatchStatus[] = ['auto_high', 'confirmed'];
const MAX_STORED_CANDIDATES = 4;

/** Item.discogsCandidates JSON envelope. */
export interface DiscogsCandidatesEnvelope {
  matcherVersion: number;
  reason: string | null;
  rule: string | null;
  candidates: DiscogsCandidate[];
  /** Item.discogsListingId the `currentlyListed` flags + discogsListingReleaseId were last read
   * from (live GET). A different listing id (e.g. a manual relink) forces a fresh read. */
  listingSyncedFor?: string | null;
}

export function readCandidatesEnvelope(raw: unknown): DiscogsCandidatesEnvelope {
  if (Array.isArray(raw)) {
    return { matcherVersion: MATCHER_VERSION, reason: null, rule: null, candidates: raw as DiscogsCandidate[] };
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).candidates)) {
    const r = raw as any;
    return {
      matcherVersion: Number(r.matcherVersion) || MATCHER_VERSION,
      reason: typeof r.reason === 'string' ? r.reason : null,
      rule: typeof r.rule === 'string' ? r.rule : null,
      candidates: r.candidates as DiscogsCandidate[],
      ...(typeof r.listingSyncedFor === 'string' ? { listingSyncedFor: r.listingSyncedFor } : {}),
    };
  }
  return { matcherVersion: MATCHER_VERSION, reason: null, rule: null, candidates: [] };
}

function dedupeCandidates(list: DiscogsCandidate[]): DiscogsCandidate[] {
  const seen = new Set<number>();
  const out: DiscogsCandidate[] = [];
  for (const c of list) {
    if (!c || seen.has(c.releaseId)) continue;
    seen.add(c.releaseId);
    out.push(c);
  }
  return out;
}

export interface DiscogsMatchView {
  itemId: string;
  status: DiscogsMatchStatus | null;
  releaseId: number | null;
  selected: DiscogsCandidate | null;
  candidates: DiscogsCandidate[];
  reason: string | null;
  rule: string | null;
  /** D3 relaxed: auto-picked most-collected pressing -- may only be pushed as a Draft. */
  draftOnly: boolean;
  canPush: boolean;
  matchedAt: string | null;
  recordIdentity: RecordIdentityValues;
  recordIdentitySources: RecordIdentitySources;
  listing: { listingId: string | null; listingReleaseId: number | null; releaseMismatch: boolean };
}

type MatchItemFields = Pick<
  Item,
  | 'id' | 'title' | 'description' | 'brand' | 'tags' | 'upc' | 'ean' | 'recordIdentity'
  | 'discogsReleaseId' | 'discogsMatchStatus' | 'discogsCandidates' | 'discogsMatchedAt'
  | 'discogsMatchInputHash' | 'discogsListingId' | 'discogsListingReleaseId'
>;

function computeEffectiveIdentity(item: MatchItemFields) {
  const derived = deriveRecordIdentityFromText({
    title: item.title,
    description: item.description,
    brand: item.brand,
    tags: item.tags,
  });
  const eff = effectiveRecordIdentity(item.recordIdentity, derived);
  const hash = computeMatchInputHash(eff.values, item);
  return { ...eff, hash };
}

function isDraftOnlyMatch(item: Pick<Item, 'discogsMatchStatus' | 'discogsReleaseId' | 'discogsCandidates'>): boolean {
  if (item.discogsMatchStatus !== 'auto_high' || item.discogsReleaseId == null) return false;
  const env = readCandidatesEnvelope(item.discogsCandidates);
  const sel = env.candidates.find(c => c.releaseId === item.discogsReleaseId);
  return !!sel?.autoSelectedPressing;
}

/**
 * 2026-09-23 QA: a listed release is "plausible" when the matcher itself returned it as a
 * candidate with no hard veto and both artist and title agree with the item's identity. Used
 * when the matcher could not pin one pressing (needs_selection, or a D3 most-collected auto-pick):
 * a listing on one of those lookalike pressings is not a wrong release, only an unconfirmed one.
 */
export function isPlausibleListedRelease(candidates: DiscogsCandidate[], listedReleaseId: number | null): boolean {
  if (listedReleaseId == null) return false;
  const c = candidates.find(x => x.releaseId === listedReleaseId);
  if (!c || c.vetoes.length > 0) return false;
  const a = c.fieldScores?.artist;
  const t = c.fieldScores?.title;
  return a != null && t != null && a >= 0.6 && t >= 0.6;
}

export function buildDiscogsMatchView(item: MatchItemFields): DiscogsMatchView {
  const env = readCandidatesEnvelope(item.discogsCandidates);
  const status = (item.discogsMatchStatus as DiscogsMatchStatus | null) ?? null;
  const releaseId = item.discogsReleaseId ?? null;
  const selected = releaseId != null ? env.candidates.find(c => c.releaseId === releaseId) ?? null : null;
  const eff = computeEffectiveIdentity(item);
  const pushable = status != null && PUSHABLE_MATCH_STATUSES.includes(status) && releaseId != null;
  const listingReleaseId = item.discogsListingReleaseId ?? null;
  const draftOnly = isDraftOnlyMatch(item);
  // 2026-09-23 QA: only a real disagreement is a mismatch. Previously any needs_selection item
  // with a stale `currentlyListed` flag counted, which misfired after a manual listing relink.
  //   - decided release (auto_high/confirmed) differs from the listing's release, unless it is a
  //     D3 most-collected auto-pick and the listing sits on another plausible lookalike pressing;
  //   - or the stored reason says a push already found the listing on a different release.
  const releaseMismatch =
    !!item.discogsListingId &&
    ((listingReleaseId != null &&
      releaseId != null &&
      listingReleaseId !== releaseId &&
      !(draftOnly && isPlausibleListedRelease(env.candidates, listingReleaseId))) ||
      (status === 'needs_selection' && env.reason === 'listing_release_mismatch'));
  return {
    itemId: item.id,
    status,
    releaseId,
    selected,
    candidates: env.candidates,
    reason: env.reason,
    rule: env.rule,
    draftOnly,
    canPush: pushable,
    matchedAt: item.discogsMatchedAt ? new Date(item.discogsMatchedAt).toISOString() : null,
    recordIdentity: eff.values,
    recordIdentitySources: eff.sources,
    listing: { listingId: item.discogsListingId ?? null, listingReleaseId, releaseMismatch },
  };
}

/** GET /database/search (authenticated). Returns the results array, or null on failure. */
export async function searchDiscogsReleases(accessToken: string, params: Record<string, string>): Promise<any[] | null> {
  const qs = new URLSearchParams(params).toString();
  const { status, text } = await discogsRequest(`/database/search?${qs}`, accessToken);
  if (status !== 200) return null;
  try {
    const data = JSON.parse(text) as any;
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return null;
  }
}

/** GET /releases/{id}. Returns null on 404, throws DiscogsApiError on other failures. */
export async function fetchDiscogsRelease(accessToken: string, releaseId: number): Promise<any | null> {
  const { status, text } = await discogsRequest(`/releases/${encodeURIComponent(String(releaseId))}`, accessToken);
  if (status === 404) return null;
  if (status < 200 || status >= 300) throw new DiscogsApiError(status, parseDiscogsError(status, text));
  return JSON.parse(text);
}

/** GET /marketplace/listings/{id}. `listing` is null on 404. */
export async function fetchDiscogsListing(
  accessToken: string,
  listingId: string
): Promise<{ status: number; listing: any | null; error?: string }> {
  const { status, text } = await discogsRequest(`/marketplace/listings/${encodeURIComponent(listingId)}`, accessToken);
  if (status === 404) return { status, listing: null };
  if (status < 200 || status >= 300) return { status, listing: null, error: parseDiscogsError(status, text) };
  try {
    return { status, listing: JSON.parse(text) };
  } catch {
    return { status: 502, listing: null, error: 'Could not parse Discogs listing' };
  }
}

/**
 * Seller-side order list for the organizer's connected Discogs account (2026-09-23, Discogs sold
 * detection -- jobs/discogsSoldSyncCron.ts). GET /marketplace/orders, newest first, one page.
 * Each order's items[].id is the Discogs LISTING id, i.e. Item.discogsListingId.
 * Returns null when the organizer has no ACTIVE Discogs connection. Throws DiscogsApiError on a
 * non-2xx so the caller can log it and move on.
 */
export async function fetchRecentDiscogsSellerOrders(
  organizerId: string,
  perPage = 50,
): Promise<Array<{ id: string; status: string; created?: string; items: Array<{ id: string }> }> | null> {
  const account = await getActiveDiscogsAccount(organizerId);
  if (!account) return null;
  const accessToken = decryptAccessToken(account);
  const qs = `sort=created&sort_order=desc&per_page=${Math.max(1, Math.min(100, perPage))}`;
  const { status, text } = await discogsRequest(`/marketplace/orders?${qs}`, accessToken);
  if (status < 200 || status >= 300) throw new DiscogsApiError(status, parseDiscogsError(status, text));
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new DiscogsApiError(502, 'Could not parse Discogs orders');
  }
  const orders: any[] = Array.isArray(body?.orders) ? body.orders : [];
  return orders.map((o) => ({
    id: String(o?.id ?? ''),
    status: String(o?.status ?? ''),
    created: typeof o?.created === 'string' ? o.created : undefined,
    items: (Array.isArray(o?.items) ? o.items : [])
      .map((it: any) => ({ id: it?.id == null ? '' : String(it.id) }))
      .filter((it: { id: string }) => it.id.length > 0),
  }));
}

async function requireAccessToken(organizerId: string): Promise<{ account: MarketplaceAccount; accessToken: string }> {
  const account = await getActiveDiscogsAccount(organizerId);
  if (!account) throw new DiscogsNotConnectedError();
  return { account, accessToken: decryptAccessToken(account) };
}

async function loadOwnedItem(organizerId: string, itemId: string): Promise<Item> {
  const item = await prisma.item.findUnique({ where: { id: itemId }, include: { sale: { select: { organizerId: true } } } });
  if (!item) throw new DiscogsHttpError(404, 'item_not_found', 'Item not found');
  const owner = item.organizerId ?? (item as any).sale?.organizerId ?? null;
  if (owner !== organizerId) throw new DiscogsHttpError(404, 'item_not_found', 'Item not found');
  return item;
}

interface ResolveOptions {
  /** Re-run the matcher even when the stored result is fresh. confirmed/not_in_discogs keep their
   * status + id; only their candidate list is refreshed. */
  force?: boolean;
  /** Clear confirmed/not_in_discogs back to a fresh auto match (organizer "Undo"). */
  reset?: boolean;
}

/**
 * 2026-09-23 QA (item cmtk31l0x0eic3bww7vwequob): the listing id was relinked in the DB to
 * 4356972027 without discogsListingReleaseId, so the match view kept `currentlyListed` flags from
 * the OLD listing and showed a false "different release". When the item has a listing and either
 * no stored listing release, or the flags were read for a different listing id, read the live
 * listing (one GET /marketplace/listings/{id}) and persist release.id + fresh flags. Reads only
 * from Discogs; never throws (the match view must still render if Discogs is unreachable).
 */
async function syncListedReleaseFromLive(organizerId: string, item: Item): Promise<Item> {
  const listingId = item.discogsListingId;
  if (!listingId) return item;
  const env = readCandidatesEnvelope(item.discogsCandidates);
  const relinked = typeof env.listingSyncedFor === 'string' && env.listingSyncedFor !== listingId;
  if (item.discogsListingReleaseId != null && !relinked) return item;
  try {
    const account = await getActiveDiscogsAccount(organizerId);
    if (!account) return item;
    const got = await fetchDiscogsListing(decryptAccessToken(account), listingId);
    // 404 / errors: leave it to the push path and the sweep, which own clearing stale ids.
    if (!got.listing) return item;
    const listedRaw = rawFromListingRelease(got.listing.release);
    const listedReleaseId = listedRaw?.releaseId ?? null;
    if (listedReleaseId == null) return item;
    const eff = computeEffectiveIdentity(item);
    const flagged = env.candidates.map(c => ({ ...c, currentlyListed: c.releaseId === listedReleaseId }));
    const listed = flagged.some(c => c.releaseId === listedReleaseId)
      ? []
      : [{ ...scoreCandidate(listedRaw!, eff.values, 0, item.title), currentlyListed: true }];
    const envelope: DiscogsCandidatesEnvelope = {
      ...env,
      // A mismatch reason recorded against a different listing no longer applies.
      reason: relinked && env.reason === 'listing_release_mismatch' ? null : env.reason,
      candidates: dedupeCandidates([...flagged, ...listed]).slice(0, MAX_STORED_CANDIDATES),
      listingSyncedFor: listingId,
    };
    return await prisma.item.update({
      where: { id: item.id },
      data: {
        discogsListingReleaseId: listedReleaseId,
        discogsCandidates: envelope as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error(`[Discogs] Could not read the live listing release for item ${item.id}:`, e);
    return item;
  }
}

async function resolveDiscogsMatchForItem(
  organizerId: string,
  itemIn: Item,
  opts: ResolveOptions = {}
): Promise<DiscogsMatchView> {
  const item = await syncListedReleaseFromLive(organizerId, itemIn);
  const eff = computeEffectiveIdentity(item);
  const status = (item.discogsMatchStatus as DiscogsMatchStatus | null) ?? null;
  const locked = !opts.reset && (status === 'confirmed' || status === 'not_in_discogs');
  if (locked && !opts.force) return buildDiscogsMatchView(item);
  if (!locked && !opts.force && !opts.reset && status && item.discogsMatchInputHash === eff.hash) {
    return buildDiscogsMatchView(item);
  }

  const { accessToken } = await requireAccessToken(organizerId);
  const res = await matchDiscogsRelease(
    { identity: eff.values, sources: eff.sources, upc: item.upc, ean: item.ean, fallbackTitle: item.title },
    { search: params => searchDiscogsReleases(accessToken, params) }
  );
  if (res.reason === 'search_failed') {
    throw new DiscogsApiError(502, 'Discogs search failed. Try again in a minute.');
  }

  const old = readCandidatesEnvelope(item.discogsCandidates);
  const keep = old.candidates.filter(
    c => c.currentlyListed || c.fromPastedUrl || (locked && c.releaseId === item.discogsReleaseId)
  );
  const envelope: DiscogsCandidatesEnvelope = {
    matcherVersion: MATCHER_VERSION,
    reason: locked ? old.reason : res.reason,
    rule: locked ? old.rule : res.rule,
    candidates: dedupeCandidates(
      locked ? [...keep, ...res.candidates] : [...res.candidates, ...keep]
    )
      .slice(0, MAX_STORED_CANDIDATES)
      // Fresh matcher results carry no `currentlyListed`; re-mark from the stored listing release.
      .map(c =>
        item.discogsListingId && item.discogsListingReleaseId != null
          ? { ...c, currentlyListed: c.releaseId === item.discogsListingReleaseId }
          : c
      ),
    ...(old.listingSyncedFor ? { listingSyncedFor: old.listingSyncedFor } : {}),
  };

  const data: Prisma.ItemUpdateInput = locked
    ? {
        recordIdentity: eff.identity as unknown as Prisma.InputJsonValue,
        discogsCandidates: envelope as unknown as Prisma.InputJsonValue,
        discogsMatchedAt: new Date(),
        discogsMatchInputHash: eff.hash,
      }
    : {
        recordIdentity: eff.identity as unknown as Prisma.InputJsonValue,
        discogsReleaseId: res.releaseId,
        discogsMatchStatus: res.status,
        discogsCandidates: envelope as unknown as Prisma.InputJsonValue,
        discogsMatchedAt: new Date(),
        discogsMatchInputHash: eff.hash,
      };
  const updated = await prisma.item.update({ where: { id: item.id }, data });
  return buildDiscogsMatchView(updated);
}

/**
 * ADR-132 section 5: the stored match for an item, running matcher v2 only when there is no
 * stored result or its inputs changed (or `force`). Ownership is re-checked here.
 */
export async function resolveDiscogsMatch(
  organizerId: string,
  itemId: string,
  opts: ResolveOptions = {}
): Promise<DiscogsMatchView> {
  return withDiscogsItemLock(itemId, async () => {
    const item = await loadOwnedItem(organizerId, itemId);
    return resolveDiscogsMatchForItem(organizerId, item, opts);
  });
}

/**
 * ADR-132 section 5: organizer confirms a release, either one of the stored candidates
 * (`releaseId`) or a pasted discogs.com release URL (`url`, parsed strictly to a numeric id and
 * validated with GET /releases/{id}; the URL itself is never fetched).
 */
export async function confirmDiscogsRelease(
  organizerId: string,
  itemId: string,
  input: { releaseId?: unknown; url?: unknown }
): Promise<DiscogsMatchView> {
  const hasId = input.releaseId !== undefined && input.releaseId !== null;
  const hasUrl = input.url !== undefined && input.url !== null && input.url !== '';
  if (hasId === hasUrl) {
    throw new DiscogsHttpError(400, 'invalid_input', 'Send exactly one of releaseId or url');
  }
  return withDiscogsItemLock(itemId, async () => {
    const item = await loadOwnedItem(organizerId, itemId);
    const env = readCandidatesEnvelope(item.discogsCandidates);
    const eff = computeEffectiveIdentity(item);
    let chosen: DiscogsCandidate;

    if (hasId) {
      const id = typeof input.releaseId === 'number' ? input.releaseId : Number.NaN;
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new DiscogsHttpError(400, 'invalid_release_id', 'releaseId must be a positive integer');
      }
      const found = env.candidates.find(c => c.releaseId === id);
      if (!found) {
        throw new DiscogsHttpError(400, 'not_a_candidate', 'Pick one of the listed releases, or paste a Discogs release link');
      }
      chosen = found;
    } else {
      const parsed = parseDiscogsReleaseUrl(input.url);
      if ('error' in parsed) {
        throw new DiscogsHttpError(
          400,
          parsed.error,
          parsed.error === 'master_url'
            ? 'That is a Discogs master page. Open it and choose the specific pressing (a /release/ link).'
            : 'Paste a Discogs release link, like https://www.discogs.com/release/1234567'
        );
      }
      const existing = env.candidates.find(c => c.releaseId === parsed.releaseId);
      if (existing) {
        chosen = existing;
      } else {
        const { accessToken } = await requireAccessToken(organizerId);
        const release = await fetchDiscogsRelease(accessToken, parsed.releaseId);
        const raw = release ? rawFromRelease(release) : null;
        if (!raw) throw new DiscogsHttpError(422, 'release_not_found', 'Discogs has no release with that id');
        chosen = { ...scoreCandidate(raw, eff.values, 0, item.title), fromPastedUrl: true };
      }
    }

    const envelope: DiscogsCandidatesEnvelope = {
      matcherVersion: MATCHER_VERSION,
      reason: 'organizer_confirmed',
      rule: null,
      candidates: dedupeCandidates([{ ...chosen, autoSelectedPressing: undefined }, ...env.candidates]).slice(0, MAX_STORED_CANDIDATES),
    };
    const updated = await prisma.item.update({
      where: { id: item.id },
      data: {
        discogsReleaseId: chosen.releaseId,
        discogsMatchStatus: 'confirmed',
        discogsCandidates: envelope as unknown as Prisma.InputJsonValue,
        discogsMatchedAt: new Date(),
        discogsMatchInputHash: eff.hash,
      },
    });
    return buildDiscogsMatchView(updated);
  });
}

/** ADR-132 section 5: organizer says the record is not in Discogs. Blocks Discogs push. */
export async function markItemNotInDiscogs(organizerId: string, itemId: string): Promise<DiscogsMatchView> {
  return withDiscogsItemLock(itemId, async () => {
    const item = await loadOwnedItem(organizerId, itemId);
    const updated = await prisma.item.update({
      where: { id: item.id },
      data: { discogsMatchStatus: 'not_in_discogs', discogsReleaseId: null, discogsMatchedAt: new Date() },
    });
    return buildDiscogsMatchView(updated);
  });
}

/** Organizer edit of the record identity panel. Re-matches unless the status is locked. */
export async function updateItemRecordIdentity(
  organizerId: string,
  itemId: string,
  body: Record<string, unknown>
): Promise<DiscogsMatchView> {
  return withDiscogsItemLock(itemId, async () => {
    const item = await loadOwnedItem(organizerId, itemId);
    const applied = applyOrganizerRecordIdentity(item.recordIdentity, body);
    if ('error' in applied) throw new DiscogsHttpError(400, 'invalid_record_identity', applied.error);
    const updated = await prisma.item.update({
      where: { id: item.id },
      data: { recordIdentity: applied.identity as unknown as Prisma.InputJsonValue },
    });
    const status = updated.discogsMatchStatus;
    if (status === 'confirmed' || status === 'not_in_discogs') return buildDiscogsMatchView(updated);
    const account = await getActiveDiscogsAccount(organizerId);
    if (!account) return buildDiscogsMatchView(updated);
    return resolveDiscogsMatchForItem(organizerId, updated, { force: true });
  });
}

// ─── Listing field snapshot (ADR-132 6.3) ────────────────────────────────────

export interface DiscogsListingSnapshot {
  status: string;
  releaseId: number | null;
  price: number | null;
  condition: string | null;
  sleeve_condition: string | null;
  comments: string | null;
  allow_offers: boolean | null;
  location: string | null;
  weight: number | string | null;
  format_quantity: number | string | null;
  external_id: string | null;
}

/**
 * 2026-09-23 QA (live): GET /marketplace/listings/{id} returns free-text fields HTML-escaped
 * (listing 4356972027 comes back with "&#34;It&#39;s Like You Never Left&#34;"). Echoing that
 * back on an edit or a recreate stored the entities as literal text (Styx listing 4376372817
 * now reads "Styx &#39;Pieces of Eight&#39;"). Every text field is therefore decoded exactly
 * once here, which undoes Discogs's output escaping without double-decoding real text.
 */
export function snapshotDiscogsListing(listing: any): DiscogsListingSnapshot {
  const priceValue = listing?.price?.value ?? listing?.price;
  return {
    status: String(listing?.status ?? ''),
    releaseId: listing?.release?.id != null ? Number(listing.release.id) : null,
    price: priceValue != null && !Number.isNaN(Number(priceValue)) ? Number(priceValue) : null,
    condition: listing?.condition ? decodeHtmlEntities(String(listing.condition)) : null,
    sleeve_condition: listing?.sleeve_condition ? decodeHtmlEntities(String(listing.sleeve_condition)) : null,
    comments: typeof listing?.comments === 'string' ? decodeHtmlEntities(listing.comments) : null,
    allow_offers: typeof listing?.allow_offers === 'boolean' ? listing.allow_offers : null,
    location: typeof listing?.location === 'string' && listing.location ? decodeHtmlEntities(listing.location) : null,
    weight: listing?.weight != null && listing.weight !== '' ? listing.weight : null,
    format_quantity: listing?.format_quantity != null && listing.format_quantity !== '' ? listing.format_quantity : null,
    external_id: listing?.external_id != null && listing.external_id !== '' ? String(listing.external_id) : null,
  };
}

/** Full edit/create body that carries every existing field forward (never a partial POST). */
export function buildDiscogsListingBody(
  snap: DiscogsListingSnapshot,
  overrides: { releaseId: number; status: string; price?: number; allowOffers?: boolean }
): Record<string, any> {
  const body: Record<string, any> = {
    release_id: overrides.releaseId,
    condition: snap.condition,
    status: overrides.status,
    price: overrides.price ?? snap.price,
  };
  if (snap.sleeve_condition) body.sleeve_condition = snap.sleeve_condition;
  if (snap.comments != null) body.comments = snap.comments;
  if (overrides.allowOffers === true) body.allow_offers = true;
  else if (snap.allow_offers != null) body.allow_offers = snap.allow_offers;
  if (snap.location) body.location = snap.location;
  if (snap.weight != null) body.weight = snap.weight;
  if (snap.format_quantity != null) body.format_quantity = snap.format_quantity;
  if (snap.external_id) body.external_id = snap.external_id;
  return body;
}

// ─── Correction executor (ADR-132 6.2-6.3; Patrick D2 + D4) ──────────────────

export type DiscogsCorrectionAction =
  | 'already_correct'
  | 'edited_in_place'
  | 'recreated'
  | 'recreated_old_listing_not_deleted'
  | 'listing_gone';

export interface DiscogsCorrectionResult {
  action: DiscogsCorrectionAction;
  listingId: string | null;
  previousListingId: string;
  listingReleaseId: number | null;
  listingStatus: string | null;
  message: string;
}

const CORRECTABLE_LISTING_STATUSES = ['For Sale', 'Draft', 'Expired'];

/**
 * Re-point one item's Discogs listing at the organizer-confirmed release. Runs ONLY when an
 * organizer/admin explicitly invokes it for this item (Patrick D2) -- nothing calls it in bulk.
 *   1. Preconditions: status 'confirmed', discogsReleaseId + discogsListingId set, FAS item AVAILABLE.
 *   2. GET listing; abort unless For Sale / Draft / Expired (Sold = a Discogs order exists).
 *   3. Snapshot every field (text fields entity-decoded), create a new Draft with the snapshot
 *      on the new release, persist it, DELETE the old listing, then promote the new one. No
 *      in-place release edit: confirmed 2026-09-23 that Discogs ignores release_id edits.
 *   4. Final status (Patrick D4): For Sale / Draft -> For Sale; Expired stays Expired.
 */
export async function correctDiscogsListingRelease(organizerId: string, itemId: string): Promise<DiscogsCorrectionResult> {
  return withDiscogsItemLock(itemId, async () => {
    const item = await loadOwnedItem(organizerId, itemId);
    if (item.discogsMatchStatus !== 'confirmed' || item.discogsReleaseId == null) {
      throw new DiscogsHttpError(409, 'not_confirmed', 'Confirm the right Discogs release before fixing the listing');
    }
    if (!item.discogsListingId) {
      throw new DiscogsHttpError(409, 'no_listing', 'This item has no Discogs listing to fix');
    }
    if (item.status !== 'AVAILABLE') {
      throw new DiscogsHttpError(409, 'item_not_available', `This item is ${String(item.status).toLowerCase()} in FindA.Sale, so its Discogs listing was not changed`);
    }
    const newReleaseId = item.discogsReleaseId;
    const oldListingId = item.discogsListingId;
    const { account, accessToken } = await requireAccessToken(organizerId);

    const current = await fetchDiscogsListing(accessToken, oldListingId);
    if (current.status === 404) {
      await prisma.item.update({
        where: { id: item.id },
        data: { discogsListingId: null, discogsListedAt: null, discogsListingReleaseId: null },
      });
      return {
        action: 'listing_gone', listingId: null, previousListingId: oldListingId, listingReleaseId: null, listingStatus: null,
        message: 'The Discogs listing no longer exists. Push the item again to list it with the confirmed release.',
      };
    }
    if (!current.listing) throw new DiscogsApiError(current.status >= 400 ? current.status : 502, current.error || 'Could not read the Discogs listing');

    const snap = snapshotDiscogsListing(current.listing);
    if (!CORRECTABLE_LISTING_STATUSES.includes(snap.status)) {
      console.warn(`[DiscogsCorrectionAudit] ${JSON.stringify({ event: 'abort_status', itemId, listingId: oldListingId, status: snap.status })}`);
      throw new DiscogsHttpError(
        409,
        snap.status === 'Sold' ? 'sold_on_discogs' : 'listing_not_editable',
        snap.status === 'Sold'
          ? 'This listing already sold on Discogs as the wrong release. It was not changed; contact the buyer on Discogs.'
          : `This Discogs listing is "${snap.status}" and cannot be edited through the API.`
      );
    }
    if (!snap.condition || snap.price == null) {
      throw new DiscogsHttpError(502, 'incomplete_listing', 'The Discogs listing is missing its price or condition');
    }
    const finalStatus = snap.status === 'Expired' ? 'Expired' : 'For Sale';
    console.info(`[DiscogsCorrectionAudit] ${JSON.stringify({ event: 'snapshot', itemId, listingId: oldListingId, newReleaseId, snapshot: snap })}`);

    const postEdit = (listingId: string, body: Record<string, any>) =>
      discogsRequest(`/marketplace/listings/${encodeURIComponent(listingId)}`, accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    // Already on the right release: only restore the status (D4).
    if (snap.releaseId === newReleaseId) {
      if (snap.status !== finalStatus) {
        const r = await postEdit(oldListingId, buildDiscogsListingBody(snap, { releaseId: newReleaseId, status: finalStatus }));
        if (r.status < 200 || r.status >= 300) throw new DiscogsApiError(r.status, parseDiscogsError(r.status, r.text));
      }
      await prisma.item.update({ where: { id: item.id }, data: { discogsListingReleaseId: newReleaseId } });
      return {
        action: 'already_correct', listingId: oldListingId, previousListingId: oldListingId, listingReleaseId: newReleaseId,
        listingStatus: finalStatus, message: 'The Discogs listing already uses the confirmed release.',
      };
    }

    // In-place release edit is intentionally NOT attempted (2026-09-23 live test, item Styx
    // "Pieces of Eight"): POST /marketplace/listings/{id} with a new release_id returned 2xx but
    // the follow-up GET still showed the old release, so the recreate path ran (new listing
    // 4376372817 created, old 4356618198 deleted). Discogs does not change a listing's release
    // in place, so we skip straight to replace and save a POST + GET per correction. The
    // verify step that matters is kept: the GET above already short-circuits when the listing
    // is on the confirmed release ("already_correct"). 'edited_in_place' stays in the result
    // type for compatibility but is no longer produced. See ADR-132 6.2 / 11 note.
    console.info(`[DiscogsCorrectionAudit] ${JSON.stringify({ event: 'replace_start', itemId, listingId: oldListingId, newReleaseId })}`);

    // 2) Recreate: new Draft -> persist -> delete old -> promote.
    const create = await discogsRequest('/marketplace/listings', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDiscogsListingBody(snap, { releaseId: newReleaseId, status: 'Draft' })),
    });
    if (create.status < 200 || create.status >= 300) {
      const message = parseDiscogsError(create.status, create.text);
      await prisma.marketplaceAccount
        .update({ where: { id: account.id }, data: { lastErrorAt: new Date(), lastErrorMessage: message.slice(0, 500) } })
        .catch(() => undefined);
      throw new DiscogsApiError(create.status, message);
    }
    let newListingId: string | null = null;
    try {
      const parsed = JSON.parse(create.text) as any;
      newListingId = parsed?.listing_id != null ? String(parsed.listing_id) : null;
    } catch {
      newListingId = null;
    }
    if (!newListingId) throw new DiscogsApiError(502, 'Discogs created the listing but returned no listing id');
    await prisma.item.update({
      where: { id: item.id },
      data: { discogsListingId: newListingId, discogsListedAt: new Date(), discogsListingReleaseId: newReleaseId },
    });
    console.info(`[DiscogsCorrectionAudit] ${JSON.stringify({ event: 'recreated_draft', itemId, oldListingId, newListingId, newReleaseId })}`);

    const del = await discogsRequest(`/marketplace/listings/${encodeURIComponent(oldListingId)}`, accessToken, { method: 'DELETE' });
    if ((del.status < 200 || del.status >= 300) && del.status !== 404) {
      console.error(`[DiscogsCorrectionAudit] ${JSON.stringify({ event: 'old_delete_failed', itemId, oldListingId, newListingId, status: del.status })}`);
      return {
        action: 'recreated_old_listing_not_deleted', listingId: newListingId, previousListingId: oldListingId, listingReleaseId: newReleaseId,
        listingStatus: 'Draft',
        message: `Created a corrected Draft listing, but Discogs refused to delete the old listing ${oldListingId}. Delete it on discogs.com, then publish the new Draft.`,
      };
    }

    const promote = await postEdit(newListingId, buildDiscogsListingBody(snap, { releaseId: newReleaseId, status: finalStatus }));
    const promoted = promote.status >= 200 && promote.status < 300;
    if (!promoted) console.error(`[Discogs] Promote of recreated listing ${newListingId} failed: ${promote.status} ${promote.text}`);
    return {
      action: 'recreated', listingId: newListingId, previousListingId: oldListingId, listingReleaseId: newReleaseId,
      listingStatus: promoted ? finalStatus : 'Draft',
      message: promoted
        ? 'Replaced the Discogs listing with one for the confirmed release.'
        : 'Replaced the Discogs listing; the new listing is still a Draft (publishing it failed).',
    };
  });
}

// ─── Rematch sweep (ADR-132 6.1) -- dry-run by default, never writes to Discogs ──

export type DiscogsSweepClassification =
  | 'AGREE'
  | 'MISMATCH'
  | 'NEEDS_SELECTION'
  | 'CONFIRMED_AGREE'
  | 'CONFIRMED_MISMATCH'
  | 'NOT_IN_DISCOGS'
  | 'LISTING_GONE'
  | 'ERROR';

export interface DiscogsSweepRow {
  itemId: string;
  title: string;
  organizerId: string | null;
  listingId: string;
  listingStatus: string | null;
  listedRelease: Pick<DiscogsCandidate, 'releaseId' | 'artist' | 'title' | 'formatClass' | 'vetoes' | 'fieldScores'> | null;
  listedHasHardVeto: boolean;
  proposed: {
    status: string;
    releaseId: number | null;
    reason: string;
    rule: string | null;
    draftOnly: boolean;
    candidates: Array<Pick<DiscogsCandidate, 'releaseId' | 'artist' | 'title' | 'formatClass' | 'composite' | 'vetoes' | 'catno' | 'year' | 'country'>>;
  } | null;
  recordIdentity: RecordIdentityValues | null;
  classification: DiscogsSweepClassification;
  /** Soft note on an AGREE row: the listing is on the matcher's best (or a plausible lookalike)
   * pressing, but no pressing was confirmed. Not a problem row. */
  note?: 'pressing_not_confirmed';
  error?: string;
  wrote: boolean;
}

export interface DiscogsSweepReport {
  dryRun: boolean;
  offset: number;
  limit: number;
  total: number;
  nextOffset: number | null;
  summary: Record<DiscogsSweepClassification, number>;
  rows: DiscogsSweepRow[];
}

const SWEEP_MAX_LIMIT = 25;
const SWEEP_ITEM_DELAY_MS = 1000;

function slimCandidate(c: DiscogsCandidate) {
  return {
    releaseId: c.releaseId, artist: c.artist, title: c.title, formatClass: c.formatClass, composite: c.composite,
    vetoes: c.vetoes, catno: c.catno, year: c.year, country: c.country,
  };
}

/**
 * Re-match every item that has a Discogs listing (optionally scoped to one organizer), compare
 * against the release the live listing actually uses, and report. Dry-run (default) performs
 * Discogs READS only (GET listing + searches) and writes nothing anywhere. With dryRun=false it
 * writes the match fields to FindA.Sale's DB only -- never to Discogs, and never overwrites a
 * confirmed / not_in_discogs decision (only discogsListingReleaseId is refreshed for those).
 */
export async function runDiscogsRematchSweep(opts: {
  organizerId?: string | null;
  dryRun?: boolean;
  limit?: number;
  offset?: number;
  delayMs?: number;
}): Promise<DiscogsSweepReport> {
  const dryRun = opts.dryRun !== false;
  const limit = Math.min(Math.max(Math.trunc(Number(opts.limit) || 10), 1), SWEEP_MAX_LIMIT);
  const offset = Math.max(Math.trunc(Number(opts.offset) || 0), 0);
  const delayMs = opts.delayMs ?? SWEEP_ITEM_DELAY_MS;

  const where: Prisma.ItemWhereInput = {
    discogsListingId: { not: null },
    ...(opts.organizerId
      ? { OR: [{ organizerId: opts.organizerId }, { organizerId: null, sale: { organizerId: opts.organizerId } }] }
      : {}),
  };
  const total = await prisma.item.count({ where });
  const items = await prisma.item.findMany({
    where,
    orderBy: { id: 'asc' },
    skip: offset,
    take: limit,
    include: { sale: { select: { organizerId: true } } },
  });

  const summary = {
    AGREE: 0, MISMATCH: 0, NEEDS_SELECTION: 0, CONFIRMED_AGREE: 0, CONFIRMED_MISMATCH: 0,
    NOT_IN_DISCOGS: 0, LISTING_GONE: 0, ERROR: 0,
  } as Record<DiscogsSweepClassification, number>;
  const rows: DiscogsSweepRow[] = [];
  const tokenCache = new Map<string, string | null>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0 && delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    const ownerId: string | null = item.organizerId ?? (item as any).sale?.organizerId ?? null;
    const row: DiscogsSweepRow = {
      itemId: item.id, title: item.title, organizerId: ownerId, listingId: item.discogsListingId!,
      listingStatus: null, listedRelease: null, listedHasHardVeto: false, proposed: null, recordIdentity: null,
      classification: 'ERROR', wrote: false,
    };
    try {
      if (!ownerId) throw new Error('Could not resolve the item organizer');
      if (!tokenCache.has(ownerId)) {
        const account = await getActiveDiscogsAccount(ownerId);
        tokenCache.set(ownerId, account ? decryptAccessToken(account) : null);
      }
      const accessToken = tokenCache.get(ownerId);
      if (!accessToken) throw new Error('Organizer has no active Discogs connection');

      const eff = computeEffectiveIdentity(item);
      row.recordIdentity = eff.values;

      const got = await fetchDiscogsListing(accessToken, item.discogsListingId!);
      if (got.status === 404) {
        row.classification = 'LISTING_GONE';
        if (!dryRun) {
          await prisma.item.update({
            where: { id: item.id },
            data: { discogsListingId: null, discogsListedAt: null, discogsListingReleaseId: null },
          });
          row.wrote = true;
        }
        summary[row.classification]++;
        rows.push(row);
        continue;
      }
      if (!got.listing) throw new Error(got.error || `Discogs listing fetch failed (${got.status})`);
      row.listingStatus = got.listing.status ?? null;
      const listedRaw = rawFromListingRelease(got.listing.release);
      const listed = listedRaw ? { ...scoreCandidate(listedRaw, eff.values, 0, item.title), currentlyListed: true } : null;
      const listedReleaseId = listed?.releaseId ?? null;
      if (listed) {
        row.listedRelease = {
          releaseId: listed.releaseId, artist: listed.artist, title: listed.title, formatClass: listed.formatClass,
          vetoes: listed.vetoes, fieldScores: listed.fieldScores,
        };
        row.listedHasHardVeto = listed.vetoes.length > 0;
      }

      const status = item.discogsMatchStatus as DiscogsMatchStatus | null;
      if (status === 'confirmed' || status === 'not_in_discogs') {
        row.classification =
          status === 'not_in_discogs'
            ? 'NOT_IN_DISCOGS'
            : listedReleaseId === item.discogsReleaseId ? 'CONFIRMED_AGREE' : 'CONFIRMED_MISMATCH';
        row.proposed = {
          status, releaseId: item.discogsReleaseId ?? null, reason: 'organizer_decision', rule: null, draftOnly: false,
          candidates: [],
        };
        if (!dryRun && listedReleaseId !== item.discogsListingReleaseId) {
          await prisma.item.update({ where: { id: item.id }, data: { discogsListingReleaseId: listedReleaseId } });
          row.wrote = true;
        }
        summary[row.classification]++;
        rows.push(row);
        continue;
      }

      const res = await matchDiscogsRelease(
        { identity: eff.values, sources: eff.sources, upc: item.upc, ean: item.ean, fallbackTitle: item.title },
        { search: params => searchDiscogsReleases(accessToken, params) }
      );
      if (res.reason === 'search_failed') throw new Error('Discogs search failed');
      row.proposed = {
        status: res.status, releaseId: res.releaseId, reason: res.reason, rule: res.rule,
        draftOnly: res.autoSelectedPressing, candidates: res.candidates.map(slimCandidate),
      };
      // 2026-09-23 QA: 30 of 37 flagged rows were listed on exactly the release we would
      // suggest and were flagged only because the matcher's status was needs_selection. Flag only
      // real problems: the listing release differs from the best candidate, fails a hard veto,
      // or there is no candidate at all.
      const confident = res.status === 'auto_high' && !res.autoSelectedPressing;
      const best = res.releaseId ?? res.candidates[0]?.releaseId ?? null;
      if (listedReleaseId == null || res.candidates.length === 0 || row.listedHasHardVeto) {
        row.classification = res.status === 'auto_high' && listedReleaseId != null ? 'MISMATCH' : 'NEEDS_SELECTION';
      } else if (listedReleaseId === best) {
        row.classification = 'AGREE';
        if (!confident) row.note = 'pressing_not_confirmed';
      } else if (!confident && isPlausibleListedRelease(res.candidates, listedReleaseId)) {
        // Lookalike pressing the matcher could not rule out: fine, just unconfirmed.
        row.classification = 'AGREE';
        row.note = 'pressing_not_confirmed';
      } else if (res.status === 'auto_high') {
        row.classification = 'MISMATCH';
      } else {
        row.classification = 'NEEDS_SELECTION';
      }

      if (!dryRun) {
        // DB writes are unchanged in spirit: only a confident auto_high agreement is stored as
        // auto_high. A soft "pressing not confirmed" AGREE keeps the matcher's own status (the
        // organizer still confirms the pressing) but is no longer recorded as a listing mismatch.
        const agree = row.classification === 'AGREE' && res.status === 'auto_high' && res.releaseId === listedReleaseId;
        const candidates = dedupeCandidates(
          agree ? res.candidates : [...(listed ? [listed] : []), ...res.candidates]
        )
          .slice(0, MAX_STORED_CANDIDATES)
          .map(c => ({ ...c, currentlyListed: c.releaseId === listedReleaseId }));
        const envelope: DiscogsCandidatesEnvelope = {
          matcherVersion: MATCHER_VERSION,
          reason: agree ? res.reason : row.classification === 'MISMATCH' ? 'listing_release_mismatch' : res.reason,
          rule: agree ? res.rule : null,
          candidates,
          listingSyncedFor: item.discogsListingId,
        };
        await prisma.item.update({
          where: { id: item.id },
          data: {
            recordIdentity: eff.identity as unknown as Prisma.InputJsonValue,
            discogsReleaseId: agree ? res.releaseId : null,
            discogsMatchStatus: agree ? 'auto_high' : 'needs_selection',
            discogsCandidates: envelope as unknown as Prisma.InputJsonValue,
            discogsMatchedAt: new Date(),
            discogsMatchInputHash: eff.hash,
            discogsListingReleaseId: listedReleaseId,
          },
        });
        row.wrote = true;
      }
    } catch (err: any) {
      row.classification = 'ERROR';
      row.error = String(err?.message || err).slice(0, 300);
    }
    summary[row.classification]++;
    rows.push(row);
  }

  return {
    dryRun, offset, limit, total,
    nextOffset: offset + items.length < total ? offset + items.length : null,
    summary, rows,
  };
}
