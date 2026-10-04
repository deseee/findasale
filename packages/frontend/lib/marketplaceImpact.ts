/**
 * What a save will do to the marketplaces, and what it did (item editor, Edit page and sheet).
 *
 * Pure module (imports only the condition model, no React, no side effects).
 *
 *  - computeSaveImpact: the BEFORE-save text. Mirrors the backend rules in services/ebayItemPushService.ts
 *    (computeEbayPushFields, buildEbayPlan, buildExtensionPlan): eBay is pushed only for fields that REALLY changed
 *    (title, description, condition, price, shipping inputs), only when the item is listed on eBay with an offer, and
 *    never while the eBay sync is held. Extension marketplaces (Vinted, Poshmark, ...) are never pushed: where the item
 *    is listed and a title, description, condition or price changed, the organizer is told to update it by hand.
 *  - describePlan / describePushOutcome: the AFTER-save row text, from the PUT response's marketplacePlan and from the
 *    newest recentPushes row of GET /items/:id/marketplace-status.
 *  - pollForNewPush: the bounded poll for that row (the push runs after the PUT returns). At most five fetches, then it stops.
 *
 * All copy here follows the brand rules: no em dashes, never the word "AI".
 */
import { desiredEbayCondition } from './conditionModel';

export type EbayPushField = 'title' | 'description' | 'condition' | 'price' | 'shipping';
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
  packageWeightOz?: unknown;
  packageLengthIn?: unknown;
  packageWidthIn?: unknown;
  packageHeightIn?: unknown;
  packageType?: string | null;
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

function priceNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
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

  const shippingChanged =
    (provided(dirty, 'packageWeightOz') && numOrNull(dirty.packageWeightOz) !== numOrNull(loaded.packageWeightOz)) ||
    (provided(dirty, 'packageLengthIn') && numOrNull(dirty.packageLengthIn) !== numOrNull(loaded.packageLengthIn)) ||
    (provided(dirty, 'packageWidthIn') && numOrNull(dirty.packageWidthIn) !== numOrNull(loaded.packageWidthIn)) ||
    (provided(dirty, 'packageHeightIn') && numOrNull(dirty.packageHeightIn) !== numOrNull(loaded.packageHeightIn)) ||
    (provided(dirty, 'packageType') && (blank(dirty.packageType) || null) !== (blank(loaded.packageType) || null));
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
  shipping: 'shipping',
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
  if (ebay.reason === 'held') return { tone: 'info', text: 'eBay not changed (sync paused)', canRetry: false };
  if (ebay.reason === 'no_changes' || ebay.reason === 'no_offer_id') {
    return { tone: 'info', text: 'eBay not changed', canRetry: false };
  }
  return null;
}

type OutcomeRowLike = {
  status: string;
  fieldsAttempted?: string[];
  fieldsPushed?: string[];
  errorMessage?: string | null;
};

/** The settled result of a push (a recentPushes row or a repush outcome). */
export function describePushOutcome(row: OutcomeRowLike): OutcomeView {
  const attempted = row.fieldsAttempted || [];
  const pushed = row.fieldsPushed && row.fieldsPushed.length > 0 ? row.fieldsPushed : [];
  switch (row.status) {
    case 'SUCCESS': {
      const shown = pushed.length > 0 ? pushed : attempted;
      return { tone: 'success', text: shown.length > 0 ? `eBay updated: ${fieldList(shown)}` : 'eBay updated', canRetry: false };
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
      return { tone: 'info', text: 'eBay not changed (sync paused)', canRetry: false };
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
