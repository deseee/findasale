/**
 * vintedBundleOrderService.ts -- automatic reconciliation of a Vinted BUNDLE sale (2026-10-12).
 *
 * Vinted's bundle sold email names no items, but it carries a link to the order's conversation
 * (vintedSoldEmailDetection.ts extractVintedConversationId). The extension (fas-vinted.js) reads that
 * order from Vinted itself with the organizer's own session and reports the Vinted item ids here:
 *
 *   POST /api/extension/vinted-bundle-orders/report  { noticeId, conversationId, items: [{ vintedId, title }] }
 *
 * Each reported item goes through processVintedSoldReport (VINTED job remoteListingId first, unique
 * normalized title second, never guessed), which commits the sale exactly like a single-item Vinted sale
 * (commitFacebookNativeSale, soldVia VINTED: closes the Vinted record, marks the item SOLD, withdraws every
 * other channel). The notice is closed ONLY when the number of items sold/already sold reaches the bundle's
 * item count from the email (a retry of a unit already counted for that exact Vinted id reports alreadySold). Fewer -> the notice stays open, the attempt is counted, and the next extension
 * sold-check retries (everything already committed is idempotent). After
 * VINTED_BUNDLE_AUTO_MAX_ATTEMPTS unresolved attempts the notice switches to the manual-page fallback wording.
 *
 * Safety: a report with MORE items than the email's item count is refused outright (a mis-parsed order must
 * never sell extra inventory), and the notice must belong to the calling user.
 */

import { prisma } from '../lib/prisma';
import {
  processVintedSoldReport,
  sanitizeVintedSoldEntries,
  VINTED_SOLD_MAX_ENTRIES,
  type VintedSoldEntry,
  type VintedSoldEntryResult,
  type VintedSoldDeps,
} from './vintedSoldDetectionService';
import {
  VINTED_BUNDLE_NOTIFICATION_TYPE,
  parseBundleNoticeLink,
  recordBundleNoticeAttempt,
} from './vintedBundleSaleService';

export type VintedBundleOrderOutcome =
  | { status: 'notFound' }
  | { status: 'alreadyResolved' }
  | { status: 'rejected'; reason: 'no_conversation' | 'conversation_mismatch' | 'no_item_count' | 'too_many_items' | 'too_many_entries' }
  | { status: 'resolved'; resolved: number; itemCount: number; results: VintedSoldEntryResult[] }
  | { status: 'partial'; resolved: number; itemCount: number; attempts: number; fallbackShown: boolean; results: VintedSoldEntryResult[] };

export interface VintedBundleOrderReportArgs {
  userId: string;
  organizerId: string;
  noticeId: string;
  conversationId?: string | null;
  /** Raw body entries ({ vintedId, title }); sanitized here. */
  items: unknown;
  /** True when the extension could not read the order from Vinted at all (counts as an unresolved attempt). */
  readFailed?: boolean;
  /** Optional short reason code for a failed read (untrusted: sanitized by sanitizeBundleFailReason). */
  failReason?: unknown;
}

/** Keeps only [a-z0-9_:.-], max 120 chars; non-strings / empty -> null. Reason codes only, never free text. */
export function sanitizeBundleFailReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/[^a-z0-9_:.-]/gi, '').slice(0, 120);
  return clean || null;
}

export interface VintedBundleOrderDeps {
  processReport?: (organizerId: string, entries: VintedSoldEntry[]) => Promise<VintedSoldEntryResult[]>;
  /** Injection points of the shared per-item matcher/committer (tests drive the real matching with fakes). */
  soldDeps?: VintedSoldDeps;
}

export async function reportVintedBundleOrder(
  args: VintedBundleOrderReportArgs,
  deps: VintedBundleOrderDeps = {},
): Promise<VintedBundleOrderOutcome> {
  if (!args.userId || !args.organizerId) throw new Error('userId and organizerId required'); // never unscoped
  const notice = await prisma.notification.findFirst({
    where: { id: String(args.noticeId || ''), userId: args.userId, type: VINTED_BUNDLE_NOTIFICATION_TYPE },
    select: { id: true, link: true, body: true, read: true, createdAt: true },
  });
  if (!notice) return { status: 'notFound' };
  if (notice.read) return { status: 'alreadyResolved' };
  const orderCreatedAt = notice.createdAt;
  const processReport =
    deps.processReport ?? ((orgId: string, entries: VintedSoldEntry[]) => processVintedSoldReport(orgId, entries, deps.soldDeps, { trustedOrder: true, ...(orderCreatedAt ? { orderCreatedAt } : {}) }));

  const meta = parseBundleNoticeLink(notice.link, notice.body);
  if (!meta.conversationId) return { status: 'rejected', reason: 'no_conversation' };
  if (args.conversationId && String(args.conversationId) !== meta.conversationId) {
    return { status: 'rejected', reason: 'conversation_mismatch' };
  }
  const itemCount = meta.itemCount;
  if (!itemCount) return { status: 'rejected', reason: 'no_item_count' };

  const rawList = Array.isArray(args.items) ? args.items : [];
  if (rawList.length > VINTED_SOLD_MAX_ENTRIES) return { status: 'rejected', reason: 'too_many_entries' };
  const entries = args.readFailed ? [] : sanitizeVintedSoldEntries(rawList);

  if (entries.length > itemCount) {
    console.warn('[VintedBundleOrder] refusing report: more items than the email bundle count', {
      noticeId: notice.id,
      itemCount,
      reported: entries.length,
    });
    await recordBundleNoticeAttempt(notice, args.organizerId);
    return { status: 'rejected', reason: 'too_many_items' };
  }

  let results: VintedSoldEntryResult[] = [];
  if (entries.length > 0) results = await processReport(args.organizerId, entries);
  const resolved = results.filter((r) => r.result === 'sold' || r.result === 'alreadySold').length;

  if (resolved >= itemCount) {
    // Conditional on still-unread so two racing reports close it once.
    await prisma.notification.updateMany({ where: { id: notice.id, read: false }, data: { read: true } });
    console.log('[VintedBundleOrder] RESOLVED', JSON.stringify({ noticeId: notice.id, conversationId: meta.conversationId, itemCount, resolved }));
    return { status: 'resolved', resolved, itemCount, results };
  }

  const failReason = args.readFailed ? sanitizeBundleFailReason(args.failReason) : null;
  const attempt = await recordBundleNoticeAttempt(notice, args.organizerId, failReason);
  console.log(
    '[VintedBundleOrder] PARTIAL -- notice stays open, next sold-check retries',
    JSON.stringify({
      noticeId: notice.id,
      conversationId: meta.conversationId,
      itemCount,
      reported: entries.length,
      resolved,
      attempts: attempt.attempts,
      readFailed: !!args.readFailed,
      ...(args.readFailed ? { reason: failReason ?? 'unspecified' } : {}),
      // Per-entry outcome so the cause of an unresolved entry is visible (2026-10-12).
      entries: results.map((r) => ({
        vintedId: r.vintedId,
        title: String(r.title ?? '').slice(0, 80),
        result: r.result,
        via: r.via ?? null,
        reason: r.reason ?? null,
        itemId: r.itemId ?? null,
        itemStatus: r.itemStatus ?? null,
      })),
    }),
  );
  return { status: 'partial', resolved, itemCount, attempts: attempt.attempts, fallbackShown: attempt.fallbackShown, results };
}
