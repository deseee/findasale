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
//                A new successful poll replaces the context, which re-arms the alert for the next silence.
// Pure helpers are exported for unit tests.
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const HEARTBEAT_SOURCE = 'AUTOQUEUE_HEARTBEAT';
/** An organizer with auto queue on whose extension has not polled successfully for this long gets a notice. */
export const HEARTBEAT_STALE_MS = 24 * 60 * 60 * 1000;
export const HEARTBEAT_HELD_MAX = 50;

export type HeldKind = 'oversized' | 'prohibited';
export type HeldItem = { itemId: string; kind: HeldKind; at: string };
export type HeartbeatRecord = { lastPollAt: Date | null; held: HeldItem[]; alertedAt: Date | null; version: string | null };

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
    if (kind !== 'oversized' && kind !== 'prohibited') continue;
    const at = Number(atRaw);
    if (!Number.isFinite(at) || at <= 0 || at > now + 60 * 60 * 1000) continue;
    seen.add(itemId);
    out.push({ itemId, kind, at: new Date(at).toISOString() });
    if (out.length >= HEARTBEAT_HELD_MAX) break;
  }
  return out;
}

export function parseVersionParam(raw: unknown): string | null {
  return typeof raw === 'string' && VERSION_RE.test(raw) ? raw : null;
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
  if (!row) return { lastPollAt: null, held: [], alertedAt: null, version: null };
  const ctx = (row.context && typeof row.context === 'object' ? row.context : {}) as Record<string, unknown>;
  const held = Array.isArray(ctx.held)
    ? (ctx.held as unknown[]).filter((h): h is HeldItem => !!h && typeof h === 'object'
      && typeof (h as HeldItem).itemId === 'string' && ((h as HeldItem).kind === 'oversized' || (h as HeldItem).kind === 'prohibited')
      && typeof (h as HeldItem).at === 'string')
    : [];
  const alertedAt = typeof ctx.alertedAt === 'string' && !Number.isNaN(Date.parse(ctx.alertedAt)) ? new Date(ctx.alertedAt) : null;
  return { lastPollAt: row.createdAt, held, alertedAt, version: typeof ctx.v === 'string' ? ctx.v : null };
}

/** Record a successful poll. Never throws (a heartbeat write must never break the queue response). */
export async function recordExtensionHeartbeat(organizerId: string, info: { held: HeldItem[]; version: string | null }): Promise<void> {
  try {
    const context = { held: info.held, v: info.version } as unknown as Prisma.InputJsonValue;
    const existing = await prisma.extensionRuntimeLog.findFirst({
      where: { organizerId, source: HEARTBEAT_SOURCE },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      await prisma.extensionRuntimeLog.update({ where: { id: existing.id }, data: { createdAt: new Date(), context } });
    } else {
      await prisma.extensionRuntimeLog.create({
        data: { organizerId, level: 'info', source: HEARTBEAT_SOURCE, message: 'auto queue poll (last successful)', context },
      });
    }
  } catch (err) {
    console.warn('[extensionHeartbeat] record failed:', (err as Error)?.message || err);
  }
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
