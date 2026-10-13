/**
 * What a save will do to the marketplaces, and what it did (item editor, Edit page and sheet).
 *
 * Pure module (imports only the condition model, no React, no side effects).
 *
 *  - computeSaveImpact: the BEFORE-save text. Mirrors the backend rules in services/ebayItemPushService.ts
 *    (computeEbayPushFields, buildEbayPlan, buildExtensionPlan): eBay is pushed only for fields that REALLY changed
 *    (title, description, condition, price, in stock, shipping inputs), only when the item is listed on eBay with an offer, and
 *    never while the eBay sync is held. Extension marketplaces (Vinted, Poshmark, ...) are never pushed: where the item
 *    is listed and a title, description, condition or price changed, the organizer is told to update it by hand.
 *  - describePlan / describePushOutcome: the AFTER-save row text, from the PUT response's marketplacePlan and from the
 *    newest recentPushes row of GET /items/:id/marketplace-status.
 *  - pollForNewPush: the bounded poll for that row (the push runs after the PUT returns). At most five fetches, then it stops.
 *
 * All copy here follows the brand rules: no em dashes, never the word "AI".
 */
import { desiredEbayCondition } from './conditionModel';

export type EbayPushField = 'title' | 'description' | 'condition' | 'price' | 'quantity' | 'shipping' | 'fccId' | 'brand' | 'mpn' | 'upc' | 'ean' | 'isbn';
export type EbayPlanReason = 'not_listed' | 'no_offer_id' | 'held' | 'no_changes';

/** The fields whose change prompts a manual update on an extension marketplace (same set as the backend). */
const EXTENSION_RELEVANT_FIELDS: ReadonlyArray<string> = ['title', 'description', 'condition', 'price'];

/** Display labels, keyed by the backend platform enum. Same table as the backend. */
export const EXTENSION_PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  CRAIGSLIST: 'Craigslist',
  GUMTREE_AU: 'Gumtree AU',
  POSHMARK: 'Poshmark',
  MERCARI: 'Mercari',
  VINTED: 'Vinted',
  GRAILED: 'Grailed',
};

/** marketplace-status uses camelCase platform keys (gumtreeAu); the plan uses the enum. Both resolve to a label. */
const PLATFORM_KEY_ALIASES: Record<string, string> = {
  FACEBOOK: 'FACEBOOK',
  CRAIGSLIST: 'CRAIGSLIST',
  GUMTREEAU: 'GUMTREE_AU',
  GUMTREE_AU: 'GUMTREE_AU',
  POSHMARK: 'POSHMARK',
  MERCARI: 'MERCARI',
  VINTED: 'VINTED',
  GRAILED: 'GRAILED',
};

export function extensionPlatformLabel(platform: string): string {
  const key = PLATFORM_KEY_ALIASES[String(platform).toUpperCase()];
  return (key && EXTENSION_PLATFORM_LABELS[key]) || String(platform);
}

export interface SaveImpactLoadedItem {
  title?: string | null;
  description?: string | null;
  condition?: string | null;
  conditionGrade?: string | null;
  price?: unknown;
  /** The one in-stock number (server computed). When absent, stockTotal minus stockSold is used. */
  inStock?: number | null;
  stockTotal?: number | null;
  stockSold?: number | null;
  packageWeightOz?: unknown;
  packageLengthIn?: unknown;
  packageWidthIn?: unknown;
  packageHeightIn?: unknown;
  packageType?: string | null;
  fccId?: string | null;
  brand?: string | null;
  mpn?: string | null;
  upc?: string | null;
  ean?: string | null;
  isbn?: string | null;
  ebayOfferId?: string | null;
  ebayListingId?: string | null;
}

export interface SaveImpactInput {
  /** The item as loaded (what the server has now). */
  loadedItem: SaveImpactLoadedItem;
  /**
   * The values this save would send for the marketplace-relevant keys (title, description, condition,
   * conditionGrade, price, packageWeightOz, packageLengthIn, packageWidthIn, packageHeightIn, packageType).
   * A key that is absent, or undefined, is "not sent" (untouched), exactly like an omitted key in the PUT body.
   */
  dirtyFields: Record<string, unknown>;
  /** The eBay sync is held (the item is already paused, or this save is "Save without updating marketplaces"). */
  held: boolean;
  ebayListed: boolean;
  /** Extension marketplaces where the item is listed: a platform enum or key string, or { platform, label }. */
  extensionPlatformsListed: ReadonlyArray<string | { platform?: string; label: string }>;
}

export interface SaveImpact {
  ebay: { willPush: boolean; fields: EbayPushField[]; reason?: EbayPlanReason };
  extensions: Array<{ platform: string; message: string; fields: string[] }>;
}

const blank = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Same normalizer as the backend (utils/fccId.ts normalizeFccId): trim, uppercase, letters, digits and hyphens, max 20. */
function normalizeFcc(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20) : '';
}

/** Same trim as the backend (utils/ebayIdentifierMerge.ts normalizeIdentifier). */
function normalizeIdentifier(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Product identifiers that sync to a live eBay listing, in the backend's order. */
const IDENTIFIER_FIELDS: ReadonlyArray<'brand' | 'mpn' | 'upc' | 'ean' | 'isbn'> = ['brand', 'mpn', 'upc', 'ean', 'isbn'];

function priceNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

/** The loaded in-stock number: the server's inStock, else stockTotal minus stockSold, else null (unknown). */
function loadedInStockNumber(loaded: SaveImpactLoadedItem): number | null {
  if (typeof loaded.inStock === 'number' && Number.isFinite(loaded.inStock)) return loaded.inStock;
  if (typeof loaded.stockTotal === 'number' && Number.isFinite(loaded.stockTotal)) {
    const sold = typeof loaded.stockSold === 'number' && Number.isFinite(loaded.stockSold) ? loaded.stockSold : 0;
    return Math.max(0, loaded.stockTotal - sold);
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  return v === undefined || v === null || v === '' ? null : Number(v);
}

const provided = (d: Record<string, unknown>, key: string): boolean => d[key] !== undefined;

/** Which eBay-pushable fields REALLY change. Same rules as computeEbayPushFields plus the shipping-input comparison. */
export function computeChangedEbayFields(
  loaded: SaveImpactLoadedItem,
  dirty: Record<string, unknown>
): EbayPushField[] {
  const fields: EbayPushField[] = [];

  if (provided(dirty, 'title') && blank(dirty.title).length > 0 && blank(dirty.title) !== blank(loaded.title)) {
    fields.push('title');
  }
  if (provided(dirty, 'description') && blank(dirty.description) !== blank(loaded.description)) {
    fields.push('description');
  }

  const nextCondition = provided(dirty, 'condition') ? dirty.condition : loaded.condition;
  const nextGrade = provided(dirty, 'conditionGrade') ? dirty.conditionGrade : loaded.conditionGrade;
  if (blank(nextCondition).length > 0) {
    const conditionChanged = provided(dirty, 'condition') && blank(dirty.condition) !== blank(loaded.condition);
    const enumChanged =
      desiredEbayCondition(loaded.condition, loaded.conditionGrade) !==
      desiredEbayCondition(nextCondition as string, nextGrade as string);
    if (conditionChanged || enumChanged) fields.push('condition');
  }

  if (provided(dirty, 'price')) {
    const nextNum = priceNumber(dirty.price);
    const curNum = priceNumber(loaded.price);
    if (nextNum !== null && (curNum === null || Math.abs(nextNum - curNum) >= 0.005)) fields.push('price');
  }

  // quantity: the entered In stock number differs from the loaded one. eBay takes a count, so it is pushed.
  if (provided(dirty, 'inStock')) {
    const nextStock = numOrNull(dirty.inStock);
    if (nextStock !== null && Number.isFinite(nextStock) && nextStock !== loadedInStockNumber(loaded)) fields.push('quantity');
  }

  const shippingChanged =
    (provided(dirty, 'packageWeightOz') && numOrNull(dirty.packageWeightOz) !== numOrNull(loaded.packageWeightOz)) ||
    (provided(dirty, 'packageLengthIn') && numOrNull(dirty.packageLengthIn) !== numOrNull(loaded.packageLengthIn)) ||
    (provided(dirty, 'packageWidthIn') && numOrNull(dirty.packageWidthIn) !== numOrNull(loaded.packageWidthIn)) ||
    (provided(dirty, 'packageHeightIn') && numOrNull(dirty.packageHeightIn) !== numOrNull(loaded.packageHeightIn)) ||
    (provided(dirty, 'packageType') && (blank(dirty.packageType) || null) !== (blank(loaded.packageType) || null));
  // fccId: a non-empty FCC ID that differs from the stored one (a clear never pushes), same rule as the backend.
  if (provided(dirty, 'fccId')) {
    const nextFcc = normalizeFcc(dirty.fccId);
    if (nextFcc && nextFcc !== normalizeFcc(loaded.fccId)) fields.push('fccId');
  }

  // brand, mpn, upc, ean, isbn: any real change after trimming, including a clear (the backend reports a clear it cannot
  // apply, for example a brand, instead of removing it from eBay). Same rule as computeEbayPushFields.
  IDENTIFIER_FIELDS.forEach((key) => {
    if (provided(dirty, key) && normalizeIdentifier(dirty[key]) !== normalizeIdentifier(loaded[key])) fields.push(key);
  });

  if (shippingChanged) fields.push('shipping');

  return fields;
}

export function computeSaveImpact(input: SaveImpactInput): SaveImpact {
  const { loadedItem, dirtyFields, held, ebayListed, extensionPlatformsListed } = input;
  const changed = computeChangedEbayFields(loadedItem, dirtyFields || {});

  let ebay: SaveImpact['ebay'];
  if (!ebayListed) {
    ebay = { willPush: false, fields: [], reason: 'not_listed' };
  } else if (held) {
    ebay = { willPush: false, fields: changed, reason: 'held' };
  } else if (!loadedItem.ebayOfferId) {
    // Listed (it has a listing id) but there is no offer to update: the backend cannot push it.
    ebay = { willPush: false, fields: changed, reason: 'no_offer_id' };
  } else if (changed.length === 0) {
    ebay = { willPush: false, fields: [], reason: 'no_changes' };
  } else {
    ebay = { willPush: true, fields: changed };
  }

  const relevant = changed.filter((f) => EXTENSION_RELEVANT_FIELDS.indexOf(f) !== -1);
  const extensions: SaveImpact['extensions'] = [];
  if (relevant.length > 0) {
    const seen: Record<string, true> = {};
    extensionPlatformsListed.forEach((p) => {
      const platform = typeof p === 'string' ? p : p.platform || p.label;
      const label = typeof p === 'string' ? extensionPlatformLabel(p) : p.label || extensionPlatformLabel(platform);
      if (seen[label]) return;
      seen[label] = true;
      extensions.push({ platform, message: `Needs manual update on ${label}`, fields: relevant });
    });
  }
  return { ebay, extensions };
}

// ---------------------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------------------

const FIELD_WORDS: Record<string, string> = {
  title: 'title',
  description: 'description',
  condition: 'condition',
  price: 'price',
  quantity: 'in stock',
  shipping: 'shipping',
  fccId: 'FCC ID',
  brand: 'brand',
  mpn: 'MPN',
  upc: 'UPC',
  ean: 'EAN',
  isbn: 'ISBN',
};

export function fieldList(fields: ReadonlyArray<string>): string {
  return fields.map((f) => FIELD_WORDS[f] || f).join(', ');
}

/** One plain sentence per marketplace for the before-save note. Empty when there is nothing to say about eBay or extensions. */
export function describeSaveImpact(impact: SaveImpact): string[] {
  const lines: string[] = [];
  const { ebay } = impact;
  if (ebay.reason !== 'not_listed') {
    if (ebay.willPush) lines.push(`Saving will update eBay: ${fieldList(ebay.fields)}.`);
    else if (ebay.reason === 'held') lines.push('eBay sync is paused, so eBay will not change.');
    else lines.push('eBay will not change.');
  }
  impact.extensions.forEach((e) => lines.push(`${e.message}.`));
  return lines;
}

export interface OutcomeView {
  tone: 'success' | 'error' | 'warning' | 'info' | 'pending';
  text: string;
  /** Show the Retry button. */
  canRetry: boolean;
}

/** The one text for "the eBay hold is on". Shared so a release can recognise (and drop) a stale paused row. */
export const SYNC_PAUSED_TEXT = 'eBay not changed (sync paused)';

export interface PlanLike {
  ebay?: { willPush?: boolean; fields?: string[]; held?: boolean; reason?: string };
  /** The backend sends `extension`; the brief called it `extensions`. Both are read. */
  extension?: Array<{ platform?: string; message?: string; fields?: string[] }>;
  extensions?: Array<{ platform?: string; message?: string; fields?: string[] }>;
}

/** The plan's extension prompts as sentences. */
export function planExtensionLines(plan: PlanLike | null | undefined): string[] {
  const list = (plan && (plan.extensions || plan.extension)) || [];
  return list.filter((e) => e && typeof e.message === 'string' && e.message).map((e) => `${e.message}.`);
}

/** The row shown right after the PUT succeeds, from the response's marketplacePlan alone. Null when nothing needs saying. */
export function describePlan(plan: PlanLike | null | undefined): OutcomeView | null {
  const ebay = plan && plan.ebay;
  if (!ebay) return null;
  if (ebay.willPush) {
    return { tone: 'pending', text: `Updating eBay: ${fieldList(ebay.fields || [])}.`, canRetry: false };
  }
  if (ebay.reason === 'held') return { tone: 'info', text: SYNC_PAUSED_TEXT, canRetry: false };
  if (ebay.reason === 'no_changes' || ebay.reason === 'no_offer_id') {
    return { tone: 'info', text: 'eBay not changed', canRetry: false };
  }
  return null;
}

type OutcomeRowLike = {
  status: string;
  fieldsAttempted?: string[];
  fieldsPushed?: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
};

/**
 * Push block reasons that mean "the organizer needs to add information", not "eBay failed". Mirrors the backend list in
 * lib/ebayPushInformational.ts. Such a row is shown as an amber note ("Needs package details"), never as a red failure.
 */
const PACKAGE_DETAIL_CODES: ReadonlyArray<string> = [
  'NEEDS_PACKAGE_DETAILS',
  'EBAY_NO_PACKAGE_WEIGHT',
  'EBAY_WEIGHT_NOT_CONFIRMED',
  'EBAY_PACKAGE_DIMS_NOT_CONFIRMED',
];
export const INFORMATIONAL_PUSH_CODES: ReadonlyArray<string> = [
  ...PACKAGE_DETAIL_CODES,
  'EBAY_BOOK_NO_ISBN',
  'POLICIES_NOT_CONFIGURED',
  'NO_FULFILLMENT_POLICY_MATCH',
];

export function isInformationalPushCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && INFORMATIONAL_PUSH_CODES.indexOf(code) !== -1;
}

/** Codes that mean the eBay shipping policies are not set up yet (the fix is in eBay settings). */
const EBAY_SETUP_CODES: ReadonlyArray<string> = ['POLICIES_NOT_CONFIGURED', 'NO_FULFILLMENT_POLICY_MATCH'];

/**
 * The one label for a blocked push, used by every surface (item form, Add Items chip, review page, sale page, post-sale
 * panel) so the wording is identical. Null when the code is a real failure.
 */
export function informationalPushLabel(code: string | null | undefined): string | null {
  if (!isInformationalPushCode(code)) return null;
  if (PACKAGE_DETAIL_CODES.indexOf(code as string) !== -1) return 'Needs package details';
  if (EBAY_SETUP_CODES.indexOf(code as string) !== -1) return 'Finish eBay setup';
  return 'Needs ISBN'; // EBAY_BOOK_NO_ISBN
}

/** Where the organizer fixes a blocked push: the package fields, the eBay settings page, or the ISBN field. */
export function informationalPushFix(code: string | null | undefined): 'package' | 'ebay-settings' | 'isbn' | null {
  if (!isInformationalPushCode(code)) return null;
  if (PACKAGE_DETAIL_CODES.indexOf(code as string) !== -1) return 'package';
  if (EBAY_SETUP_CODES.indexOf(code as string) !== -1) return 'ebay-settings';
  return 'isbn';
}

/** Route of the eBay settings page (organizer settings, eBay tab). */
export const EBAY_SETTINGS_HREF = '/organizer/settings?tab=ebay';

type BlockedResultLike = { itemId?: string; status?: string; code?: string | null; error?: string | null; informational?: boolean };

/**
 * One persistent summary for a sale-level push: how many items were blocked because they need more information, in plain
 * words, plus up to three item TITLES (never ids). Null when nothing was blocked.
 */
export function describeBlockedPushes(
  results: ReadonlyArray<BlockedResultLike>,
  titleOf: (itemId: string) => string | null | undefined
): { text: string; titles: string[]; count: number } | null {
  const blocked = results.filter((r) => r && r.status === 'error' && (r.informational || isInformationalPushCode(r.code ?? r.error)));
  if (blocked.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const r of blocked) {
    const label = informationalPushLabel(r.code ?? r.error) || 'Needs package details';
    counts[label] = (counts[label] || 0) + 1;
  }
  const parts: string[] = [];
  const plural = (n: number) => (n === 1 ? 'item' : 'items');
  if (counts['Needs package details']) {
    const n = counts['Needs package details'];
    parts.push(`${n} ${plural(n)} ${n === 1 ? 'needs' : 'need'} package details before ${n === 1 ? 'it' : 'they'} can go to eBay`);
  }
  if (counts['Needs ISBN']) {
    const n = counts['Needs ISBN'];
    parts.push(`${n} ${plural(n)} ${n === 1 ? 'needs' : 'need'} an ISBN before ${n === 1 ? 'it' : 'they'} can go to eBay`);
  }
  if (counts['Finish eBay setup']) {
    const n = counts['Finish eBay setup'];
    parts.push(`Finish eBay setup before ${n} ${plural(n)} can go to eBay`);
  }
  const titles = blocked
    .map((r) => (r.itemId ? titleOf(r.itemId) : null) || 'Untitled item')
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 3);
  return { text: parts.join('. '), titles, count: blocked.length };
}

/** The settled result of a push (a recentPushes row or a repush outcome). */
export function describePushOutcome(row: OutcomeRowLike): OutcomeView {
  const needsInfoLabel = row.status === 'FAILED' || row.status === 'PARTIAL' ? informationalPushLabel(row.errorCode) : null;
  if (needsInfoLabel) {
    return {
      tone: 'warning',
      text: `${needsInfoLabel}: ${row.errorMessage || 'Add the missing details, then update eBay again.'}`,
      canRetry: false,
    };
  }
  const attempted = row.fieldsAttempted || [];
  const pushed = row.fieldsPushed && row.fieldsPushed.length > 0 ? row.fieldsPushed : [];
  switch (row.status) {
    case 'SUCCESS': {
      // fieldsPushed lists only what was actually sent to eBay. A field that needed no change (already on eBay, or the category
      // has no such field) is in fieldsAttempted but not fieldsPushed: never say "updated" for it. A row with no fieldsPushed
      // list at all (older data) falls back to the attempted fields, as before.
      if (row.fieldsPushed === undefined || row.fieldsPushed === null) {
        return { tone: 'success', text: attempted.length > 0 ? `eBay updated: ${fieldList(attempted)}` : 'eBay updated', canRetry: false };
      }
      if (pushed.length > 0) {
        const unchanged = attempted.filter((f) => pushed.indexOf(f) === -1);
        return {
          tone: 'success',
          text: unchanged.length > 0 ? `eBay updated: ${fieldList(pushed)}. No change needed for ${fieldList(unchanged)}.` : `eBay updated: ${fieldList(pushed)}`,
          canRetry: false,
        };
      }
      return {
        tone: 'success',
        text: attempted.length > 0 ? `eBay already has this (${fieldList(attempted)}). Nothing needed to be sent.` : 'eBay is already up to date. Nothing needed to be sent.',
        canRetry: false,
      };
    }
    case 'PARTIAL': {
      const failed = attempted.filter((f) => pushed.indexOf(f) === -1);
      const parts: string[] = [];
      parts.push(pushed.length > 0 ? `eBay updated: ${fieldList(pushed)}.` : 'eBay was only partly updated.');
      parts.push(failed.length > 0 ? `Could not update: ${fieldList(failed)}.` : 'Part of the update did not go through.');
      if (row.errorMessage) parts.push(row.errorMessage);
      return { tone: 'warning', text: parts.join(' '), canRetry: true };
    }
    case 'FAILED':
      return {
        tone: 'error',
        text: `eBay update failed: ${row.errorMessage || 'eBay did not accept the update.'}`,
        canRetry: true,
      };
    case 'SKIPPED_HELD':
      return { tone: 'info', text: SYNC_PAUSED_TEXT, canRetry: false };
    case 'SKIPPED_NOT_LISTED':
      return { tone: 'info', text: 'eBay not changed (this item is not listed on eBay)', canRetry: false };
    default:
      return { tone: 'info', text: 'eBay not changed', canRetry: false };
  }
}

// ---------------------------------------------------------------------------------------------------------
// Bounded polling for the push row that follows a save
// ---------------------------------------------------------------------------------------------------------

/** Delays before each fetch. Five entries means at most five fetches, then the poll stops. */
export const OUTCOME_POLL_DELAYS_MS: ReadonlyArray<number> = [1500, 2000, 3000, 4000, 5000];

export interface PushRowLike {
  id: string;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface NewPushContext {
  /** Row ids already known before the save click (from the status loaded earlier). */
  knownIds: ReadonlyArray<string>;
  /** True when a status had been loaded before the click, so knownIds is trustworthy. */
  knownLoaded: boolean;
  /** Date.now() at the save click. */
  clickedAtMs: number;
}

const CLOCK_SKEW_MS = 5000;

export function rowTimeMs(row: PushRowLike): number | null {
  const raw = row.createdAt || row.startedAt || row.finishedAt;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** The newest row that did not exist before the save click, or null. Rows are newest first. */
export function findNewPush<T extends PushRowLike>(rows: ReadonlyArray<T>, ctx: NewPushContext): T | null {
  const row = rows[0];
  if (!row) return null;
  if (ctx.knownLoaded) return ctx.knownIds.indexOf(row.id) === -1 ? row : null;
  const t = rowTimeMs(row);
  return t !== null && t >= ctx.clickedAtMs - CLOCK_SKEW_MS ? row : null;
}

export interface PollArgs<T extends PushRowLike> {
  /** Fetches the status once and returns its recentPushes (newest first). A throw counts as an attempt with no row. */
  fetchRows: () => Promise<ReadonlyArray<T>>;
  ctx: NewPushContext;
  wait: (ms: number) => Promise<void>;
  isCancelled: () => boolean;
  delays?: ReadonlyArray<number>;
}

/**
 * Waits, fetches, and checks, once per delay (five by default), and stops at the first new row. Never polls past the
 * delay list, and stops at once when cancelled (unmount). `attempts` is the number of fetches made.
 */
export async function pollForNewPush<T extends PushRowLike>(
  args: PollArgs<T>
): Promise<{ row: T | null; attempts: number; cancelled: boolean }> {
  const delays = args.delays || OUTCOME_POLL_DELAYS_MS;
  let attempts = 0;
  for (let i = 0; i < delays.length; i++) {
    await args.wait(delays[i]);
    if (args.isCancelled()) return { row: null, attempts, cancelled: true };
    attempts += 1;
    try {
      const rows = await args.fetchRows();
      if (args.isCancelled()) return { row: null, attempts, cancelled: true };
      const row = findNewPush(rows, args.ctx);
      if (row) return { row, attempts, cancelled: false };
    } catch {
      // A failed fetch is just a miss; the next delay tries again, up to the limit.
    }
  }
  return { row: null, attempts, cancelled: false };
}

// ---------------------------------------------------------------------------------------------------------
// The single save-outcome row next to Save: a newer result always replaces the older one
// ---------------------------------------------------------------------------------------------------------

export interface SaveOutcomeState {
  /** 'pending' while the eBay push is still being waited for, 'settled' once the row is in or nothing was planned. */
  phase: 'pending' | 'settled' | 'timeout';
  view: OutcomeView | null;
  /** "Needs manual update on Vinted." style sentences from the plan. */
  extensionLines: string[];
}

/** True when the view is the "sync paused" message, which stops being true once the hold is released. */
export function isSyncPausedView(view: OutcomeView | null | undefined): boolean {
  return !!view && view.text === SYNC_PAUSED_TEXT;
}

export type OutcomeEvent =
  /** "Update eBay now" (or Retry) came back. `view` is the push outcome, or null for a message-only answer. */
  | { type: 'repush'; view: OutcomeView | null; retry: boolean }
  /** "Resume syncing" succeeded: the hold is gone. */
  | { type: 'release' };

/** Keep only the extension prompts (they are about other marketplaces and stay true); null when none are left. */
function extensionsOnly(prev: SaveOutcomeState | null): SaveOutcomeState | null {
  if (!prev || prev.extensionLines.length === 0) return null;
  return { phase: 'settled', view: null, extensionLines: prev.extensionLines };
}

/**
 * The next outcome row after a hold action. A repush result replaces the older eBay message (a Retry also drops the
 * extension prompts, as before). A message-only repush or a release removes an eBay message that can no longer be
 * true: any pending or paused text after a repush, the paused text after a release.
 */
export function reduceSaveOutcome(prev: SaveOutcomeState | null, event: OutcomeEvent): SaveOutcomeState | null {
  if (event.type === 'repush') {
    if (event.view) {
      return {
        phase: 'settled',
        view: event.view,
        extensionLines: event.retry ? [] : prev ? prev.extensionLines : [],
      };
    }
    // Message-only answer: nothing was pushed, so an older "updating" or "paused" row is out of date.
    if (!prev || !prev.view) return prev;
    if (isSyncPausedView(prev.view) || prev.view.tone === 'pending') return extensionsOnly(prev);
    return prev;
  }
  if (!prev) return null;
  if (isSyncPausedView(prev.view)) return extensionsOnly(prev);
  return prev;
}

/**
 * What the footer should show. A "sync paused" row is hidden whenever the loaded status says nothing is held, so a
 * hold released anywhere (this page, another tab, a refetch) never leaves it behind.
 */
export function selectVisibleOutcome(
  outcome: SaveOutcomeState | null,
  hold: { heldAt?: string | null },
  statusLoaded: boolean
): SaveOutcomeState | null {
  if (!outcome) return null;
  if (statusLoaded && !hold.heldAt && isSyncPausedView(outcome.view)) return extensionsOnly(outcome);
  return outcome;
}
