/**
 * ebayReconciliationCron.ts -- nightly, READ-ONLY eBay <-> FindA.Sale reconciliation.
 * eBay sync hardening (2026-10-01).
 *
 * For every eBay-connected organizer: read the live ActiveList from eBay (GetMyeBaySelling, paginated)
 * and compare it with that organizer's Item rows. Counts + ids are written as one structured console
 * line per organizer ("[eBay Reconcile] RESULT {...}"). NOTHING is written to eBay and no Item row is
 * changed. The only writes are an in-app Notification (deduped) and a Sentry message when a REAL
 * discrepancy exists.
 *
 * Buckets:
 *   liveNoItem        live on eBay, no FindA item carries that ItemID (fasItemId shows an SKU-prefix match when one exists)
 *   liveButSold       live on eBay, but the linked FindA item is SOLD (risk: double sale)
 *   liveMultiItem     one eBay ItemID linked by more than one FindA item
 *   availableNonLive  AVAILABLE item whose stored ebayListingId is not live and whose status could not be proven Ended/Completed
 *   endedStillLinked  AVAILABLE item whose stored listing is Ended/Completed per GetItem (capped GetItem lookups per organizer)
 *   availableUnlinked AVAILABLE item with no ebayListingId (informational; never alerts: most items are not on eBay)
 * Drift = FindA AVAILABLE items linked to a listing minus eBay live listing count.
 *
 * If the live-listing fetch is incomplete for an organizer the run for that organizer is skipped (a
 * partial list would raise false alarms). Alerts fire only for the first five buckets with a non-zero count.
 */

import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { refreshEbayAccessToken } from '../services/ebayHttp';
import { createNotification } from '../lib/notificationService';
import { fetchLiveEbayListings, fetchEbayListingStatus, itemIdFromFasSku } from '../services/ebayLiveListingsService';

const GETITEM_CAP_PER_ORGANIZER = 30; // bound the extra read-only eBay calls per organizer per night
const ID_LIST_CAP = 50; // ids stored per bucket in the log line
const ALERT_DEDUPE_DAYS = 3;
const ALERT_TYPE = 'ebay_reconciliation_drift';

export interface EbayReconciliationResult {
  organizerId: string;
  liveCount: number;
  linkedAvailableCount: number;
  drift: number; // linkedAvailableCount - liveCount
  liveNoItem: Array<{ ebayListingId: string; sku: string | null; fasItemId: string | null }>;
  liveButSold: string[];
  liveMultiItem: Array<{ ebayListingId: string; itemIds: string[] }>;
  availableNonLive: string[];
  endedStillLinked: string[];
  availableUnlinkedCount: number;
  availableUnlinkedSample: string[];
}

export async function reconcileOrganizer(organizerId: string): Promise<EbayReconciliationResult | null> {
  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) {
    console.warn(`[eBay Reconcile] Organizer ${organizerId}: no usable eBay token, skipped`);
    return null;
  }
  const live = await fetchLiveEbayListings(accessToken);
  if (!live.complete) {
    console.warn(`[eBay Reconcile] Organizer ${organizerId}: live listing fetch incomplete, skipped (no alerts on partial data)`);
    return null;
  }

  const items = await prisma.item.findMany({
    where: {
      OR: [{ sale: { organizerId } }, { organizerId }],
      AND: [{ OR: [{ ebayListingId: { not: null } }, { status: 'AVAILABLE' }] }],
    },
    select: { id: true, status: true, ebayListingId: true },
  });

  const liveIds = new Set(live.listings.map((l) => l.itemId));
  const itemsByListing = new Map<string, string[]>();
  for (const it of items) {
    if (!it.ebayListingId) continue;
    const arr = itemsByListing.get(it.ebayListingId) ?? [];
    arr.push(it.id);
    itemsByListing.set(it.ebayListingId, arr);
  }
  const itemIdSet = new Set(items.map((i) => i.id));

  const liveNoItem: EbayReconciliationResult['liveNoItem'] = [];
  for (const l of live.listings) {
    if (itemsByListing.has(l.itemId)) continue;
    const fas = itemIdFromFasSku(l.sku);
    liveNoItem.push({ ebayListingId: l.itemId, sku: l.sku, fasItemId: fas && itemIdSet.has(fas) ? fas : null });
  }

  const liveMultiItem: EbayReconciliationResult['liveMultiItem'] = [];
  for (const [listingId, ids] of itemsByListing) {
    if (liveIds.has(listingId) && ids.length > 1) liveMultiItem.push({ ebayListingId: listingId, itemIds: ids });
  }

  const liveButSold = items
    .filter((i) => i.status === 'SOLD' && i.ebayListingId && liveIds.has(i.ebayListingId))
    .map((i) => i.id);

  const availableLinked = items.filter((i) => i.status === 'AVAILABLE' && i.ebayListingId);
  const nonLive = availableLinked.filter((i) => !liveIds.has(i.ebayListingId as string));
  const endedStillLinked: string[] = [];
  const availableNonLive: string[] = [];
  let lookups = 0;
  for (const it of nonLive) {
    if (lookups >= GETITEM_CAP_PER_ORGANIZER) {
      availableNonLive.push(it.id); // unclassified past the cap
      continue;
    }
    lookups++;
    const st = await fetchEbayListingStatus(accessToken, it.ebayListingId as string);
    if (st.status === 'Ended' || st.status === 'Completed') endedStillLinked.push(it.id);
    else availableNonLive.push(it.id);
  }

  const unlinked = items.filter((i) => i.status === 'AVAILABLE' && !i.ebayListingId);

  return {
    organizerId,
    liveCount: live.listings.length,
    linkedAvailableCount: availableLinked.length,
    drift: availableLinked.length - live.listings.length,
    liveNoItem,
    liveButSold,
    liveMultiItem,
    availableNonLive,
    endedStillLinked,
    availableUnlinkedCount: unlinked.length,
    availableUnlinkedSample: unlinked.slice(0, 25).map((i) => i.id),
  };
}

function hasRealDiscrepancy(r: EbayReconciliationResult): boolean {
  return (
    r.liveNoItem.length > 0 ||
    r.liveButSold.length > 0 ||
    r.liveMultiItem.length > 0 ||
    r.availableNonLive.length > 0 ||
    r.endedStillLinked.length > 0
  );
}

async function alertIfDiscrepancy(r: EbayReconciliationResult): Promise<void> {
  if (!hasRealDiscrepancy(r)) return;

  Sentry.captureMessage(`eBay reconciliation discrepancy for organizer ${r.organizerId}`, {
    level: 'warning',
    extra: {
      organizerId: r.organizerId,
      drift: r.drift,
      liveNoItem: r.liveNoItem.length,
      liveButSold: r.liveButSold.length,
      liveMultiItem: r.liveMultiItem.length,
      availableNonLive: r.availableNonLive.length,
      endedStillLinked: r.endedStillLinked.length,
    },
  });

  const organizer = await prisma.organizer.findUnique({ where: { id: r.organizerId }, select: { userId: true } });
  if (!organizer) return;
  const since = new Date(Date.now() - ALERT_DEDUPE_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.notification.findFirst({
    where: { userId: organizer.userId, type: ALERT_TYPE, createdAt: { gte: since } },
    select: { id: true },
  });
  if (recent) return;

  const parts: string[] = [];
  if (r.liveButSold.length) parts.push(`${r.liveButSold.length} sold item(s) still live on eBay`);
  if (r.liveNoItem.length) parts.push(`${r.liveNoItem.length} eBay listing(s) with no matching item`);
  if (r.liveMultiItem.length) parts.push(`${r.liveMultiItem.length} eBay listing(s) linked to more than one item`);
  if (r.endedStillLinked.length) parts.push(`${r.endedStillLinked.length} item(s) linked to an ended eBay listing`);
  if (r.availableNonLive.length) parts.push(`${r.availableNonLive.length} available item(s) whose eBay listing is not live`);
  await createNotification({
    userId: organizer.userId,
    type: ALERT_TYPE,
    title: 'eBay and FindA.Sale do not match',
    body: `Nightly check found: ${parts.join('; ')}. Open your eBay platform page to review.`,
    link: '/organizer/platforms',
  }).catch((err) => console.warn(`[eBay Reconcile] notification failed for organizer ${r.organizerId}:`, err?.message));
}

async function runEbayReconciliation(): Promise<void> {
  const connections = await prisma.ebayConnection.findMany({ select: { organizerId: true } });
  console.log(`[eBay Reconcile] Starting nightly reconciliation for ${connections.length} eBay-connected organizer(s)`);
  for (const { organizerId } of connections) {
    try {
      const r = await reconcileOrganizer(organizerId);
      if (!r) continue;
      console.log(
        `[eBay Reconcile] RESULT ${JSON.stringify({
          organizerId: r.organizerId,
          liveCount: r.liveCount,
          linkedAvailableCount: r.linkedAvailableCount,
          drift: r.drift,
          counts: {
            liveNoItem: r.liveNoItem.length,
            liveButSold: r.liveButSold.length,
            liveMultiItem: r.liveMultiItem.length,
            availableNonLive: r.availableNonLive.length,
            endedStillLinked: r.endedStillLinked.length,
            availableUnlinked: r.availableUnlinkedCount,
          },
          ids: {
            liveNoItem: r.liveNoItem.slice(0, ID_LIST_CAP),
            liveButSold: r.liveButSold.slice(0, ID_LIST_CAP),
            liveMultiItem: r.liveMultiItem.slice(0, ID_LIST_CAP),
            availableNonLive: r.availableNonLive.slice(0, ID_LIST_CAP),
            endedStillLinked: r.endedStillLinked.slice(0, ID_LIST_CAP),
            availableUnlinkedSample: r.availableUnlinkedSample,
          },
        })}`
      );
      await alertIfDiscrepancy(r);
    } catch (err) {
      console.error(`[eBay Reconcile] Failed for organizer ${organizerId}:`, err);
      // continue: one organizer's failure must not block the rest
    }
  }
}

export function startEbayReconciliationCron(): void {
  // 45 3 * * * = 3:45 AM UTC daily, after ebayRenewalForecastCron (3:15) and the 4-hourly ended sync.
  cron.schedule('45 3 * * *', cronGuard({ jobName: 'ebayReconciliationCron' }, async () => {
    console.log('[eBay Reconcile] Starting nightly run...');
    await runEbayReconciliation();
  }));
  console.log('[eBay Reconcile] Cron registered — runs daily at 3:45 AM UTC (read-only)');
}
