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
import { commitFacebookNativeSale } from './facebookNativeSaleService';

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
}

export type VintedSoldMatch =
  | { kind: 'matched'; itemId: string; via: 'remoteId' | 'title' }
  | { kind: 'ambiguous'; candidateCount: number; via: 'remoteId' | 'title' }
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
  vintedJobs: Array<{ itemId: string; remoteListingId: string | null }>,
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
  const itemsByNormTitle = new Map<string, VintedSoldCandidateItem[]>();
  for (const it of items) {
    const key = normalizeListingTitle(it.title);
    if (!key) continue;
    const arr = itemsByNormTitle.get(key) || [];
    arr.push(it);
    itemsByNormTitle.set(key, arr);
  }
  return { itemIdsByRemoteId, remoteIdsByItemId, itemsByNormTitle };
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
  if (hits.length === 0) return { kind: 'notFound', reason: 'no_match' };
  if (hits.length > 1) return { kind: 'ambiguous', candidateCount: hits.length, via: 'title' };
  const hit = hits[0];
  const recorded = ctx.remoteIdsByItemId.get(hit.id);
  if (hasId && recorded && recorded.size > 0 && !recorded.has(entry.vintedId)) {
    return { kind: 'notFound', reason: 'title_match_has_different_vinted_id' };
  }
  return { kind: 'matched', itemId: hit.id, via: 'title' };
}

export type VintedSoldResultKind = 'sold' | 'alreadySold' | 'notAvailable' | 'ambiguous' | 'notFound' | 'error';

export interface VintedSoldEntryResult {
  vintedId: string;
  title: string;
  result: VintedSoldResultKind;
  matched: boolean;
  itemId?: string;
  via?: 'remoteId' | 'title';
  itemStatus?: string;
  vintedListingClosed?: boolean;
  reason?: string;
  candidateCount?: number;
}

export interface VintedSoldDeps {
  loadCandidateItems?: (organizerId: string) => Promise<VintedSoldCandidateItem[]>;
  loadVintedJobs?: (organizerId: string) => Promise<Array<{ itemId: string; remoteListingId: string | null }>>;
  /** Writes VINTED REMOVE/REMOVED when the item's Vinted listing is live on record; true if written. */
  closeVintedListingRecord?: (itemId: string) => Promise<boolean>;
  commitSale?: (itemId: string, soldVia: string) => Promise<{ alreadyCommitted: boolean }>;
  getItemStatus?: (itemId: string) => Promise<string | null>;
}

function organizerItemScope(organizerId: string) {
  return {
    deletedAt: null,
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
    where: { platform: 'VINTED', remoteListingId: { not: null }, item: organizerItemScope(organizerId) },
    select: { itemId: true, remoteListingId: true },
  });
}

// Mirrors markItemRemoved's row (action REMOVE, status REMOVED, platform) and its latest-row rule
// (REMOVE/SKIPPED is a failed attempt, not a state change -- same exclusion getPendingRemovals
// applies). Only written while the latest VINTED row is POST/POSTED, so a repeat report is a no-op.
async function defaultCloseVintedListingRecord(itemId: string): Promise<boolean> {
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

async function defaultCommitSale(itemId: string, soldVia: string) {
  const r = await commitFacebookNativeSale(itemId, soldVia);
  return { alreadyCommitted: r.alreadyCommitted };
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
    try {
      vintedListingClosed = await closeVintedListingRecord(m.itemId);
      ({ alreadyCommitted } = await commitSale(m.itemId, SOLD_VIA_VINTED));
    } catch (err: any) {
      // One bad entry never fails the batch; the extension does not mark it reported, so it retries.
      console.error('[VintedSoldDetection] commit failed for item', m.itemId, err?.message || err);
      results.push({ ...entry, result: 'error', matched: true, itemId: m.itemId, via: m.via, vintedListingClosed, reason: 'commit_failed' });
      continue;
    }
    if (!alreadyCommitted) {
      results.push({ ...entry, result: 'sold', matched: true, itemId: m.itemId, via: m.via, itemStatus: 'SOLD', vintedListingClosed });
      continue;
    }
    const status = await getItemStatus(m.itemId);
    results.push({
      ...entry,
      result: status === 'SOLD' ? 'alreadySold' : 'notAvailable',
      matched: true,
      itemId: m.itemId,
      via: m.via,
      itemStatus: status ?? undefined,
      vintedListingClosed,
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
