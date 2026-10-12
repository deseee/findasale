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

export interface VintedBundleCandidate {
  itemId: string;
  title: string;
}

/** Buyer handles are untrusted email text; keep only a short, harmless token for display. */
export function sanitizeBuyerHandle(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  return t || null;
}

/** Pure: the notification body. Exported for tests. */
export function buildVintedBundleNotificationBody(args: {
  itemCount: number;
  amountText: string | null;
  buyer: string | null;
  candidates: VintedBundleCandidate[];
}): string {
  const buyer = sanitizeBuyerHandle(args.buyer);
  const amount = args.amountText ? String(args.amountText).replace(/[^\w$€£¥.,\s]/g, '').trim().slice(0, 20) : '';
  const head =
    `Vinted reports a bundle of ${args.itemCount} item${args.itemCount === 1 ? '' : 's'} sold` +
    `${amount ? ` for ${amount}` : ''}${buyer ? ` to ${buyer}` : ''}. ` +
    `Vinted's email does not say which items are in the bundle, so none were marked sold automatically. `;
  const how =
    `Your FindA.Sale extension will mark them sold (and take them down from your other channels) as soon as ` +
    `your Vinted wardrobe shows them as sold: open vinted.com in the browser with the extension installed. ` +
    `If that has not happened, open the Vinted bundle page in FindA.Sale and tick the items yourself.`;
  if (!args.candidates.length) return head + how;
  const shown = args.candidates.slice(0, MAX_CANDIDATES_LISTED).map((c) => `"${c.title}"`).join('; ');
  const more = args.candidates.length > MAX_CANDIDATES_LISTED ? ` (+${args.candidates.length - MAX_CANDIDATES_LISTED} more)` : '';
  return `${head}${how} Your most recently posted live Vinted listings (candidates only, nothing was changed): ${shown}${more}.`;
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

/** Best-effort: never throws. Creates the (email + in-app) bundle notification. */
export async function notifyOrganizerVintedBundleSale(
  organizerId: string,
  info: { itemCount: number; amountText: string | null; buyer: string | null },
): Promise<void> {
  try {
    const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { userId: true } });
    if (!organizer?.userId) return;
    let candidates: VintedBundleCandidate[] = [];
    try {
      candidates = await listLiveVintedCandidates(organizerId);
    } catch (e: any) {
      console.warn('[VintedBundleSale] candidate lookup failed (notification still sent):', e?.message || e);
    }
    await createNotification({
      userId: organizer.userId,
      type: VINTED_BUNDLE_NOTIFICATION_TYPE,
      title: `A Vinted bundle of ${info.itemCount} item${info.itemCount === 1 ? '' : 's'} sold`,
      body: buildVintedBundleNotificationBody({ ...info, candidates }),
      link: VINTED_BUNDLE_PAGE_PATH,
      channel: 'OPERATIONAL',
      sendEmail: true,
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
