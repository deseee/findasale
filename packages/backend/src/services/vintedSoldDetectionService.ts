/**
 * vintedSoldDetectionService.ts -- Vinted sold-detection (2026-09-23, S-EXT-VINTED-SOLD-DETECT).
 *
 * Nothing in FindA.Sale learned that an item sold on Vinted: the item stayed AVAILABLE and kept
 * its live Facebook / Poshmark / Craigslist / Mercari listings. Live case: "Mr. Natural #2 R. Crumb"
 * (Item cmo3etbyk003ljqsui846fr84) sold on Vinted, listed there outside job tracking (no VINTED
 * MarketplaceListingJob row at all). fas-vinted.js now reads the organizer's own wardrobe through
 * Vinted's same-origin API (sold listings carry is_closed: true + item_closing_action: "sold") and
 * reports them to POST /api/extension/vinted-sold, which lands here.
 *
 * Resolution, per reported { vintedId, title }, always scoped to the calling organizer:
 *   (a) a VINTED MarketplaceListingJob whose remoteListingId === vintedId (Item has no item-level
 *       Vinted id column; the job row is the only stored id);
 *   (b) otherwise an exact NORMALIZED-title match (case, whitespace, punctuation collapsed) that is
 *       UNIQUE across the organizer's items. More than one match -> 'ambiguous', never guessed.
 *       A title match whose item already has a DIFFERENT Vinted listing id on record is refused
 *       (that item's Vinted listing is some other listing).
 *
 * On a match the sale goes through commitFacebookNativeSale (the shared commit-and-cascade helper
 * also used by /internal/mark-item-sold-elsewhere and markItemSoldOnFacebook) with soldVia
 * 'VINTED'. Before that, if the item has a live VINTED listing on record (latest non-SKIPPED
 * VINTED row is POST/POSTED), a VINTED REMOVE/REMOVED row is written -- the same row
 * markItemRemoved writes -- so getPendingRemovals never hands the removal engine the Vinted
 * listing itself (it already sold there). Every other still-POSTED platform stays in the pending
 * removals and is withdrawn by the extension's normal cross-platform removal engine.
 *
 * TITLE-ONLY ENTRY (2026-09-23, ADR-131 Vinted email branch): Vinted's "You sold an item on
 * Vinted" email carries the title but no listing id. processVintedSoldTitleReport runs the same
 * batch path with vintedId '' ("unknown"): step (a) is skipped, step (b) keeps its uniqueness and
 * VINTED_SOLD_MIN_TITLE_LEN refusals, and the "different Vinted id on record" refusal is skipped
 * because there is no reported id to compare against (a job-tracked item's own Vinted listing is
 * exactly what that email is about). Same commit (soldVia 'VINTED'), so whichever of the email
 * and the extension wardrobe report runs second gets alreadySold.
 *
 * TESTABILITY: matchVintedSoldEntry is pure; processVintedSoldReport takes injectable deps.
 */

import { prisma } from '../lib/prisma';
import { commitFacebookNativeSale, isMultiStockItem } from './facebookNativeSaleService';
import { soldEmailStaleReason } from './soldEmailSourceGuard';

export const SOLD_VIA_VINTED = 'VINTED';
export const VINTED_SOLD_MAX_ENTRIES = 200;
// Same floor fas-vinted.js's removal matcher uses (VINT_REM_MIN_SAFE_TITLE_LEN): a very short
// normalized title collides with unrelated items, so it is never title-matched.
export const VINTED_SOLD_MIN_TITLE_LEN = 8;

export interface VintedSoldEntry {
  vintedId: string;
  title: string;
}

export interface VintedSoldCandidateItem {
  id: string;
  title: string;
  status: string;
}

export interface VintedSoldMatchContext {
  /** vintedId -> item ids whose VINTED job rows carry that remoteListingId (organizer-scoped). */
  itemIdsByRemoteId: Map<string, Set<string>>;
  /** itemId -> every Vinted remoteListingId recorded on that item's VINTED job rows. */
  remoteIdsByItemId: Map<string, Set<string>>;
  /** normalized title -> organizer items with that normalized title. */
  itemsByNormTitle: Map<string, VintedSoldCandidateItem[]>;
  /** True when the job rows carried action/status (full row state), so live-listing logic below is meaningful. */
  hasJobState: boolean;
  /** itemId -> remoteListingId (null = not recorded) of the item's LIVE Vinted listing (latest non-REMOVE/SKIPPED row is POST/POSTED). */
  liveRemoteIdByItemId: Map<string, string | null>;
  /** Items with a live Vinted listing, with their significant title tokens (token-overlap fallback). */
  liveTokenItems: Array<{ item: VintedSoldCandidateItem; tokens: Set<string>; numerics: Set<string> }>;
}

export interface VintedJobRow {
  itemId: string;
  remoteListingId: string | null;
  action?: string;
  status?: string;
  createdAt?: Date | string | null;
}

const TOKEN_STOPWORDS = new Set([
  'each', 'qty', 'quantity', 'size', 'sizes', 'pack', 'set', 'lot', 'of', 'the', 'a', 'an', 'and', 'for', 'with', 'in', 'to', 'new', 'x',
]);
export const VINTED_TOKEN_MATCH_MIN_SHARED = 4;
export const VINTED_TOKEN_MATCH_ITEM_COVERAGE = 0.9; // share of the ITEM's tokens present in the sold title
export const VINTED_TOKEN_MATCH_TITLE_COVERAGE = 0.6; // share of the SOLD title's tokens present in the item

/** Significant tokens of a listing title: normalized, "qty N" removed, stopwords dropped, plural 's' folded. Numbers kept apart. */
export function significantTitleTokens(title: string | null | undefined): { tokens: Set<string>; numerics: Set<string> } {
  const norm = normalizeListingTitle(title).replace(/\b(?:qty|quantity)\s+\d+\b/g, ' ');
  const tokens = new Set<string>();
  const numerics = new Set<string>();
  for (const raw of norm.split(' ')) {
    if (!raw || TOKEN_STOPWORDS.has(raw)) continue;
    if (/^\d+$/.test(raw)) { numerics.add(raw); continue; }
    tokens.add(raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
  }
  return { tokens, numerics };
}

export type VintedSoldMatch =
  | { kind: 'matched'; itemId: string; via: 'remoteId' | 'title' | 'titleTokens' }
  | { kind: 'ambiguous'; candidateCount: number; via: 'remoteId' | 'title' | 'titleTokens' }
  | { kind: 'notFound'; reason: string };

/** Lowercase, strip diacritics, turn every non-alphanumeric run into one space, trim. */
export function normalizeListingTitle(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildVintedSoldMatchContext(
  items: VintedSoldCandidateItem[],
  vintedJobs: VintedJobRow[],
): VintedSoldMatchContext {
  const itemIdsByRemoteId = new Map<string, Set<string>>();
  const remoteIdsByItemId = new Map<string, Set<string>>();
  for (const j of vintedJobs) {
    if (!j.remoteListingId) continue;
    if (!itemIdsByRemoteId.has(j.remoteListingId)) itemIdsByRemoteId.set(j.remoteListingId, new Set());
    itemIdsByRemoteId.get(j.remoteListingId)!.add(j.itemId);
    if (!remoteIdsByItemId.has(j.itemId)) remoteIdsByItemId.set(j.itemId, new Set());
    remoteIdsByItemId.get(j.itemId)!.add(j.remoteListingId);
  }
  // Live listing per item = latest non-(REMOVE/SKIPPED) row, when it is POST/POSTED (same rule as the commit's idempotency key).
  const hasJobState = vintedJobs.some((j) => j.action !== undefined && j.status !== undefined);
  const liveRemoteIdByItemId = new Map<string, string | null>();
  if (hasJobState) {
    const latest = new Map<string, { row: VintedJobRow; t: number }>();
    vintedJobs.forEach((j, idx) => {
      if (j.action === 'REMOVE' && j.status === 'SKIPPED') return;
      const t = j.createdAt ? new Date(j.createdAt as any).getTime() : idx;
      const cur = latest.get(j.itemId);
      if (!cur || t >= cur.t) latest.set(j.itemId, { row: j, t });
    });
    for (const [itemId, { row }] of latest) {
      if (row.action === 'POST' && row.status === 'POSTED') liveRemoteIdByItemId.set(itemId, row.remoteListingId || null);
    }
  }
  const liveTokenItems: VintedSoldMatchContext['liveTokenItems'] = [];
  for (const it of items) {
    if (!liveRemoteIdByItemId.has(it.id)) continue;
    const { tokens, numerics } = significantTitleTokens(it.title);
    if (tokens.size >= VINTED_TOKEN_MATCH_MIN_SHARED) liveTokenItems.push({ item: it, tokens, numerics });
  }
  const itemsByNormTitle = new Map<string, VintedSoldCandidateItem[]>();
  for (const it of items) {
    const key = normalizeListingTitle(it.title);
    if (!key) continue;
    const arr = itemsByNormTitle.get(key) || [];
    arr.push(it);
    itemsByNormTitle.set(key, arr);
  }
  return { itemIdsByRemoteId, remoteIdsByItemId, itemsByNormTitle, hasJobState, liveRemoteIdByItemId, liveTokenItems };
}

/** Pure resolver for one reported sold Vinted listing. Remote id always wins over title. */
export function matchVintedSoldEntry(entry: VintedSoldEntry, ctx: VintedSoldMatchContext): VintedSoldMatch {
  // '' = no Vinted id known (title-only report from the sold email); never looked up by id.
  const hasId = entry.vintedId.length > 0;
  const byId = hasId ? ctx.itemIdsByRemoteId.get(entry.vintedId) : undefined;
  if (byId && byId.size === 1) return { kind: 'matched', itemId: byId.values().next().value as string, via: 'remoteId' };
  if (byId && byId.size > 1) return { kind: 'ambiguous', candidateCount: byId.size, via: 'remoteId' };

  const norm = normalizeListingTitle(entry.title);
  if (norm.length < VINTED_SOLD_MIN_TITLE_LEN) return { kind: 'notFound', reason: 'title_too_short' };
  const hits = ctx.itemsByNormTitle.get(norm) || [];
  if (hits.length === 0) return matchByTokenOverlap(entry, ctx);
  if (hits.length > 1) return { kind: 'ambiguous', candidateCount: hits.length, via: 'title' };
  const hit = hits[0];
  if (hasId && hasDifferentLiveVintedId(hit.id, entry.vintedId, ctx)) {
    return { kind: 'notFound', reason: 'title_match_has_different_vinted_id' };
  }
  return { kind: 'matched', itemId: hit.id, via: 'title' };
}

/**
 * True when a title match must be refused because the item's Vinted listing is some OTHER listing. With full job state
 * (2026-10-12) only the item's LIVE listing id counts, and a live row with NO recorded id (the extension did not capture
 * it) never blocks: older rows of a relisted multi-unit item carry old sold ids that must not veto the new sale. Without
 * job state (legacy callers/tests) every recorded id counts, as before.
 */
function hasDifferentLiveVintedId(itemId: string, vintedId: string, ctx: VintedSoldMatchContext): boolean {
  if (ctx.hasJobState) {
    if (!ctx.liveRemoteIdByItemId.has(itemId)) return false; // not live on record: the commit decides
    const liveId = ctx.liveRemoteIdByItemId.get(itemId);
    return !!liveId && liveId !== vintedId;
  }
  const recorded = ctx.remoteIdsByItemId.get(itemId);
  return !!recorded && recorded.size > 0 && !recorded.has(vintedId);
}

/**
 * Fallback when no item has the same normalized title: robust token overlap against ONLY the organizer's items that have a
 * live Vinted listing on record (so a sold title can only close a listing that is actually live). The sale title may be a
 * re-worded variant of the stored one ("BCW Nickel Coin Tubes, Each, Crystal Clear Storage" vs "BCW Nickel Size Coin Tube
 * Crystal Clear, Qty 1"). A candidate needs >= 4 shared tokens, >= 90% of the ITEM's tokens inside the sold title and
 * >= 60% of the sold title's tokens inside the item, with identical numbers (#2 vs #3 never match). Exactly one candidate
 * qualifies or nothing is matched (several -> ambiguous, never guessed). A sibling product that differs by one distinctive
 * word (Dime vs Nickel) falls under the 90% bar.
 */
function matchByTokenOverlap(entry: VintedSoldEntry, ctx: VintedSoldMatchContext): VintedSoldMatch {
  const hasId = entry.vintedId.length > 0;
  const sold = significantTitleTokens(entry.title);
  if (sold.tokens.size < VINTED_TOKEN_MATCH_MIN_SHARED) return { kind: 'notFound', reason: 'no_match' };
  const qualifying: string[] = [];
  for (const c of ctx.liveTokenItems) {
    if (c.numerics.size !== sold.numerics.size || [...c.numerics].some((n) => !sold.numerics.has(n))) continue;
    let shared = 0;
    for (const t of c.tokens) if (sold.tokens.has(t)) shared++;
    if (shared < VINTED_TOKEN_MATCH_MIN_SHARED) continue;
    if (shared / c.tokens.size < VINTED_TOKEN_MATCH_ITEM_COVERAGE) continue;
    if (shared / sold.tokens.size < VINTED_TOKEN_MATCH_TITLE_COVERAGE) continue;
    if (hasId && hasDifferentLiveVintedId(c.item.id, entry.vintedId, ctx)) continue;
    qualifying.push(c.item.id);
  }
  if (qualifying.length === 1) return { kind: 'matched', itemId: qualifying[0], via: 'titleTokens' };
  if (qualifying.length > 1) return { kind: 'ambiguous', candidateCount: qualifying.length, via: 'titleTokens' };
  return { kind: 'notFound', reason: 'no_match' };
}

export type VintedSoldResultKind = 'sold' | 'alreadySold' | 'notAvailable' | 'ambiguous' | 'notFound' | 'error';

export interface VintedSoldEntryResult {
  vintedId: string;
  title: string;
  result: VintedSoldResultKind;
  matched: boolean;
  itemId?: string;
  via?: 'remoteId' | 'title' | 'titleTokens';
  itemStatus?: string;
  vintedListingClosed?: boolean;
  reason?: string;
  candidateCount?: number;
}

export interface VintedSoldDeps {
  loadCandidateItems?: (organizerId: string) => Promise<VintedSoldCandidateItem[]>;
  loadVintedJobs?: (organizerId: string) => Promise<VintedJobRow[]>;
  /** Writes VINTED REMOVE/REMOVED when the item's Vinted listing is live on record; true if written. */
  closeVintedListingRecord?: (itemId: string) => Promise<boolean>;
  commitSale?: (itemId: string, soldVia: string, remoteListingId?: string, opts?: VintedCommitOpts) => Promise<VintedCommitOutcome>;
  getItemStatus?: (itemId: string) => Promise<string | null>;
}

export interface VintedCommitOpts {
  /** Ids come from a fresh Vinted ORDER (bundle), not a wardrobe re-report; see CommitFacebookNativeSaleOptions.soldOnPlatform. */
  trustedOrder?: boolean;
}
export interface VintedCommitOutcome {
  alreadyCommitted: boolean;
  partial?: boolean;
  /** This exact Vinted listing id already consumed a unit earlier (counts as resolved). */
  alreadyCounted?: boolean;
  noopReason?: string;
}

function organizerItemScope(organizerId: string) {
  return {
    deletedAt: null,
    listingType: { not: 'CONSIGNOR_TAG' }, // consignor price tags are never sold-sync candidates
    OR: [
      { sale: { organizerId, deletedAt: null } },
      { saleId: null, organizerId },
    ],
  };
}

async function defaultLoadCandidateItems(organizerId: string): Promise<VintedSoldCandidateItem[]> {
  return prisma.item.findMany({
    where: organizerItemScope(organizerId),
    select: { id: true, title: true, status: true },
  });
}

async function defaultLoadVintedJobs(organizerId: string) {
  return prisma.marketplaceListingJob.findMany({
    // All VINTED rows (also those with no recorded id): the live-listing state is needed to tolerate NULL ids.
    where: { platform: 'VINTED', item: organizerItemScope(organizerId) },
    select: { itemId: true, remoteListingId: true, action: true, status: true, createdAt: true },
  });
}

// Mirrors markItemRemoved's row (action REMOVE, status REMOVED, platform) and its latest-row rule
// (REMOVE/SKIPPED is a failed attempt, not a state change -- same exclusion getPendingRemovals
// applies). Only written while the latest VINTED row is POST/POSTED, so a repeat report is a no-op.
async function defaultCloseVintedListingRecord(itemId: string): Promise<boolean> {
  // Multi-unit item (2026-09-30): commitFacebookNativeSale closes the row itself, inside the same
  // transaction as the stock decrement -- closing it here first would consume the idempotency key.
  if (await isMultiStockItem(itemId)) return false;
  // 2026-10-12: a sold e-mail older than the live listing must not close that listing (soldEmailSourceGuard.ts).
  if (await soldEmailStaleReason(itemId, 'VINTED')) return false;
  const latest = await prisma.marketplaceListingJob.findFirst({
    where: { itemId, platform: 'VINTED', NOT: { action: 'REMOVE', status: 'SKIPPED' } },
    orderBy: { createdAt: 'desc' },
    select: { action: true, status: true },
  });
  if (!latest || latest.action !== 'POST' || latest.status !== 'POSTED') return false;
  await prisma.marketplaceListingJob.create({
    data: {
      itemId,
      action: 'REMOVE',
      status: 'REMOVED',
      platform: 'VINTED',
      lastAttemptAt: new Date(),
      lastErrorMessage: 'sold_on_vinted',
    },
  });
  return true;
}

async function defaultCommitSale(itemId: string, soldVia: string, remoteListingId?: string, opts: VintedCommitOpts = {}): Promise<VintedCommitOutcome> {
  const r = await commitFacebookNativeSale(itemId, soldVia, {
    soldOnPlatform: { platform: 'VINTED', remoteListingId: remoteListingId || null, ...(opts.trustedOrder ? { trustedOrder: true } : {}) },
  });
  return { alreadyCommitted: r.alreadyCommitted, partial: r.partial === true, alreadyCounted: r.alreadyCounted === true, noopReason: r.noopReason };
}

async function defaultGetItemStatus(itemId: string): Promise<string | null> {
  const it = await prisma.item.findUnique({ where: { id: itemId }, select: { status: true } });
  return it?.status ?? null;
}

/** Validates and de-duplicates the raw request body entries. */
export function sanitizeVintedSoldEntries(raw: unknown): VintedSoldEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: VintedSoldEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const idRaw = (e as any).vintedId;
    const vintedId = typeof idRaw === 'number' && Number.isSafeInteger(idRaw) ? String(idRaw) : typeof idRaw === 'string' ? idRaw.trim() : '';
    const title = typeof (e as any).title === 'string' ? (e as any).title.slice(0, 500) : '';
    if (!/^\d{1,20}$/.test(vintedId) || seen.has(vintedId)) continue;
    seen.add(vintedId);
    out.push({ vintedId, title });
    if (out.length >= VINTED_SOLD_MAX_ENTRIES) break;
  }
  return out;
}

export async function processVintedSoldReport(
  organizerId: string,
  entries: VintedSoldEntry[],
  deps: VintedSoldDeps = {},
  opts: VintedCommitOpts = {},
): Promise<VintedSoldEntryResult[]> {
  if (!organizerId) throw new Error('organizerId required'); // never an unscoped lookup
  const loadCandidateItems = deps.loadCandidateItems ?? defaultLoadCandidateItems;
  const loadVintedJobs = deps.loadVintedJobs ?? defaultLoadVintedJobs;
  const closeVintedListingRecord = deps.closeVintedListingRecord ?? defaultCloseVintedListingRecord;
  const commitSale = deps.commitSale ?? defaultCommitSale;
  const getItemStatus = deps.getItemStatus ?? defaultGetItemStatus;

  if (!entries.length) return [];
  const [items, jobs] = await Promise.all([loadCandidateItems(organizerId), loadVintedJobs(organizerId)]);
  const ctx = buildVintedSoldMatchContext(items, jobs);

  const results: VintedSoldEntryResult[] = [];
  const handledItemIds = new Set<string>();
  for (const entry of entries) {
    const m = matchVintedSoldEntry(entry, ctx);
    if (m.kind === 'ambiguous') {
      results.push({ ...entry, result: 'ambiguous', matched: false, via: m.via, candidateCount: m.candidateCount });
      continue;
    }
    if (m.kind === 'notFound') {
      results.push({ ...entry, result: 'notFound', matched: false, reason: m.reason });
      continue;
    }
    if (handledItemIds.has(m.itemId)) {
      // Two sold Vinted listings resolved to the same FindA.Sale item in one batch -- never
      // double-apply; report the second as ambiguous for a human to look at.
      results.push({ ...entry, result: 'ambiguous', matched: false, via: m.via, itemId: m.itemId, reason: 'item_already_matched_in_batch' });
      continue;
    }
    handledItemIds.add(m.itemId);
    // Vinted record first, so a pending-removals poll racing this request can never see the item
    // SOLD with its Vinted listing still marked live (which would queue a Vinted delete).
    let vintedListingClosed = false;
    let alreadyCommitted: boolean;
    let partial = false;
    let alreadyCounted = false;
    let noopReason: string | undefined;
    try {
      vintedListingClosed = await closeVintedListingRecord(m.itemId);
      const c = opts.trustedOrder
        ? await commitSale(m.itemId, SOLD_VIA_VINTED, entry.vintedId, opts)
        : await commitSale(m.itemId, SOLD_VIA_VINTED, entry.vintedId);
      ({ alreadyCommitted, partial = false } = c);
      alreadyCounted = c.alreadyCounted === true;
      noopReason = c.noopReason;
    } catch (err: any) {
      // One bad entry never fails the batch; the extension does not mark it reported, so it retries.
      console.error('[VintedSoldDetection] commit failed for item', m.itemId, err?.message || err);
      results.push({ ...entry, result: 'error', matched: true, itemId: m.itemId, via: m.via, vintedListingClosed, reason: 'commit_failed' });
      continue;
    }
    if (!alreadyCommitted) {
      // A multi-unit item that still has stock stays AVAILABLE; its Vinted listing closed and re-queues.
      results.push({ ...entry, result: 'sold', matched: true, itemId: m.itemId, via: m.via, itemStatus: partial ? 'AVAILABLE' : 'SOLD', vintedListingClosed: vintedListingClosed || partial });
      continue;
    }
    const status = await getItemStatus(m.itemId);
    // alreadyCounted: this exact Vinted listing id already consumed a unit (a retry of a committed multi-unit sale) -> resolved.
    results.push({
      ...entry,
      result: status === 'SOLD' || alreadyCounted ? 'alreadySold' : 'notAvailable',
      matched: true,
      itemId: m.itemId,
      via: m.via,
      itemStatus: status ?? undefined,
      vintedListingClosed,
      ...(alreadyCounted ? { reason: 'listing_already_counted' } : noopReason && status !== 'SOLD' ? { reason: noopReason } : {}),
    });
  }
  return results;
}

/**
 * Title-only variant for Vinted's sold email (no listing id in it). One entry, organizer-scoped,
 * same matcher refusals and same commit path as processVintedSoldReport.
 */
export async function processVintedSoldTitleReport(
  organizerId: string,
  title: string,
  deps: VintedSoldDeps = {},
): Promise<VintedSoldEntryResult> {
  const clean = String(title ?? '').slice(0, 500);
  const [result] = await processVintedSoldReport(organizerId, [{ vintedId: '', title: clean }], deps);
  return result;
}

/**
 * RETRY variant for a sold e-mail that was already processed once (2026-10-12, Nickel Coin Tube): the first pass found no
 * match (the re-worded e-mail title did not exact-match, and the token-overlap matcher was not deployed yet), the e-mail
 * was marked processed and never looked at again, so the Vinted row stayed POSTED after the sale. A replay must be SAFE, so
 * it is deliberately narrower than processVintedSoldTitleReport: it only goes ahead when the pure matcher resolves the title
 * to exactly one item with a LIVE Vinted listing through the token-overlap fallback. Anything else (exact title hit, no
 * match, ambiguous) returns notFound WITHOUT touching the item, because an exact-title email that matched earlier may belong
 * to an item the organizer has since put back on sale, and replaying it would sell that item again.
 */
export async function processVintedSoldTitleReportTokenMatchOnly(
  organizerId: string,
  title: string,
  deps: VintedSoldDeps = {},
): Promise<VintedSoldEntryResult> {
  if (!organizerId) throw new Error('organizerId required'); // never an unscoped lookup
  const clean = String(title ?? '').slice(0, 500);
  const loadCandidateItems = deps.loadCandidateItems ?? defaultLoadCandidateItems;
  const loadVintedJobs = deps.loadVintedJobs ?? defaultLoadVintedJobs;
  const [items, jobs] = await Promise.all([loadCandidateItems(organizerId), loadVintedJobs(organizerId)]);
  const m = matchVintedSoldEntry({ vintedId: '', title: clean }, buildVintedSoldMatchContext(items, jobs));
  if (m.kind !== 'matched' || m.via !== 'titleTokens') {
    return {
      vintedId: '',
      title: clean,
      result: 'notFound',
      matched: false,
      reason: m.kind === 'notFound' ? m.reason : 'retry_not_a_token_match',
    };
  }
  return processVintedSoldTitleReport(organizerId, clean, deps);
}

// ---------------------------------------------------------------------------------------------
// Manual reconciliation (2026-10-12, Vinted bundle sale): the organizer ticks the items that were
// in a bundle and we run the SAME per-item sold flow as the email / wardrobe paths above
// (closeVintedListingRecord, then commitFacebookNativeSale with soldVia 'VINTED' and
// soldOnPlatform VINTED, which cascades withdrawals to every other channel). No price is read or
// guessed: the commit helper never takes one, so each item keeps its own price and the bundle
// total is not allocated (no bundle/multi-item allocation convention exists in this codebase).
// ---------------------------------------------------------------------------------------------

export const VINTED_MANUAL_SOLD_MAX_ITEMS = 50;

export type VintedManualSoldResultKind = 'sold' | 'alreadySold' | 'notAvailable' | 'notFound' | 'error';

export interface VintedManualSoldResult {
  itemId: string;
  title?: string;
  result: VintedManualSoldResultKind;
  itemStatus?: string;
  vintedListingClosed?: boolean;
  reason?: string;
}

export interface VintedManualSoldDeps {
  loadOwnedItems?: (organizerId: string, itemIds: string[]) => Promise<VintedSoldCandidateItem[]>;
  closeVintedListingRecord?: (itemId: string) => Promise<boolean>;
  commitSale?: (itemId: string, soldVia: string, remoteListingId?: string) => Promise<{ alreadyCommitted: boolean; partial?: boolean }>;
  getItemStatus?: (itemId: string) => Promise<string | null>;
}

async function defaultLoadOwnedItems(organizerId: string, itemIds: string[]): Promise<VintedSoldCandidateItem[]> {
  return prisma.item.findMany({
    where: { id: { in: itemIds }, ...organizerItemScope(organizerId) },
    select: { id: true, title: true, status: true },
  });
}

/** Keeps only non-empty string ids, trimmed, unique, in order. Does NOT cap (the caller rejects an oversized list). */
export function sanitizeManualSoldItemIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id || id.length > 64 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function markItemsSoldOnVinted(
  organizerId: string,
  itemIds: string[],
  deps: VintedManualSoldDeps = {},
): Promise<VintedManualSoldResult[]> {
  if (!organizerId) throw new Error('organizerId required'); // never an unscoped lookup
  if (itemIds.length > VINTED_MANUAL_SOLD_MAX_ITEMS) throw new Error('too_many_items');
  const loadOwnedItems = deps.loadOwnedItems ?? defaultLoadOwnedItems;
  const closeVintedListingRecord = deps.closeVintedListingRecord ?? defaultCloseVintedListingRecord;
  const commitSale = deps.commitSale ?? defaultCommitSale;
  const getItemStatus = deps.getItemStatus ?? defaultGetItemStatus;
  if (!itemIds.length) return [];

  const owned = new Map((await loadOwnedItems(organizerId, itemIds)).map((i) => [i.id, i]));
  const results: VintedManualSoldResult[] = [];
  for (const itemId of itemIds) {
    const it = owned.get(itemId);
    if (!it) {
      results.push({ itemId, result: 'notFound', reason: 'not_found_for_this_organizer' });
      continue;
    }
    let vintedListingClosed = false;
    let alreadyCommitted: boolean;
    let partial = false;
    try {
      vintedListingClosed = await closeVintedListingRecord(itemId);
      ({ alreadyCommitted, partial = false } = await commitSale(itemId, SOLD_VIA_VINTED, ''));
    } catch (err: any) {
      console.error('[VintedManualSold] commit failed for item', itemId, err?.message || err);
      results.push({ itemId, title: it.title, result: 'error', vintedListingClosed, reason: 'commit_failed' });
      continue;
    }
    if (!alreadyCommitted) {
      results.push({ itemId, title: it.title, result: 'sold', itemStatus: partial ? 'AVAILABLE' : 'SOLD', vintedListingClosed: vintedListingClosed || partial });
      continue;
    }
    const status = await getItemStatus(itemId);
    results.push({
      itemId,
      title: it.title,
      result: status === 'SOLD' ? 'alreadySold' : 'notAvailable',
      itemStatus: status ?? undefined,
      vintedListingClosed,
    });
  }
  return results;
}
