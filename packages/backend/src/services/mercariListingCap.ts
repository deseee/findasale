// Mercari active-listing cap (2026-10-27, Patrick: "well mercari has a 100 listing threshhold").
//
// Mercari limits a seller account's ACTIVE listings ("Currently you are limited to 100 listings. This will be increased as you
// complete more sales."). extension/fas-mercari.js detects that notice on the sell page and stops with the trace problem code
// mercari_listing_limit; the trace is forwarded to ExtensionRuntimeLog (source "trace:MERCARI", message
// "[mercari_listing_limit] ... limited to N listings ..."). That newest report is the cap; never seen = 100.
//
// GET /extension/autolist-queue hands out at most (cap - live) Mercari items per poll. "Live" is counted exactly like every
// other listed flag: the newest non-SKIPPED MarketplaceListingJob row per item is POST/POSTED (all of the organizer's items,
// listable or not, because a sold/unpublished item's Mercari listing occupies a slot until it is removed), plus Mercari
// PendingListingRemoval rows (deleted items whose listing is still up). A listing that SOLD on Mercari has a sold_on_mercari
// REMOVE row as its newest row, so it is not live: its slot is already free and its repost uses exactly that slot (net zero).
// Deactivated listings are inactive on Mercari and do not count. Reposts (proven sellers) get the free slots first.

import { prisma } from '../lib/prisma';

export const DEFAULT_MERCARI_LISTING_CAP = 100;
export const MERCARI_LISTING_LIMIT_CODE = 'mercari_listing_limit';
const CAP_MIN = 1;
const CAP_MAX = 100000;

type Row = { itemId: string; action: string; status: string; createdAt: Date | string };

/** N from a reported Mercari limit (context.ctx.cap first, else "limited to N listings" in the message). Null when absent or absurd. */
export function parseMercariListingCap(message: unknown, context?: unknown): number | null {
  const ctx = context && typeof context === 'object' ? (context as any).ctx : null;
  const fromCtx = ctx && typeof ctx === 'object' ? Number((ctx as any).cap) : NaN;
  const fromMsg = (() => {
    const m = String(message ?? '').match(/limited to (\d{1,6}) listings?/i);
    return m ? Number(m[1]) : NaN;
  })();
  const n = Number.isInteger(fromCtx) ? fromCtx : fromMsg;
  return Number.isInteger(n) && n >= CAP_MIN && n <= CAP_MAX ? n : null;
}

/** Items whose newest non-SKIPPED Mercari row is POST/POSTED. */
export function countLiveListings(rows: readonly Row[]): number {
  const latest = new Map<string, Row>();
  for (const r of rows) {
    if (r.action === 'REMOVE' && r.status === 'SKIPPED') continue;
    const cur = latest.get(r.itemId);
    if (!cur || new Date(r.createdAt).getTime() > new Date(cur.createdAt).getTime()) latest.set(r.itemId, r);
  }
  let n = 0;
  for (const r of latest.values()) if (r.action === 'POST' && r.status === 'POSTED') n++;
  return n;
}

export interface MercariCapacity {
  cap: number;
  capSource: 'reported' | 'default';
  live: number;
  free: number;
  atLimit: boolean;
  /** Plain note for the queue response / web card; null while there is room. */
  note: string | null;
}

export function mercariCapacity(cap: number | null, live: number): MercariCapacity {
  const c = cap ?? DEFAULT_MERCARI_LISTING_CAP;
  const free = Math.max(c - Math.max(live, 0), 0);
  return {
    cap: c,
    capSource: cap == null ? 'default' : 'reported',
    live,
    free,
    atLimit: free === 0,
    note: free === 0 ? mercariLimitNote(c) : null,
  };
}

export function mercariLimitNote(cap: number): string {
  return `Mercari is at its ${cap}-listing limit for your account. New Mercari listings wait until one sells or is removed.`;
}

/**
 * At most `free` entries, reposts after a sale first (in their original order), then new items (original order).
 * Returns what to queue and how many were held back for lack of room.
 */
export function applyMercariCap<T extends { repostAfterSale?: boolean }>(entries: readonly T[], free: number): { kept: T[]; heldBack: number } {
  const room = Math.max(Math.floor(free), 0);
  const ordered = [...entries.filter((e) => e.repostAfterSale === true), ...entries.filter((e) => e.repostAfterSale !== true)];
  const kept = ordered.slice(0, room);
  return { kept, heldBack: entries.length - kept.length };
}

type Db = typeof prisma;

/** Newest reported cap for this organizer (ExtensionRuntimeLog), or null. Never throws. */
export async function loadReportedMercariCap(organizerId: string, db: Db = prisma): Promise<number | null> {
  try {
    const row = await db.extensionRuntimeLog.findFirst({
      where: {
        organizerId,
        source: { in: ['trace:MERCARI', 'trace:Mercari'] },
        message: { startsWith: `[${MERCARI_LISTING_LIMIT_CODE}]` },
      },
      orderBy: { createdAt: 'desc' },
      select: { message: true, context: true },
    });
    return row ? parseMercariListingCap(row.message, row.context) : null;
  } catch (err) {
    console.warn('[MercariCap] could not read the reported Mercari listing limit, using the default:', (err as Error)?.message);
    return null;
  }
}

/** The organizer's Mercari capacity right now. Throws on a database error (callers fail closed: no Mercari items). */
export async function loadMercariCapacity(organizerId: string, db: Db = prisma): Promise<MercariCapacity> {
  const [rows, pendingRemovals, cap] = await Promise.all([
    db.marketplaceListingJob.findMany({
      where: { platform: 'MERCARI', item: { OR: [{ sale: { organizerId } }, { organizerId }] } },
      select: { itemId: true, action: true, status: true, createdAt: true },
    }),
    db.pendingListingRemoval.count({ where: { organizerId, platform: 'MERCARI' } }),
    loadReportedMercariCap(organizerId, db),
  ]);
  return mercariCapacity(cap, countLiveListings(rows) + (pendingRemovals || 0));
}
