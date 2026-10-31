// Removal skip counter per (item, platform) from MarketplaceListingJob rows (2026-10-30).
//
// One rule for every reader of "how many times has removing this listing failed": the fast-fail cap
// (MAX_REMOVAL_SKIP_ATTEMPTS), the deterministic-reason stop, the hard stop / re-probe gate
// (utils/removalRetryGate.ts), getPendingRemovals' needsManualReview, getSyncHealth's manualReviewBacklog
// and the admin marketplace review backlog.
//
// Rule: only REMOVE/SKIPPED rows created AFTER the item+platform's newest POST/POSTED row count. A repost is a
// new listing, so the failures against the old one say nothing about it. Before this, the count covered every
// skip ever recorded: live 2026-10-30, organizer cmnxueoas0005tfv8brnc0kky, items cmp1digeb000lxravcnxftuix
// (Zoom B3), cmpbizn7z000j3lq1rjrvn5js (MXL 770) and cmtbhh5hz022ap46d4s9avonn (Apple Magic Mouse) carried
// 94-95 Poshmark skips from 2026-09-28..30, were REMOVED on 2026-09-30 and reposted on 2026-10-22, and the
// live, correct reposts kept being flagged for manual review (and held to the post-cap cooldown) forever.
// With no POST/POSTED row on record every skip counts (nothing to reset against).

export interface RemovalSkipRow {
  itemId: string;
  platform: string;
  action: string;
  status: string;
  createdAt: Date | string;
  lastAttemptAt?: Date | string | null;
  lastErrorMessage?: string | null;
}

export interface RemovalSkipStats {
  /** REMOVE/SKIPPED rows since the newest POST/POSTED row. Always > 0 for a key present in the map. */
  count: number;
  /** lastErrorMessage of the newest counted skip (by lastAttemptAt, falling back to createdAt). */
  lastReason: string | null;
  /** Newest lastAttemptAt among the counted skips (null when none of them carries one). */
  lastAttemptAt: Date | null;
  /** Newest (lastAttemptAt || createdAt) among the counted skips. */
  lastActivityAt: Date;
}

const ts = (d: Date | string): number => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const asDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));
const isSkip = (r: RemovalSkipRow) => r.action === 'REMOVE' && r.status === 'SKIPPED';
const isPost = (r: RemovalSkipRow) => r.action === 'POST' && r.status === 'POSTED';

/** Skip stats keyed `${itemId}:${platform}`; keys with no counted skip are absent. Rows may be in any order. Pure. */
export function removalSkipStatsByItemPlatform(rows: readonly RemovalSkipRow[]): Map<string, RemovalSkipStats> {
  const newestPostAt = new Map<string, number>();
  for (const r of rows || []) {
    if (!r || !isPost(r)) continue;
    const k = r.itemId + ':' + r.platform;
    const t = ts(r.createdAt);
    if (!newestPostAt.has(k) || t > newestPostAt.get(k)!) newestPostAt.set(k, t);
  }
  const out = new Map<string, RemovalSkipStats>();
  const reasonAt = new Map<string, number>();
  for (const r of rows || []) {
    if (!r || !isSkip(r)) continue;
    const k = r.itemId + ':' + r.platform;
    const postAt = newestPostAt.get(k);
    if (postAt !== undefined && ts(r.createdAt) <= postAt) continue; // a skip against an earlier listing
    const activity = asDate(r.lastAttemptAt || r.createdAt);
    const prev = out.get(k);
    if (!prev) {
      out.set(k, {
        count: 1,
        lastReason: r.lastErrorMessage ?? null,
        lastAttemptAt: r.lastAttemptAt ? asDate(r.lastAttemptAt) : null,
        lastActivityAt: activity,
      });
      reasonAt.set(k, activity.getTime());
      continue;
    }
    prev.count += 1;
    if (activity.getTime() >= reasonAt.get(k)!) {
      reasonAt.set(k, activity.getTime());
      prev.lastReason = r.lastErrorMessage ?? null;
    }
    if (activity.getTime() > prev.lastActivityAt.getTime()) prev.lastActivityAt = activity;
    if (r.lastAttemptAt && (!prev.lastAttemptAt || ts(r.lastAttemptAt) > prev.lastAttemptAt.getTime())) {
      prev.lastAttemptAt = asDate(r.lastAttemptAt);
    }
  }
  return out;
}
