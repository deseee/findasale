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

import { prisma } from '../lib/prisma';
import { ebayPublishWithSelfHeal, ensureConditionValidForCategory } from './ebayPublishService';
import { desiredEbayCondition } from '../utils/conditionMapping';

export const EBAY_PUSH_FIELDS = ['title', 'description', 'condition', 'price', 'shipping'] as const;
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
  title?: string | null;
  description?: string | null;
  condition?: string | null;
  conditionGrade?: string | null;
  price?: unknown;
};
type DiffNext = {
  title?: string | null;
  description?: string | null;
  condition?: string | null;
  conditionGrade?: string | null;
  price?: unknown;
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
        brand: true,
        mpn: true,
        category: true,
        tags: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        ebayOfferId: true,
        ebayListingId: true,
        ebayContentDirtyAt: true,
        status: true,
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
      const raw = item.description ?? '';
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
      return f === 'shipping' ? !!item.ebayListingId : false;
    });

    if (attempted.length === 0) {
      // Nothing pushable (for example the description was cleared with no template). Not an error. An explicit
      // "Update eBay now" with nothing left to send still ends the pause.
      if (trigger === 'REPUSH') await releaseHoldUnlessEditedSince(item.id, startedAt);
      return await record(skipOutcome('SUCCESS', [], null, null));
    }

    const pushed = new Set<string>();
    // The first failure wins: it is the root cause the organizer should see.
    const failure: { code: string | null; message: string | null } = { code: null, message: null };
    const fail = (code: string, message: string | null) => {
      if (!failure.code) {
        failure.code = /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'UNKNOWN'; // a code is stored and shown: controlled shapes only
        failure.message = sanitizePushErrorMessage(message);
      }
    };

    const contentRequested = attempted.filter((f) => f !== 'shipping');
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

        const inventoryFields = contentRequested.filter((f) => f === 'title' || f === 'description' || f === 'condition');
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

            try {
              const invRes = await fetch(proxyUrl(invPath), {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify(invObject),
              });
              if (invRes.ok || invRes.status === 204) {
                pendingAfterRepublish.push(...inventoryFields);
                republishNeeded = true;
              } else {
                fail('INVENTORY_PUT_FAILED', `eBay did not accept the listing changes (${httpCode(invRes.status)}).`);
              }
            } catch (invPutErr) {
              fail('INVENTORY_PUT_FAILED', `Could not send the listing changes to eBay: ${(invPutErr as Error).message}`);
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

    // ADR Part B: a changed shipping-determining input on a LIVE listing re-resolves and re-applies the eBay
    // fulfillment policy so the live buyer is charged the correct shipping. It guards on ebayListingId, the
    // offer id and the rate limiter internally and never throws.
    if (attempted.includes('shipping')) {
      try {
        const { resyncItemShippingPolicy } = await import('../controllers/ebayController');
        const resync = await resyncItemShippingPolicy(item.id);
        console.log(`[eBay PushSync] Item ${item.id}: shipping resync changed=${resync.changed} reason=${resync.reason}`);
        pushed.add('shipping');
      } catch (resyncErr) {
        fail('SHIPPING_RESYNC_FAILED', `The shipping update could not be sent to eBay: ${(resyncErr as Error).message}`);
      }
    }

    const fieldsPushed = attempted.filter((f) => pushed.has(f));
    const status: EbayPushStatus =
      fieldsPushed.length === attempted.length ? 'SUCCESS' : fieldsPushed.length === 0 ? 'FAILED' : 'PARTIAL';
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
      if (fieldsPushed.length > 0) await ackCoveredFailures(item.id, organizerId, fieldsPushed);
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
