/**
 * lib/etsyUiState.ts -- pure logic behind the Etsy connector UI (ADR-135 D8, batch E-B5).
 *
 * Everything the components decide lives here so it can be unit tested without a browser:
 *   - normalising the server responses (connection, shop setup, listing, eligibility, categories)
 *   - which panel or section state to draw (not connected, connecting, connected, setup empty,
 *     needs reconnect, disabled, busy, ineligible, draft pending, draft ready, live, failed)
 *   - what blocks a draft, in plain words, and what is still missing from the form
 *   - the read-only preview of what Etsy will receive
 *   - mapping errors to fixed copy (a server's free text is never rendered except two cases noted below)
 *
 * Pure module: no imports of React, axios or Next; no env reads; no clock reads (callers pass the year).
 * Server response shapes are the ones implemented in wave 1 (controllers/etsyConnectController.ts and
 * services/marketplace/etsyAuth.ts). The listing, eligibility and category shapes belong to batch E-B3,
 * which was built in parallel: those normalisers are deliberately tolerant and are marked UNVERIFIED.
 *
 * ELIGIBILITY MIRROR: checkEtsyEligibilityLocal mirrors packages/backend/src/services/marketplace/
 * etsyEligibility.ts so the modal can explain a problem the moment an era is picked. The server stays
 * the authority (draft and publish re-check). etsyUiState.test.ts compares the message text with the
 * backend file whenever the backend source is present.
 */

import {
  ETSY_BANNER_MESSAGES,
  ETSY_BUSY_ERROR,
  ETSY_FAILED_STEP_MESSAGES,
  ETSY_GENERIC_ERROR,
  ETSY_MISSING_LABELS,
  ETSY_PANEL_COPY,
  ETSY_PROBLEM_MESSAGES,
  ETSY_STATUS_DETAILS,
  ETSY_STATUS_LABELS,
  etsyCurrencyMessage,
} from './etsyCopy';
import { etsyEraOptionsFor, getEtsyEra } from './etsyWhenMade';
import { normalizeCondition } from './conditionModel';

// ---------------------------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asIdString(v: unknown): string | null {
  return (typeof v === 'string' || typeof v === 'number') && /^\d{1,20}$/.test(String(v)) ? String(v) : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
  return null;
}

/** Etsy allows up to 20 images per listing (ADR-135 D2.1). */
export const ETSY_MAX_PHOTOS = 20;
export const ETSY_MAX_TITLE_LEN = 140;
export const ETSY_MAX_TAGS = 13;
export const ETSY_MAX_TAG_LEN = 20;
const MAX_SERVER_MESSAGE_LEN = 300;

// ---------------------------------------------------------------------------------------------
// Errors (axios-shaped, read defensively; nothing here logs).
// ---------------------------------------------------------------------------------------------

export function etsyErrorStatus(err: unknown): number | null {
  if (!isRecord(err) || !isRecord(err.response)) return null;
  const s = err.response.status;
  return typeof s === 'number' ? s : null;
}

export function etsyErrorData(err: unknown): Rec | null {
  if (!isRecord(err) || !isRecord(err.response)) return null;
  return isRecord(err.response.data) ? err.response.data : null;
}

export function etsyErrorCode(err: unknown): string | null {
  const d = etsyErrorData(err);
  return d ? asString(d.code) : null;
}

/** The server's own sentence, only when it is short plain text. Rendered by React as text (escaped). */
function safeServerMessage(d: Rec | null, key: string = 'message'): string | null {
  if (!d) return null;
  const m = d[key];
  if (typeof m !== 'string') return null;
  const t = m.trim();
  return t.length > 0 && t.length <= MAX_SERVER_MESSAGE_LEN ? t : null;
}

/**
 * Organizer-facing sentence for a failed Etsy request. Known codes map to our own fixed copy. The
 * server's text is used for exactly two cases where it is the useful part: ETSY_PUBLISH_BLOCKED (the
 * server passes Etsy's sanitized reason through, ADR-135 D2.4) and the 422 eligibility `reason`
 * (a fixed sentence from etsyEligibility.ts). Anything else unknown gets the generic sentence.
 */
export function etsyErrorMessage(err: unknown, fallback: string = ETSY_GENERIC_ERROR): string {
  const status = etsyErrorStatus(err);
  const code = etsyErrorCode(err);
  const data = etsyErrorData(err);
  switch (code) {
    case 'ETSY_DISABLED':
    case 'ETSY_NOT_CONFIGURED':
      return ETSY_PANEL_COPY.disabled;
    case 'ETSY_NOT_ALLOWED':
      return ETSY_PANEL_COPY.notAllowed;
    case 'ETSY_BUSY':
    case 'ETSY_BUDGET':
    case 'ETSY_BLOCKED':
      return ETSY_BUSY_ERROR;
    case 'ETSY_NEEDS_REAUTH':
      return ETSY_PANEL_COPY.needsReconnect;
    case 'ETSY_NOT_CONNECTED':
      return ETSY_PROBLEM_MESSAGES.notConnected;
    case 'ETSY_CONNECT_FAILED':
      return ETSY_BANNER_MESSAGES.ETSY_CONNECT_FAILED;
    case 'ETSY_NO_SHOP':
      return ETSY_BANNER_MESSAGES.ETSY_NO_SHOP;
    case 'ETSY_SHOP_IN_USE':
      return ETSY_BANNER_MESSAGES.ETSY_SHOP_IN_USE;
    case 'ETSY_SETUP_INVALID':
      return ETSY_PANEL_COPY.setupSaveFailed;
    case 'ETSY_PUBLISH_BLOCKED':
      return safeServerMessage(data) ?? ETSY_GENERIC_ERROR;
    // The listing routes answer these with fixed organizer-facing sentences (etsyConnector.ts).
    case 'ETSY_PUSH_DISABLED':
    case 'ETSY_ATTESTATION_REQUIRED':
    case 'ETSY_CONFIRM_REQUIRED':
    case 'ETSY_BAD_REQUEST':
    case 'ETSY_PAYLOAD_INVALID':
    case 'ETSY_ITEM_UNAVAILABLE':
    case 'ETSY_ITEM_NOT_FOUND':
    case 'ETSY_SETUP_INCOMPLETE':
    case 'ETSY_CURRENCY_UNSUPPORTED':
    case 'ETSY_TAXONOMY_INVALID':
    case 'ETSY_TAXONOMY_UNAVAILABLE':
    case 'ETSY_DRAFT_EXISTS':
    case 'ETSY_LISTING_BUSY':
    case 'ETSY_ALREADY_LISTED':
    case 'ETSY_LISTING_ORPHANED':
    case 'ETSY_LISTING_NOT_FOUND':
    case 'ETSY_NOT_DRAFT_READY':
    case 'ETSY_NOT_ATTESTED':
    case 'ETSY_END_FAILED':
      return safeServerMessage(data) ?? fallback;
    case 'ETSY_NOT_ELIGIBLE':
      return safeServerMessage(data, 'reason') ?? safeServerMessage(data) ?? fallback;
    default:
      break;
  }
  if (status === 422) {
    const reason = safeServerMessage(data, 'reason');
    if (reason) return reason;
  }
  if (status === 429 || status === 503) return ETSY_BUSY_ERROR;
  return fallback;
}

/** 503 with ETSY_DISABLED (or enabled:false) means the connector is switched off on the server. */
export function isEtsyDisabledError(err: unknown): boolean {
  const data = etsyErrorData(err);
  return etsyErrorStatus(err) === 503 && (etsyErrorCode(err) === 'ETSY_DISABLED' || (data !== null && data.enabled === false));
}

// ---------------------------------------------------------------------------------------------
// Connection (GET /api/etsy/connection), shape from etsyAuth.getEtsyConnectionStatus.
// ---------------------------------------------------------------------------------------------

export interface EtsyConnectionInfo {
  /** False when the server answered 503 ETSY_DISABLED. Availability comes from the server only. */
  enabled: boolean;
  /** True when the server allows draft and publish (ETSY_PUSH_ENABLED). */
  pushEnabled: boolean;
  allowed: boolean;
  connected: boolean;
  /** MarketplaceAccount.status (ACTIVE | NEEDS_REAUTH | REVOKED) or null when no account exists. */
  status: string | null;
  hasAccount: boolean;
  needsReauth: boolean;
  missingScopes: string[];
  refreshExpiresSoon: boolean;
  shopId: string | null;
  shopName: string | null;
  shopCurrency: string | null;
  currencySupported: boolean;
  currencyMessage: string | null;
  setupComplete: boolean;
  defaultShippingProfileId: string | null;
  defaultReturnPolicyId: string | null;
  defaultReadinessStateId: string | null;
  connectedAt: string | null;
  etsyBusy: boolean;
  retryAt: string | null;
}

export const ETSY_DISABLED_CONNECTION: EtsyConnectionInfo = {
  enabled: false,
  pushEnabled: false,
  allowed: false,
  connected: false,
  status: null,
  hasAccount: false,
  needsReauth: false,
  missingScopes: [],
  refreshExpiresSoon: false,
  shopId: null,
  shopName: null,
  shopCurrency: null,
  currencySupported: true,
  currencyMessage: null,
  setupComplete: false,
  defaultShippingProfileId: null,
  defaultReturnPolicyId: null,
  defaultReadinessStateId: null,
  connectedAt: null,
  etsyBusy: false,
  retryAt: null,
};

export function normalizeEtsyConnection(data: unknown): EtsyConnectionInfo {
  const d: Rec = isRecord(data) ? data : {};
  const status = asString(d.status);
  const currency = asString(d.shopCurrency);
  const currencySupported = d.currencySupported === false ? false : currency === null || currency.toUpperCase() === 'USD';
  return {
    enabled: d.enabled !== false,
    pushEnabled: d.pushEnabled === true,
    allowed: d.allowed === true,
    connected: d.connected === true,
    status,
    hasAccount: status !== null,
    needsReauth: d.needsReauth === true,
    missingScopes: Array.isArray(d.missingScopes) ? d.missingScopes.filter((s): s is string => typeof s === 'string') : [],
    refreshExpiresSoon: d.refreshExpiresSoon === true,
    shopId: asString(d.shopId),
    shopName: asString(d.shopName),
    shopCurrency: currency,
    currencySupported,
    currencyMessage: currencySupported ? null : currency ? etsyCurrencyMessage(currency) : null,
    setupComplete: d.setupComplete === true,
    defaultShippingProfileId: asString(d.defaultShippingProfileId),
    defaultReturnPolicyId: asString(d.defaultReturnPolicyId),
    defaultReadinessStateId: asString(d.defaultReadinessStateId),
    connectedAt: asString(d.connectedAt),
    etsyBusy: d.etsyBusy === true,
    retryAt: asString(d.retryAt),
  };
}

/** True when the organizer must run the connect flow again (account problem or missing permissions). */
export function etsyNeedsReconnect(c: EtsyConnectionInfo): boolean {
  return c.hasAccount && (c.needsReauth || c.status !== 'ACTIVE' || c.missingScopes.length > 0);
}

// ---------------------------------------------------------------------------------------------
// Shop setup (GET /api/etsy/shop-setup), shape from etsyAuth.fetchEtsyShopSetupOptions.
// ---------------------------------------------------------------------------------------------

export interface EtsyOption {
  id: string;
  label: string;
}

export interface EtsySetupInfo {
  shippingProfiles: EtsyOption[];
  returnPolicies: EtsyOption[];
  processingProfiles: EtsyOption[];
  selected: { shipping: string | null; returnPolicy: string | null; processing: string | null };
  /** True when the shop has no shipping profile or no processing profile (we cannot create them). */
  needsEtsySideSetup: boolean;
  emptyMessage: string | null;
}

function normalizeOptions(list: unknown, labelKey: string): EtsyOption[] {
  if (!Array.isArray(list)) return [];
  const out: EtsyOption[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    if (!isRecord(row)) continue;
    const id = asIdString(row.id);
    if (!id) continue;
    out.push({ id, label: asString(row[labelKey]) ?? `Profile ${id}` });
  }
  return out;
}

export function normalizeEtsySetup(data: unknown): EtsySetupInfo {
  const d: Rec = isRecord(data) ? data : {};
  const sel: Rec = isRecord(d.selected) ? d.selected : {};
  const shippingProfiles = normalizeOptions(d.shippingProfiles, 'title');
  const returnPolicies = normalizeOptions(d.returnPolicies, 'label');
  const processingProfiles = normalizeOptions(d.processingProfiles, 'label');
  return {
    shippingProfiles,
    returnPolicies,
    processingProfiles,
    selected: {
      shipping: asIdString(sel.defaultShippingProfileId),
      returnPolicy: asIdString(sel.defaultReturnPolicyId),
      processing: asIdString(sel.defaultReadinessStateId),
    },
    needsEtsySideSetup: d.needsEtsySideSetup === true || shippingProfiles.length === 0 || processingProfiles.length === 0,
    emptyMessage: asString(d.emptyMessage),
  };
}

// ---------------------------------------------------------------------------------------------
// Panel state (Settings, Etsy tab).
// ---------------------------------------------------------------------------------------------

export type EtsyPanelKind =
  | 'loading'
  | 'error'
  | 'disabled'
  | 'not_allowed'
  | 'not_connected'
  | 'connecting'
  | 'needs_reconnect'
  | 'connected';

export interface EtsyPanelState {
  kind: EtsyPanelKind;
  /** Etsy is rate limited right now: show a soft banner, keep everything usable. */
  busy: boolean;
  /** Connected, but the shop is not USD. */
  currencyUnsupported: boolean;
  /** Connected with shipping, return and processing choices saved. */
  setupComplete: boolean;
  /** Connected, but the shop has no shipping or processing profile on Etsy yet. */
  setupEmpty: boolean;
  refreshExpiresSoon: boolean;
}

export function deriveEtsyPanelState(input: {
  isLoading: boolean;
  isError: boolean;
  connection: EtsyConnectionInfo | undefined;
  isStartingConnect: boolean;
  setup?: Pick<EtsySetupInfo, 'needsEtsySideSetup'> | null;
}): EtsyPanelState {
  const c = input.connection;
  const base = {
    busy: Boolean(c && c.enabled && c.etsyBusy),
    currencyUnsupported: Boolean(c && c.hasAccount && !c.currencySupported),
    setupComplete: Boolean(c && c.setupComplete),
    setupEmpty: Boolean(input.setup && input.setup.needsEtsySideSetup),
    refreshExpiresSoon: Boolean(c && c.connected && c.refreshExpiresSoon),
  };
  const kind = ((): EtsyPanelKind => {
    if (input.isStartingConnect) return 'connecting';
    if (input.isLoading || !c) return input.isError ? 'error' : 'loading';
    if (!c.enabled) return 'disabled';
    if (etsyNeedsReconnect(c)) return 'needs_reconnect';
    if (c.connected) return 'connected';
    if (!c.allowed) return 'not_allowed';
    return 'not_connected';
  })();
  return { kind, ...base };
}

/** The connect call returns { authorizeUrl }. Only Etsy's own sign-in address is followed. */
export function isSafeEtsyAuthorizeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    (u.hostname === 'www.etsy.com' || u.hostname === 'etsy.com') &&
    u.port === '' &&
    u.username === '' &&
    u.password === '' &&
    u.pathname === '/oauth/connect'
  );
}

// ---------------------------------------------------------------------------------------------
// Banner keys (callback page -> settings tab). Only whitelisted keys are ever shown.
// ---------------------------------------------------------------------------------------------

export function resolveEtsyBannerKey(etsy: unknown, reason: unknown): keyof typeof ETSY_BANNER_MESSAGES | null {
  const e = Array.isArray(etsy) ? etsy[0] : etsy;
  const r = Array.isArray(reason) ? reason[0] : reason;
  if (e === 'connected') return 'connected';
  if (e !== 'error') return null;
  if (typeof r === 'string' && Object.prototype.hasOwnProperty.call(ETSY_BANNER_MESSAGES, r) && r !== 'connected') {
    return r as keyof typeof ETSY_BANNER_MESSAGES;
  }
  return 'generic';
}

export function isEtsyErrorBanner(key: keyof typeof ETSY_BANNER_MESSAGES): boolean {
  return key !== 'connected';
}

// ---------------------------------------------------------------------------------------------
// Listing (GET /api/etsy/items/:id/listing). UNVERIFIED shape: built against ADR-135 D2 and the
// EtsyListing model while batch E-B3 was written in parallel. Accepts a bare row, { listing: row },
// null, or { listing: null }.
// ---------------------------------------------------------------------------------------------

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

const LISTING_STATES: readonly string[] = [
  'PREPARING',
  'DRAFT_PENDING',
  'DRAFT_READY',
  'PUBLISHING',
  'ACTIVE',
  'ENDED',
  'SOLD',
  'FAILED',
  'ORPHANED',
];

export interface EtsyListingInfo {
  state: EtsyListingState;
  failedStep: string | null;
  lastErrorMessage: string | null;
  etsyListingId: string | null;
  imagesUploaded: number;
  whenMade: string | null;
  isSupply: boolean;
  taxonomyId: number | null;
  shippingProfileId: string | null;
  returnPolicyId: string | null;
  readinessStateId: string | null;
  attestedAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
}

/**
 * The stored failure reason. The listing route returns it as `message` (the server fills in a fixed
 * per-step sentence when nothing was stored; those fallbacks are dropped here because the panel shows
 * its own sentence for the step), older shapes use `lastErrorMessage`.
 */
const SERVER_STEP_FALLBACKS: readonly string[] = [
  'Etsy could not create the draft. Try again.',
  'Etsy could not take the photos. Try again.',
  'Etsy could not publish the listing. Try again.',
  'Etsy could not update the listing. Try again.',
  'Etsy could not end the listing. Try again.',
  'Etsy could not complete this step. Try again, or contact support.',
];

function listingErrorDetail(row: Rec): string | null {
  const m = safeServerMessage(row, 'lastErrorMessage') ?? safeServerMessage(row, 'message');
  return m !== null && SERVER_STEP_FALLBACKS.indexOf(m) === -1 ? m : null;
}

export function normalizeEtsyListing(data: unknown): EtsyListingInfo | null {
  let row: unknown = data;
  if (isRecord(data) && 'listing' in data) row = data.listing;
  if (!isRecord(row)) return null;
  const state = asString(row.state);
  if (!state || LISTING_STATES.indexOf(state) === -1) return null;
  const images = asNumber(row.imagesUploaded);
  return {
    state: state as EtsyListingState,
    failedStep: asString(row.failedStep),
    lastErrorMessage: listingErrorDetail(row),
    etsyListingId: asString(row.etsyListingId),
    imagesUploaded: images !== null && images > 0 ? Math.floor(images) : 0,
    whenMade: asString(row.whenMade),
    isSupply: row.isSupply === true,
    taxonomyId: asNumber(row.taxonomyId),
    shippingProfileId: asIdString(row.shippingProfileId),
    returnPolicyId: asIdString(row.returnPolicyId),
    readinessStateId: asIdString(row.readinessStateId),
    attestedAt: asString(row.attestedAt),
    publishedAt: asString(row.publishedAt),
    expiresAt: asString(row.expiresAt),
  };
}

export type EtsyChipTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface EtsyChip {
  state: EtsyListingState;
  label: string;
  tone: EtsyChipTone;
  /** One short sentence under the chip. */
  detail: string;
}

export type EtsyListingMode =
  | 'form'
  | 'pending'
  | 'ready'
  | 'publishing'
  | 'live'
  | 'sold'
  | 'orphaned'
  | 'failed';

export type EtsyRetry = 'draft' | 'publish' | 'remove' | 'none';

export interface EtsyListingView {
  chip: EtsyChip | null;
  mode: EtsyListingMode;
  /** The page should poll every 2 s (subject to ETSY_POLL_MAX_MS). */
  polling: boolean;
  retry: EtsyRetry;
  /** Fixed sentence for a FAILED listing (plus the sanitized server detail, if any). */
  failureMessage: string | null;
  failureDetail: string | null;
}

const CHIP_TONES: Record<EtsyListingState, EtsyChipTone> = {
  PREPARING: 'neutral',
  DRAFT_PENDING: 'info',
  DRAFT_READY: 'warning',
  PUBLISHING: 'info',
  ACTIVE: 'success',
  ENDED: 'neutral',
  SOLD: 'success',
  FAILED: 'danger',
  ORPHANED: 'neutral',
};

function failureMessageFor(step: string | null): string {
  switch (step) {
    case 'CREATE':
    case 'IMAGES':
    case 'PUBLISH':
    case 'UPDATE':
    case 'DELETE':
      return ETSY_FAILED_STEP_MESSAGES[step];
    default:
      return ETSY_FAILED_STEP_MESSAGES.UNKNOWN;
  }
}

export function deriveEtsyListingView(listing: EtsyListingInfo | null): EtsyListingView {
  if (!listing) return { chip: null, mode: 'form', polling: false, retry: 'none', failureMessage: null, failureDetail: null };
  const s = listing.state;
  const detail = s === 'FAILED' ? failureMessageFor(listing.failedStep) : ETSY_STATUS_DETAILS[s];
  const chip: EtsyChip = { state: s, label: ETSY_STATUS_LABELS[s], tone: CHIP_TONES[s], detail };
  const none = { retry: 'none' as EtsyRetry, failureMessage: null, failureDetail: null };
  switch (s) {
    case 'PREPARING':
      return { chip, mode: 'form', polling: false, ...none };
    case 'DRAFT_PENDING':
      return { chip, mode: 'pending', polling: true, ...none };
    case 'DRAFT_READY':
      // A publish attempt that Etsy refused leaves the draft ready with the reason stored.
      return { chip, mode: 'ready', polling: false, retry: 'none', failureMessage: null, failureDetail: listing.lastErrorMessage };
    case 'PUBLISHING':
      return { chip, mode: 'publishing', polling: true, ...none };
    case 'ACTIVE':
      return { chip, mode: 'live', polling: false, ...none };
    case 'ENDED':
      return { chip, mode: 'form', polling: false, ...none };
    case 'SOLD':
      return { chip, mode: 'sold', polling: false, ...none };
    case 'ORPHANED':
      return { chip, mode: 'orphaned', polling: false, ...none };
    case 'FAILED': {
      const step = listing.failedStep;
      let retry: EtsyRetry = 'draft';
      if (step === 'PUBLISH') retry = listing.etsyListingId ? 'publish' : 'draft';
      else if (step === 'DELETE') retry = 'remove';
      else if (step === 'UPDATE') retry = 'none';
      return {
        chip,
        mode: 'failed',
        polling: false,
        retry,
        failureMessage: failureMessageFor(step),
        failureDetail: listing.lastErrorMessage,
      };
    }
    default:
      return { chip: null, mode: 'form', polling: false, ...none };
  }
}

export const ETSY_POLL_INTERVAL_MS = 2000;
/** Stop polling after 5 minutes; the server sweep resumes stuck drafts after 3 idle minutes (ADR D2.3). */
export const ETSY_POLL_MAX_MS = 5 * 60 * 1000;

export function shouldPollEtsyListing(state: string | null | undefined, elapsedMs: number): boolean {
  return (state === 'DRAFT_PENDING' || state === 'PUBLISHING') && elapsedMs < ETSY_POLL_MAX_MS;
}

// ---------------------------------------------------------------------------------------------
// Eligibility: local mirror of checkEtsyEligibility (backend etsyEligibility.ts) and the response of
// GET /api/etsy/items/:id/eligibility (UNVERIFIED shape: 200 { eligible: true } or 422
// { eligible: false, reason, code? }, the Discogs shape named in ADR-135 D2.3).
// ---------------------------------------------------------------------------------------------

export type EtsyEligibilityCode = 'OK' | 'NO_ERA' | 'ERA_TOO_RECENT' | 'CARD_YEAR_TOO_RECENT';

export interface EtsyEligibilityInfo {
  eligible: boolean;
  reason: string | null;
  code: EtsyEligibilityCode | null;
}

/** Copied from backend etsyEligibility.ts (ADR-135 D4.3). Drift is caught by etsyUiState.test.ts. */
export const ETSY_MSG_NO_ERA =
  'To list this item on Etsy, tell us when it was made. Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies.';

export function etsyMsgEraTooRecent(eraLabel: string): string {
  return `This item is marked as made in ${eraLabel}. Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies, so it cannot be listed on Etsy.`;
}

export function etsyMsgCardYearTooRecent(year: number): string {
  return `This card was released in ${year}. Etsy only accepts items that are 20 or more years old, so it cannot be listed on Etsy.`;
}

export function checkEtsyEligibilityLocal(
  input: { releaseYear?: number | null; whenMade?: string | null; isSupply?: boolean | null },
  asOfYear: number
): EtsyEligibilityInfo {
  const cutoff = asOfYear - 20;
  const year = typeof input.releaseYear === 'number' && isFinite(input.releaseYear) ? input.releaseYear : null;
  // Same order as the backend registry: a card's own release year decides alone.
  if (year !== null) {
    return year <= cutoff
      ? { eligible: true, reason: null, code: 'OK' }
      : { eligible: false, reason: etsyMsgCardYearTooRecent(year), code: 'CARD_YEAR_TOO_RECENT' };
  }
  if (input.isSupply === true) return { eligible: true, reason: null, code: 'OK' };
  const era = getEtsyEra(input.whenMade);
  if (!era) return { eligible: false, reason: ETSY_MSG_NO_ERA, code: 'NO_ERA' };
  if (era.maxYear !== null && era.maxYear <= cutoff) return { eligible: true, reason: null, code: 'OK' };
  return { eligible: false, reason: etsyMsgEraTooRecent(era.label), code: 'ERA_TOO_RECENT' };
}

export function normalizeEtsyEligibility(status: number, data: unknown): EtsyEligibilityInfo {
  const d: Rec = isRecord(data) ? data : {};
  const eligible = status >= 200 && status < 300 && d.eligible !== false;
  const code = asString(d.code);
  const knownCodes: readonly string[] = ['OK', 'NO_ERA', 'ERA_TOO_RECENT', 'CARD_YEAR_TOO_RECENT'];
  return {
    eligible,
    reason: eligible ? null : safeServerMessage(d, 'reason'),
    code: code && knownCodes.indexOf(code) !== -1 ? (code as EtsyEligibilityCode) : null,
  };
}

/** An ineligible answer that only means "tell us the era first", which the modal collects. */
export function isNoEraEligibility(e: EtsyEligibilityInfo | null | undefined): boolean {
  if (!e || e.eligible) return false;
  if (e.code) return e.code === 'NO_ERA';
  return typeof e.reason === 'string' && e.reason.indexOf('tell us when it was made') !== -1;
}

// ---------------------------------------------------------------------------------------------
// Per-item section (edit-item page): what to draw.
// ---------------------------------------------------------------------------------------------

export type EtsySectionKind =
  | 'hidden'
  | 'reconnect'
  | 'blocked'
  | 'ineligible'
  | 'prepare'
  | 'status';

export interface EtsySectionState {
  kind: EtsySectionKind;
  message: string | null;
  /** Label for the button that opens the modal (null: no button). */
  buttonLabel: string | null;
  /** A hint under the button (the era question when nothing was attested yet). */
  hint: string | null;
}

export function deriveEtsySection(input: {
  connection: EtsyConnectionInfo | undefined;
  eligibility: EtsyEligibilityInfo | null;
  listing: EtsyListingInfo | null;
  labels: {
    prepare: string;
    seeProgress: string;
    reviewAndPublish: string;
    viewDetails: string;
    fixAndRetry: string;
    pushPaused: string;
  };
}): EtsySectionState {
  const hidden: EtsySectionState = { kind: 'hidden', message: null, buttonLabel: null, hint: null };
  const c = input.connection;
  if (!c || !c.enabled || !c.hasAccount) return hidden;
  if (!c.allowed) return hidden;
  if (etsyNeedsReconnect(c)) return { kind: 'reconnect', message: ETSY_PANEL_COPY.needsReconnect, buttonLabel: null, hint: null };

  const view = deriveEtsyListingView(input.listing);
  if (input.listing && view.mode !== 'form') {
    const label =
      view.mode === 'pending' || view.mode === 'publishing'
        ? input.labels.seeProgress
        : view.mode === 'ready'
          ? input.labels.reviewAndPublish
          : view.mode === 'failed'
            ? input.labels.fixAndRetry
            : view.mode === 'live'
              ? input.labels.viewDetails
              : null;
    return { kind: 'status', message: null, buttonLabel: label, hint: null };
  }
  if (!c.currencySupported && c.currencyMessage) return { kind: 'blocked', message: c.currencyMessage, buttonLabel: null, hint: null };
  if (!c.pushEnabled) return { kind: 'blocked', message: input.labels.pushPaused, buttonLabel: null, hint: null };

  const e = input.eligibility;
  if (e && !e.eligible && !isNoEraEligibility(e)) {
    return { kind: 'ineligible', message: e.reason, buttonLabel: null, hint: null };
  }
  return {
    kind: 'prepare',
    message: null,
    buttonLabel: input.labels.prepare,
    hint: e && isNoEraEligibility(e) ? e.reason : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Item facts the modal needs (passed in by the page; the server re-reads everything itself).
// ---------------------------------------------------------------------------------------------

export interface EtsyItemInput {
  id: string;
  title?: string | null;
  description?: string | null;
  /** Item.price may arrive as a number or a decimal string. */
  price?: number | string | null;
  tags?: readonly string[] | null;
  condition?: string | null;
  conditionGrade?: string | null;
  photoUrls?: readonly string[] | null;
  stockTotal?: number | null;
  stockSold?: number | null;
  /** Card release year (Item.card.releaseYear, ADR-134) when the item is a card. */
  releaseYear?: number | null;
}

/** Mirrors ETSY_CONDITION_LABELS and ETSY_GRADE_LABELS in backend etsyMapping.ts (ADR-135 D3.2). */
const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New',
  USED: 'Pre-owned',
  REFURBISHED: 'Refurbished',
  PARTS_OR_REPAIR: 'For parts or repair',
};
const GRADE_LABELS: Record<string, string> = {
  S: 'Excellent',
  A: 'Excellent',
  B: 'Very good',
  C: 'Good',
  D: 'Acceptable',
};

const SCHEME_URL_RE = /\b(?:https?|ftp):\/\/\S+/gi;
const WWW_URL_RE = /\bwww\.\S+/gi;
const EMAIL_RE = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g;
const BARE_DOMAIN_RE =
  /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:com|net|org|io|co|us|uk|biz|info|shop|store|site|online|app|me|ca|au|de|sale)\b(?:\/\S*)?/gi;
const BRAND_RE = /\bfinda\.?sale\b/gi;

function previewDescription(raw: string | null | undefined): string {
  let t = String(raw ?? '').replace(/\r\n?/g, '\n');
  t = t.replace(SCHEME_URL_RE, ' ').replace(WWW_URL_RE, ' ').replace(EMAIL_RE, ' ').replace(BARE_DOMAIN_RE, ' ').replace(BRAND_RE, ' ');
  const lines = t.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function previewConditionLine(item: EtsyItemInput): string {
  const parts: string[] = [];
  // Read the normalized condition, as the backend does (buildEtsyConditionLine): legacy LIKE_NEW, GOOD, FAIR, POOR and
  // casing fold onto the canonical four, so the preview shows the same Condition line the listing will carry.
  const canonicalCondition = normalizeCondition(item.condition).condition;
  const cond = canonicalCondition ? CONDITION_LABELS[canonicalCondition] : undefined;
  if (cond) parts.push(`Condition: ${cond}.`);
  const grade = item.conditionGrade ? String(item.conditionGrade).trim() : '';
  if (grade) {
    const label = GRADE_LABELS[grade.toUpperCase()];
    parts.push(label ? `Grade: ${grade} (${label}).` : `Grade: ${grade}.`);
  }
  return parts.join(' ');
}

/** Units to list: stockTotal minus stockSold when stockTotal > 1, else 1 (backend computeEtsyQuantity). */
export function etsyPreviewQuantity(item: Pick<EtsyItemInput, 'stockTotal' | 'stockSold'>): number {
  const total = item.stockTotal;
  if (typeof total !== 'number' || !isFinite(total) || total <= 1) return 1;
  const sold = typeof item.stockSold === 'number' && isFinite(item.stockSold) && item.stockSold > 0 ? item.stockSold : 0;
  return Math.max(0, Math.min(Math.floor(total - sold), 999));
}

export function formatEtsyPrice(price: number | string | null | undefined): string | null {
  const n = asNumber(price);
  if (n === null || n <= 0) return null;
  return `$${n.toFixed(2)}`;
}

function capChars(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join('').trimEnd();
}

export function isSafePhotoUrl(u: unknown): u is string {
  return typeof u === 'string' && /^https:\/\//i.test(u) && u.length <= 2048;
}

export interface EtsyPreview {
  title: string;
  priceText: string | null;
  quantity: number;
  tags: string[];
  description: string;
  photoUrls: string[];
  /** Photos in the item, before the 20 limit. */
  photoCount: number;
}

export function buildEtsyPreview(item: EtsyItemInput): EtsyPreview {
  const title = capChars(String(item.title ?? '').replace(/\s+/g, ' ').trim(), ETSY_MAX_TITLE_LEN);
  const tags: string[] = [];
  const raw = item.tags ?? [];
  for (let i = 0; i < raw.length && tags.length < ETSY_MAX_TAGS; i += 1) {
    const t = capChars(String(raw[i] ?? '').replace(/\s+/g, ' ').trim(), ETSY_MAX_TAG_LEN);
    if (t && tags.map((x) => x.toLowerCase()).indexOf(t.toLowerCase()) === -1) tags.push(t);
  }
  const body = previewDescription(item.description);
  const cond = previewConditionLine(item);
  const photos = (item.photoUrls ?? []).filter(isSafePhotoUrl);
  return {
    title,
    priceText: formatEtsyPrice(item.price),
    quantity: etsyPreviewQuantity(item),
    tags,
    description: [body, cond].filter((p) => p.length > 0).join('\n\n'),
    photoUrls: photos.slice(0, ETSY_MAX_PHOTOS),
    photoCount: photos.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Draft form: what blocks it, what is missing, and the request body.
// ---------------------------------------------------------------------------------------------

export interface EtsyDraftFormValues {
  whenMade: string;
  isSupply: boolean;
  taxonomyId: number | null;
  shippingProfileId: string;
  returnPolicyId: string;
  readinessStateId: string;
  attested: boolean;
}

export interface EtsyDraftProblems {
  /** Plain-word reasons the organizer cannot go ahead from this window. */
  blocking: string[];
  /** Short names of form fields still to complete (see ETSY_MISSING_LABELS). */
  missing: string[];
  eligibility: EtsyEligibilityInfo;
  canSubmit: boolean;
}

export function getEtsyDraftProblems(args: {
  item: EtsyItemInput;
  connection: EtsyConnectionInfo | undefined;
  form: EtsyDraftFormValues;
  asOfYear: number;
}): EtsyDraftProblems {
  const { item, connection: c, form } = args;
  const blocking: string[] = [];
  const missing: string[] = [];

  if (!c || !c.enabled) blocking.push(ETSY_PROBLEM_MESSAGES.disabled);
  else if (!c.hasAccount) blocking.push(ETSY_PROBLEM_MESSAGES.notConnected);
  else if (etsyNeedsReconnect(c)) blocking.push(ETSY_PROBLEM_MESSAGES.needsReconnect);
  else {
    if (!c.allowed) blocking.push(ETSY_PROBLEM_MESSAGES.notAllowed);
    if (!c.currencySupported && c.currencyMessage) blocking.push(c.currencyMessage);
    if (!c.pushEnabled) blocking.push(ETSY_PROBLEM_MESSAGES.pushPaused);
  }

  const preview = buildEtsyPreview(item);
  if (!preview.title) blocking.push(ETSY_PROBLEM_MESSAGES.titleMissing);
  if (!preview.priceText) blocking.push(ETSY_PROBLEM_MESSAGES.priceMissing);
  if (preview.photoUrls.length === 0 && preview.photoCount === 0) blocking.push(ETSY_PROBLEM_MESSAGES.noPhotos);
  if (preview.quantity === 0) blocking.push(ETSY_PROBLEM_MESSAGES.soldOut);

  const eligibility = checkEtsyEligibilityLocal(
    { releaseYear: item.releaseYear ?? null, whenMade: form.whenMade || null, isSupply: form.isSupply },
    args.asOfYear
  );
  if (!eligibility.eligible && eligibility.code !== 'NO_ERA' && eligibility.reason) blocking.push(eligibility.reason);

  const eraOk = Boolean(getEtsyEra(form.whenMade)) && etsyEraOptionsFor(form.isSupply, args.asOfYear).some((o) => o.value === form.whenMade);
  if (!eraOk) missing.push(ETSY_MISSING_LABELS.era);
  if (form.taxonomyId === null) missing.push(ETSY_MISSING_LABELS.category);
  if (!form.shippingProfileId) missing.push(ETSY_MISSING_LABELS.shipping);
  if (!form.readinessStateId) missing.push(ETSY_MISSING_LABELS.processing);
  if (!form.attested) missing.push(ETSY_MISSING_LABELS.attestation);

  return { blocking, missing, eligibility, canSubmit: blocking.length === 0 && missing.length === 0 };
}

export interface EtsyDraftRequestBody {
  whenMade: string;
  isSupply: boolean;
  taxonomyId: number;
  shippingProfileId: string;
  returnPolicyId?: string;
  readinessStateId: string;
  attest: true;
}

/** Body for POST /api/etsy/items/:id/draft (ADR-135 D2.3). Never carries title, price, ids of listings or shops. */
export function buildEtsyDraftRequest(form: EtsyDraftFormValues): EtsyDraftRequestBody | null {
  if (!form.attested || form.taxonomyId === null || !form.whenMade || !form.shippingProfileId || !form.readinessStateId) return null;
  const body: EtsyDraftRequestBody = {
    whenMade: form.whenMade,
    isSupply: form.isSupply,
    taxonomyId: form.taxonomyId,
    shippingProfileId: form.shippingProfileId,
    readinessStateId: form.readinessStateId,
    attest: true,
  };
  if (form.returnPolicyId) body.returnPolicyId = form.returnPolicyId;
  return body;
}

/** Starting form values, from a saved listing when there is one, else from the shop defaults. */
export function initialEtsyDraftForm(
  listing: EtsyListingInfo | null,
  connection: EtsyConnectionInfo | undefined
): EtsyDraftFormValues {
  return {
    whenMade: listing?.whenMade ?? '',
    isSupply: listing?.isSupply ?? false,
    taxonomyId: listing?.taxonomyId ?? null,
    shippingProfileId: listing?.shippingProfileId ?? connection?.defaultShippingProfileId ?? '',
    returnPolicyId: listing?.returnPolicyId ?? connection?.defaultReturnPolicyId ?? '',
    readinessStateId: listing?.readinessStateId ?? connection?.defaultReadinessStateId ?? '',
    attested: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Etsy categories (GET /api/etsy/taxonomy/suggest?itemId=). UNVERIFIED shape (batch E-B3). Accepts
// { suggested | suggestion, nodes | leaves | results | options } with nodes shaped
// { id | taxonomyId | nodeId, name, fullPath | path }, or a bare array of nodes. Only leaf nodes
// are offered because Etsy's acceptance of a non-leaf taxonomy_id is UNVERIFIED (ADR-135 D3.1).
// ---------------------------------------------------------------------------------------------

export interface EtsyCategoryNode {
  id: number;
  name: string;
  fullPath: string;
}

export interface EtsyCategoryOptions {
  suggested: EtsyCategoryNode | null;
  leaves: EtsyCategoryNode[];
}

function normalizeNode(v: unknown): EtsyCategoryNode | null {
  if (!isRecord(v)) return null;
  if (v.isLeaf === false) return null;
  const id = asNumber(v.id ?? v.taxonomyId ?? v.nodeId);
  if (id === null || !Number.isInteger(id) || id <= 0 || id > 2147483647) return null;
  const name = asString(v.name);
  const path = asString(v.fullPath) ?? asString(v.path);
  if (!name && !path) return null;
  return { id, name: name ?? (path as string), fullPath: path ?? (name as string) };
}

export function normalizeEtsyCategories(data: unknown): EtsyCategoryOptions {
  let list: unknown = null;
  let suggestedRaw: unknown = null;
  let suggestedList: unknown[] = [];
  if (Array.isArray(data)) list = data;
  else if (isRecord(data)) {
    suggestedRaw = data.suggested ?? data.suggestion ?? null;
    if (Array.isArray(suggestedRaw)) {
      suggestedList = suggestedRaw;
      suggestedRaw = null;
    }
    list = data.nodes ?? data.leaves ?? data.results ?? data.options ?? null;
  }
  const leaves: EtsyCategoryNode[] = [];
  const seen: Record<string, boolean> = {};
  let firstSuggested: EtsyCategoryNode | null = null;
  for (let i = 0; i < suggestedList.length; i += 1) {
    const n = normalizeNode(suggestedList[i]);
    if (n && !seen[String(n.id)]) {
      seen[String(n.id)] = true;
      leaves.push(n);
      if (!firstSuggested) firstSuggested = n;
    }
  }
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i += 1) {
      const n = normalizeNode(list[i]);
      if (n && !seen[String(n.id)]) {
        seen[String(n.id)] = true;
        leaves.push(n);
      }
    }
  }
  let suggested = firstSuggested ?? normalizeNode(suggestedRaw);
  if (!suggested && typeof suggestedRaw === 'number') {
    suggested = leaves.filter((l) => l.id === suggestedRaw)[0] ?? null;
  }
  if (suggested && !seen[String(suggested.id)]) {
    leaves.unshift(suggested);
  }
  return { suggested, leaves };
}

/** Case-insensitive match on the full path; every word typed must appear. The suggested node sorts first. */
export function filterEtsyCategories(
  options: EtsyCategoryOptions,
  query: string,
  limit: number = 50
): EtsyCategoryNode[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const hits = options.leaves.filter((n) => {
    const hay = n.fullPath.toLowerCase();
    return words.every((w) => hay.indexOf(w) !== -1);
  });
  const sid = options.suggested ? options.suggested.id : -1;
  hits.sort((a, b) => (a.id === sid ? -1 : b.id === sid ? 1 : 0));
  return hits.slice(0, limit);
}

export function formatEtsyDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
