/**
 * eBay item push service (item editor unification, Wave 2, U1/U2/U4).
 *
 * Extracted from the fire-and-forget push-on-save block that used to live inside itemController.updateItem
 * (Feature #244 Phase 4). It owns three things:
 *
 *   1. computeEbayPushFields: which fields REALLY changed (existing row vs patch). The old block derived the
 *      list from request-body key PRESENCE, so every save re-pushed price and condition. An unchanged-field
 *      save now makes zero eBay calls (intended behavior change).
 *   2. pushItemToEbay: the GET-merge-PUT-republish dance, returning a structured outcome and recording one
 *      ItemMarketplacePush row per attempt (pruned to the last 20 per item). It never throws.
 *   3. buildEbayPlan / buildExtensionPlan: the "what WILL be pushed" plan the PUT /items/:id response carries.
 *
 * Unchanged on purpose: ebayPublishService internals, ensureConditionValidForCategory (called with the
 * desired enum computed BEFORE it, per the unified table in utils/conditionMapping.ts), the lock list, and the
 * price push-first cycle (ebaySyncState / ebayPriceSyncedAt are written by updateItem and the cron exactly as
 * before; this service never touches them).
 *
 * Security: errorMessage is built from controlled codes plus sanitizePushErrorMessage output. Tokens, auth
 * headers, proxy secrets, URLs, long opaque strings and raw JSON payloads are never stored or returned.
 */

import { isInformationalPushCode } from '../lib/ebayPushInformational';
import { loadKitComponentLines, withKitIncludes } from './itemKitListing'; // 2026-10-13: a kit's live eBay description keeps its Includes list
import { prisma } from '../lib/prisma';
import { ebayPublishWithSelfHeal, ensureConditionValidForCategory, getRequiredAspectsForCategory } from './ebayPublishService';
import { applyFccIdAspect } from '../utils/ebayFccAspect'; // FCC ID item specific, shared with the first-publish path
import { normalizeFccId } from '../utils/fccId';
import { mergeEbayIdentifiers, resolveMpnRequired, normalizeIdentifier, EBAY_IDENTIFIER_FIELDS, type EbayIdentifierField } from '../utils/ebayIdentifierMerge'; // brand, mpn, upc, ean, isbn on a live listing
import { desiredEbayCondition, buildEbayConditionDescription } from '../utils/conditionMapping';
import { findBulkLotItemIds } from './bulkLot/bulkLotService'; // ADR-136 Addendum C (#659)
import { isBulkLotsEnabled } from './bulkLot/bulkLotConfig';

// fccId (2026-10-11): an FCC ID added or edited after the item went live is sent as the "FCC ID" item specific. It is
// deliberately NOT in EBAY_CONTENT_FIELDS (no pull-sync dirty flag, no hold-release coupling).
//
// brand, mpn, upc, ean, isbn (2026-10-11): product identifiers edited after the item went live, merged into the live
// inventory item by utils/ebayIdentifierMerge.ts (same GET, merge, PUT, republish path as fccId). Not content fields either.
// quantity (2026-10-13): the ONE in-stock number (inStockOf). Not a content field. It is never sent from here directly: the
// quantity branch of pushItemToEbay calls services/inventoryStockSync (syncItemStockForPush), which owns the hold, rate limit,
// stale-overwrite and zero-stock rules.
export const EBAY_PUSH_FIELDS = ['title', 'description', 'condition', 'price', 'quantity', 'shipping', 'fccId', 'brand', 'mpn', 'upc', 'ean', 'isbn'] as const;
export type EbayPushField = (typeof EBAY_PUSH_FIELDS)[number];
/** The fields the pull-sync cron would otherwise overwrite from eBay (guarded by ebayContentDirtyAt). */
export const EBAY_CONTENT_FIELDS = ['title', 'description', 'condition'] as const;

export type EbayPushTrigger = 'SAVE' | 'REPUSH' | 'RETRY';
export type EbayPushStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED_HELD' | 'SKIPPED_NOT_LISTED';

export interface EbayPushOutcome {
  status: EbayPushStatus;
  fieldsAttempted: string[];
  fieldsPushed: string[];
  errorCode: string | null;
  /** Sanitized, at most 500 characters. Never a token, auth header or raw eBay payload. */
  errorMessage: string | null;
}

/** ItemMarketplacePush rows kept per item. */
export const PUSH_HISTORY_LIMIT = 20;
export const PUSH_ERROR_MESSAGE_MAX = 500;

// ---------------------------------------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------------------------------------

/** Shown instead of any message that is the shape of an internal failure (database client, stack, SQL, server path). */
export const INTERNAL_ERROR_TEXT = 'An internal error occurred. Try again, and contact support if it keeps happening.';

/**
 * Text that only an internal failure produces: a database client error, a stack frame, SQL, a source or server path.
 * A message of this shape is never stored or shown, whatever else it says (a Prisma connection error carries the
 * database host and port; an invocation error carries source code). SQL is matched case-sensitively so ordinary
 * English ("select a category from the list") is not mistaken for it.
 */
const INTERNAL_SHAPE =
  /prisma|invocation|\bP[12]\d{3}\b|SQLSTATE|can't reach database|\n\s*at\s|\bat\s+[^\n(]*\([^)\n]*:\d+:\d+\)|\.(?:[cm]?[jt]sx?):\d+|node_modules|\b[a-z]:\\|\/(?:app|home|usr|var|opt|srv|root)\//i;
const SQL_SHAPE = /\bSELECT\b[^]{0,200}\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+["`]|\bDELETE\s+FROM\b|\bWHERE\s+["`]/;

/** Keys whose value is a credential: the value is removed wherever the key appears as key: value or key=value. */
const SECRET_KEY =
  '(?:[\\w-]*(?:token|secret|passw(?:or)?d|pwd|credential|api[_-]?key|private[_-]?key)[\\w-]*)';

/**
 * Makes an error string safe to store and show. Strings only (an object is never serialized). A message shaped like
 * an internal failure (Prisma, stack, SQL, server path) is replaced wholesale by INTERNAL_ERROR_TEXT. Otherwise it
 * removes bearer tokens, auth and secret key/value pairs, cookies, eBay user tokens, every URI (https, postgresql,
 * redis, ...), user:password@host, IP addresses and host:port pairs, JSON payload fragments and long opaque strings,
 * strips control and bidirectional-override characters, collapses whitespace and truncates to PUSH_ERROR_MESSAGE_MAX.
 * Returns null for empty input.
 */
export function sanitizePushErrorMessage(raw: unknown, max: number = PUSH_ERROR_MESSAGE_MAX): string | null {
  let s = '';
  if (typeof raw === 'string') s = raw;
  else if (raw instanceof Error) s = raw.message;
  if (!s) return null;

  // Internal-failure shapes are judged on the raw text (newlines still intact for stack frames).
  if (INTERNAL_SHAPE.test(s) || SQL_SHAPE.test(s)) return INTERNAL_ERROR_TEXT;

  // Control characters (except tab, CR, LF, collapsed next) and bidirectional/zero-width controls never survive.
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, '');
  s = s.replace(/[\r\n\t]+/g, ' ');
  // eBay user access tokens look like v^1.1#i^1#... (before the Bearer rule, so a Bearer token is removed whole).
  s = s.replace(/v\^1\.1#[^\s"']+/g, '[redacted]');
  // Bearer / Basic credentials anywhere in the text: the whole non-space run after the scheme word.
  s = s.replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[redacted]');
  // Cookie headers: every cookie after the first is part of the value, so the rest of the text goes.
  s = s.replace(/["']?(?:set-)?cookie["']?\s*[:=].*$/i, '[redacted]');
  // Authorization header with any scheme: the scheme word and the credential.
  s = s.replace(/["']?(?:proxy-)?authorization["']?\s*[:=]\s*(?:\[redacted\]\S*|\S+(?:\s+\S+)?)/gi, '[redacted]');
  // key: value or key=value pairs that carry credentials (header dumps, query strings, JSON-ish fragments). The value is
  // a quoted string (spaces allowed) or a bare run.
  s = s.replace(
    new RegExp(`["']?${SECRET_KEY}["']?\\s*[:=]\\s*(?:"[^"]*"|'[^']*'|[^\\s,;"'}]+)`, 'gi'),
    '[redacted]'
  );
  // Every URI, not only http(s): a postgresql:// or redis:// string can carry host, port and password.
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"')]+/gi, '[link]');
  // user:password@host without a scheme, IPv4 addresses (with port) and host:port pairs (internal infrastructure).
  s = s.replace(/[\w.~%-]+:[^\s@/]+@[\w.-]+/g, '[redacted]');
  s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, '[host]');
  s = s.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+:\d{2,5}\b/gi, '[host]');
  // JSON fragments: drop innermost {...} blocks repeatedly (handles nesting), then any leftover array blobs.
  for (let i = 0; i < 6 && /\{[^{}]*\}/.test(s); i++) s = s.replace(/\{[^{}]*\}/g, '[details omitted]');
  s = s.replace(/\[[^\][]{80,}\]/g, '[details omitted]');
  if (/[{}]/.test(s)) s = s.replace(/[{}]/g, '');
  // Long opaque strings (tokens, hashes, base64).
  s = s.replace(/[A-Za-z0-9+/_=-]{32,}/g, '[redacted]');
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}

// ---------------------------------------------------------------------------------------------------------
// Real-change diff and plan
// ---------------------------------------------------------------------------------------------------------

type DiffExisting = {
  stockTotal?: number | null;
  stockSold?: number | null;
  title?: string | null;
  description?: string | null;
  condition?: string | null;
  conditionGrade?: string | null;
  price?: unknown;
  fccId?: string | null;
  brand?: string | null;
  mpn?: string | null;
  upc?: string | null;
  ean?: string | null;
  isbn?: string | null;
};
type DiffNext = {
  /** The in-stock number after the edit (stockTotal - stockSold). undefined means "not provided". */
  inStock?: number | null;
  title?: string | null;
  description?: string | null;
  condition?: string | null;
  conditionGrade?: string | null;
  price?: unknown;
  fccId?: string | null;
  brand?: string | null;
  mpn?: string | null;
  upc?: string | null;
  ean?: string | null;
  isbn?: string | null;
};

const blank = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function priceNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * The eBay-pushable fields that REALLY changed. A next value of undefined means "not provided" (untouched).
 *   title       changed and non-empty
 *   description changed
 *   condition   the condition changed OR the desired eBay enum changed (a grade change can move the enum),
 *               and the effective condition is set (the old block also required a condition)
 *   price       changed by at least half a cent (and the new price is not null), or priceReopen (the organizer
 *               resaved an item whose price sync is parked in a failed state: the old behavior re-pushed)
 *   shipping    package inputs changed (shippingInputsChanged), pushed through the shipping policy resync
 */
export function computeEbayPushFields(
  existing: DiffExisting,
  next: DiffNext,
  opts: { priceReopen?: boolean; shippingInputsChanged?: boolean } = {}
): EbayPushField[] {
  const fields: EbayPushField[] = [];

  if (next.title !== undefined && blank(next.title).length > 0 && blank(next.title) !== blank(existing.title)) {
    fields.push('title');
  }
  if (next.description !== undefined && blank(next.description) !== blank(existing.description)) {
    fields.push('description');
  }

  const nextCondition = next.condition !== undefined ? next.condition : existing.condition;
  const nextGrade = next.conditionGrade !== undefined ? next.conditionGrade : existing.conditionGrade;
  if (blank(nextCondition).length > 0) {
    const conditionChanged = next.condition !== undefined && blank(next.condition) !== blank(existing.condition);
    const enumChanged =
      desiredEbayCondition(existing.condition, existing.conditionGrade) !== desiredEbayCondition(nextCondition, nextGrade);
    if (conditionChanged || enumChanged) fields.push('condition');
  }

  if (next.price !== undefined) {
    const nextNum = priceNumber(next.price);
    const curNum = priceNumber(existing.price);
    if (nextNum !== null) {
      const changed = curNum === null ? true : Math.abs(nextNum - curNum) >= 0.005;
      if (changed || opts.priceReopen) fields.push('price');
    }
  } else if (opts.priceReopen && priceNumber(existing.price) !== null) {
    fields.push('price');
  }

  // quantity: the one in-stock number changed (stockTotal - stockSold). Needs the existing stock to compare against.
  if (next.inStock !== undefined && next.inStock !== null && (existing.stockTotal !== undefined || existing.stockSold !== undefined)) {
    const curInStock = Math.max((existing.stockTotal ?? 1) - (existing.stockSold ?? 0), 0);
    if (next.inStock !== curInStock) fields.push('quantity');
  }

  // fccId: a non-empty FCC ID that differs from the stored one. Clearing one (null / empty) never pushes: eBay's
  // existing "FCC ID" aspect is left untouched, the same way a cleared brand or MPN is never pushed.
  if (next.fccId !== undefined) {
    const nextFcc = normalizeFccId(next.fccId);
    if (nextFcc && nextFcc !== normalizeFccId(existing.fccId)) fields.push('fccId');
  }

  // brand, mpn, upc, ean, isbn: any real change after trimming, INCLUDING a clear. A clear is pushed so upc / ean can be
  // removed and so a cleared brand / mpn / isbn is reported (pushItemToEbay leaves eBay's brand, and a required mpn / isbn,
  // untouched and says so). next === undefined means "not provided".
  for (const f of EBAY_IDENTIFIER_FIELDS) {
    if (next[f] === undefined) continue;
    if ((normalizeIdentifier(next[f]) ?? '') !== (normalizeIdentifier(existing[f]) ?? '')) fields.push(f);
  }

  if (opts.shippingInputsChanged) fields.push('shipping');
  return fields;
}

export type EbayPlanReason = 'not_listed' | 'no_offer_id' | 'held' | 'no_changes';

export interface MarketplacePlan {
  ebay: { willPush: boolean; fields: string[]; reason?: EbayPlanReason };
  extension: Array<{ platform: string; message: string; fields: string[] }>;
}

/**
 * Plan for the eBay side. `held` means the save asked to skip marketplaces or the item is already on hold.
 * When held, willPush is false and `fields` lists what will be held back instead.
 */
export function buildEbayPlan(args: {
  ebayOfferId?: string | null;
  ebayListingId?: string | null;
  held: boolean;
  changedFields: string[];
}): MarketplacePlan['ebay'] {
  const { ebayOfferId, ebayListingId, held, changedFields } = args;
  if (!ebayOfferId && !ebayListingId) return { willPush: false, fields: [], reason: 'not_listed' };
  if (held) return { willPush: false, fields: changedFields, reason: 'held' };
  if (!ebayOfferId) return { willPush: false, fields: changedFields, reason: 'no_offer_id' };
  if (changedFields.length === 0) return { willPush: false, fields: [], reason: 'no_changes' };
  return { willPush: true, fields: changedFields };
}

export const EXTENSION_PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  CRAIGSLIST: 'Craigslist',
  GUMTREE_AU: 'Gumtree AU',
  POSHMARK: 'Poshmark',
  MERCARI: 'Mercari',
  VINTED: 'Vinted',
  GRAILED: 'Grailed',
};

/** The fields whose change should prompt a manual update on an extension marketplace. */
const EXTENSION_RELEVANT_FIELDS = new Set(['title', 'description', 'condition', 'price']);

/** Prompt-only plan for extension marketplaces: listed there plus a relevant change = needs a manual update. */
export function buildExtensionPlan(
  listedPlatforms: Iterable<string>,
  changedFields: string[]
): MarketplacePlan['extension'] {
  const relevant = changedFields.filter((f) => EXTENSION_RELEVANT_FIELDS.has(f));
  if (relevant.length === 0) return [];
  const out: MarketplacePlan['extension'] = [];
  for (const platform of listedPlatforms) {
    const label = EXTENSION_PLATFORM_LABELS[platform] ?? platform;
    out.push({ platform, message: `Needs manual update on ${label}`, fields: relevant });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// History rows
// ---------------------------------------------------------------------------------------------------------

type PushRowInput = {
  itemId: string;
  organizerId: string;
  trigger: EbayPushTrigger;
  startedAt: Date;
  outcome: EbayPushOutcome;
};

/** Writes one ItemMarketplacePush row and prunes the item to its newest PUSH_HISTORY_LIMIT rows. Never throws. */
async function recordPushRow(input: PushRowInput): Promise<void> {
  try {
    const { itemId, organizerId, trigger, startedAt, outcome } = input;
    await prisma.itemMarketplacePush.create({
      data: {
        itemId,
        organizerId,
        platform: 'EBAY',
        trigger,
        fieldsAttempted: outcome.fieldsAttempted,
        fieldsPushed: outcome.fieldsPushed,
        status: outcome.status,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage ? outcome.errorMessage.slice(0, PUSH_ERROR_MESSAGE_MAX) : null,
        startedAt,
        finishedAt: new Date(),
      },
    });
    const stale = await prisma.itemMarketplacePush.findMany({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
      skip: PUSH_HISTORY_LIMIT,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.itemMarketplacePush.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
    }
  } catch (err) {
    console.warn(`[eBay PushSync] could not record push row for item ${input.itemId}:`, (err as Error).message);
  }
}

/**
 * After a successful push: acknowledge earlier FAILED or PARTIAL rows whose attempted fields this push has now
 * covered, so the Add Items list badge clears ("a later push succeeds"). Never throws.
 */
async function ackCoveredFailures(itemId: string, organizerId: string, pushed: string[]): Promise<void> {
  try {
    const open = await prisma.itemMarketplacePush.findMany({
      where: { itemId, organizerId, platform: 'EBAY', status: { in: ['FAILED', 'PARTIAL'] }, acknowledgedAt: null },
      select: { id: true, fieldsAttempted: true },
    });
    const covered = open.filter((r) => r.fieldsAttempted.every((f) => pushed.includes(f))).map((r) => r.id);
    if (covered.length > 0) {
      await prisma.itemMarketplacePush.updateMany({
        where: { id: { in: covered } },
        data: { acknowledgedAt: new Date() },
      });
    }
  } catch (err) {
    console.warn(`[eBay PushSync] could not acknowledge covered failures for item ${itemId}:`, (err as Error).message);
  }
}

/**
 * Race-safe bookkeeping. A save that lands while a push is in flight sets ebayContentDirtyAt (or edits the item while it
 * is held) AFTER this push read the row. Clearing unconditionally would erase that newer protection, and the pull-sync
 * cron would then overwrite the organizer's newest edit with eBay's older value if its own push failed. So each clear
 * is a conditional updateMany: it only matches when nothing newer than this push's start exists.
 */
async function clearDirtyUnlessSetSince(itemId: string, startedAt: Date): Promise<void> {
  await prisma.item.updateMany({
    where: { id: itemId, OR: [{ ebayContentDirtyAt: null }, { ebayContentDirtyAt: { lte: startedAt } }] },
    data: { ebayContentDirtyAt: null },
  });
}

async function releaseHoldUnlessEditedSince(itemId: string, startedAt: Date): Promise<void> {
  await prisma.item.updateMany({
    where: { id: itemId, OR: [{ lastEditedAt: null }, { lastEditedAt: { lte: startedAt } }] },
    data: { ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null },
  });
}

// ---------------------------------------------------------------------------------------------------------
// The push
// ---------------------------------------------------------------------------------------------------------

export interface PushItemToEbayParams {
  itemId: string;
  /** The resolved owner organizer id (callers resolve ownership; this service trusts it). */
  organizerId: string;
  trigger: EbayPushTrigger;
  /** Requested fields. REPUSH and RETRY callers pass the held or dirty fields (or all content fields). */
  fields: EbayPushField[];
  /** Record SKIPPED_HELD and make no eBay call. */
  hold?: boolean;
  /**
   * ebayContentDirtyAt as it was BEFORE the save that triggered this push (null when the save itself set it).
   * Undefined means "use the value on the row" (REPUSH and RETRY). See the clear rule in the body.
   */
  dirtyBefore?: Date | null;
}

function skipOutcome(status: EbayPushStatus, fields: string[], errorCode: string | null, errorMessage: string | null): EbayPushOutcome {
  return { status, fieldsAttempted: fields, fieldsPushed: [], errorCode, errorMessage };
}

/**
 * What the shipping policy resync reported (resyncItemShippingPolicy returns a short reason, or a routing error code), turned
 * into a push result. Before this, EVERY reason (no package weight, rate limited, no token, a blocked routing) was recorded as
 * "shipping pushed", so a soft-blocked item showed "eBay updated: shipping" although nothing was sent to eBay.
 *   pushed -> eBay was changed
 *   noop   -> nothing needed sending (already current, or a local-pickup listing that has no shipping policy to resync)
 *   fail   -> nothing was sent and the organizer must act or retry: the code and the plain message are stored on the push row
 */
export type ShippingResyncResult = { kind: 'pushed' } | { kind: 'noop' } | { kind: 'fail'; code: string; message: string };

export const SHIPPING_BLOCK_MESSAGES: Readonly<Record<string, string>> = {
  NEEDS_PACKAGE_DETAILS:
    'Shipping was not updated on eBay because this item has no package weight. Add the package weight and box size, or mark the item Local pickup only, then update eBay again.',
  SHIPPING_POLICY_UNAVAILABLE:
    'Shipping was not updated on eBay because we could not work out a shipping policy for this item. Check your shipping fallback in eBay Settings and make sure your return and payment policies are set, then try again.',
  POLICIES_NOT_CONFIGURED: 'Your eBay return and payment policies are not set up yet. Finish eBay setup in Settings, then update eBay again.',
  NO_FULFILLMENT_POLICY_MATCH:
    'No shipping policy matched this item. Add a package weight or set a default shipping policy in eBay Settings, then update eBay again.',
  SHIPPING_RATE_LIMITED: 'eBay is limiting requests right now. Wait a minute, then update eBay again.',
  NO_TOKEN: 'Could not reach your eBay account. Reconnect eBay and try again.',
  SHIPPING_RESYNC_FAILED: 'The shipping update could not be sent to eBay. Try again in a minute.',
};

export function classifyShippingResync(resync: { changed?: boolean; reason?: string } | null | undefined): ShippingResyncResult {
  if (!resync) return { kind: 'fail', code: 'SHIPPING_RESYNC_FAILED', message: SHIPPING_BLOCK_MESSAGES.SHIPPING_RESYNC_FAILED };
  if (resync.changed) return { kind: 'pushed' };
  const reason = String(resync.reason ?? '');
  switch (reason) {
    case 'repinned':
      return { kind: 'pushed' };
    case 'already-current':
    case 'local-pickup': // a pickup-only listing has no shipping policy to resync
    case 'not-live':
      return { kind: 'noop' };
    case 'no-weight':
    case 'NEEDS_PACKAGE_DETAILS':
      return { kind: 'fail', code: 'NEEDS_PACKAGE_DETAILS', message: SHIPPING_BLOCK_MESSAGES.NEEDS_PACKAGE_DETAILS };
    case 'rate-limited':
      return { kind: 'fail', code: 'SHIPPING_RATE_LIMITED', message: SHIPPING_BLOCK_MESSAGES.SHIPPING_RATE_LIMITED };
    case 'no-token':
      return { kind: 'fail', code: 'NO_TOKEN', message: SHIPPING_BLOCK_MESSAGES.NO_TOKEN };
    case 'SHIPPING_POLICY_UNAVAILABLE':
    case 'POLICIES_NOT_CONFIGURED':
    case 'NO_FULFILLMENT_POLICY_MATCH':
      return { kind: 'fail', code: reason, message: SHIPPING_BLOCK_MESSAGES[reason] };
    default:
      return { kind: 'fail', code: 'SHIPPING_RESYNC_FAILED', message: SHIPPING_BLOCK_MESSAGES.SHIPPING_RESYNC_FAILED };
  }
}

/**
 * Records a successful sale-level push ("Re-push to eBay", pushSaleToEbay) as a SUCCESS row per item, with the same
 * shape the per-item push writes, so the item's "last push" is current. The sale-level push sends the full listing, so
 * the content fields and price are recorded as attempted and pushed. Trigger REPUSH (existing value, no new enum value or
 * migration): it is the organizer's explicit re-push. Also acknowledges earlier failed or blocked rows it covers.
 * Never throws.
 */
export async function recordSuccessfulSalePush(input: { itemId: string; organizerId: string; startedAt?: Date }): Promise<void> {
  const fields: string[] = [...EBAY_CONTENT_FIELDS, 'price'];
  await recordPushRow({
    itemId: input.itemId,
    organizerId: input.organizerId,
    trigger: 'REPUSH',
    startedAt: input.startedAt ?? new Date(),
    outcome: { status: 'SUCCESS', fieldsAttempted: fields, fieldsPushed: fields, errorCode: null, errorMessage: null },
  });
  // A successful sale-level push builds the listing with its shipping policy, so it also covers an earlier shipping block.
  await ackCoveredFailures(input.itemId, input.organizerId, [...fields, 'shipping']);
}

/**
 * Records an attempt that was stopped BEFORE anything reached eBay (the Re-push to eBay button's shipping soft-block,
 * a guard that refuses the item) as a FAILED ItemMarketplacePush row, so the item form and the Add Items list show the
 * same plain, actionable reason instead of a toast that disappears. Only for an item already on eBay. Never throws.
 * A reason in INFORMATIONAL_PUSH_CODES (needs package details and similar) is NOT a failure: the row keeps this stored
 * status but every count, banner and retry lookup skips it, and the UI shows it as an amber "needs more information" note.
 */
export async function recordBlockedEbayPush(input: {
  itemId: string;
  organizerId: string;
  code: string | null | undefined;
  message: string | null | undefined;
  startedAt?: Date;
}): Promise<void> {
  const code = input.code && /^[A-Z0-9_]{1,40}$/.test(input.code) ? input.code : 'PUSH_BLOCKED';
  const message = sanitizePushErrorMessage(SHIPPING_BLOCK_MESSAGES[code] ?? input.message) ?? 'eBay could not be updated.';
  await recordPushRow({
    itemId: input.itemId,
    organizerId: input.organizerId,
    trigger: 'REPUSH',
    startedAt: input.startedAt ?? new Date(),
    outcome: { status: 'FAILED', fieldsAttempted: [], fieldsPushed: [], errorCode: code, errorMessage: message },
  });
}

/** Marks per-item sale push results whose block is informational (needs package details and similar). Mutates in place. */
export function flagInformationalResults(results: any[]): void {
  for (const r of results) {
    if (r?.status === 'error' && isInformationalPushCode(r.code ?? r.error)) r.informational = true;
  }
}

/** The pushSaleToEbay summary. An informational block is counted as `blocked`, never as `failed`. */
export function summarizeSalePushResults(results: any[]): { total: number; success: number; failed: number; blocked: number } {
  return {
    total: results.length,
    success: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'error' && !r.informational).length,
    blocked: results.filter((r) => r.status === 'error' && r.informational).length,
  };
}

/**
 * Push history for a real sale-level push (pushSaleToEbay; never for the fee check or queue mode):
 *  - a successful item gets a SUCCESS row, so its "last push" is current;
 *  - an item already on eBay that was stopped before anything reached eBay gets the blocked row (FAILED storage for a real
 *    problem, informational for a "needs more information" reason, see recordBlockedEbayPush).
 * Never throws.
 */
export async function recordSalePushHistory(input: {
  results: any[];
  items: Array<{ id: string; ebayOfferId?: string | null; ebayListingId?: string | null }>;
  organizerId: string;
  startedAt: Date;
}): Promise<void> {
  for (const r of input.results) {
    if (r?.status === 'success') {
      // 'success' means the offer was published and eBay returned a listing id (a failed or unfinished publish is a different
      // status). Still require the listing id here, so nothing is recorded or acknowledged unless the listing is live.
      if (!r.ebayListingId) continue;
      await recordSuccessfulSalePush({ itemId: r.itemId, organizerId: input.organizerId, startedAt: input.startedAt });
      continue;
    }
    if (r?.status !== 'error') continue;
    const row = input.items.find((it) => it.id === r.itemId);
    if (!row || (!row.ebayOfferId && !row.ebayListingId)) continue;
    await recordBlockedEbayPush({ itemId: row.id, organizerId: input.organizerId, code: r.code ?? r.error, message: r.message });
  }
}

/** Item.status values whose eBay offer is already withdrawn or ended: never pushed or republished. */
const NOT_PUSHABLE_STATUSES: ReadonlySet<string> = new Set(['SOLD', 'DONATED', 'AUCTION_ENDED']);

function httpCode(status: number): string {
  return `HTTP_${status}`;
}

/**
 * Pushes the requested fields of one item to its live eBay listing and records the attempt. Never throws.
 *
 *   hold                  -> SKIPPED_HELD, no eBay call, hold columns untouched except for the union that the
 *                            caller already wrote
 *   not on eBay           -> SKIPPED_NOT_LISTED (recorded for REPUSH and RETRY only, never for SAVE)
 *   listed without offer  -> FAILED NO_OFFER_ID (the listing was not created by FindA.Sale)
 *   otherwise             -> GET offer, PUT offer price, GET and PUT inventory item (title, description,
 *                            condition), republish through the self-heal loop, shipping policy resync
 *
 * SUCCESS clears ebayContentDirtyAt when every content field attempted was pushed (and, if the item was
 * already dirty before this save, only when all three content fields were pushed). A REPUSH SUCCESS also
 * clears the hold (ebaySyncHeldAt, ebayHeldFields, ebayContentDirtyAt). Failures leave the dirty flag set so the
 * pull-sync cron keeps its hands off the organizer's local edit.
 */
export async function pushItemToEbay(params: PushItemToEbayParams): Promise<EbayPushOutcome> {
  const startedAt = new Date();
  const { itemId, organizerId, trigger } = params;
  const requested = Array.from(new Set(params.fields));
  const record = async (outcome: EbayPushOutcome): Promise<EbayPushOutcome> => {
    await recordPushRow({ itemId, organizerId, trigger, startedAt, outcome });
    return outcome;
  };

  try {
    if (params.hold) {
      return await record(skipOutcome('SKIPPED_HELD', requested, 'HELD', 'Marketplace sync is paused for this item.'));
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        condition: true,
        conditionGrade: true,
        conditionNotes: true,
        brand: true,
        mpn: true,
        isbn: true,
        upc: true,
        ean: true,
        fccId: true,
        category: true,
        tags: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        ebayOfferId: true,
        ebayListingId: true,
        ebayContentDirtyAt: true,
        status: true,
        listingType: true,
      },
    });

    if (!item || (!item.ebayOfferId && !item.ebayListingId)) {
      const outcome = skipOutcome('SKIPPED_NOT_LISTED', requested, 'NOT_LISTED', 'This item is not listed on eBay.');
      return trigger === 'SAVE' ? outcome : await record(outcome);
    }
    // Resource-state gate. When an item sells, endEbayListingIfExists withdraws the eBay offer but deliberately leaves
    // ebayOfferId and ebayListingId set (the sold-order sync matches on them). A push here would PUT the offer and then
    // republish it, putting a SOLD item back on eBay. The cron only syncs AVAILABLE items; this gate stops the same
    // thing through the save, "Update eBay now" and retry paths. Reserved and invoiced items are still live, so they pass.
    if (item.status && NOT_PUSHABLE_STATUSES.has(item.status)) {
      const outcome = skipOutcome(
        'SKIPPED_NOT_LISTED',
        requested,
        'ITEM_NOT_ACTIVE',
        'This item is no longer for sale, so its eBay listing was not changed.'
      );
      return trigger === 'SAVE' ? outcome : await record(outcome);
    }
    // ADR-136 Addendum C (#659): a bulk lot's title, description, price and condition describe a count of cards sold by
    // the thousand, not an eBay listing. Its bundle listing (title, bundle price, quantity, package) is owned by
    // services/bulkLot/bulkLotEbayService and re-pushed from the lot screen. Fails closed with the lot flag on.
    try {
      if ((await findBulkLotItemIds(prisma as any, [itemId], isBulkLotsEnabled())).has(itemId)) {
        const outcome = skipOutcome(
          'SKIPPED_NOT_LISTED',
          requested,
          'BULK_LOT_BUNDLE',
          'This is a bulk lot listed on eBay in bundles. Change its eBay listing from the lot screen.'
        );
        return trigger === 'SAVE' ? outcome : await record(outcome);
      }
    } catch {
      return await record(skipOutcome('FAILED', requested, 'BULK_CHECK_FAILED', 'Could not check whether this item is a bulk lot. Try again in a moment.'));
    }
    if (!item.ebayOfferId) {
      return await record(
        skipOutcome(
          'FAILED',
          requested,
          'NO_OFFER_ID',
          'This eBay listing was not created through FindA.Sale, so it can only be edited on eBay.'
        )
      );
    }

    // Only fields that have something to push count as attempted.
    const ebayOfferId = item.ebayOfferId;
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { id: true, ebayPolicyMapping: { select: { defaultDescriptionHtml: true } } },
    });
    if (!organizer) {
      return await record(skipOutcome('FAILED', requested, 'NO_ORGANIZER', 'Seller account not found.'));
    }

    const templateHtml = organizer.ebayPolicyMapping?.defaultDescriptionHtml ?? null;
    let finalDescription = '';
    if (requested.includes('description')) {
      let raw = item.description ?? '';
      // Kits: the live eBay description is the kit's description plus the Includes list (built now, never stored).
      if (item.listingType === 'KIT') raw = withKitIncludes(raw, (await loadKitComponentLines([item.id])).get(item.id) ?? []);
      finalDescription = raw;
      if (templateHtml) {
        // Bug #424: split/join replaces ALL occurrences of {{DESCRIPTION}}.
        finalDescription = templateHtml.includes('{{DESCRIPTION}}')
          ? templateHtml.split('{{DESCRIPTION}}').join(raw)
          : raw
            ? `${raw}\n\n${templateHtml}`
            : templateHtml;
      }
    }

    const attempted: EbayPushField[] = requested.filter((f) => {
      if (f === 'title') return !!item.title;
      if (f === 'description') return finalDescription.length > 0;
      if (f === 'condition') return !!item.condition;
      if (f === 'price') return item.price !== null && item.price !== undefined;
      if (f === 'quantity') return true; // sent through inventoryStockSync below
      if (f === 'fccId') return !!normalizeFccId(item.fccId); // never attempt (or send) an empty FCC ID
      if ((EBAY_IDENTIFIER_FIELDS as readonly string[]).includes(f)) return true; // a clear is attempted too (removed, or reported as skipped)
      return f === 'shipping' ? !!item.ebayListingId : false;
    });

    if (attempted.length === 0) {
      // Nothing pushable (for example the description was cleared with no template). Not an error. An explicit
      // "Update eBay now" with nothing left to send still ends the pause.
      if (trigger === 'REPUSH') await releaseHoldUnlessEditedSince(item.id, startedAt);
      return await record(skipOutcome('SUCCESS', [], null, null));
    }

    const pushed = new Set<string>();
    // Fields that needed no eBay change (already identical on eBay, or the category has no such specific). They count as
    // done for the status but are NOT reported as pushed, so the organizer is never told eBay was updated when nothing was sent.
    const noop = new Set<string>();
    // The first failure wins: it is the root cause the organizer should see.
    const failure: { code: string | null; message: string | null } = { code: null, message: null };
    const fail = (code: string, message: string | null) => {
      if (!failure.code) {
        failure.code = /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'UNKNOWN'; // a code is stored and shown: controlled shapes only
        failure.message = sanitizePushErrorMessage(message);
      }
    };

    const contentRequested = attempted.filter((f) => f !== 'shipping' && f !== 'quantity');
    let accessToken: string | null = null;

    if (contentRequested.length > 0) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
      const proxySecret = process.env.EBAY_PROXY_SECRET;
      const proxyHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
        'Accept-Language': 'en-US',
        ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
      };

      const { refreshEbayAccessToken } = await import('../controllers/ebayController');
      accessToken = await refreshEbayAccessToken(organizer.id);
      if (!accessToken) {
        fail('NO_TOKEN', 'Could not reach your eBay account. Reconnect eBay and try again.');
      } else {
        const authHeaders = { ...proxyHeaders, Authorization: `Bearer ${accessToken}` };
        const proxyUrl = (path: string) => `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(path)}`;

        // eBay PUT endpoints are full REPLACE, so GET the full object, mutate, PUT it back. The offer GET also
        // recovers the REAL SKU (it carries a date suffix), so `FAS-${id}` is never guessed.
        const offerPath = `/sell/inventory/v1/offer/${encodeURIComponent(ebayOfferId)}`;
        let offerObject: Record<string, unknown> | null = null;
        try {
          const offerGetRes = await fetch(proxyUrl(offerPath), { method: 'GET', headers: authHeaders });
          if (offerGetRes.ok) {
            offerObject = (await offerGetRes.json()) as Record<string, unknown>;
          } else {
            fail('OFFER_GET_FAILED', `eBay did not return the listing details (${httpCode(offerGetRes.status)}).`);
          }
        } catch (offerGetErr) {
          fail('OFFER_GET_FAILED', `Could not read the eBay listing: ${(offerGetErr as Error).message}`);
        }

        let republishNeeded = false;
        const pendingAfterRepublish: string[] = [];
        const priceFieldsPushedByPut: string[] = [];

        if (offerObject && contentRequested.includes('price')) {
          const pricingSummary = (offerObject.pricingSummary as Record<string, unknown> | undefined) ?? {};
          const priceObj = (pricingSummary.price as Record<string, unknown> | undefined) ?? {};
          offerObject.pricingSummary = {
            ...pricingSummary,
            price: { ...priceObj, value: String(item.price), currency: (priceObj.currency as string) ?? 'USD' },
          };
          try {
            const offerRes = await fetch(proxyUrl(offerPath), {
              method: 'PUT',
              headers: authHeaders,
              body: JSON.stringify(offerObject),
            });
            if (offerRes.ok || offerRes.status === 204) {
              priceFieldsPushedByPut.push('price');
              republishNeeded = true;
            } else {
              fail('OFFER_PRICE_PUT_FAILED', `eBay did not accept the new price (${httpCode(offerRes.status)}).`);
            }
          } catch (priceErr) {
            fail('OFFER_PRICE_PUT_FAILED', `Could not send the new price to eBay: ${(priceErr as Error).message}`);
          }
        }

        const inventoryFields = contentRequested.filter((f) => f === 'title' || f === 'description' || f === 'condition' || f === 'fccId' || (EBAY_IDENTIFIER_FIELDS as readonly string[]).includes(f));
        const sku = offerObject ? (offerObject.sku as string | undefined) : undefined;
        if (inventoryFields.length > 0 && offerObject && !sku) {
          fail('NO_SKU', 'eBay did not return a SKU for this listing.');
        }
        if (inventoryFields.length > 0 && sku) {
          const inventoryUpdates: Record<string, unknown> = {};
          if (inventoryFields.includes('title')) inventoryUpdates['product.title'] = item.title;
          if (inventoryFields.includes('description')) inventoryUpdates['product.description'] = finalDescription;
          if (inventoryFields.includes('condition')) {
            // Unified table (utils/conditionMapping.ts), computed BEFORE the category remap below so the locked
            // ensureConditionValidForCategory and idToEnum pieces are untouched.
            const rawCondition = desiredEbayCondition(item.condition, item.conditionGrade);
            let finalCondition: string = rawCondition;
            if (item.ebayCategoryId) {
              try {
                finalCondition = await ensureConditionValidForCategory(rawCondition, item.ebayCategoryId);
              } catch (condErr) {
                console.warn(`[eBay PushSync] ensureConditionValidForCategory failed (non-fatal): ${(condErr as Error).message}`);
              }
            }
            inventoryUpdates['condition'] = finalCondition;
          }
          if (inventoryFields.includes('condition') || inventoryFields.includes('description')) {
            // The eBay condition note (conditionDescription) is built by the same table as first publish, so a
            // condition change (for example Used grade C to Refurbished) rewrites the old grade line, and a
            // description change refreshes the description slice inside it. null means remove it (a NEW item).
            inventoryUpdates['conditionDescription'] = buildEbayConditionDescription(item) ?? null;
          }

          const invPath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
          let invObject: Record<string, unknown> | null = null;
          try {
            const invGetRes = await fetch(proxyUrl(invPath), { method: 'GET', headers: authHeaders });
            if (invGetRes.ok) {
              invObject = (await invGetRes.json()) as Record<string, unknown>;
            } else {
              fail('INVENTORY_GET_FAILED', `eBay did not return the item details (${httpCode(invGetRes.status)}).`);
            }
          } catch (invGetErr) {
            fail('INVENTORY_GET_FAILED', `Could not read the eBay item details: ${(invGetErr as Error).message}`);
          }

          if (invObject) {
            if ('product.title' in inventoryUpdates || 'product.description' in inventoryUpdates) {
              const existingProduct = (invObject.product as Record<string, unknown> | undefined) ?? {};
              invObject.product = {
                ...existingProduct,
                ...(inventoryUpdates['product.title'] ? { title: inventoryUpdates['product.title'] } : {}),
                ...(inventoryUpdates['product.description'] ? { description: inventoryUpdates['product.description'] } : {}),
              };
            }
            if ('condition' in inventoryUpdates) invObject.condition = inventoryUpdates['condition'];
            if ('conditionDescription' in inventoryUpdates) {
              if (inventoryUpdates['conditionDescription']) invObject.conditionDescription = inventoryUpdates['conditionDescription'];
              else delete invObject.conditionDescription;
            }

            // Product identifiers (brand, mpn, upc, ean, isbn): pure merge in utils/ebayIdentifierMerge.ts. It preserves every
            // other product key and aspect, keeps Brand paired with an MPN, and never deletes a Brand (or an MPN / ISBN the
            // category may require). A field it deliberately leaves alone is reported through fail() (PARTIAL / FAILED, like
            // FCC_ASPECT_SKIPPED) and is never sent. An unchanged result makes no PUT and no republish for these fields.
            const idSkipPut = new Set<string>();
            const idFields = inventoryFields.filter((f): f is EbayIdentifierField => (EBAY_IDENTIFIER_FIELDS as readonly string[]).includes(f));
            if (idFields.length > 0) {
              const offerCat = offerObject ? offerObject.categoryId : undefined;
              const idCategoryId: string | null = (typeof offerCat === 'string' && offerCat.length > 0 ? offerCat : null) || item.ebayCategoryId || null;
              const mpnRequired =
                idFields.includes('mpn') && !normalizeIdentifier(item.mpn)
                  ? await resolveMpnRequired(idCategoryId, getRequiredAspectsForCategory)
                  : null;
              const merged = mergeEbayIdentifiers(
                (invObject.product as Record<string, unknown> | undefined) ?? {},
                { brand: item.brand, mpn: item.mpn, upc: item.upc, ean: item.ean, isbn: item.isbn },
                idFields,
                { categoryId: idCategoryId, mpnRequired }
              );
              invObject.product = merged.product;
              for (const note of merged.skipped) {
                console.warn(`[eBay PushSync] Item ${item.id}: ${note.code}, left untouched on eBay.`);
                fail(note.code, note.message);
                idSkipPut.add(note.field);
              }
              if (!merged.changed) {
                // Already identical on eBay: nothing to send for these fields.
                for (const f of merged.done) {
                  noop.add(f);
                  idSkipPut.add(f);
                }
              }
            }

            // Missing product.brand causes 25002 BrandMPN on republish (confirmed 2026-06-30): mirror it from the
            // aspects when absent. Heals items first pushed before Fix A.
            const invProduct = invObject.product as Record<string, unknown> | undefined;
            if (invProduct && !invProduct.brand) {
              const invAspects = invProduct.aspects as Record<string, string[]> | undefined;
              const aspectBrand = invAspects
                ? Object.entries(invAspects).find(([k]) => k.toLowerCase() === 'brand')?.[1]?.[0]
                : null;
              if (aspectBrand && aspectBrand.toLowerCase() !== 'unbranded') invProduct.brand = aspectBrand;
            }

            // FCC ID item specific (eBay requirement effective 2026-10-13). Same helper and rules as first publish
            // (utils/ebayFccAspect.ts) except an edited value replaces the existing one. The category comes from the
            // live offer (falling back to the stored one). A lookup failure is logged and skipped: it never blocks the
            // other fields. Existing eBay aspects are preserved (the aspects object comes from the GET above).
            let fccApplied = false;
            if (inventoryFields.includes('fccId')) {
              const offerCategoryId = offerObject ? offerObject.categoryId : undefined;
              const liveCategoryId: string | null =
                (typeof offerCategoryId === 'string' && offerCategoryId.length > 0 ? offerCategoryId : null) || item.ebayCategoryId || null;
              if (!liveCategoryId) {
                console.warn(`[eBay PushSync] Item ${item.id}: no eBay category for the FCC ID aspect (non-fatal), skipped.`);
                fail('FCC_ASPECT_SKIPPED', 'Could not tell which eBay category this listing is in, so the FCC ID was not sent.');
              } else {
                const invProd = ((invObject.product as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
                const fccAspects: Record<string, string[]> =
                  invProd.aspects && typeof invProd.aspects === 'object' ? (invProd.aspects as Record<string, string[]>) : {};
                const fccResult = await applyFccIdAspect(fccAspects, item.fccId, liveCategoryId, getRequiredAspectsForCategory, { overwrite: true });
                if (fccResult.status === 'applied') {
                  invObject.product = { ...invProd, aspects: fccAspects };
                  fccApplied = true;
                } else if (fccResult.status === 'lookup_failed') {
                  console.warn(`[eBay PushSync] Item ${item.id}: FCC ID aspect lookup failed (non-fatal): ${fccResult.error}`);
                  fail('FCC_ASPECT_LOOKUP_FAILED', 'Could not check whether this eBay category takes an FCC ID, so it was not sent.');
                } else {
                  // unchanged, unsupported, empty: nothing was sent to eBay, so the field is done but NOT reported as pushed
                  // (an "unsupported" category used to record SUCCESS fieldsPushed [fccId] and show "eBay updated: FCC ID").
                  noop.add('fccId');
                }
              }
            }

            const putFields = inventoryFields.filter((f) => (f !== 'fccId' || fccApplied) && !idSkipPut.has(f));
            if (putFields.length > 0) {
              try {
                const invRes = await fetch(proxyUrl(invPath), {
                  method: 'PUT',
                  headers: authHeaders,
                  body: JSON.stringify(invObject),
                });
                if (invRes.ok || invRes.status === 204) {
                  pendingAfterRepublish.push(...putFields);
                  republishNeeded = true;
                } else {
                  fail('INVENTORY_PUT_FAILED', `eBay did not accept the listing changes (${httpCode(invRes.status)}).`);
                }
              } catch (invPutErr) {
                fail('INVENTORY_PUT_FAILED', `Could not send the listing changes to eBay: ${(invPutErr as Error).message}`);
              }
            }
          }
        }

        // Bug #469: only a (re)publish makes the pushed inventory/offer changes visible to shoppers. The
        // self-heal loop (ADR 2026-06-30) repairs 25101/25021/25002/25005 reactively.
        if (republishNeeded) {
          let published = false;
          try {
            // ADR-134 B5b: a graded card keeps its grader, grade and cert descriptors on heal. null for non-cards.
            const healCard = await prisma.itemCard.findUnique({
              where: { itemId: item.id },
              select: { game: true, productType: true, cardName: true, setCode: true, setName: true, collectorNumber: true, language: true, finish: true, rarity: true, conditionCode: true, grader: true, grade: true, certNumber: true },
            });
            const healResult = await ebayPublishWithSelfHeal({
              item: {
                id: item.id,
                title: item.title,
                condition: item.condition,
                brand: item.brand,
                mpn: item.mpn,
                isbn: item.isbn, // ADR-089: heal25002 injects the real ISBN for Books
                ebayCategoryId: item.ebayCategoryId,
                ebayCategoryName: item.ebayCategoryName,
                ebayOfferId,
                category: item.category,
                tags: item.tags,
                description: item.description,
                card: healCard,
              },
              accessToken,
            });
            published = !!healResult.published;
            if (!published) {
              fail(
                healResult.lastErrorId ? `EBAY_${healResult.lastErrorId}` : 'REPUBLISH_FAILED',
                healResult.lastErrorMessage ?? 'eBay did not republish the listing.'
              );
            }
          } catch (healErr) {
            fail('REPUBLISH_FAILED', `The listing could not be republished: ${(healErr as Error).message}`);
          }
          // The offer PUT for price is accepted by eBay on its own; content changes are live only once republished.
          for (const f of priceFieldsPushedByPut) pushed.add(f);
          if (published) for (const f of pendingAfterRepublish) pushed.add(f);
        }
      }
    }

    // quantity (2026-10-13): the one in-stock number goes through inventoryStockSync (GET, merge, PUT, stale-overwrite guard, rate
    // limiter, zero-stock end). An explicit push ignores the "Save without updating marketplaces" hold; the hold is released
    // below only after everything succeeded.
    if (attempted.includes('quantity')) {
      try {
        const { syncItemStockForPush } = await import('./inventoryStockSync');
        const res = await syncItemStockForPush(item.id, `push:${trigger}`);
        const ebayOut = res.outcomes.find((o) => o.market === 'ebay');
        if (res.inStock < 0) {
          fail('QUANTITY_PUSH_FAILED', 'The quantity could not be read, so it was not sent to eBay.');
        } else if (!ebayOut) {
          noop.add('quantity');
        } else if (ebayOut.status === 'synced' || ebayOut.status === 'relisted' || ebayOut.status === 'ended') {
          pushed.add('quantity');
        } else if (ebayOut.status === 'unchanged') {
          noop.add('quantity');
        } else if (ebayOut.status === 'failed') {
          fail('QUANTITY_PUSH_FAILED', ebayOut.detail ?? 'eBay did not accept the new quantity.');
        } else {
          fail('QUANTITY_NOT_SENT', ebayOut.detail ?? 'The new quantity was not sent to eBay.');
        }
      } catch (qtyErr) {
        fail('QUANTITY_PUSH_FAILED', `The quantity could not be sent to eBay: ${(qtyErr as Error).message}`);
      }
    }

    // ADR Part B: a changed shipping-determining input on a LIVE listing re-resolves and re-applies the eBay
    // fulfillment policy so the live buyer is charged the correct shipping. It guards on ebayListingId, the
    // offer id and the rate limiter internally and never throws.
    if (attempted.includes('shipping')) {
      try {
        const { resyncItemShippingPolicy } = await import('../controllers/ebayController');
        const resync = await resyncItemShippingPolicy(item.id);
        console.log(`[eBay PushSync] Item ${item.id}: shipping resync changed=${resync?.changed} reason=${resync?.reason}`);
        const verdict = classifyShippingResync(resync);
        if (verdict.kind === 'pushed') pushed.add('shipping');
        else if (verdict.kind === 'noop') noop.add('shipping');
        else fail(verdict.code, verdict.message);
      } catch (resyncErr) {
        fail('SHIPPING_RESYNC_FAILED', `The shipping update could not be sent to eBay: ${(resyncErr as Error).message}`);
      }
    }

    const fieldsPushed = attempted.filter((f) => pushed.has(f));
    const fieldsDone = attempted.filter((f) => pushed.has(f) || noop.has(f));
    const status: EbayPushStatus =
      fieldsDone.length === attempted.length ? 'SUCCESS' : fieldsDone.length === 0 ? 'FAILED' : 'PARTIAL';
    const outcome: EbayPushOutcome = {
      status,
      fieldsAttempted: attempted,
      fieldsPushed,
      errorCode: status === 'SUCCESS' ? null : failure.code ?? 'UNKNOWN',
      errorMessage: status === 'SUCCESS' ? null : failure.message ?? 'eBay did not confirm the update.',
    };

    await record(outcome);

    // Item-level bookkeeping (system writes: never lastEditedAt).
    try {
      const contentAttempted = attempted.filter((f) => (EBAY_CONTENT_FIELDS as readonly string[]).includes(f));
      const contentOk = contentAttempted.length > 0 && contentAttempted.every((f) => pushed.has(f));
      const allThree = EBAY_CONTENT_FIELDS.every((f) => pushed.has(f));
      const dirtyBefore = params.dirtyBefore !== undefined ? params.dirtyBefore : item.ebayContentDirtyAt;
      const clearDirty = contentOk && (dirtyBefore == null || allThree);

      if (status === 'SUCCESS' && trigger === 'REPUSH') {
        // An explicit "Update eBay now" that fully succeeded releases the hold. (A retry of one failed save
        // covers only some fields, so it never releases a hold on its own.) A save that landed while this push was
        // in flight keeps the hold: that edit was never sent, so releasing would let the pull-sync overwrite it.
        await releaseHoldUnlessEditedSince(item.id, startedAt);
      } else if (clearDirty) {
        await clearDirtyUnlessSetSince(item.id, startedAt);
      }
      if (fieldsDone.length > 0) await ackCoveredFailures(item.id, organizerId, fieldsDone);
    } catch (bookkeepErr) {
      console.warn(`[eBay PushSync] Item ${item.id}: bookkeeping after push failed (non-fatal):`, (bookkeepErr as Error).message);
    }

    return outcome;
  } catch (err) {
    const outcome = skipOutcome('FAILED', requested, 'UNEXPECTED', sanitizePushErrorMessage((err as Error)?.message) ?? 'Unexpected error.');
    console.warn(`[eBay PushSync] Non-fatal error pushing item ${itemId} to eBay:`, (err as Error)?.message);
    await recordPushRow({ itemId, organizerId, trigger, startedAt, outcome });
    return outcome;
  }
}
