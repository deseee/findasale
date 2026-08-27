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
 *      organizer's own photos.
 *   2. Listing creation requires an existing Discogs catalog `release_id` — there
 *      is no API path to submit a new release. An obscure/uncatalogued record
 *      cannot be auto-listed. findDiscogsReleaseId() below is the required
 *      pre-check; callers must treat a null result as "not eligible," not an error.
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
import type { Item, MarketplaceAccount } from '@prisma/client';

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
}

/**
 * Create a Discogs marketplace listing for a FindA.Sale item. Looks up the
 * organizer's active DISCOGS MarketplaceAccount, resolves a catalog release_id
 * (throws DiscogsNotEligibleError if none found), and POSTs to /marketplace/listings.
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
  const match = await findDiscogsReleaseId(accessToken, item);
  if (match == null) {
    throw new DiscogsNotEligibleError();
  }

  const body: Record<string, any> = {
    release_id: match.releaseId,
    condition: resolveDiscogsCondition(item.condition ?? null),
    price: item.price ?? 0, // Discogs takes a plain decimal in the seller's currency, not cents
    status: options.publish === true ? 'For Sale' : 'Draft',
    comments: item.description || undefined,
    external_id: item.id,
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
 * Eligibility pre-check for the frontend: is this item in Discogs's catalog at
 * all? Requires an active Discogs connection (reuses the organizer's own
 * authenticated rate-limit budget rather than the unauthenticated tier).
 */
export async function checkDiscogsEligibility(
  organizerId: string,
  item: Item
): Promise<{ eligible: boolean; releaseId: number | null; matchConfidence: 'high' | 'fuzzy' | null; matchedTitle: string | null }> {
  const account = await getActiveDiscogsAccount(organizerId);
  if (!account) {
    throw new Error('[Discogs] No active Discogs connection for this organizer');
  }
  const accessToken = decryptAccessToken(account);
  const match = await findDiscogsReleaseId(accessToken, item);
  return {
    eligible: match != null,
    releaseId: match?.releaseId ?? null,
    matchConfidence: match?.matchConfidence ?? null,
    matchedTitle: match?.matchedTitle ?? null,
  };
}
