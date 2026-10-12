/**
 * vintedBundleSaleService.ts -- Vinted multi-item BUNDLE sale handling (S-VINTED-BUNDLE-SALE,
 * 2026-10-11).
 *
 * Live case: Vinted emailed "<buyer> has bought Bundle 5 items ... $5.00" for five listings.
 * The email names no items and carries no listing ids, so the title matcher (exact unique title)
 * cannot resolve it, and nothing was marked sold. Guessing which items sold (e.g. "the 5 newest
 * listings") would mark real, still-for-sale items sold and pull their live listings, so this
 * service NEVER marks anything sold. It does two things instead:
 *
 *  1. Creates one organizer notification (type 'vinted_bundle_sale_pending') naming the bundle
 *     size / amount and listing the organizer's most recently posted live Vinted listings as
 *     CANDIDATES (display only).
 *  2. That unread notification (< 48h old) arms the extension's authoritative path: the
 *     extension's wardrobe sold-check (fas-vinted.js vintSoldMaybeCheck) reads the organizer's own
 *     Vinted wardrobe, where each bundled item shows as sold with its Vinted listing id, and
 *     reports them to POST /api/extension/vinted-sold -> processVintedSoldReport (remote id first,
 *     unique-title fallback) -> commitFacebookNativeSale, the exact flow single-item sales use
 *     (closes the VINTED job row, marks the item SOLD, queues removal on every other platform).
 *     getPendingSoldChecks exposes the flag; reportVintedSold acknowledges it (marks read) once
 *     something was actually sold.
 *
 * AUTOMATIC RECONCILIATION (2026-10-12): the sold email also carries a tracked "message thread" link
 * whose payload is https://www.vinted.com/inbox/<conversationId> (vintedSoldEmailDetection.ts
 * extractVintedConversationId). The conversation id is stored on the notice (see buildBundleNoticeLink:
 * Notification has no JSON column, so the machine fields ride in the link's query string), served to the
 * extension through GET /api/extension/pending-sold-checks (vintedBundleOrders), and the extension reads
 * the order's Vinted item ids from Vinted itself (same-origin, the organizer's own session) and reports
 * them to POST /api/extension/vinted-bundle-orders/report (vintedBundleOrderService.ts), which commits the
 * sale per item and closes the notice only when every item of the bundle resolved. The manual page stays
 * as a fallback, announced only after VINTED_BUNDLE_AUTO_MAX_ATTEMPTS unresolved attempts.
 */

import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';

export const VINTED_BUNDLE_NOTIFICATION_TYPE = 'vinted_bundle_sale_pending';
/** How long an unread bundle notification keeps asking the extension for a forced wardrobe check. */
export const VINTED_BUNDLE_CHECK_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_CANDIDATES_LISTED = 15;
/** Web page where the organizer ticks the bundled items (frontend/pages/organizer/vinted-bundle.tsx). */
export const VINTED_BUNDLE_PAGE_PATH = '/organizer/vinted-bundle';
const MAX_OTHER_OPTIONS = 300;
/** How long an unread bundle notice with a conversation id keeps being served to the extension. */
export const VINTED_BUNDLE_ORDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Unresolved automatic attempts after which the notice switches to the manual-page fallback wording. */
export const VINTED_BUNDLE_AUTO_MAX_ATTEMPTS = 3;
/** The retroactive conversation-id attach only looks at notices this young (Gmail search window is 7 days). */
export const VINTED_BUNDLE_RETRO_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;

export interface VintedBundleCandidate {
  itemId: string;
  title: string;
}

/** Buyer handles are untrusted email text; keep only a short, harmless token for display. */
export function sanitizeBuyerHandle(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  return t || null;
}

/**
 * Pure: the notification body. Exported for tests. `fallback` is false for the normal (automatic) wording
 * and true once automatic reconciliation failed after retries (then the manual page is mentioned and the
 * candidate listings are shown).
 */
export function buildVintedBundleNotificationBody(args: {
  itemCount: number;
  amountText: string | null;
  buyer: string | null;
  candidates?: VintedBundleCandidate[];
  fallback?: boolean;
}): string {
  const buyer = sanitizeBuyerHandle(args.buyer);
  const amount = args.amountText ? String(args.amountText).replace(/[^\w$€£¥.,\s]/g, '').trim().slice(0, 20) : '';
  const head =
    `Vinted reports a bundle of ${args.itemCount} item${args.itemCount === 1 ? '' : 's'} sold` +
    `${amount ? ` for ${amount}` : ''}${buyer ? ` to ${buyer}` : ''}. `;
  if (!args.fallback) {
    return (
      head +
      `FindA.Sale is reconciling this bundle automatically: it reads the order from your Vinted account, marks each ` +
      `item sold and takes it down from your other channels. This happens the next time Chrome with the FindA.Sale ` +
      `extension is open and signed in to Vinted. There is nothing for you to do.`
    );
  }
  const candidates = args.candidates ?? [];
  const how =
    `FindA.Sale could not match every item of this bundle automatically yet, and it keeps retrying. ` +
    `If you would rather not wait, open the Vinted bundle page in FindA.Sale and choose the items yourself.`;
  if (!candidates.length) return head + how;
  const shown = candidates.slice(0, MAX_CANDIDATES_LISTED).map((c) => `"${c.title}"`).join('; ');
  const more = candidates.length > MAX_CANDIDATES_LISTED ? ` (+${candidates.length - MAX_CANDIDATES_LISTED} more)` : '';
  return `${head}${how} Your most recently posted live Vinted listings (candidates only, nothing was changed): ${shown}${more}.`;
}

// ---------------------------------------------------------------------------------------------
// Machine-readable notice fields. Notification has no JSON column and a schema change is not worth it for
// four small values, so they ride in the notice's link query string:
//   /organizer/vinted-bundle?vc=<conversationId>&ic=<itemCount>&at=<priceText>&ta=<failed attempts>
// The page ignores the query string. All reads go through parseBundleNoticeLink.
// ---------------------------------------------------------------------------------------------

export interface VintedBundleNoticeMeta {
  conversationId: string | null;
  itemCount: number | null;
  amountText: string | null;
  attempts: number;
}

export function buildBundleNoticeLink(meta: {
  conversationId?: string | null;
  itemCount: number;
  amountText?: string | null;
  attempts?: number;
}): string {
  const params = new URLSearchParams();
  if (meta.conversationId && /^\d{5,20}$/.test(meta.conversationId)) params.set('vc', meta.conversationId);
  params.set('ic', String(Math.max(1, Math.min(200, Math.floor(meta.itemCount)))));
  if (meta.amountText) params.set('at', String(meta.amountText).replace(/[^\w$€£¥.,\s]/g, '').trim().slice(0, 20));
  params.set('ta', String(Math.max(0, Math.floor(meta.attempts ?? 0))));
  return `${VINTED_BUNDLE_PAGE_PATH}?${params.toString()}`;
}

/** Item count of a legacy notice that has no `ic` in its link: read from the body ("a bundle of N items"). */
export function itemCountFromBundleBody(body: string | null | undefined): number | null {
  const m = /bundle of (\d{1,3}) items?/i.exec(String(body ?? ''));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 200 ? n : null;
}

/** Amount text of a bundle notice body ("... sold for $5.00 to duck212."), or null. */
export function amountFromBundleBody(body: string | null | undefined): string | null {
  const m = /sold for ([^\s]+?)(?: to \S+)?\. /i.exec(String(body ?? ''));
  return m ? m[1] : null;
}

export function parseBundleNoticeLink(link: string | null | undefined, body?: string | null): VintedBundleNoticeMeta {
  const q = String(link ?? '').split('?')[1] ?? '';
  const sp = new URLSearchParams(q);
  const vc = sp.get('vc');
  const ic = parseInt(sp.get('ic') ?? '', 10);
  const ta = parseInt(sp.get('ta') ?? '', 10);
  const at = sp.get('at');
  return {
    conversationId: vc && /^\d{5,20}$/.test(vc) ? vc : null,
    itemCount: Number.isFinite(ic) && ic >= 1 && ic <= 200 ? ic : itemCountFromBundleBody(body),
    amountText: at ? at.slice(0, 20) : amountFromBundleBody(body),
    attempts: Number.isFinite(ta) && ta > 0 ? ta : 0,
  };
}

/**
 * Items of this organizer whose latest VINTED job row is POST/POSTED (live on record), newest
 * posting first. Read-only. Uses the same latest-row rule as getPendingSoldChecks /
 * defaultCloseVintedListingRecord (a REMOVE/SKIPPED row is a failed attempt, not a state change).
 */
export async function listLiveVintedCandidates(organizerId: string, limit = 50): Promise<VintedBundleCandidate[]> {
  if (!organizerId) throw new Error('organizerId required');
  const rows = await prisma.marketplaceListingJob.findMany({
    where: {
      platform: 'VINTED',
      item: {
        status: 'AVAILABLE',
        deletedAt: null,
        OR: [{ sale: { organizerId, deletedAt: null } }, { saleId: null, organizerId }],
      },
    },
    select: { itemId: true, action: true, status: true, createdAt: true, item: { select: { title: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const seen = new Set<string>();
  const out: VintedBundleCandidate[] = [];
  for (const r of rows) {
    if (r.action === 'REMOVE' && r.status === 'SKIPPED') continue;
    if (seen.has(r.itemId)) continue;
    seen.add(r.itemId); // first non-skipped row per item is the latest (createdAt desc)
    if (r.action === 'POST' && r.status === 'POSTED') out.push({ itemId: r.itemId, title: r.item?.title ?? '' });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Best-effort: never throws. Creates the in-app bundle notice (no email: Vinted already emailed the sale, and
 * a notification email would carry the fallback page link, which the organizer is not meant to use).
 * Idempotent per Vinted conversation: a second call for the same conversation id creates nothing.
 */
export async function notifyOrganizerVintedBundleSale(
  organizerId: string,
  info: { itemCount: number; amountText: string | null; buyer: string | null; conversationId?: string | null },
): Promise<void> {
  try {
    const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { userId: true } });
    if (!organizer?.userId) return;
    const conversationId = info.conversationId && /^\d{5,20}$/.test(info.conversationId) ? info.conversationId : null;
    if (conversationId) {
      const existing = await prisma.notification.findFirst({
        where: { userId: organizer.userId, type: VINTED_BUNDLE_NOTIFICATION_TYPE, link: { contains: `vc=${conversationId}` } },
        select: { id: true },
      });
      if (existing) return;
    }
    await createNotification({
      userId: organizer.userId,
      type: VINTED_BUNDLE_NOTIFICATION_TYPE,
      title: `A Vinted bundle of ${info.itemCount} item${info.itemCount === 1 ? '' : 's'} sold: reconciling automatically`,
      body: buildVintedBundleNotificationBody({ itemCount: info.itemCount, amountText: info.amountText, buyer: info.buyer }),
      link: buildBundleNoticeLink({ conversationId, itemCount: info.itemCount, amountText: info.amountText, attempts: 0 }),
      channel: 'OPERATIONAL',
      sendEmail: false,
    });
  } catch (err: any) {
    console.error(`[VintedBundleSale] Failed to notify organizer ${organizerId}:`, err?.message || err);
  }
}

/** True while an unread, recent bundle notification exists for this user (arms the forced check). */
export async function hasPendingVintedBundleSale(userId: string, now: number = Date.now()): Promise<boolean> {
  try {
    const n = await prisma.notification.count({
      where: {
        userId,
        type: VINTED_BUNDLE_NOTIFICATION_TYPE,
        read: false,
        createdAt: { gte: new Date(now - VINTED_BUNDLE_CHECK_WINDOW_MS) },
      },
    });
    return n > 0;
  } catch (err: any) {
    console.warn('[VintedBundleSale] pending lookup failed:', err?.message || err);
    return false;
  }
}

/** Marks pending bundle notifications read once the wardrobe check actually sold something. */
export async function acknowledgeVintedBundleSale(userId: string): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { userId, type: VINTED_BUNDLE_NOTIFICATION_TYPE, read: false },
      data: { read: true },
    });
  } catch (err: any) {
    console.warn('[VintedBundleSale] acknowledge failed:', err?.message || err);
  }
}

/**
 * Marks only LEGACY bundle notices (no conversation id) read. Used by the wardrobe sold-report path: that path
 * cannot prove a conversation-tracked bundle is fully reconciled, so it must never close those notices.
 */
export async function acknowledgeLegacyVintedBundleSales(userId: string): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: {
        userId,
        type: VINTED_BUNDLE_NOTIFICATION_TYPE,
        read: false,
        OR: [{ link: null }, { link: { not: { contains: 'vc=' } } }],
      },
      data: { read: true },
    });
  } catch (err: any) {
    console.warn('[VintedBundleSale] legacy acknowledge failed:', err?.message || err);
  }
}

export interface VintedBundleOrder {
  noticeId: string;
  conversationId: string;
  priceText: string | null;
  itemCount: number;
  emailAt: string;
  attempts: number;
}

/** Open (unread, recent) bundle orders that carry a Vinted conversation id: what the extension must reconcile. */
export async function listOpenVintedBundleOrders(userId: string, now: number = Date.now()): Promise<VintedBundleOrder[]> {
  try {
    const rows = await prisma.notification.findMany({
      where: {
        userId,
        type: VINTED_BUNDLE_NOTIFICATION_TYPE,
        read: false,
        createdAt: { gte: new Date(now - VINTED_BUNDLE_ORDER_WINDOW_MS) },
      },
      select: { id: true, link: true, body: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    const out: VintedBundleOrder[] = [];
    for (const r of rows) {
      const meta = parseBundleNoticeLink(r.link, r.body);
      if (!meta.conversationId || !meta.itemCount) continue;
      out.push({
        noticeId: r.id,
        conversationId: meta.conversationId,
        priceText: meta.amountText,
        itemCount: meta.itemCount,
        emailAt: r.createdAt.toISOString(),
        attempts: meta.attempts,
      });
    }
    return out;
  } catch (err: any) {
    console.warn('[VintedBundleSale] open orders lookup failed:', err?.message || err);
    return [];
  }
}

export interface BundleNoticeRow {
  id: string;
  userId: string;
  link: string | null;
  body: string;
  createdAt: Date;
}

/** Unread bundle notices young enough for the retro pass that still have no conversation id. */
export async function listBundleNoticesMissingConversation(now: number = Date.now()): Promise<BundleNoticeRow[]> {
  const rows = await prisma.notification.findMany({
    where: {
      type: VINTED_BUNDLE_NOTIFICATION_TYPE,
      read: false,
      createdAt: { gte: new Date(now - VINTED_BUNDLE_RETRO_WINDOW_MS) },
    },
    select: { id: true, userId: true, link: true, body: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  return rows.filter((r: BundleNoticeRow) => !parseBundleNoticeLink(r.link, r.body).conversationId);
}

/**
 * Attaches a conversation id to an existing open notice (idempotent: a notice that already has one, or a
 * conversation id already used by another notice of this user, is left alone). Returns true when attached.
 */
export async function attachConversationToNotice(
  notice: BundleNoticeRow,
  info: { conversationId: string; itemCount: number; amountText: string | null },
): Promise<boolean> {
  if (!/^\d{5,20}$/.test(info.conversationId)) return false;
  const meta = parseBundleNoticeLink(notice.link, notice.body);
  if (meta.conversationId) return false;
  const dup = await prisma.notification.findFirst({
    where: { userId: notice.userId, type: VINTED_BUNDLE_NOTIFICATION_TYPE, link: { contains: `vc=${info.conversationId}` } },
    select: { id: true },
  });
  if (dup) return false;
  await prisma.notification.update({
    where: { id: notice.id },
    data: {
      link: buildBundleNoticeLink({
        conversationId: info.conversationId,
        itemCount: meta.itemCount ?? info.itemCount,
        amountText: meta.amountText ?? info.amountText,
        attempts: meta.attempts,
      }),
    },
  });
  return true;
}

/**
 * Records one unresolved automatic attempt on a notice. When the count reaches VINTED_BUNDLE_AUTO_MAX_ATTEMPTS
 * the notice text switches to the fallback wording (manual page + candidates). Returns the new count and
 * whether the fallback wording was just applied. Never throws.
 */
export async function recordBundleNoticeAttempt(
  notice: { id: string; link: string | null; body: string },
  organizerId: string,
): Promise<{ attempts: number; fallbackShown: boolean }> {
  const meta = parseBundleNoticeLink(notice.link, notice.body);
  const attempts = meta.attempts + 1;
  try {
    const itemCount = meta.itemCount ?? 1;
    const data: { link: string; body?: string; title?: string } = {
      link: buildBundleNoticeLink({ conversationId: meta.conversationId, itemCount, amountText: meta.amountText, attempts }),
    };
    let fallbackShown = false;
    if (attempts === VINTED_BUNDLE_AUTO_MAX_ATTEMPTS) {
      let candidates: VintedBundleCandidate[] = [];
      try { candidates = await listLiveVintedCandidates(organizerId); } catch { candidates = []; }
      const headMatch = /^(Vinted reports a bundle .*?\.)\s/.exec(notice.body);
      const tail = buildVintedBundleNotificationBody({ itemCount, amountText: meta.amountText, buyer: null, candidates, fallback: true });
      data.body = headMatch ? tail.replace(/^Vinted reports a bundle .*?\.\s/, `${headMatch[1]} `) : tail;
      data.title = `A Vinted bundle of ${itemCount} item${itemCount === 1 ? '' : 's'} sold: some items need a hand`;
      fallbackShown = true;
    }
    await prisma.notification.update({ where: { id: notice.id }, data });
    return { attempts, fallbackShown };
  } catch (err: any) {
    console.warn('[VintedBundleSale] could not record attempt:', err?.message || err);
    return { attempts: meta.attempts, fallbackShown: false };
  }
}

export interface VintedBundlePendingNotice {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
}

/** Unread bundle notifications (newest first, last 14 days) -- the "why am I here" header of the selection page. */
export async function listPendingVintedBundleNotices(userId: string, now: number = Date.now()): Promise<VintedBundlePendingNotice[]> {
  return prisma.notification.findMany({
    where: { userId, type: VINTED_BUNDLE_NOTIFICATION_TYPE, read: false, createdAt: { gte: new Date(now - 14 * 24 * 60 * 60 * 1000) } },
    select: { id: true, title: true, body: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
}

/**
 * Items the organizer can tick for a bundle. `tracked` = latest VINTED job row is POST/POSTED (the
 * candidates the notification already lists). `other` = remaining AVAILABLE published items with no
 * tracked live Vinted listing (an item listed on Vinted outside job tracking, e.g. one whose
 * listing was never reported back, can only be found here). Read-only.
 */
export async function listVintedBundleSelectionOptions(organizerId: string): Promise<{ tracked: VintedBundleCandidate[]; other: VintedBundleCandidate[] }> {
  if (!organizerId) throw new Error('organizerId required');
  const tracked = await listLiveVintedCandidates(organizerId, 200);
  const trackedIds = new Set(tracked.map((c) => c.itemId));
  const rows = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      deletedAt: null,
      draftStatus: 'PUBLISHED',
      listingType: { not: 'CONSIGNOR_TAG' },
      OR: [{ sale: { organizerId, deletedAt: null } }, { saleId: null, organizerId }],
    },
    select: { id: true, title: true },
    orderBy: { updatedAt: 'desc' },
    take: MAX_OTHER_OPTIONS + trackedIds.size,
  });
  const other: VintedBundleCandidate[] = [];
  for (const r of rows) {
    if (trackedIds.has(r.id)) continue;
    other.push({ itemId: r.id, title: r.title ?? '' });
    if (other.length >= MAX_OTHER_OPTIONS) break;
  }
  return { tracked, other };
}
