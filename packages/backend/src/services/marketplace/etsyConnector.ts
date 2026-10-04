/**
 * etsyConnector.ts -- the Etsy listing lifecycle (ADR-135 D2, D6.1, acceptance B3 items 1 to 8,
 * batch E-B3): request a draft, run the draft worker, publish, end, withdraw when sold elsewhere,
 * and push price and quantity changes.
 *
 * Draft first. Nothing goes live on Etsy without (1) the organizer's attestation saved on the
 * draft request and (2) a separate, explicit publish confirmation. Etsy charges a $0.20 listing
 * fee when a draft goes live [ADR-135 D2, Etsy help article How Does Etsy Charge for Listing].
 *
 * Every Etsy call goes through etsyAuthedRequest -> etsyRequest (etsyHttp.ts, the one door), so
 * the kill switch, the QPS gate and the shared Postgres budget all apply. The ONLY place a photo
 * URL is fetched is etsyImageFetch.ts. The client never supplies an Etsy listing id, shop id,
 * organizer id or price: everything is read from the signed-in organizer's own rows.
 *
 * Switches: ETSY_CONNECTOR_ENABLED off blocks everything (withdraw answers 'skipped'). ETSY_PUSH_ENABLED
 * off blocks draft and publish only. Withdraw, end and the inventory push never check it.
 *
 * Etsy paths used (ADR-135 D2.1 and the OpenAPI spec 3.0.0 operations it names):
 *   POST   /v3/application/shops/{shop_id}/listings                       createDraftListing (form)
 *   POST   /v3/application/shops/{shop_id}/listings/{listing_id}/images   uploadListingImage (multipart)
 *   PATCH  /v3/application/shops/{shop_id}/listings/{listing_id}          updateListing, state=active
 *   DELETE /v3/application/listings/{listing_id}                          deleteListing
 *   GET    /v3/application/listings/{listing_id}/images                   getListingImages
 *   GET    /v3/application/listings/{listing_id}/inventory                getListingInventory
 *   PUT    /v3/application/listings/{listing_id}/inventory                updateListingInventory (JSON)
 * UNVERIFIED (live tests, ADR-135 section 12): the getListingImages and inventory paths and response
 * shapes were not fetched while building (T5, T7); the createDraftListing response is read for
 * `listing_id` only; image count and alt text limits (T5); the exact inventory PUT body (T7); what a
 * publish needs for a Personal Access app (T6); delete semantics for a listing with an open order (T8).
 *
 * Import safety: no env reads, network or database access at module load. The database, env, clock,
 * Etsy request function, image fetcher and taxonomy lookups are injectable through the deps argument.
 */

import { etsyAuthedRequest, findMissingEtsyScopes, fetchEtsyShopSetupOptions, isOrganizerAllowedForEtsy } from './etsyAuth';
import type { EtsyAuthDeps } from './etsyAuth';
import { isEtsyConnectorEnabled, isEtsyPushEnabled, summarizeEtsyError } from './etsyHttp';
import type { EtsyRequestOptions, EtsyResponse } from './etsyHttp';
import { EtsyError, captureEtsyEvent, scrubEtsySecrets } from './etsyBudget';
import type { EtsyEnv, EtsyPriority } from './etsyBudget';
import { buildEtsyDraftPayload, computeEtsyQuantity, ETSY_PAYLOAD_PROBLEM_MESSAGES } from './etsyMapping';
import type { EtsyPayloadProblem } from './etsyMapping';
import { checkEtsyEligibility } from './etsyEligibility';
import {
  EtsyImageFetchError,
  fetchEtsyImage,
  isTransientEtsyImageError,
  readEtsyImageHostAllowlist,
  validateEtsyImageUrl,
} from './etsyImageFetch';
import type { FetchedEtsyImage } from './etsyImageFetch';
import { ensureEtsyTaxonomyLoaded, ETSY_TAXONOMY_MAX_NODE_ID, getEtsyTaxonomyNode } from './etsyTaxonomy';
import type { EtsyTaxonomyDeps } from './etsyTaxonomy';
import { ETSY_WHO_MADE_DEFAULT } from '../../config/etsyWhenMade';

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** Photos sent per draft. The spec says `image_ids` "can include up to 20 images". UNVERIFIED (T5): hard limit. */
export const ETSY_MAX_IMAGES = 20;
/** A DRAFT_PENDING row untouched for this long is treated as abandoned and may be resumed. */
export const ETSY_DRAFT_IDLE_MS = 3 * 60 * 1000;
/** A PUBLISHING row untouched for this long may be published again (the activation call is idempotent in effect, UNVERIFIED T6). */
export const ETSY_PUBLISHING_STALE_MS = 2 * 60 * 1000;
/** Listings expire after 4 months [Etsy help: How Does Etsy Charge for Listing and Renewing Items]. */
export const ETSY_LISTING_TERM_MONTHS = 4;
/** Item.status values that mean the item can no longer be listed. */
export const ETSY_UNAVAILABLE_ITEM_STATUSES: readonly string[] = ['SOLD', 'DONATED', 'AUCTION_ENDED', 'INVOICE_ISSUED'];
/** EtsyListing states from which withdrawEtsyListingIfExists will call deleteListing. */
export const ETSY_WITHDRAWABLE_STATES: readonly string[] = ['ACTIVE', 'DRAFT_READY', 'DRAFT_PENDING', 'PUBLISHING', 'FAILED'];
const ETSY_TERMINAL_STATES: readonly string[] = ['ENDED', 'SOLD', 'ORPHANED'];

export type EtsyListingState =
  | 'PREPARING'
  | 'DRAFT_PENDING'
  | 'DRAFT_READY'
  | 'PUBLISHING'
  | 'ACTIVE'
  | 'ENDED'
  | 'SOLD'
  | 'FAILED'
  | 'ORPHANED';
export type EtsyFailedStep = 'CREATE' | 'IMAGES' | 'PUBLISH' | 'UPDATE' | 'DELETE';

/** Organizer-facing text. No "AI", no "estate sale", no em dashes (copy-lint test enforces it). */
export const ETSY_LISTING_MESSAGES = {
  disabled: 'Etsy is not available right now.',
  pushDisabled: 'Listing on Etsy is paused right now. Try again later.',
  attestationRequired: 'Confirm the details are accurate before creating an Etsy draft.',
  confirmRequired: 'Confirm that you want to publish this listing on Etsy. Etsy charges a $0.20 listing fee when it goes live.',
  badRequest: 'Some of the details sent were not valid. Check them and try again.',
  itemNotFound: 'Item not found',
  itemUnavailable: 'This item is no longer available, so it cannot be listed on Etsy.',
  setupIncomplete: 'Choose a shipping profile and a processing profile in your Etsy settings before creating a draft.',
  setupInvalid: 'Choose a shipping profile and a processing profile from your Etsy shop.',
  noPhotos: "None of this item's photos could be sent to Etsy.",
  taxonomyInvalid: 'Choose an Etsy category from the list.',
  taxonomyNotLeaf: 'Choose a more specific Etsy category.',
  taxonomyUnavailable: 'Etsy categories are not available right now. Try again in a moment.',
  draftExists: 'An Etsy draft already exists for this item. Publish it or discard it first.',
  listingBusy: 'Etsy is already working on this listing. Try again in a moment.',
  alreadyListed: 'This item is already live on Etsy.',
  orphaned: 'This item has a listing from an earlier Etsy connection. Remove it on Etsy before creating a new one.',
  draftPending: 'Your Etsy draft is still being created.',
  notDraftReady: 'The Etsy draft is not ready to publish yet.',
  notAttested: 'Confirm the details are accurate before publishing.',
  listingNotFound: 'No Etsy listing was found for this item.',
  publishBlockedPrefix: 'Etsy could not publish this listing: ',
  publishBlocked: 'Etsy could not publish this listing. Check your shop settings and try again.',
  draftGone: 'This draft no longer exists on Etsy. Create a new draft.',
  endFailed: 'Etsy could not end this listing right now. Try again in a moment.',
  etsyTrouble: 'Etsy is having trouble right now. Try again in a moment.',
  photoHostTrouble: 'A photo could not be downloaded right now. Try again in a moment.',
  busy: 'Etsy is busy. Try again in a moment.',
  needsReauth: 'Etsy needs you to reconnect your shop.',
  notConnected: 'Connect your Etsy shop first.',
  generic: 'Etsy could not complete this step. Try again, or contact support.',
} as const;

export function etsyCurrencyUnsupportedMessage(code: string): string {
  return `Your Etsy shop uses ${code}. Etsy listings from FindA.Sale currently need a USD shop.`;
}

/** Chip text per state (ADR-135 D8). */
export const ETSY_LISTING_STATUS_LABELS: Readonly<Record<string, string>> = {
  PREPARING: 'Preparing',
  DRAFT_PENDING: 'Creating draft',
  DRAFT_READY: 'Draft ready (needs your confirmation)',
  PUBLISHING: 'Publishing',
  ACTIVE: 'Live on Etsy',
  ENDED: 'Ended',
  SOLD: 'Sold on Etsy',
  FAILED: 'Needs attention',
  ORPHANED: 'Disconnected from Etsy',
};

/** Fallback sentence for a FAILED row that has no stored message. */
export const ETSY_FAILED_STEP_MESSAGES: Readonly<Record<string, string>> = {
  CREATE: 'Etsy could not create the draft. Try again.',
  IMAGES: 'Etsy could not take the photos. Try again.',
  PUBLISH: 'Etsy could not publish the listing. Try again.',
  UPDATE: 'Etsy could not update the listing. Try again.',
  DELETE: 'Etsy could not end the listing. Try again.',
};

// ---------------------------------------------------------------------------------------------
// Errors, deps, small helpers
// ---------------------------------------------------------------------------------------------

export type EtsyListingErrorCode =
  | 'ETSY_PUSH_DISABLED'
  | 'ETSY_ATTESTATION_REQUIRED'
  | 'ETSY_CONFIRM_REQUIRED'
  | 'ETSY_BAD_REQUEST'
  | 'ETSY_ITEM_NOT_FOUND'
  | 'ETSY_ITEM_UNAVAILABLE'
  | 'ETSY_NOT_ELIGIBLE'
  | 'ETSY_PAYLOAD_INVALID'
  | 'ETSY_SETUP_INCOMPLETE'
  | 'ETSY_SETUP_INVALID'
  | 'ETSY_CURRENCY_UNSUPPORTED'
  | 'ETSY_TAXONOMY_INVALID'
  | 'ETSY_TAXONOMY_UNAVAILABLE'
  | 'ETSY_DRAFT_EXISTS'
  | 'ETSY_LISTING_BUSY'
  | 'ETSY_ALREADY_LISTED'
  | 'ETSY_LISTING_ORPHANED'
  | 'ETSY_NOT_DRAFT_READY'
  | 'ETSY_NOT_ATTESTED'
  | 'ETSY_LISTING_NOT_FOUND'
  | 'ETSY_PUBLISH_BLOCKED'
  | 'ETSY_END_FAILED';

/** A listing-lifecycle failure with a fixed organizer-facing message and the HTTP status to answer with. */
export class EtsyListingError extends Error {
  code: EtsyListingErrorCode;
  httpStatus: number;
  details?: Record<string, unknown>;
  constructor(code: EtsyListingErrorCode, httpStatus: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EtsyListingError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

type EtsyDb = any;
export type EtsyListingRow = Record<string, any>;

export interface EtsyConnectorDeps extends EtsyAuthDeps {
  /** Authenticated Etsy call for an organizer. Defaults to etsyAuthedRequest (token, refresh, one retry on 401). */
  authedRequest?: (organizerId: string, opts: Omit<EtsyRequestOptions, 'accessToken' | 'organizerId'>) => Promise<EtsyResponse>;
  /** Photo download. Defaults to the SSRF-guarded fetchEtsyImage. */
  fetchImage?: (url: string) => Promise<FetchedEtsyImage>;
  /** Injection for the year age is measured against (tests). Omit in production. */
  asOfYear?: number;
}

function getDb(deps: EtsyConnectorDeps): EtsyDb {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return deps.db ?? require('../../lib/prisma').prisma;
}
const getEnv = (deps: EtsyConnectorDeps): EtsyEnv => deps.env ?? process.env;
const getNow = (deps: EtsyConnectorDeps): Date => (deps.now ?? (() => new Date()))();

function authedFn(deps: EtsyConnectorDeps) {
  return deps.authedRequest ?? ((organizerId: string, opts: Omit<EtsyRequestOptions, 'accessToken' | 'organizerId'>) => etsyAuthedRequest(organizerId, opts, deps));
}

function taxonomyDeps(deps: EtsyConnectorDeps): EtsyTaxonomyDeps {
  return { db: getDb(deps), env: getEnv(deps), now: deps.now, request: deps.request, http: deps.http };
}

const isNumericId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v);

function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Organizer-facing sentence for a thrown value (never echoes internal or Etsy text). */
export function describeEtsyThrown(err: unknown): string {
  if (err instanceof EtsyListingError) return err.message;
  if (err instanceof EtsyError) {
    switch (err.code) {
      case 'ETSY_DISABLED':
      case 'ETSY_NOT_CONFIGURED':
        return ETSY_LISTING_MESSAGES.disabled;
      case 'ETSY_BUDGET':
      case 'ETSY_BLOCKED':
      case 'ETSY_BUSY':
      case 'ETSY_REFRESH_BUSY':
        return ETSY_LISTING_MESSAGES.busy;
      case 'ETSY_NEEDS_REAUTH':
        return ETSY_LISTING_MESSAGES.needsReauth;
      case 'ETSY_NOT_CONNECTED':
        return ETSY_LISTING_MESSAGES.notConnected;
      default:
        return ETSY_LISTING_MESSAGES.generic;
    }
  }
  return ETSY_LISTING_MESSAGES.generic;
}

function sentence(text: string): string {
  const t = text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * Organizer-facing sentence for a non-OK Etsy response, and a Sentry capture for the unexpected
 * ones (a 400 that mentions when_made is flagged as possible enum drift, ADR-135 D7.3). Only a
 * publish rejection passes Etsy's own (scrubbed, shortened) wording through; everything else is fixed text.
 */
export function describeEtsyResponse(
  step: EtsyFailedStep,
  res: EtsyResponse,
  ctx: { env?: EtsyEnv; organizerId?: string; itemId?: string } = {}
): string {
  const env = ctx.env ?? process.env;
  const summary = summarizeEtsyError(res, env);
  const whenMadeDrift = res.status === 400 && /when_made/i.test(`${summary.message} ${res.rawText ?? ''}`);
  captureEtsyEvent(
    whenMadeDrift ? 'error' : 'warning',
    whenMadeDrift ? 'Etsy rejected when_made (the era list may have changed)' : 'Etsy returned an unexpected listing response',
    {
      area: 'listing',
      step: whenMadeDrift ? 'when-made-drift' : step.toLowerCase(),
      extra: { status: res.status, etsyError: summary.code, organizerId: ctx.organizerId, itemId: ctx.itemId },
    },
    env
  );
  if (res.status >= 500) return ETSY_LISTING_MESSAGES.etsyTrouble;
  if (step === 'PUBLISH' && res.status >= 400 && res.status < 500) {
    return summary.message && !/^Etsy returned HTTP/.test(summary.message)
      ? `${ETSY_LISTING_MESSAGES.publishBlockedPrefix}${sentence(summary.message)}`.slice(0, 300)
      : ETSY_LISTING_MESSAGES.publishBlocked;
  }
  return ETSY_LISTING_MESSAGES.generic;
}

// ---------------------------------------------------------------------------------------------
// Loading rows (always scoped by organizer)
// ---------------------------------------------------------------------------------------------

/** The item, only when it belongs to this organizer (directly or through its sale) and is not deleted. */
export async function loadOwnedEtsyItem(organizerId: string, itemId: string, deps: EtsyConnectorDeps = {}): Promise<any | null> {
  if (typeof itemId !== 'string' || !itemId || itemId.length > 100) return null;
  return (
    (await getDb(deps).item.findFirst({
      where: { id: itemId, deletedAt: null, OR: [{ organizerId }, { sale: { organizerId } }] },
      include: { card: true },
    })) ?? null
  );
}

async function loadListingRow(organizerId: string, itemId: string, deps: EtsyConnectorDeps): Promise<EtsyListingRow | null> {
  return (await getDb(deps).etsyListing.findFirst({ where: { itemId, organizerId } })) ?? null;
}

async function reloadRow(id: string, deps: EtsyConnectorDeps): Promise<EtsyListingRow | null> {
  return (await getDb(deps).etsyListing.findUnique({ where: { id } })) ?? null;
}

/** Photos that pass the pure URL checks (https, allowlisted host), capped at ETSY_MAX_IMAGES. */
export function collectUsableEtsyPhotoUrls(photoUrls: unknown, env: EtsyEnv = process.env): { urls: string[]; skipped: number } {
  const allowlist = readEtsyImageHostAllowlist(env);
  const urls: string[] = [];
  let skipped = 0;
  for (const u of Array.isArray(photoUrls) ? photoUrls : []) {
    try {
      validateEtsyImageUrl(u, allowlist);
      if (urls.length < ETSY_MAX_IMAGES) urls.push(u as string);
    } catch {
      skipped++;
    }
  }
  return { urls, skipped };
}

// ---------------------------------------------------------------------------------------------
// Serialization for the frontend
// ---------------------------------------------------------------------------------------------

/**
 * The organizer-facing view of an EtsyListing row. Deliberately omits the Etsy listing id, shop id,
 * organizer id and the id of the user who attested.
 */
export function serializeEtsyListing(row: EtsyListingRow, extras: { taxonomyPath?: string | null; imagesTotal?: number | null } = {}) {
  const state = String(row.state);
  const stored: string | null = row.lastErrorMessage ?? null;
  const message = state === 'FAILED' ? stored ?? ETSY_FAILED_STEP_MESSAGES[String(row.failedStep ?? '')] ?? ETSY_LISTING_MESSAGES.generic : stored;
  return {
    id: row.id,
    itemId: row.itemId,
    state,
    statusLabel: ETSY_LISTING_STATUS_LABELS[state] ?? state,
    failedStep: row.failedStep ?? null,
    message,
    whenMade: row.whenMade ?? null,
    whoMade: row.whoMade ?? ETSY_WHO_MADE_DEFAULT,
    isSupply: row.isSupply === true,
    taxonomyId: row.taxonomyId ?? null,
    taxonomyPath: extras.taxonomyPath ?? null,
    shippingProfileId: row.shippingProfileId ?? null,
    returnPolicyId: row.returnPolicyId ?? null,
    readinessStateId: row.readinessStateId ?? null,
    imagesUploaded: row.imagesUploaded ?? 0,
    imagesTotal: extras.imagesTotal ?? null,
    attestedAt: row.attestedAt ?? null,
    publishedAt: row.publishedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    endedAt: row.endedAt ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    canPublish: state === 'DRAFT_READY' && Boolean(row.attestedAt),
    canRetry: state === 'FAILED',
    canDiscard: ['PREPARING', 'DRAFT_PENDING', 'DRAFT_READY', 'FAILED'].includes(state),
    canEnd: state === 'ACTIVE',
  };
}

// ---------------------------------------------------------------------------------------------
// Draft request (the synchronous half): every check, then the atomic claim
// ---------------------------------------------------------------------------------------------

export interface EtsyDraftRequest {
  organizerId: string;
  userId: string;
  itemId: string;
  whenMade?: unknown;
  isSupply?: unknown;
  taxonomyId?: unknown;
  shippingProfileId?: unknown;
  returnPolicyId?: unknown;
  readinessStateId?: unknown;
  attest?: unknown;
}

function parseTaxonomyId(v: unknown): number | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= ETSY_TAXONOMY_MAX_NODE_ID ? n : null;
}

/** undefined for absent, the id string for a valid id, throws for anything else. */
function parseOptionalEtsyId(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = typeof v === 'number' ? String(v) : v;
  if (!isNumericId(s)) throw new EtsyListingError('ETSY_SETUP_INVALID', 400, ETSY_LISTING_MESSAGES.setupInvalid);
  return s;
}

function assertItemAvailable(item: any): void {
  if (ETSY_UNAVAILABLE_ITEM_STATUSES.includes(String(item.status ?? ''))) {
    throw new EtsyListingError('ETSY_ITEM_UNAVAILABLE', 409, ETSY_LISTING_MESSAGES.itemUnavailable);
  }
}

/** The eligibility re-check, run on every draft and publish call. No override exists. */
export function assertEtsyEligible(item: any, attestation: { whenMade: string | null; isSupply: boolean }, deps: EtsyConnectorDeps = {}): void {
  const result = checkEtsyEligibility({ card: item.card ?? null }, { ...attestation, asOfYear: deps.asOfYear });
  if (!result.eligible) {
    throw new EtsyListingError('ETSY_NOT_ELIGIBLE', 422, result.reason ?? ETSY_LISTING_MESSAGES.generic, {
      eligible: false,
      reason: result.reason,
      eligibilityCode: result.code,
    });
  }
}

function payloadError(problems: EtsyPayloadProblem[]): EtsyListingError {
  return new EtsyListingError('ETSY_PAYLOAD_INVALID', 400, problems[0]?.message ?? ETSY_LISTING_MESSAGES.badRequest, { problems });
}

/**
 * Validate everything for a draft and claim the row (DRAFT_PENDING). Does NOT call Etsy for the
 * listing itself (it may call Etsy for the shipping and processing lists when the organizer picked
 * values other than the saved defaults, and for the category tree on first use). Returns started=true
 * when the caller should now run runEtsyDraftWorker(listing.id); false when a worker is already running.
 */
export async function requestEtsyDraft(args: EtsyDraftRequest, deps: EtsyConnectorDeps = {}): Promise<{ listing: EtsyListingRow; started: boolean }> {
  const env = getEnv(deps);
  const db = getDb(deps);

  if (!isEtsyConnectorEnabled(env)) throw new EtsyError('ETSY_DISABLED', 'The Etsy connector is switched off');
  if (!isEtsyPushEnabled(env)) throw new EtsyListingError('ETSY_PUSH_DISABLED', 503, ETSY_LISTING_MESSAGES.pushDisabled);
  if (args.attest !== true) throw new EtsyListingError('ETSY_ATTESTATION_REQUIRED', 400, ETSY_LISTING_MESSAGES.attestationRequired);
  if (!isOrganizerAllowedForEtsy(args.organizerId, env)) throw new EtsyError('ETSY_NOT_ALLOWED', 'This organizer is not on the Etsy allowlist');

  if (args.whenMade !== undefined && args.whenMade !== null && typeof args.whenMade !== 'string') {
    throw new EtsyListingError('ETSY_BAD_REQUEST', 400, ETSY_LISTING_MESSAGES.badRequest);
  }
  if (args.isSupply !== undefined && args.isSupply !== null && typeof args.isSupply !== 'boolean') {
    throw new EtsyListingError('ETSY_BAD_REQUEST', 400, ETSY_LISTING_MESSAGES.badRequest);
  }
  const whenMade: string | null = typeof args.whenMade === 'string' && args.whenMade.trim() ? args.whenMade.trim() : null;
  const isSupply = args.isSupply === true;
  const taxonomyId = parseTaxonomyId(args.taxonomyId);
  if (taxonomyId === null) throw payloadError([{ code: 'TAXONOMY_MISSING', message: ETSY_PAYLOAD_PROBLEM_MESSAGES.TAXONOMY_MISSING }]);

  const item = await loadOwnedEtsyItem(args.organizerId, args.itemId, deps);
  if (!item) throw new EtsyListingError('ETSY_ITEM_NOT_FOUND', 404, ETSY_LISTING_MESSAGES.itemNotFound);
  assertItemAvailable(item);

  // Account, scopes and shop settings.
  const account = await db.marketplaceAccount.findUnique({
    where: { organizerId_platform: { organizerId: args.organizerId, platform: 'ETSY' } },
  });
  if (!account) throw new EtsyError('ETSY_NOT_CONNECTED', 'No Etsy account is connected');
  if (account.status !== 'ACTIVE' || findMissingEtsyScopes(account.grantedScopes).length > 0) {
    throw new EtsyError('ETSY_NEEDS_REAUTH', 'Etsy needs the organizer to reconnect');
  }
  const settings = await db.etsyShopSettings.findUnique({ where: { organizerId: args.organizerId } });
  if (!settings || !isNumericId(String(settings.shopId))) throw new EtsyError('ETSY_NOT_CONNECTED', 'No Etsy shop is connected');
  const currency: string | null = settings.shopCurrency ?? null;
  if (currency && currency.toUpperCase() !== 'USD') {
    throw new EtsyListingError('ETSY_CURRENCY_UNSUPPORTED', 422, etsyCurrencyUnsupportedMessage(currency));
  }

  // The eligibility re-check, server-side, every time.
  assertEtsyEligible(item, { whenMade, isSupply }, deps);

  // Shipping, return and processing profiles: saved defaults, or values the organizer picked now
  // (validated against lists fetched fresh with this organizer's own token).
  const pickedShipping = parseOptionalEtsyId(args.shippingProfileId);
  const pickedReturn = parseOptionalEtsyId(args.returnPolicyId);
  const pickedReadiness = parseOptionalEtsyId(args.readinessStateId);
  const shippingProfileId: string | null = pickedShipping ?? settings.defaultShippingProfileId ?? null;
  const returnPolicyId: string | null = pickedReturn ?? settings.defaultReturnPolicyId ?? null;
  const readinessStateId: string | null = pickedReadiness ?? settings.defaultReadinessStateId ?? null;
  if (!shippingProfileId || !readinessStateId) {
    throw new EtsyListingError('ETSY_SETUP_INCOMPLETE', 409, ETSY_LISTING_MESSAGES.setupIncomplete);
  }
  const pickedDifferent =
    (pickedShipping !== undefined && pickedShipping !== (settings.defaultShippingProfileId ?? null)) ||
    (pickedReturn !== undefined && pickedReturn !== (settings.defaultReturnPolicyId ?? null)) ||
    (pickedReadiness !== undefined && pickedReadiness !== (settings.defaultReadinessStateId ?? null));
  if (pickedDifferent) {
    const options = await fetchEtsyShopSetupOptions(args.organizerId, deps);
    const okShipping = options.shippingProfiles.some((p) => p.id === shippingProfileId);
    const okReadiness = options.processingProfiles.some((p) => p.id === readinessStateId);
    const okReturn = !returnPolicyId || options.returnPolicies.some((p) => p.id === returnPolicyId);
    if (!okShipping || !okReadiness || !okReturn) {
      throw new EtsyListingError('ETSY_SETUP_INVALID', 400, ETSY_LISTING_MESSAGES.setupInvalid, {
        field: !okShipping ? 'shippingProfileId' : !okReadiness ? 'readinessStateId' : 'returnPolicyId',
      });
    }
  }

  // The draft payload must be buildable (title, price, quantity, era, category).
  const payload = buildEtsyDraftPayload(item, { whenMade, isSupply, taxonomyId }, { shippingProfileId, returnPolicyId, readinessStateId });
  if (!payload.ok) throw payloadError(payload.problems);

  // Category: must be a cached LEAF node (non-leaf acceptance by Etsy is UNVERIFIED, T4).
  const tdeps = taxonomyDeps(deps);
  if (!(await ensureEtsyTaxonomyLoaded(tdeps))) {
    throw new EtsyListingError('ETSY_TAXONOMY_UNAVAILABLE', 503, ETSY_LISTING_MESSAGES.taxonomyUnavailable);
  }
  const node = await getEtsyTaxonomyNode(taxonomyId, tdeps);
  if (!node) throw new EtsyListingError('ETSY_TAXONOMY_INVALID', 400, ETSY_LISTING_MESSAGES.taxonomyInvalid);
  if (!node.isLeaf) throw new EtsyListingError('ETSY_TAXONOMY_INVALID', 400, ETSY_LISTING_MESSAGES.taxonomyNotLeaf, { reason: 'NOT_LEAF' });

  return claimDraftRow(
    {
      itemId: item.id,
      organizerId: args.organizerId,
      userId: args.userId,
      shopId: String(settings.shopId),
      whenMade: whenMade as string,
      isSupply,
      taxonomyId,
      shippingProfileId,
      returnPolicyId,
      readinessStateId,
    },
    deps
  );
}

interface ClaimInput {
  itemId: string;
  organizerId: string;
  userId: string;
  shopId: string;
  whenMade: string;
  isSupply: boolean;
  taxonomyId: number;
  shippingProfileId: string;
  returnPolicyId: string | null;
  readinessStateId: string;
}

/**
 * Create or atomically claim the EtsyListing row for DRAFT_PENDING. One in-flight draft per item:
 * a second request while a worker is running (row touched within ETSY_DRAFT_IDLE_MS) returns the
 * running row with started=false. When the row already holds an Etsy listing id (a resume), the
 * attestation values stored with it stay, because the Etsy draft was created from them; only the
 * attestation time and user are refreshed. To change them the organizer discards the draft first.
 */
async function claimDraftRow(input: ClaimInput, deps: EtsyConnectorDeps): Promise<{ listing: EtsyListingRow; started: boolean }> {
  const db = getDb(deps);
  const now = getNow(deps);
  const attested = { attestedAt: now, attestedByUserId: input.userId };
  const fresh = {
    organizerId: input.organizerId,
    shopId: input.shopId,
    whenMade: input.whenMade,
    whoMade: ETSY_WHO_MADE_DEFAULT,
    isSupply: input.isSupply,
    taxonomyId: input.taxonomyId,
    shippingProfileId: input.shippingProfileId,
    returnPolicyId: input.returnPolicyId,
    readinessStateId: input.readinessStateId,
    ...attested,
    failedStep: null,
    lastErrorMessage: null,
    lastErrorAt: null,
  };

  const existing: EtsyListingRow | null = await db.etsyListing.findUnique({ where: { itemId: input.itemId } });

  if (!existing) {
    try {
      const created = await db.etsyListing.create({ data: { itemId: input.itemId, state: 'DRAFT_PENDING', imagesUploaded: 0, ...fresh } });
      return { listing: created, started: true };
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      const raced = await db.etsyListing.findUnique({ where: { itemId: input.itemId } });
      if (!raced) throw err;
      return { listing: raced, started: false };
    }
  }

  // The row belongs to someone else's item id? EtsyListing.itemId is unique and items are owned by exactly one organizer.
  if (existing.organizerId !== input.organizerId) {
    throw new EtsyListingError('ETSY_ITEM_NOT_FOUND', 404, ETSY_LISTING_MESSAGES.itemNotFound);
  }

  const state = String(existing.state);
  switch (state) {
    case 'ACTIVE':
      throw new EtsyListingError('ETSY_ALREADY_LISTED', 409, ETSY_LISTING_MESSAGES.alreadyListed);
    case 'PUBLISHING':
      throw new EtsyListingError('ETSY_LISTING_BUSY', 409, ETSY_LISTING_MESSAGES.listingBusy);
    case 'SOLD':
      throw new EtsyListingError('ETSY_ITEM_UNAVAILABLE', 409, ETSY_LISTING_MESSAGES.itemUnavailable);
    case 'DRAFT_READY':
      throw new EtsyListingError('ETSY_DRAFT_EXISTS', 409, ETSY_LISTING_MESSAGES.draftExists);
    case 'ORPHANED':
      throw new EtsyListingError('ETSY_LISTING_ORPHANED', 409, ETSY_LISTING_MESSAGES.orphaned);
    default:
      break;
  }

  const updatedAt: Date | null = existing.updatedAt instanceof Date ? existing.updatedAt : null;
  if (state === 'DRAFT_PENDING' && updatedAt && now.getTime() - updatedAt.getTime() < ETSY_DRAFT_IDLE_MS) {
    return { listing: existing, started: false };
  }

  const keepsEtsyDraft = state !== 'ENDED' && Boolean(existing.etsyListingId);
  const data = keepsEtsyDraft
    ? { state: 'DRAFT_PENDING', ...attested, failedStep: null, lastErrorMessage: null, lastErrorAt: null }
    : {
        state: 'DRAFT_PENDING',
        ...fresh,
        etsyListingId: null,
        imagesUploaded: 0,
        syncedQuantity: null,
        syncedPrice: null,
        publishedAt: null,
        expiresAt: null,
        endedAt: null,
      };
  // Optimistic claim: only the request that still sees the state (and, for a stale pending row,
  // the same updatedAt) wins.
  const where: Record<string, any> = { id: existing.id, state };
  if (state === 'DRAFT_PENDING' && updatedAt) where.updatedAt = updatedAt;
  const claimed = await db.etsyListing.updateMany({ where, data });
  const row = await reloadRow(existing.id, deps);
  if (!row) throw new EtsyListingError('ETSY_LISTING_NOT_FOUND', 404, ETSY_LISTING_MESSAGES.listingNotFound);
  return { listing: row, started: Boolean(claimed && claimed.count === 1) };
}

// ---------------------------------------------------------------------------------------------
// Draft worker (the asynchronous half)
// ---------------------------------------------------------------------------------------------

export type EtsyDraftWorkerOutcome = 'ready' | 'failed' | 'skipped' | 'cancelled';

/**
 * Create the Etsy draft, upload its photos in rank order (up to ETSY_MAX_IMAGES) and mark the row
 * DRAFT_READY. Runs in process, fire and forget, from the draft route and from the sync batch's
 * stale-draft sweep. Never throws.
 *
 * Idempotent and resumable: the Etsy listing id is persisted straight after the create call, so a
 * later run skips create; on a resume it asks Etsy once how many images the draft already has and
 * continues from that count. Every write is conditional on the row still being DRAFT_PENDING, so a
 * discard (or an end) while the worker runs stops it at the next step.
 * Known limit: photos skipped as unusable are not remembered, so a crash after a skip and a resume
 * can send one photo twice. That needs a crash at exactly that moment.
 */
export async function runEtsyDraftWorker(listingRowId: string, deps: EtsyConnectorDeps = {}): Promise<EtsyDraftWorkerOutcome> {
  const env = getEnv(deps);
  const db = getDb(deps);
  // Switched off: leave the row alone so it can be resumed when switched back on.
  if (!isEtsyConnectorEnabled(env) || !isEtsyPushEnabled(env)) return 'skipped';

  let row: EtsyListingRow | null = null;
  try {
    row = await reloadRow(listingRowId, deps);
    if (!row || row.state !== 'DRAFT_PENDING') return 'skipped';
    const rowId: string = row.id;
    const organizerId: string = row.organizerId;
    const itemId: string = row.itemId;
    const send = authedFn(deps);

    const fail = async (step: EtsyFailedStep, message: string, extra: Record<string, any> = {}): Promise<EtsyDraftWorkerOutcome> => {
      await db.etsyListing.updateMany({
        where: { id: rowId, state: 'DRAFT_PENDING' },
        data: { state: 'FAILED', failedStep: step, lastErrorMessage: message.slice(0, 300), lastErrorAt: getNow(deps), ...extra },
      });
      return 'failed';
    };

    const item = await loadOwnedEtsyItem(organizerId, itemId, deps);
    if (!item || ETSY_UNAVAILABLE_ITEM_STATUSES.includes(String(item.status ?? ''))) {
      return fail('CREATE', ETSY_LISTING_MESSAGES.itemUnavailable);
    }
    if (!isNumericId(String(row.shopId))) return fail('CREATE', ETSY_LISTING_MESSAGES.notConnected);
    const shopPath = `/v3/application/shops/${encodeURIComponent(String(row.shopId))}`;

    // Never create or extend an Etsy listing for an item that is no longer eligible.
    const eligibility = checkEtsyEligibility({ card: item.card ?? null }, { whenMade: row.whenMade, isSupply: row.isSupply === true, asOfYear: deps.asOfYear });
    if (!eligibility.eligible) return fail('CREATE', eligibility.reason ?? ETSY_LISTING_MESSAGES.generic);

    // 1. Create the draft (skipped on a resume).
    let etsyListingId: string | null = row.etsyListingId ? String(row.etsyListingId) : null;
    let uploaded: number = typeof row.imagesUploaded === 'number' ? row.imagesUploaded : 0;
    const resuming = etsyListingId !== null;

    if (!etsyListingId) {
      const payload = buildEtsyDraftPayload(
        item,
        { whenMade: row.whenMade, isSupply: row.isSupply === true, taxonomyId: row.taxonomyId },
        { shippingProfileId: row.shippingProfileId, returnPolicyId: row.returnPolicyId, readinessStateId: row.readinessStateId }
      );
      if (!payload.ok) return fail('CREATE', payload.problems[0]?.message ?? ETSY_LISTING_MESSAGES.badRequest);

      const created = await send(organizerId, {
        method: 'POST',
        path: `${shopPath}/listings`,
        priority: 'INTERACTIVE',
        form: payload.fields,
        endpoint: 'POST createDraftListing',
      });
      if (!created.ok) return fail('CREATE', describeEtsyResponse('CREATE', created, { env, organizerId, itemId }));
      const rawId = created.data?.listing_id;
      const newId = typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId) : '';
      if (!/^[1-9]\d{0,19}$/.test(newId)) {
        captureEtsyEvent('warning', 'Etsy create response had no listing_id', { area: 'listing', step: 'create-no-id', extra: { organizerId, itemId, status: created.status } }, env);
        return fail('CREATE', ETSY_LISTING_MESSAGES.generic);
      }
      etsyListingId = newId;
      // Persist the id at once, but only while the row is still ours to write.
      const kept = await db.etsyListing.updateMany({ where: { id: rowId, state: 'DRAFT_PENDING' }, data: { etsyListingId, imagesUploaded: 0 } });
      if (!kept || kept.count !== 1) {
        // Discarded while we were creating: remove the draft we just made (best effort).
        await send(organizerId, { method: 'DELETE', path: `/v3/application/listings/${etsyListingId}`, priority: 'INTERACTIVE' }).catch(() => undefined);
        return 'cancelled';
      }
      uploaded = 0;
    }

    // 2. On a resume, ask Etsy how many images the draft already has (one call).
    if (resuming) {
      const existingImages = await send(organizerId, {
        method: 'GET',
        path: `/v3/application/listings/${etsyListingId}/images`,
        priority: 'INTERACTIVE',
        endpoint: 'GET getListingImages',
      });
      if (existingImages.status === 404) {
        // The draft was deleted on Etsy: forget it so the next attempt creates a new one.
        return fail('IMAGES', ETSY_LISTING_MESSAGES.draftGone, { etsyListingId: null, imagesUploaded: 0 });
      }
      if (!existingImages.ok) return fail('IMAGES', describeEtsyResponse('IMAGES', existingImages, { env, organizerId, itemId }));
      const results = existingImages.data?.results;
      const count = Array.isArray(results) ? results.length : Number(existingImages.data?.count);
      uploaded = Number.isFinite(count) && count >= 0 ? Math.floor(count) : uploaded;
      const synced = await db.etsyListing.updateMany({ where: { id: rowId, state: 'DRAFT_PENDING' }, data: { imagesUploaded: uploaded } });
      if (!synced || synced.count !== 1) return 'cancelled';
    }

    // 3. Photos, sequential, rank 1..N.
    const { urls, skipped } = collectUsableEtsyPhotoUrls(item.photoUrls, env);
    if (skipped > 0) {
      captureEtsyEvent('info', 'Some item photos were skipped for Etsy (host not allowed or bad URL)', { area: 'listing', step: 'image-skipped', extra: { organizerId, itemId, skipped } }, env);
    }
    const downloader = deps.fetchImage ?? ((u: string) => fetchEtsyImage(u, { env }));
    for (let i = uploaded; i < urls.length && uploaded < ETSY_MAX_IMAGES; i++) {
      let image: FetchedEtsyImage;
      try {
        image = await downloader(urls[i]);
      } catch (err: any) {
        if (isTransientEtsyImageError(err)) return fail('IMAGES', ETSY_LISTING_MESSAGES.photoHostTrouble);
        captureEtsyEvent('info', 'An item photo was rejected for Etsy', {
          area: 'listing',
          step: 'image-rejected',
          extra: { organizerId, itemId, reason: err instanceof EtsyImageFetchError ? err.code : 'UNKNOWN' },
        }, env);
        continue;
      }
      const sent = await send(organizerId, {
        method: 'POST',
        path: `${shopPath}/listings/${etsyListingId}/images`,
        priority: 'INTERACTIVE',
        endpoint: 'POST uploadListingImage',
        multipart: [
          { name: 'image', filename: image.filename, contentType: image.contentType, data: image.data },
          { name: 'rank', value: String(uploaded + 1) },
        ],
      });
      if (sent.status === 404) return fail('IMAGES', ETSY_LISTING_MESSAGES.draftGone, { etsyListingId: null, imagesUploaded: 0 });
      if (!sent.ok) return fail('IMAGES', describeEtsyResponse('IMAGES', sent, { env, organizerId, itemId }));
      uploaded += 1;
      const bumped = await db.etsyListing.updateMany({ where: { id: rowId, state: 'DRAFT_PENDING' }, data: { imagesUploaded: uploaded } });
      if (!bumped || bumped.count !== 1) return 'cancelled';
    }

    if (uploaded < 1) return fail('IMAGES', ETSY_LISTING_MESSAGES.noPhotos);

    // 4. Ready for the organizer's confirmation.
    const ready = await db.etsyListing.updateMany({
      where: { id: rowId, state: 'DRAFT_PENDING' },
      data: {
        state: 'DRAFT_READY',
        imagesUploaded: uploaded,
        syncedQuantity: computeEtsyQuantity(item),
        syncedPrice: typeof item.price === 'number' ? item.price : null,
        failedStep: null,
        lastErrorMessage: null,
        lastErrorAt: null,
      },
    });
    return ready && ready.count === 1 ? 'ready' : 'cancelled';
  } catch (err: any) {
    const message = describeEtsyThrown(err);
    if (!(err instanceof EtsyError)) {
      captureEtsyEvent('warning', 'Etsy draft worker failed unexpectedly', {
        area: 'listing',
        step: 'draft-worker',
        extra: { itemId: row?.itemId, organizerId: row?.organizerId, errorName: err?.name || 'Error' },
      }, env);
    }
    try {
      await db.etsyListing.updateMany({
        where: { id: listingRowId, state: 'DRAFT_PENDING' },
        data: { state: 'FAILED', failedStep: 'CREATE', lastErrorMessage: scrubEtsySecrets(message, env).slice(0, 300), lastErrorAt: getNow(deps) },
      });
    } catch {
      /* the row stays DRAFT_PENDING and the idle sweep resumes it */
    }
    return 'failed';
  }
}

// ---------------------------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------------------------

/**
 * Publish a DRAFT_READY listing: state=active on Etsy (this is when Etsy charges its $0.20 fee).
 * Requires the explicit confirmation (checked by the caller as `confirm: true`), a stored attestation,
 * and a passing eligibility re-check now. A second call on an ACTIVE row returns the row without
 * calling Etsy. An Etsy 4xx maps to ETSY_PUBLISH_BLOCKED and returns the row to DRAFT_READY.
 */
export async function publishEtsyListing(
  args: { organizerId: string; itemId: string; confirm: unknown },
  deps: EtsyConnectorDeps = {}
): Promise<{ listing: EtsyListingRow; alreadyActive: boolean }> {
  const env = getEnv(deps);
  const db = getDb(deps);
  const now = getNow(deps);

  if (!isEtsyConnectorEnabled(env)) throw new EtsyError('ETSY_DISABLED', 'The Etsy connector is switched off');
  if (!isEtsyPushEnabled(env)) throw new EtsyListingError('ETSY_PUSH_DISABLED', 503, ETSY_LISTING_MESSAGES.pushDisabled);
  if (args.confirm !== true) throw new EtsyListingError('ETSY_CONFIRM_REQUIRED', 400, ETSY_LISTING_MESSAGES.confirmRequired);
  if (!isOrganizerAllowedForEtsy(args.organizerId, env)) throw new EtsyError('ETSY_NOT_ALLOWED', 'This organizer is not on the Etsy allowlist');

  const item = await loadOwnedEtsyItem(args.organizerId, args.itemId, deps);
  if (!item) throw new EtsyListingError('ETSY_ITEM_NOT_FOUND', 404, ETSY_LISTING_MESSAGES.itemNotFound);
  const row = await loadListingRow(args.organizerId, args.itemId, deps);
  if (!row) throw new EtsyListingError('ETSY_LISTING_NOT_FOUND', 404, ETSY_LISTING_MESSAGES.listingNotFound);

  const state = String(row.state);
  if (state === 'ACTIVE') return { listing: row, alreadyActive: true };

  const updatedAt: Date | null = row.updatedAt instanceof Date ? row.updatedAt : null;
  const stalePublishing = state === 'PUBLISHING' && updatedAt !== null && now.getTime() - updatedAt.getTime() >= ETSY_PUBLISHING_STALE_MS;
  if (state === 'PUBLISHING' && !stalePublishing) throw new EtsyListingError('ETSY_LISTING_BUSY', 409, ETSY_LISTING_MESSAGES.listingBusy);
  if (state === 'DRAFT_PENDING') throw new EtsyListingError('ETSY_NOT_DRAFT_READY', 409, ETSY_LISTING_MESSAGES.draftPending);
  if (state !== 'DRAFT_READY' && !stalePublishing) throw new EtsyListingError('ETSY_NOT_DRAFT_READY', 409, ETSY_LISTING_MESSAGES.notDraftReady);
  if (!row.attestedAt) throw new EtsyListingError('ETSY_NOT_ATTESTED', 409, ETSY_LISTING_MESSAGES.notAttested);
  if (!row.etsyListingId || !isNumericId(String(row.shopId))) throw new EtsyListingError('ETSY_NOT_DRAFT_READY', 409, ETSY_LISTING_MESSAGES.notDraftReady);

  assertItemAvailable(item);
  assertEtsyEligible(item, { whenMade: row.whenMade ?? null, isSupply: row.isSupply === true }, deps);

  // Atomic claim: only one publish call reaches Etsy.
  const claimWhere: Record<string, any> = { id: row.id, state };
  if (stalePublishing && updatedAt) claimWhere.updatedAt = updatedAt;
  const claimed = await db.etsyListing.updateMany({ where: claimWhere, data: { state: 'PUBLISHING', lastErrorMessage: null, lastErrorAt: null } });
  if (!claimed || claimed.count !== 1) throw new EtsyListingError('ETSY_LISTING_BUSY', 409, ETSY_LISTING_MESSAGES.listingBusy);

  const send = authedFn(deps);
  let res: EtsyResponse;
  try {
    res = await send(args.organizerId, {
      method: 'PATCH',
      path: `/v3/application/shops/${encodeURIComponent(String(row.shopId))}/listings/${encodeURIComponent(String(row.etsyListingId))}`,
      priority: 'INTERACTIVE',
      form: { state: 'active' },
      endpoint: 'PATCH updateListing state=active',
    });
  } catch (err) {
    // Etsy was not reached, or answered with something we treat as a failure to reach it: back to a draft.
    await db.etsyListing.updateMany({
      where: { id: row.id, state: 'PUBLISHING' },
      data: { state: 'DRAFT_READY', lastErrorMessage: describeEtsyThrown(err).slice(0, 300), lastErrorAt: getNow(deps) },
    });
    throw err;
  }

  if (res.ok) {
    const at = getNow(deps);
    await db.etsyListing.updateMany({
      where: { id: row.id, state: 'PUBLISHING' },
      data: {
        state: 'ACTIVE',
        publishedAt: at,
        expiresAt: addMonthsUtc(at, ETSY_LISTING_TERM_MONTHS),
        endedAt: null,
        failedStep: null,
        lastErrorMessage: null,
        lastErrorAt: null,
      },
    });
    const updated = await reloadRow(row.id, deps);
    return { listing: updated ?? row, alreadyActive: false };
  }

  if (res.status === 404) {
    // The draft is gone on Etsy: forget it so a new draft can be created.
    await db.etsyListing.updateMany({
      where: { id: row.id, state: 'PUBLISHING' },
      data: {
        state: 'FAILED',
        failedStep: 'PUBLISH',
        lastErrorMessage: ETSY_LISTING_MESSAGES.draftGone,
        lastErrorAt: getNow(deps),
        etsyListingId: null,
        imagesUploaded: 0,
      },
    });
    throw new EtsyListingError('ETSY_PUBLISH_BLOCKED', 422, ETSY_LISTING_MESSAGES.draftGone);
  }

  const message = describeEtsyResponse('PUBLISH', res, { env, organizerId: args.organizerId, itemId: args.itemId });
  await db.etsyListing.updateMany({
    where: { id: row.id, state: 'PUBLISHING' },
    data: { state: 'DRAFT_READY', lastErrorMessage: message.slice(0, 300), lastErrorAt: getNow(deps) },
  });
  if (res.status >= 500) throw new EtsyListingError('ETSY_PUBLISH_BLOCKED', 502, message);
  throw new EtsyListingError('ETSY_PUBLISH_BLOCKED', 422, message);
}

// ---------------------------------------------------------------------------------------------
// End / withdraw
// ---------------------------------------------------------------------------------------------

export type EtsyWithdrawOutcome = 'withdrawn' | 'gone' | 'skipped' | 'failed';

/** deleteListing for one row. 2xx is 'withdrawn', 404 or 410 is 'gone' (both end the row); anything else is 'failed' and leaves the state alone. Never throws. */
async function deleteEtsyListingForRow(row: EtsyListingRow, priority: EtsyPriority, deps: EtsyConnectorDeps): Promise<EtsyWithdrawOutcome> {
  const db = getDb(deps);
  const env = getEnv(deps);
  const recordFailure = async (message: string) => {
    try {
      await db.etsyListing.updateMany({ where: { id: row.id }, data: { lastErrorMessage: message.slice(0, 300), lastErrorAt: getNow(deps) } });
    } catch {
      /* non-fatal */
    }
  };
  try {
    const res = await authedFn(deps)(row.organizerId, {
      method: 'DELETE',
      path: `/v3/application/listings/${encodeURIComponent(String(row.etsyListingId))}`,
      priority,
      endpoint: 'DELETE deleteListing',
    });
    if (res.ok || res.status === 404 || res.status === 410) {
      await db.etsyListing.updateMany({ where: { id: row.id }, data: { state: 'ENDED', endedAt: getNow(deps), lastErrorMessage: null, lastErrorAt: null } });
      return res.ok ? 'withdrawn' : 'gone';
    }
    await recordFailure(describeEtsyResponse('DELETE', res, { env, organizerId: row.organizerId, itemId: row.itemId }));
    return 'failed';
  } catch (err) {
    await recordFailure(describeEtsyThrown(err));
    return 'failed';
  }
}

/**
 * Withdraw an item's Etsy listing (sold elsewhere, item deleted). Self-guarding: 'skipped' unless
 * the connector is on and an EtsyListing exists with an Etsy listing id in a withdrawable state.
 * 'withdrawn' (Etsy deleted it) and 'gone' (Etsy said 404 or 410) both set the row ENDED; 'failed'
 * (any other answer, a 5xx, a throw) leaves the state unchanged so a later sweep can retry. Never
 * throws and never checks ETSY_PUSH_ENABLED. Called with an item id only, like withdrawReverbListingIfExists.
 */
export async function withdrawEtsyListingIfExists(itemId: string, deps: EtsyConnectorDeps = {}): Promise<EtsyWithdrawOutcome> {
  try {
    if (!isEtsyConnectorEnabled(getEnv(deps))) return 'skipped';
    if (typeof itemId !== 'string' || !itemId) return 'skipped';
    const row: EtsyListingRow | null = (await getDb(deps).etsyListing.findUnique({ where: { itemId } })) ?? null;
    if (!row || !row.etsyListingId) return 'skipped';
    if (!ETSY_WITHDRAWABLE_STATES.includes(String(row.state))) return 'skipped';
    const outcome = await deleteEtsyListingForRow(row, 'URGENT', deps);
    if (outcome === 'withdrawn' || outcome === 'gone') {
      console.log(`[Etsy] withdraw-on-SOLD: listing ${outcome} for item ${itemId}`);
    }
    return outcome;
  } catch (error: any) {
    console.error(`[Etsy] withdraw-on-SOLD failed for item ${itemId}:`, scrubEtsySecrets(error?.message || String(error)));
    return 'failed';
  }
}

/**
 * The organizer's "end listing" or "discard draft" action (INTERACTIVE). Scoped by organizer. A row
 * with no Etsy listing id (nothing exists on Etsy) is just marked ENDED locally. Returns the outcome
 * and the fresh row; throws ETSY_LISTING_NOT_FOUND (404) or ETSY_END_FAILED (502). Never checks
 * ETSY_PUSH_ENABLED. When the kill switch is off the throw is ETSY_DISABLED.
 */
export async function endEtsyListing(
  args: { organizerId: string; itemId: string },
  deps: EtsyConnectorDeps = {}
): Promise<{ outcome: EtsyWithdrawOutcome; listing: EtsyListingRow }> {
  const db = getDb(deps);
  if (!isEtsyConnectorEnabled(getEnv(deps))) throw new EtsyError('ETSY_DISABLED', 'The Etsy connector is switched off');
  const row = await loadListingRow(args.organizerId, args.itemId, deps);
  if (!row) throw new EtsyListingError('ETSY_LISTING_NOT_FOUND', 404, ETSY_LISTING_MESSAGES.listingNotFound);
  const state = String(row.state);
  if (ETSY_TERMINAL_STATES.includes(state)) return { outcome: 'skipped', listing: row };

  if (!row.etsyListingId) {
    await db.etsyListing.updateMany({ where: { id: row.id }, data: { state: 'ENDED', endedAt: getNow(deps) } });
    return { outcome: 'skipped', listing: (await reloadRow(row.id, deps)) ?? row };
  }
  const outcome = await deleteEtsyListingForRow(row, 'INTERACTIVE', deps);
  if (outcome === 'failed') throw new EtsyListingError('ETSY_END_FAILED', 502, ETSY_LISTING_MESSAGES.endFailed);
  return { outcome, listing: (await reloadRow(row.id, deps)) ?? row };
}

// ---------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------

/** The serialized listing for an item, or null when there is none. Local data only, no Etsy call. */
export async function getEtsyListingStatus(
  args: { organizerId: string; itemId: string; item?: any },
  deps: EtsyConnectorDeps = {}
): Promise<ReturnType<typeof serializeEtsyListing> | null> {
  const row = await loadListingRow(args.organizerId, args.itemId, deps);
  if (!row) return null;
  let taxonomyPath: string | null = null;
  if (typeof row.taxonomyId === 'number') {
    const node = await getEtsyTaxonomyNode(row.taxonomyId, taxonomyDeps(deps)).catch(() => null);
    taxonomyPath = node?.fullPath ?? null;
  }
  const imagesTotal = args.item ? collectUsableEtsyPhotoUrls(args.item.photoUrls, getEnv(deps)).urls.length : null;
  return serializeEtsyListing(row, { taxonomyPath, imagesTotal });
}

// ---------------------------------------------------------------------------------------------
// Inventory (price and quantity) push
// ---------------------------------------------------------------------------------------------

export interface EtsyInventoryUpdateResult {
  ok: boolean;
  outcome: 'updated' | 'skipped' | 'failed';
  reason?:
    | 'disabled'
    | 'no-listing'
    | 'not-live'
    | 'no-item'
    | 'zero-quantity'
    | 'no-price'
    | 'unchanged'
    | 'unsupported-variations'
    | 'get-failed'
    | 'put-failed'
    | 'threw';
  detail?: string;
}

/**
 * Build the inventory PUT body strictly from the GET body: keep every product, its sku and property
 * values, keep every offering's enabled flag, and change ONLY price and quantity. Returns null when
 * the listing has variations (more than one live product or offering), which this connector never
 * creates and will not rewrite. The exact accepted shape is UNVERIFIED (live test T7).
 */
export function buildEtsyInventoryPutBody(inventory: any, price: number, quantity: number): Record<string, any> | null {
  const products = (Array.isArray(inventory?.products) ? inventory.products : []).filter((p: any) => p && p.is_deleted !== true);
  if (products.length !== 1) return null;
  const offerings = (Array.isArray(products[0].offerings) ? products[0].offerings : []).filter((o: any) => o && o.is_deleted !== true);
  if (offerings.length !== 1) return null;
  const product = products[0];
  const offering = offerings[0];
  const propertyValues = (Array.isArray(product.property_values) ? product.property_values : []).map((pv: any) => {
    const out: Record<string, any> = {};
    for (const key of ['property_id', 'value_ids', 'scale_id', 'property_name', 'values']) {
      if (pv && pv[key] !== undefined) out[key] = pv[key];
    }
    return out;
  });
  const body: Record<string, any> = {
    products: [
      {
        sku: typeof product.sku === 'string' ? product.sku : '',
        property_values: propertyValues,
        offerings: [{ price, quantity, is_enabled: offering.is_enabled !== false }],
      },
    ],
  };
  for (const key of ['price_on_property', 'quantity_on_property', 'sku_on_property']) {
    if (Array.isArray(inventory?.[key])) body[key] = inventory[key];
  }
  return body;
}

/**
 * Push the item's current price and remaining quantity to its live Etsy listing (GET inventory, then
 * PUT inventory, BACKGROUND). Never throws; returns a typed result. Price flows one way: FindA.Sale to
 * Etsy. A quantity of 0 is not pushed (the caller withdraws instead). Does not check ETSY_PUSH_ENABLED
 * (it only updates a listing that already exists). Not safe to enable in production until live test T7
 * confirms the PUT shape.
 */
export async function updateEtsyListingInventory(itemId: string, deps: EtsyConnectorDeps = {}): Promise<EtsyInventoryUpdateResult> {
  const env = getEnv(deps);
  try {
    if (!isEtsyConnectorEnabled(env)) return { ok: false, outcome: 'skipped', reason: 'disabled' };
    const db = getDb(deps);
    const row: EtsyListingRow | null = (await db.etsyListing.findUnique({ where: { itemId } })) ?? null;
    if (!row) return { ok: false, outcome: 'skipped', reason: 'no-listing' };
    if (!row.etsyListingId || !['ACTIVE', 'DRAFT_READY'].includes(String(row.state))) return { ok: false, outcome: 'skipped', reason: 'not-live' };

    const item = await loadOwnedEtsyItem(row.organizerId, itemId, deps);
    if (!item) return { ok: false, outcome: 'skipped', reason: 'no-item' };
    const quantity = computeEtsyQuantity(item);
    if (quantity < 1) return { ok: false, outcome: 'skipped', reason: 'zero-quantity' };
    const price = typeof item.price === 'number' && item.price > 0 ? item.price : null;
    if (price === null) return { ok: false, outcome: 'skipped', reason: 'no-price' };
    const roundedPrice = Math.round(price * 100) / 100;
    if (row.syncedQuantity === quantity && row.syncedPrice === roundedPrice) return { ok: true, outcome: 'skipped', reason: 'unchanged' };

    const send = authedFn(deps);
    const inventoryPath = `/v3/application/listings/${encodeURIComponent(String(row.etsyListingId))}/inventory`;
    const recordFailure = async (message: string) => {
      try {
        await db.etsyListing.updateMany({ where: { id: row.id }, data: { lastErrorMessage: message.slice(0, 300), lastErrorAt: getNow(deps) } });
      } catch {
        /* non-fatal */
      }
    };

    const current = await send(row.organizerId, { method: 'GET', path: inventoryPath, priority: 'BACKGROUND', endpoint: 'GET getListingInventory' });
    if (!current.ok) {
      const message = describeEtsyResponse('UPDATE', current, { env, organizerId: row.organizerId, itemId });
      await recordFailure(message);
      return { ok: false, outcome: 'failed', reason: 'get-failed', detail: message };
    }
    const body = buildEtsyInventoryPutBody(current.data, roundedPrice, quantity);
    if (!body) return { ok: false, outcome: 'skipped', reason: 'unsupported-variations' };

    const put = await send(row.organizerId, { method: 'PUT', path: inventoryPath, priority: 'BACKGROUND', body, endpoint: 'PUT updateListingInventory' });
    if (!put.ok) {
      const message = describeEtsyResponse('UPDATE', put, { env, organizerId: row.organizerId, itemId });
      await recordFailure(message);
      return { ok: false, outcome: 'failed', reason: 'put-failed', detail: message };
    }
    await db.etsyListing.updateMany({ where: { id: row.id }, data: { syncedQuantity: quantity, syncedPrice: roundedPrice, lastErrorMessage: null, lastErrorAt: null } });
    return { ok: true, outcome: 'updated' };
  } catch (err: any) {
    return { ok: false, outcome: 'failed', reason: 'threw', detail: describeEtsyThrown(err) };
  }
}
