/**
 * reverbConnector.ts — Reverb Marketplace connector (Universal Crosslister, Official-API
 * Tier). This is the first platform built on the generalized `MarketplaceAccount` table
 * (see claude_docs/architecture/ADR-DRAFT-universal-crosslister-buildout-2026-08-12.md,
 * "ADDENDUM 2026-08-18" section) — distinct from `MarketplaceListingJob` /
 * `MarketplacePosterAccount`, which is the CONTENT-SCRIPT tier (Facebook/Craigslist/
 * Gumtree AU Playwright posting). This file owns the real official-API OAuth tier, same
 * shape family as `EbayConnection` / `SocialAccount`.
 *
 * Security note: unlike `EbayConnection` (plaintext tokens, a known gap called out in its
 * own schema comment), `MarketplaceAccount.accessToken`/`refreshToken` ARE run through
 * tokenCrypto.ts's `encryptToken`/`decryptToken` envelope (enc:v1:<iv>:<tag>:<ciphertext>),
 * matching the `SocialAccount`/ADR-077a precedent. This file is the sole reader/writer of
 * those two columns for the REVERB platform — mirrors tokenStore.ts's chokepoint pattern.
 *
 * ============================================================================
 * UNTESTED — read this before trusting anything below at face value.
 * ============================================================================
 * No live Reverb OAuth Client ID/Secret exists yet (an account was created and
 * integrations@reverb.com was emailed asking about partner/self-serve access; no reply as
 * of 2026-08-18). Every network call in this file is written against Reverb's own published
 * docs at reverb-api.com/docs, fetched LIVE on 2026-08-18 (not from memory or a third-party
 * summary), but NONE of it has ever actually been executed against api.reverb.com or
 * sandbox.reverb.com. Treat every exported function here as CODE-ONLY (see CLAUDE.md §9)
 * until a real organizer connects and a real listing is created/verified end-to-end.
 *
 * Specific open items, called out inline below where relevant:
 *   1. The exact OAuth2 authorize/token endpoint URLs (reverb.com/oauth/authorize,
 *      reverb.com/oauth/token) and scope names could not be re-verified by a fresh fetch
 *      this session — the specific doc page describing Reverb's multi-user OAuth2 flow
 *      ("Apps for multiple users (OAuth2 Access Code Flow)") was already cached from an
 *      earlier research pass this session and the cache could not be bypassed to re-read
 *      it. The URLs used here match the standard Rails "Doorkeeper" OAuth provider gem
 *      convention (reverb.com being a Rails app) and the endpoint named explicitly in this
 *      feature's own build spec — confirm both against reverb.com/my/api_settings the
 *      moment a real OAuth app is created there.
 *   2. Reverb's own current docs self-contradict on the listing category field name
 *      (`categories:[{uuid}]` in the create-listings curl example vs `category_uuids` in
 *      that same page's prose) — confirmed still contradictory via a live fetch 2026-08-18.
 *      See the `categories`/`category_uuids` handling in `createReverbListing` below.
 *   3. The documented 412 structured-error response shape (`{ message, errors: { field:
 *      [...] } }`) is handled in both `createReverbListing` and `endOrDeleteReverbListing`,
 *      per this feature's build spec — not independently re-verified by a fresh fetch of
 *      Reverb's Error Handling doc this session (also cache-blocked).
 */

import { prisma } from '../../lib/prisma';
import { encryptToken, decryptToken } from '../../utils/tokenCrypto';
import type { Item, MarketplaceAccount } from '@prisma/client';

// ── Endpoints ────────────────────────────────────────────────────────────────
// See "UNTESTED" header note #1 — authorize/token URLs follow the standard Rails
// Doorkeeper convention and this feature's build spec; not independently re-verified
// this session due to a tool-cache limitation, not a doc-reading shortcut.
const REVERB_OAUTH_AUTHORIZE_URL = 'https://reverb.com/oauth/authorize';
const REVERB_OAUTH_TOKEN_URL = 'https://reverb.com/oauth/token';
// sandbox.reverb.com/api for testing (full-parity sandbox, confirmed live via
// reverb-api.com/docs/testing-on-sandbox in the research pass that produced the ADR
// addendum). Override via env for sandbox testing without a code change.
const REVERB_API_BASE = process.env.REVERB_API_BASE || 'https://api.reverb.com/api';
const REVERB_ACCEPT_VERSION = '3.0';

function reverbHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/hal+json',
    Accept: 'application/hal+json',
    'Accept-Version': REVERB_ACCEPT_VERSION,
    Authorization: `Bearer ${accessToken}`,
  };
}

export class ReverbApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[]>;
  constructor(status: number, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'ReverbApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** Parse Reverb's documented error shape ({ message, errors: {field:[...]} }); falls back to a generic message for non-JSON bodies. */
function parseReverbError(status: number, rawBody: string): { message: string; fieldErrors?: Record<string, string[]> } {
  let message = `Reverb API error: ${status}`;
  let fieldErrors: Record<string, string[]> | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed?.message) message = parsed.message;
    if (parsed?.errors) fieldErrors = parsed.errors;
  } catch {
    // Non-JSON error body — keep the generic message; rawBody is still logged by the caller.
  }
  return { message, fieldErrors };
}

// ============================================================================
// OAuth2 Authorization Code flow
// ============================================================================

/** Build the Reverb OAuth2 authorize URL. `state` must already be HMAC-signed by the caller (see reverbMarketplaceController.ts, mirrors ebayController's connectEbayAccount pattern). */
export function buildReverbAuthorizeUrl(state: string): string {
  const clientId = process.env.REVERB_CLIENT_ID;
  const redirectUri = process.env.REVERB_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error('[Reverb] REVERB_CLIENT_ID / REVERB_OAUTH_REDIRECT_URI not configured');
  }
  const url = new URL(REVERB_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  // Scope names UNVERIFIED — Reverb's multi-user OAuth doc (which would name the exact
  // scope strings) is cache-blocked this session (see file header note #1). These are a
  // best-effort guess at the minimum needed for listing read/write; confirm against
  // reverb.com/my/api_settings when the OAuth app is created and correct if wrong.
  url.searchParams.set('scope', 'public read_listings write_listings');
  url.searchParams.set('state', state);
  return url.toString();
}

/** Exchange an authorization code for tokens. Returns plaintext tokens — caller (connectReverbAccount) encrypts before persisting. */
export async function exchangeReverbCodeForTokens(
  code: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresInSeconds: number | null }> {
  const clientId = process.env.REVERB_CLIENT_ID;
  const clientSecret = process.env.REVERB_CLIENT_SECRET;
  const redirectUri = process.env.REVERB_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('[Reverb] OAuth not configured (missing REVERB_CLIENT_ID/REVERB_CLIENT_SECRET/REVERB_OAUTH_REDIRECT_URI)');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const resp = await fetch(REVERB_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const text = await resp.text();
  if (!resp.ok) {
    const { message } = parseReverbError(resp.status, text);
    console.error(`[Reverb] Token exchange failed: ${resp.status} ${text}`);
    throw new ReverbApiError(resp.status, message || 'Reverb token exchange failed');
  }
  const data = JSON.parse(text) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    // Reverb's OAuth2 Access Code response does not document a token lifetime for
    // access_token (per this feature's build spec) — null unless the live response
    // actually includes expires_in, in which case we use it.
    expiresInSeconds: typeof data.expires_in === 'number' ? data.expires_in : null,
  };
}

/** Complete the OAuth flow for an organizer: exchange the code, resolve shop identity, and upsert MarketplaceAccount (tokens encrypted at rest). */
export async function connectReverbAccount(organizerId: string, code: string): Promise<MarketplaceAccount> {
  const { accessToken, refreshToken, expiresInSeconds } = await exchangeReverbCodeForTokens(code);
  const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;

  let externalUserId: string | null = null;
  try {
    const shopResp = await fetch(`${REVERB_API_BASE}/shop`, { headers: reverbHeaders(accessToken) });
    if (shopResp.ok) {
      const shop = (await shopResp.json()) as any;
      externalUserId = shop?.id != null ? String(shop.id) : shop?.name ?? null;
    }
  } catch (e) {
    console.warn('[Reverb] Could not resolve shop identity after OAuth', e);
  }

  return prisma.marketplaceAccount.upsert({
    where: { organizerId_platform: { organizerId, platform: 'REVERB' } },
    create: {
      organizerId,
      platform: 'REVERB',
      status: 'ACTIVE',
      accessToken: encryptToken(accessToken),
      refreshToken: refreshToken ? encryptToken(refreshToken) : null,
      tokenExpiresAt,
      externalUserId,
      connectedAt: new Date(),
      lastRefreshedAt: new Date(),
    },
    update: {
      status: 'ACTIVE',
      accessToken: encryptToken(accessToken),
      refreshToken: refreshToken ? encryptToken(refreshToken) : null,
      tokenExpiresAt,
      externalUserId,
      lastRefreshedAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
}

/** Delete the organizer's Reverb connection (does not attempt to revoke the token on Reverb's side — no documented revoke endpoint was found in the pages fetched this session). */
export async function disconnectReverbAccount(organizerId: string): Promise<void> {
  await prisma.marketplaceAccount.deleteMany({ where: { organizerId, platform: 'REVERB' } });
}

export async function checkReverbConnection(organizerId: string): Promise<{
  connected: boolean;
  status?: string;
  externalUserId?: string | null;
  connectedAt?: Date;
  lastRefreshedAt?: Date;
  error?: string | null;
}> {
  const account = await prisma.marketplaceAccount.findUnique({
    where: { organizerId_platform: { organizerId, platform: 'REVERB' } },
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

async function getActiveReverbAccount(organizerId: string): Promise<MarketplaceAccount | null> {
  return prisma.marketplaceAccount.findFirst({
    where: { organizerId, platform: 'REVERB', status: 'ACTIVE' },
  });
}

function decryptAccessToken(account: MarketplaceAccount): string {
  return decryptToken(account.accessToken);
}

// ============================================================================
// Condition mapping
// ============================================================================

// Fallback table — fetched LIVE from the "Condition" section of
// https://www.reverb-api.com/docs/create-listings on 2026-08-18 (GET /api/listing_conditions
// example response table in that doc). Real per-seller accounts may have a different subset
// enabled (B-Stock / "Mint (with inventory)" require per-seller enablement per that same
// doc) — resolveReverbConditionUuid() always prefers a live GET /api/listing_conditions call
// first and only falls back to this table if that call fails.
const REVERB_CONDITION_UUID_FALLBACK: Record<string, string> = {
  'Non functioning': 'fbf35668-96a0-4baa-bcde-ab18d6b1b329',
  Poor: '6a9dfcad-600b-46c8-9e08-ce6e5057921e',
  Fair: '98777886-76d0-44c8-865e-bb40e669e934',
  Good: 'f7a3f48c-972a-44c6-b01a-0cd27488d3f6',
  'Very Good': 'ae4d9114-1bd7-4ec5-a4ba-6653af5ac84d',
  Excellent: 'df268ad1-c462-4ba6-b6db-e007e23922ea',
  Mint: 'ac5b9c1e-dc78-466d-b0b3-7cf712967a48',
  'Mint (with inventory)': '6db7df88-293b-4017-a1c1-cdb5e599fa1a',
  'B-Stock': '9225283f-60c2-4413-ad18-1f5eba7a856f',
  'Brand New': '7c3f45de-2ae0-4c81-8400-fdb6b1d74890',
};

// FindA.Sale Item.condition ('NEW'|'USED'|'REFURBISHED'|'PARTS_OR_REPAIR'|null) -> Reverb
// condition NAME (resolved to a UUID at call time, never hardcoded past this map). These are
// product-decision defaults picked for closest semantic fit, NOT verified against real
// Reverb seller/buyer expectations — revisit once a real listing has been created and
// reviewed. USED and REFURBISHED collapse to different Reverb buckets deliberately (a
// refurbished item is presented as better-than-plain-used), but there is no exact 1:1
// mapping in either direction.
const ITEM_CONDITION_TO_REVERB_NAME: Record<string, string> = {
  NEW: 'Brand New',
  USED: 'Good',
  REFURBISHED: 'Excellent',
  PARTS_OR_REPAIR: 'Non functioning',
};
const DEFAULT_REVERB_CONDITION_NAME = 'Good';

async function resolveReverbConditionUuid(accessToken: string, itemCondition: string | null): Promise<string> {
  const targetName = (itemCondition && ITEM_CONDITION_TO_REVERB_NAME[itemCondition]) || DEFAULT_REVERB_CONDITION_NAME;
  try {
    const resp = await fetch(`${REVERB_API_BASE}/listing_conditions`, { headers: reverbHeaders(accessToken) });
    if (resp.ok) {
      const data = (await resp.json()) as any;
      const list: Array<{ uuid: string; display_name?: string; name?: string }> =
        data?.listing_conditions || data?._embedded?.listing_conditions || [];
      const match = list.find(c => (c.display_name || c.name || '').toLowerCase() === targetName.toLowerCase());
      if (match?.uuid) return match.uuid;
    }
  } catch (e) {
    console.warn('[Reverb] listing_conditions live fetch failed, using fallback table', e);
  }
  return REVERB_CONDITION_UUID_FALLBACK[targetName] || REVERB_CONDITION_UUID_FALLBACK['Good'];
}

// ============================================================================
// Listing create / end-or-delete
// ============================================================================

export interface ReverbListingOptions {
  /** Default false — create as a draft. Reverb requires make+model to save a draft and will
   * attempt to guess them from the title if omitted; if the guesser fails it sets them to
   * "Unknown" and the listing cannot be published until the organizer fixes that on Reverb's
   * own site. Defaulting to draft (not auto-publish) means that gap is caught before the
   * listing goes live, not after. */
  publish?: boolean;
  /** Optional Reverb category UUID (from GET /api/categories/flat). No FindA.Sale -> Reverb
   * category taxonomy crosswalk exists yet — omit to skip category assignment entirely
   * (category is not in Reverb's required-field list). */
  reverbCategoryUuid?: string;
}

/**
 * Create a Reverb listing for a FindA.Sale item. Looks up the organizer's active REVERB
 * MarketplaceAccount, decrypts the access token, and POSTs to /api/listings.
 */
export async function createReverbListing(
  organizerId: string,
  item: Item,
  options: ReverbListingOptions = {}
): Promise<any> {
  const account = await getActiveReverbAccount(organizerId);
  if (!account) {
    throw new Error('[Reverb] No active Reverb connection for this organizer');
  }
  // Defense-in-depth ownership check — the caller (reverbMarketplaceController.ts) must
  // already resolve `item` through an organizer-scoped query before calling this function,
  // but this re-check guards against any future caller that skips that step (OWNERSHIP /
  // TENANT-ISOLATION invariant, CLAUDE.md §9 Security-QA Gate).
  if (item.organizerId && item.organizerId !== organizerId) {
    throw new Error('[Reverb] Item does not belong to this organizer');
  }

  const accessToken = decryptAccessToken(account);
  const conditionUuid = await resolveReverbConditionUuid(accessToken, item.condition ?? null);

  const body: Record<string, any> = {
    title: item.title,
    description: item.description || item.title,
    condition: { uuid: conditionUuid },
    price: {
      amount: (item.price ?? 0).toFixed(2),
      currency: item.currency || 'USD',
    },
    // Cloudinary URLs are stable/non-expiring public URLs — a direct fit for Reverb's
    // URL-reference-only photos field (no multipart upload path exists on Reverb).
    photos: item.photoUrls && item.photoUrls.length > 0 ? item.photoUrls : undefined,
    sku: item.sku || undefined,
    // FindA.Sale estate-sale items are 1-of-1 pieces, not restocked SKUs — has_inventory
    // false means the `inventory` field is ignored entirely (per Reverb's own Inventory
    // section: "If you are selling a unique item, you can set has_inventory=false and the
    // inventory field will be ignored").
    has_inventory: false,
    publish: options.publish === true ? 'true' : 'false',
  };

  // Reverb's own docs self-contradict on the category field name (`categories:[{uuid}]` in
  // the create-listings curl example vs `category_uuids` in that same page's "Categories"
  // section prose) — re-confirmed still contradictory via a live fetch 2026-08-18. No
  // FindA.Sale -> Reverb category taxonomy crosswalk exists yet, so this only fires when a
  // caller explicitly supplies a UUID. Sending BOTH spellings is a deliberate hedge against
  // the documented ambiguity, not a guess dressed up as certainty — Rails APIs following
  // strong-params conventions (which Reverb's Rails-shaped doc style strongly suggests)
  // silently ignore unrecognized params rather than reject the request, so this is safe.
  // TODO: once a real listing can be created against sandbox.reverb.com, verify which field
  // name Reverb actually reads and drop the other.
  if (options.reverbCategoryUuid) {
    body.categories = [{ uuid: options.reverbCategoryUuid }];
    body.category_uuids = [options.reverbCategoryUuid];
  }

  const resp = await fetch(`${REVERB_API_BASE}/listings`, {
    method: 'POST',
    headers: reverbHeaders(accessToken),
    body: JSON.stringify(body),
  });
  const text = await resp.text();

  if (!resp.ok) {
    // Documented 412 structured-error shape: { message, errors: { field: [...] } }
    const { message, fieldErrors } = parseReverbError(resp.status, text);
    console.error(`[Reverb] Create listing failed for organizer ${organizerId}: ${resp.status} ${text}`);
    await prisma.marketplaceAccount
      .update({
        where: { id: account.id },
        data: { lastErrorAt: new Date(), lastErrorMessage: message.slice(0, 500) },
      })
      .catch(() => {
        /* non-fatal — don't let error-logging itself break the caller's error handling */
      });
    throw new ReverbApiError(resp.status, message, fieldErrors);
  }

  return JSON.parse(text);
}

/**
 * End or delete a Reverb listing, depending on whether it's still a draft or already
 * published. Tries a hard DELETE first (only works for drafts — Reverb: "Listings that have
 * already been published can't be deleted", confirmed live 2026-08-18 via
 * reverb-api.com/docs/deleting-a-draft-listing-1). If that's rejected, falls back to zeroing
 * inventory, which Reverb's own docs state ends the listing regardless of has_inventory
 * ("If you specify inventory=0 for any item, regardless of whether it supports inventory,
 * this will end the listing" — Create Listings doc, Inventory section) — this is the exact
 * path named in this feature's build spec. An alternative documented endpoint, PUT
 * /api/my/listings/{id}/state/end with body { reason: "not_sold" }, does the same thing more
 * semantically explicitly; not used here to keep to the single spec'd path, but worth
 * revisiting once a real listing exists to test end-to-end.
 */
export async function endOrDeleteReverbListing(
  organizerId: string,
  reverbListingId: string
): Promise<{ action: 'deleted' | 'ended' }> {
  const account = await getActiveReverbAccount(organizerId);
  if (!account) {
    throw new Error('[Reverb] No active Reverb connection for this organizer');
  }
  const accessToken = decryptAccessToken(account);

  const delResp = await fetch(`${REVERB_API_BASE}/listings/${encodeURIComponent(reverbListingId)}`, {
    method: 'DELETE',
    headers: reverbHeaders(accessToken),
  });
  if (delResp.ok) {
    return { action: 'deleted' };
  }

  const zeroResp = await fetch(`${REVERB_API_BASE}/listings/${encodeURIComponent(reverbListingId)}`, {
    method: 'PUT',
    headers: reverbHeaders(accessToken),
    body: JSON.stringify({ inventory: 0, has_inventory: true }),
  });
  const zeroText = await zeroResp.text();
  if (!zeroResp.ok) {
    const { message, fieldErrors } = parseReverbError(zeroResp.status, zeroText);
    console.error(`[Reverb] End listing failed for organizer ${organizerId}, listing ${reverbListingId}: ${zeroResp.status} ${zeroText}`);
    throw new ReverbApiError(zeroResp.status, message, fieldErrors);
  }
  return { action: 'ended' };
}
