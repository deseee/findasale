// Extension heartbeat (2026-10-26). The browser extension reads its sign-in from the finda.sale cookies in Chrome. When
// that session expires, every auto queue poll fails on the extension side with not_signed_in and never reaches the
// server, so nothing gets posted and nothing said so (live: silent from 2026-10-25 15:58 until noticed the next day).
//
// The server-side signal: every successful GET /extension/autolist-queue records a heartbeat for the organizer. It reuses
// ExtensionRuntimeLog (no schema change): ONE row per organizer with source AUTOQUEUE_HEARTBEAT, updated in place, whose
// createdAt is the time of the last successful poll. Its context also carries what the extension reported on that poll:
//   held      -- items the extension is holding back from the Poshmark auto queue because Poshmark's own checker flagged
//                them (oversized / prohibited) within the last 30 days (by design, Patrick 2026-10-22), so the web page
//                can list them instead of the hold being silent;
//   v         -- extension version;
//   alertedAt -- set by jobs/extensionHeartbeatAlertJob.ts when it has already notified about the current silence.
//                A new successful poll clears it, which re-arms the alert for the next silence.
//   release   -- (2026-10-26, 1.0.67) held Poshmark items the organizer asked to try again ("Try again on Poshmark" on the
//                web card): [{ itemId, at }]. The autolist-queue response hands them to the extension as releaseHolds; the
//                extension drops its own hold and acks them on its next poll (?released=), which removes them here.
// Only an extension poll (one that sends ?v=) records a heartbeat (2026-10-26 retest: a cookie GET from the web replaced
// the whole context and the page showed held 0 / version null). A poll merges into the existing context: held and v are
// the extension's current report, alertedAt is cleared, and any other keys are kept.
// Pure helpers are exported for unit tests.
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { organizerListableScope } from './itemKitListing';

export const HEARTBEAT_SOURCE = 'AUTOQUEUE_HEARTBEAT';
/** An organizer with auto queue on whose extension has not polled successfully for this long gets a notice. */
export const HEARTBEAT_STALE_MS = 24 * 60 * 60 * 1000;
export const HEARTBEAT_HELD_MAX = 50;

// 'edit' (2026-10-26): a price/stock EDIT on an already-live Poshmark listing that Poshmark flagged (certify) and that its own Edit
// Listing form did not take either. The extension holds it (never retries, never certifies) and the web card says "Poshmark needs you to
// confirm this edit". The item IS listed on Poshmark, so heldStillUnlisted keeps it.
export type HeldKind = 'oversized' | 'prohibited' | 'edit';
export type HeldItem = { itemId: string; kind: HeldKind; at: string };
export type HeldRelease = { itemId: string; at: string };
export type HeartbeatRecord = { lastPollAt: Date | null; held: HeldItem[]; alertedAt: Date | null; version: string | null; release: HeldRelease[] };
/** A pending release the extension never acked (an old extension that ignores releaseHolds) is dropped after this long. */
export const RELEASE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ITEM_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const VERSION_RE = /^\d{1,3}(\.\d{1,4}){1,3}$/;

/**
 * Parse the `held` query parameter the extension sends with its poll: comma-separated `itemId~kind~atMs` entries.
 * Anything malformed is dropped, never coerced. At most HEARTBEAT_HELD_MAX entries, de-duplicated by item id.
 */
export function parseHeldParam(raw: unknown, now: number = Date.now()): HeldItem[] {
  if (typeof raw !== 'string' || !raw) return [];
  const out: HeldItem[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',').slice(0, HEARTBEAT_HELD_MAX * 2)) {
    const [itemId, kind, atRaw] = part.split('~');
    if (!itemId || !ITEM_ID_RE.test(itemId) || seen.has(itemId)) continue;
    if (kind !== 'oversized' && kind !== 'prohibited' && kind !== 'edit') continue;
    const at = Number(atRaw);
    if (!Number.isFinite(at) || at <= 0 || at > now + 60 * 60 * 1000) continue;
    seen.add(itemId);
    out.push({ itemId, kind, at: new Date(at).toISOString() });
    if (out.length >= HEARTBEAT_HELD_MAX) break;
  }
  return out;
}

/** Parse a comma-separated item id list (the extension's ?released= ack). Malformed ids dropped; at most HEARTBEAT_HELD_MAX. */
export function parseIdListParam(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  const out: string[] = [];
  for (const id of raw.split(',').slice(0, HEARTBEAT_HELD_MAX * 2)) {
    if (ITEM_ID_RE.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= HEARTBEAT_HELD_MAX) break;
  }
  return out;
}

export function parseVersionParam(raw: unknown): string | null {
  return typeof raw === 'string' && VERSION_RE.test(raw) ? raw : null;
}

/**
 * Held items that are still not listed on Poshmark (2026-10-26 retest: an item flagged in the morning and published there
 * the same evening stayed on the held list). jobs: that item's Poshmark MarketplaceListingJob rows. Same "latest row per
 * item wins, a failed removal (REMOVE/SKIPPED) does not end a listing" rule as getAutolistQueue's isAlreadyListed. Pure.
 * eligibleIds (2026-10-26, Samurai Shodown II sold on Mercari stayed on the held list): when given, a held item whose id is
 * not in it (sold, reserved, deleted, unpublished, or not this organizer's) is no longer held, whatever its kind.
 */
export function heldStillUnlisted(held: HeldItem[], jobs: Array<{ itemId: string; action: string; status: string; createdAt: Date }>, eligibleIds?: Set<string>): HeldItem[] {
  const latest = new Map<string, { action: string; status: string; createdAt: Date }>();
  for (const j of jobs) {
    if (j.action === 'REMOVE' && j.status === 'SKIPPED') continue;
    const cur = latest.get(j.itemId);
    if (!cur || j.createdAt > cur.createdAt) latest.set(j.itemId, j);
  }
  return held.filter((h) => {
    if (eligibleIds && !eligibleIds.has(h.itemId)) return false;
    if (h.kind === 'edit') return true;   // an edit hold is about a listing that is live; "listed" does not end it
    const l = latest.get(h.itemId);
    return !(l && l.action === 'POST' && l.status === 'POSTED');
  });
}

/** An item that can still be listed: AVAILABLE, PUBLISHED, not deleted (same status/draft rule as getAutolistQueue). Pure. */
export function isHoldEligibleItem(it: { status: string | null; draftStatus: string | null; deletedAt?: Date | null }): boolean {
  return it.status === 'AVAILABLE' && it.draftStatus === 'PUBLISHED' && !it.deletedAt;
}

/**
 * For held item ids: which are this organizer's own items (with titles), which are still listable, and their Poshmark
 * jobs, so callers can run heldStillUnlisted(held, poshJobs, eligibleIds). Throws on a DB error (callers catch).
 */
export async function loadHeldItemState(organizerId: string, itemIds: string[]): Promise<{
  titleById: Map<string, string>;
  eligibleIds: Set<string>;
  poshJobs: Array<{ itemId: string; action: string; status: string; createdAt: Date }>;
}> {
  if (!itemIds.length) return { titleById: new Map(), eligibleIds: new Set(), poshJobs: [] };
  const rows = await prisma.item.findMany({
    where: { id: { in: itemIds }, OR: organizerListableScope(organizerId) },
    select: { id: true, title: true, status: true, draftStatus: true, deletedAt: true },
  });
  const poshJobs = rows.length
    ? await prisma.marketplaceListingJob.findMany({
      where: { itemId: { in: rows.map((r) => r.id) }, platform: 'POSHMARK' },
      select: { itemId: true, action: true, status: true, createdAt: true },
    })
    : [];
  return {
    titleById: new Map(rows.map((r) => [r.id, r.title])),
    eligibleIds: new Set(rows.filter(isHoldEligibleItem).map((r) => r.id)),
    poshJobs,
  };
}

/**
 * Item ids of reported Poshmark-flag holds (oversized / prohibited) that the extension should drop: the item is sold,
 * deleted, unpublished, not this organizer's, or already listed on Poshmark. Edit holds are left to the extension's own
 * drift-queue pruning. Never throws (an error reads as "drop nothing").
 */
export async function staleFlagHoldIds(organizerId: string, held: HeldItem[]): Promise<string[]> {
  const flags = held.filter((h) => h.kind !== 'edit');
  if (!flags.length) return [];
  try {
    const st = await loadHeldItemState(organizerId, flags.map((h) => h.itemId));
    const keep = new Set(heldStillUnlisted(flags, st.poshJobs, st.eligibleIds).map((h) => h.itemId));
    return flags.filter((h) => !keep.has(h.itemId)).map((h) => h.itemId);
  } catch {
    return [];
  }
}

/** Heartbeat status for the web card. stale = auto queue is on and no successful poll within HEARTBEAT_STALE_MS. */
export function heartbeatStatus(lastPollAt: Date | null, anyAutoQueueOn: boolean, now: number = Date.now()): { stale: boolean; neverSeen: boolean } {
  if (!anyAutoQueueOn) return { stale: false, neverSeen: lastPollAt == null };
  if (lastPollAt == null) return { stale: true, neverSeen: true };
  return { stale: now - lastPollAt.getTime() > HEARTBEAT_STALE_MS, neverSeen: false };
}

/**
 * True when the alert job should notify: auto queue on, the extension HAS polled before (an organizer who never installed
 * it is not nagged; the web card covers that case), it has been silent longer than HEARTBEAT_STALE_MS, and this silence
 * has not been alerted yet (alertedAt is cleared by the next successful poll).
 */
export function shouldAlertHeartbeat(hb: { lastPollAt: Date | null; alertedAt: Date | null }, anyAutoQueueOn: boolean, now: number = Date.now()): boolean {
  if (!anyAutoQueueOn || !hb.lastPollAt) return false;
  if (now - hb.lastPollAt.getTime() <= HEARTBEAT_STALE_MS) return false;
  return !hb.alertedAt || hb.alertedAt.getTime() < hb.lastPollAt.getTime();
}

function toRecord(row: { createdAt: Date; context: unknown } | null): HeartbeatRecord {
  if (!row) return { lastPollAt: null, held: [], alertedAt: null, version: null, release: [] };
  const ctx = (row.context && typeof row.context === 'object' ? row.context : {}) as Record<string, unknown>;
  const held = Array.isArray(ctx.held)
    ? (ctx.held as unknown[]).filter((h): h is HeldItem => !!h && typeof h === 'object'
      && typeof (h as HeldItem).itemId === 'string' && ((h as HeldItem).kind === 'oversized' || (h as HeldItem).kind === 'prohibited' || (h as HeldItem).kind === 'edit')
      && typeof (h as HeldItem).at === 'string')
    : [];
  const alertedAt = typeof ctx.alertedAt === 'string' && !Number.isNaN(Date.parse(ctx.alertedAt)) ? new Date(ctx.alertedAt) : null;
  return { lastPollAt: row.createdAt, held, alertedAt, version: typeof ctx.v === 'string' ? ctx.v : null, release: parseRelease(ctx.release) };
}

function parseRelease(raw: unknown): HeldRelease[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter((r): r is HeldRelease => !!r && typeof r === 'object'
    && typeof (r as HeldRelease).itemId === 'string' && ITEM_ID_RE.test((r as HeldRelease).itemId)
    && typeof (r as HeldRelease).at === 'string' && !Number.isNaN(Date.parse((r as HeldRelease).at)));
}

/**
 * Merge an extension poll into an existing heartbeat context: keep unrelated keys, set the extension's current held list
 * and version, and drop alertedAt (a successful poll ends the silence). Pending releases the extension acked (info.acked)
 * or that are older than RELEASE_TTL_MS are removed; the rest are kept. Pure; exported for unit tests.
 */
export function mergeHeartbeatContext(existing: unknown, info: { held: HeldItem[]; version: string | null; acked?: string[] }, now: number = Date.now()): Record<string, unknown> {
  const base = (existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {}) as Record<string, unknown>;
  delete base.alertedAt;
  base.held = info.held;
  if (info.version) base.v = info.version;
  if (base.release !== undefined) {
    const acked = new Set(info.acked || []);
    const left = parseRelease(base.release).filter((r) => !acked.has(r.itemId) && now - Date.parse(r.at) <= RELEASE_TTL_MS);
    if (left.length) base.release = left; else delete base.release;
  }
  return base;
}

/** Add organizer-requested releases to a heartbeat context (de-duplicated by item id, newest wins). Pure. */
export function addReleasesToContext(existing: unknown, itemIds: string[], now: number = Date.now()): Record<string, unknown> {
  const base = (existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const at = new Date(now).toISOString();
  const keep = parseRelease(base.release).filter((r) => !itemIds.includes(r.itemId));
  base.release = [...keep, ...itemIds.map((itemId) => ({ itemId, at }))].slice(-HEARTBEAT_HELD_MAX);
  return base;
}

/**
 * Record a successful extension poll. Never throws (a heartbeat write must never break the queue response).
 * A poll with no extension version is not the extension and is ignored (see the header).
 * Returns the item ids still pending release after this poll's ack (the response's releaseHolds); [] on error.
 */
export async function recordExtensionHeartbeat(organizerId: string, info: { held: HeldItem[]; version: string | null; acked?: string[] }): Promise<string[]> {
  if (!info.version) return [];
  try {
    const existing = await prisma.extensionRuntimeLog.findFirst({
      where: { organizerId, source: HEARTBEAT_SOURCE },
      orderBy: { createdAt: 'desc' },
      select: { id: true, context: true },
    });
    const merged = mergeHeartbeatContext(existing?.context, info);
    const context = merged as unknown as Prisma.InputJsonValue;
    if (existing) {
      await prisma.extensionRuntimeLog.update({ where: { id: existing.id }, data: { createdAt: new Date(), context } });
    } else {
      await prisma.extensionRuntimeLog.create({
        data: { organizerId, level: 'info', source: HEARTBEAT_SOURCE, message: 'auto queue poll (last successful)', context },
      });
    }
    return parseRelease(merged.release).map((r) => r.itemId);
  } catch (err) {
    console.warn('[extensionHeartbeat] record failed:', (err as Error)?.message || err);
    return [];
  }
}

/**
 * Record the organizer's "Try again on Poshmark" for these held item ids (already validated by the caller as this
 * organizer's own currently held flag items). Updates the heartbeat row's context only; does not move the last-poll
 * time. Returns false when there is no heartbeat row (nothing is held then). Throws on a DB error.
 */
export async function addHeldReleases(organizerId: string, itemIds: string[], now: number = Date.now()): Promise<boolean> {
  const existing = await prisma.extensionRuntimeLog.findFirst({
    where: { organizerId, source: HEARTBEAT_SOURCE },
    orderBy: { createdAt: 'desc' },
    select: { id: true, context: true },
  });
  if (!existing) return false;
  const context = addReleasesToContext(existing.context, itemIds, now) as unknown as Prisma.InputJsonValue;
  await prisma.extensionRuntimeLog.update({ where: { id: existing.id }, data: { context } });
  return true;
}

/** Latest heartbeat for one organizer. Never throws; a read error reads as "no heartbeat". */
export async function loadExtensionHeartbeat(organizerId: string): Promise<HeartbeatRecord> {
  try {
    const row = await prisma.extensionRuntimeLog.findFirst({
      where: { organizerId, source: HEARTBEAT_SOURCE },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, context: true },
    });
    return toRecord(row);
  } catch {
    return toRecord(null);
  }
}

/** Heartbeats for many organizers (alert job). Map organizerId -> { rowId, record }. */
export async function loadExtensionHeartbeats(organizerIds: string[]): Promise<Map<string, { id: string; context: unknown; record: HeartbeatRecord }>> {
  const out = new Map<string, { id: string; context: unknown; record: HeartbeatRecord }>();
  if (!organizerIds.length) return out;
  const rows = await prisma.extensionRuntimeLog.findMany({
    where: { organizerId: { in: organizerIds }, source: HEARTBEAT_SOURCE },
    orderBy: { createdAt: 'desc' },
    select: { id: true, organizerId: true, createdAt: true, context: true },
  });
  for (const r of rows) {
    if (!out.has(r.organizerId)) out.set(r.organizerId, { id: r.id, context: r.context, record: toRecord(r) });
  }
  return out;
}
