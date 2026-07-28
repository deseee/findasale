/**
 * ebayListingQueueCron.ts — eBay Queue Mode engine
 *
 * Runs every 30 minutes for organizers with ebayQueueMode = true.
 *
 * Phase A — Fill empty slots:
 *   If activeListings < limit AND queue has items, push queued items to eBay
 *   ordered by price DESC (highest value first), then ebayQueuedAt ASC (FIFO).
 *
 * Phase B — Rotation (ebayQueueRotation = true AND at limit AND queue has items):
 *   Withdraw oldest N active listings (≤ 10% of limit), move them back to queue,
 *   then let Phase A fill those freed slots with waiting items.
 *
 * Safety guards:
 *   - Skip organizer if eBay connection missing or token expired
 *   - Cap: never withdraw more than 25 items in a single cron run
 *   - 200ms delay between eBay API calls to respect rate limits
 *   - Push failures leave item in queue; withdrawal failures abort rotation
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { refreshEbayAccessToken } from '../controllers/ebayController';
import { invalidatePlatformStatsCache } from '../services/platformStatsService';

const EBAY_API_DELAY_MS = 200;
const MAX_WITHDRAWALS_PER_RUN = 25;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── eBay proxy helpers (mirrored from ebayController — avoids circular import) ─

function ebayProxyUrl(path: string): string {
  return `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${path}`;
}

function ebayUserHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US',
    'Content-Language': 'en-US',
  };
}

function ebayProxyHeaders(): Record<string, string> {
  const secret = process.env.EBAY_PROXY_SECRET;
  return secret ? { 'X-Proxy-Secret': secret } : {};
}

// ─── Limit resolution ─────────────────────────────────────────────────────────

function resolveLimit(ebayStoreUrl: string | null): number {
  return ebayStoreUrl ? 1000 : 250;
}

// ─── Push a single queued item to eBay ───────────────────────────────────────
// Calls the same proxy endpoint that pushSaleToEbay uses for individual items.
// On success: sets ebayListedAt (first time only), clears ebayQueuedAt, sets ebayOfferId.
// On failure: leaves item in queue.

async function pushQueuedItem(
  itemId: string,
  organizerId: string,
  accessToken: string,
): Promise<boolean> {
  try {
    // Load item to get its offerId (needed for publish)
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        ebayOfferId: true,
        ebayListingId: true,
        ebayListedAt: true,
        // Weight guard inputs — this cron is a third publish entry point and used to
        // bypass the pre-publish checks in ebayController entirely.
        packageWeightOz: true,
        packageConfirmedByOrganizer: true,
        ebayShippingOverride: true,
      },
    });

    if (!item) {
      console.warn(`[eBay Queue] Item ${itemId} not found`);
      return false;
    }

    // If already live (has a listingId), just clear queue flag and set listed timestamp
    if (item.ebayListingId) {
      await prisma.item.update({
        where: { id: itemId },
        data: {
          ebayQueuedAt: null,
          ebayListedAt: item.ebayListedAt ?? new Date(),
        },
      });
      return true;
    }

    // Must have an offerId to publish
    if (!item.ebayOfferId) {
      console.warn(`[eBay Queue] Item ${itemId} has no ebayOfferId — cannot publish from queue`);
      return false;
    }

    // Weight guard — mirrors validateItemForEbayPublish Guard 2 in ebayController.
    // Queue mode publishes an already-created offer without going back through the
    // controller, so without this check it is a way to publish a shippable item on an
    // unconfirmed, auto-estimated weight. Returning false leaves the item in the queue
    // (nothing is dropped or unqueued) so it publishes on a later run once the
    // organizer confirms the weight. Local-pickup items are exempt.
    if (item.ebayShippingOverride !== 'LOCAL_PICKUP_ONLY') {
      const hasWeight = item.packageWeightOz != null && Number(item.packageWeightOz) > 0;
      if (!hasWeight || item.packageConfirmedByOrganizer !== true) {
        console.warn(
          `[eBay Queue] Item ${itemId} held in queue: shipping weight not confirmed by organizer (weightOz=${item.packageWeightOz ?? 'null'}, confirmed=${item.packageConfirmedByOrganizer === true})`
        );
        return false;
      }
    }

    const publishPath = encodeURIComponent(`/sell/inventory/v1/offer/${item.ebayOfferId}/publish`);
    const resp = await fetch(ebayProxyUrl(publishPath), {
      method: 'POST',
      headers: {
        ...ebayUserHeaders(accessToken),
        ...ebayProxyHeaders(),
      },
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(
        `[eBay Queue] Publish failed for item ${itemId}: HTTP ${resp.status} — ${errText.slice(0, 200)}`
      );
      return false;
    }

    const publishData = (await resp.json()) as { listingId?: string };
    const listingId = publishData.listingId ?? null;

    if (!listingId) {
      console.warn(`[eBay Queue] No listingId returned for item ${itemId}`);
      return false;
    }

    await prisma.item.update({
      where: { id: itemId },
      data: {
        ebayListingId: listingId,
        listedOnEbayAt: new Date(),
        // ebayListedAt: first listing timestamp, never overwritten on relist
        ebayListedAt: item.ebayListedAt ?? new Date(),
        ebayQueuedAt: null,
        ebayNeedsReview: false,
      },
    });

    console.log(`[eBay Queue] Item ${itemId} published — listingId ${listingId}`);
    return true;
  } catch (err) {
    console.error(
      `[eBay Queue] Error pushing item ${itemId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

// ─── Withdraw a single active eBay listing ────────────────────────────────────

async function withdrawItem(
  itemId: string,
  offerId: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const withdrawPath = encodeURIComponent(`/sell/inventory/v1/offer/${offerId}/withdraw`);
    const resp = await fetch(ebayProxyUrl(withdrawPath), {
      method: 'POST',
      headers: {
        ...ebayUserHeaders(accessToken),
        ...ebayProxyHeaders(),
      },
      body: '{}',
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(
        `[eBay Queue] Withdraw failed for item ${itemId} offer ${offerId}: HTTP ${resp.status} — ${errText.slice(0, 200)}`
      );
      return false;
    }

    // Clear listingId; preserve ebayListedAt as historical record
    await prisma.item.update({
      where: { id: itemId },
      data: {
        ebayListingId: null,
        ebayOfferId: null,
        // Re-queue so it goes back to waiting (to the back of the line)
        ebayQueuedAt: new Date(),
      },
    });

    console.log(`[eBay Queue] Item ${itemId} withdrawn and re-queued`);
    return true;
  } catch (err) {
    console.error(
      `[eBay Queue] Error withdrawing item ${itemId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

// ─── Process one organizer ────────────────────────────────────────────────────

async function processOrganizer(
  organizerId: string,
  ebayStoreUrl: string | null,
  queueRotation: boolean,
): Promise<void> {
  // Refresh token
  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) {
    console.warn(`[eBay Queue] Organizer ${organizerId}: token refresh failed — skipping`);
    return;
  }

  const limit = resolveLimit(ebayStoreUrl);
  const availableBase = {
    organizerId,
    status: 'AVAILABLE' as const,
    isActive: true,
    deletedAt: null,
  };

  // Count currently active eBay listings
  const activeListings = await prisma.item.count({
    where: { ...availableBase, ebayOfferId: { not: null } },
  });

  // Count queued items
  const queuedCount = await prisma.item.count({
    where: { ...availableBase, ebayQueuedAt: { not: null }, ebayOfferId: null },
  });

  console.log(
    `[eBay Queue] Organizer ${organizerId}: active=${activeListings}, limit=${limit}, queued=${queuedCount}`
  );

  // ── Phase B: Rotation ──────────────────────────────────────────────────────
  if (queueRotation && activeListings >= limit && queuedCount > 0) {
    const rotateN = Math.min(
      Math.min(Math.floor(limit * 0.1), MAX_WITHDRAWALS_PER_RUN),
      queuedCount
    );

    if (rotateN > 0) {
      // Oldest active listings first (ebayListedAt ASC, nulls last)
      const oldest = await prisma.item.findMany({
        where: { ...availableBase, ebayOfferId: { not: null } },
        select: { id: true, ebayOfferId: true, ebayListedAt: true },
        orderBy: [{ ebayListedAt: 'asc' }, { createdAt: 'asc' }],
        take: rotateN,
      });

      console.log(`[eBay Queue] Organizer ${organizerId}: rotating ${oldest.length} listings`);

      for (const item of oldest) {
        if (!item.ebayOfferId) continue;
        const ok = await withdrawItem(item.id, item.ebayOfferId, accessToken);
        if (!ok) {
          console.warn(`[eBay Queue] Withdrawal failed for ${item.id} — aborting rotation`);
          break;
        }
        await sleep(EBAY_API_DELAY_MS);
      }
    }
  }

  // ── Phase A: Fill empty slots ──────────────────────────────────────────────
  // Re-count after potential rotation
  const currentActive = await prisma.item.count({
    where: { ...availableBase, ebayOfferId: { not: null } },
  });

  const openSlots = Math.max(0, limit - currentActive);
  if (openSlots === 0) {
    console.log(`[eBay Queue] Organizer ${organizerId}: no open slots`);
    return;
  }

  // Fetch items to fill: highest price first, then FIFO by queue time
  const toFill = await prisma.item.findMany({
    where: { ...availableBase, ebayQueuedAt: { not: null }, ebayOfferId: null },
    select: { id: true },
    orderBy: [{ price: 'desc' }, { ebayQueuedAt: 'asc' }],
    take: openSlots,
  });

  if (toFill.length === 0) {
    console.log(`[eBay Queue] Organizer ${organizerId}: queue empty, nothing to fill`);
    return;
  }

  console.log(
    `[eBay Queue] Organizer ${organizerId}: filling ${toFill.length} slot(s) from queue`
  );

  let pushed = 0;
  for (const { id } of toFill) {
    const ok = await pushQueuedItem(id, organizerId, accessToken);
    if (ok) pushed++;
    await sleep(EBAY_API_DELAY_MS);
  }

  console.log(`[eBay Queue] Organizer ${organizerId}: pushed ${pushed}/${toFill.length}`);
  invalidatePlatformStatsCache(organizerId);
}

// ─── Main cron function ────────────────────────────────────────────────────────

async function runEbayListingQueueCron(): Promise<void> {
  // Find organizers with queue mode enabled AND an eBay connection
  const orgs = await prisma.organizer.findMany({
    where: {
      ebayQueueMode: true,
      ebayConnection: { isNot: null },
    },
    select: {
      id: true,
      ebayStoreUrl: true,
      ebayQueueRotation: true,
    },
  });

  console.log(`[eBay Queue] Starting queue cron for ${orgs.length} organizer(s)`);

  for (const org of orgs) {
    try {
      await processOrganizer(org.id, org.ebayStoreUrl, org.ebayQueueRotation);
    } catch (err) {
      console.error(
        `[eBay Queue] Unhandled error for organizer ${org.id}:`,
        err instanceof Error ? err.message : String(err)
      );
      // Continue — one organizer's failure must not block others
    }
  }

  console.log('[eBay Queue] Queue cron complete');
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function startEbayListingQueueCron(): void {
  cron.schedule(
    '*/30 * * * *',
    cronGuard({ jobName: 'ebayListingQueueCron' }, runEbayListingQueueCron)
  );
  console.log('[eBay Queue] Cron registered — runs every 30 minutes');
}
