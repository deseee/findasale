/**
 * ebayListingQueueCron.ts — eBay Queue Mode engine
 *
 * Runs every 30 minutes for organizers with ebayQueueMode = true.
 *
 * ADR-115 (2026-09-11) redesign — the gate is now a LIVE per-item eBay fee
 * check (checkEbayListingFee / getListingFees), not a local concurrent-count
 * guess. eBay's real free-listing constraint is a MONTHLY consumption counter
 * (Good-Til-Cancelled renewals and relists consume from it too, not just new
 * listings) — the old `resolveLimit()` binary 250/1000 split conflated
 * "currently live" with "used this month" and was provably wrong for
 * Premium/Anchor stores (10,000/mo, not 1,000). resolveLimit() is now a
 * display-only estimate; it no longer gates whether the cron attempts a
 * publish. See claude_docs/feature-notes/ADR-115-ebay-queue-fee-awareness-redesign-2026-09-11.md.
 *
 * Phase A — Fill from queue:
 *   Attempt up to MAX_QUEUE_FILLS_PER_RUN queued items, ordered by price DESC
 *   (highest value first) then ebayQueuedAt ASC (FIFO). Each one is checked
 *   live against eBay's getListingFees before publish; only a confirmed-$0
 *   item is actually published. A confirmed-fee or inconclusive result leaves
 *   the item in queue with ebayFeeBlocked=true (fail-closed).
 *
 * Phase B — Rotation (ebayQueueRotation = true AND at limit AND queue has items):
 *   Before withdrawing anything, the top-of-queue replacement candidate(s) are
 *   fee-checked first. Only withdraws as many oldest active listings as have a
 *   confirmed-free replacement waiting — withdrawing a free listing to make
 *   room for one that would cost money (or isn't filled at all) is pure waste.
 *
 * Known gap (flagged, not fixed by ADR-115): items added via the manual
 * "add to queue" endpoint (platformStatsController.ts addToEbayQueue) never
 * have an ebayOfferId — nothing in this codebase creates one for them before
 * Phase A tries to publish, so they correctly fail closed with a clear log
 * line but can never actually be fee-checked or published until that's built.
 * Rotation-requeued items DO have an offerId (ADR-115 fix — see withdrawItem)
 * and work end-to-end.
 *
 * Safety guards:
 *   - Skip organizer if eBay connection missing or token expired
 *   - Caps: never withdraw or fill more than 25 items in a single cron run
 *   - 200ms delay between eBay API calls to respect rate limits
 *   - Push failures leave item in queue; withdrawal failures abort rotation
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { refreshEbayAccessToken } from '../controllers/ebayController';
import { invalidatePlatformStatsCache } from '../services/platformStatsService';
import { checkEbayListingFee } from '../lib/ebayListingFeeCheck';
import { recordFreeEbayInsertion } from '../lib/ebayInsertionsQuotaTracker';

const EBAY_API_DELAY_MS = 200;
const MAX_WITHDRAWALS_PER_RUN = 25;
const MAX_QUEUE_FILLS_PER_RUN = 25; // ADR-115: bounds getListingFees + publish call volume per cron tick, independent of the (unreliable) local tier-guess limit

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
        // Weight/dims guard inputs — this cron is a third publish entry point and used to
        // bypass the pre-publish checks in ebayController entirely.
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
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
          ebayFeeBlocked: false,
        },
      });
      return true;
    }

    // Must have an offerId to publish
    if (!item.ebayOfferId) {
      console.warn(`[eBay Queue] Item ${itemId} has no ebayOfferId — cannot publish from queue`);
      return false;
    }

    // Weight/dims guard — mirrors validateItemForEbayPublish Guards 2/2b in ebayController.
    // Queue mode publishes an already-created offer without going back through the
    // controller, so without this check it is a way to publish a shippable item on an
    // unconfirmed, auto-estimated weight or a confirmed item missing box dimensions.
    // Returning false leaves the item in the queue (nothing is dropped or unqueued) so
    // it publishes on a later run once the organizer confirms weight + dims.
    // Local-pickup items are exempt.
    if (item.ebayShippingOverride !== 'LOCAL_PICKUP_ONLY') {
      const hasWeight = item.packageWeightOz != null && Number(item.packageWeightOz) > 0;
      const hasDims =
        item.packageLengthIn != null && item.packageWidthIn != null && item.packageHeightIn != null;
      if (!hasWeight || item.packageConfirmedByOrganizer !== true || !hasDims) {
        console.warn(
          `[eBay Queue] Item ${itemId} held in queue: shipping weight/dims not confirmed by organizer (weightOz=${item.packageWeightOz ?? 'null'}, confirmed=${item.packageConfirmedByOrganizer === true}, dims=${item.packageLengthIn ?? '?'}x${item.packageWidthIn ?? '?'}x${item.packageHeightIn ?? '?'})`
        );
        return false;
      }
    }

    // ADR-115: live eBay fee gate — never auto-publish something that would incur
    // a real insertion fee. Fail-closed: 'unknown' is treated the same as 'fee'
    // (leave in queue), matching the weight/dims guard's posture above.
    const feeCheck = await checkEbayListingFee(item.ebayOfferId, accessToken);
    if (feeCheck.status === 'fee') {
      console.warn(
        `[eBay Queue] Item ${itemId} held in queue: would incur a real eBay insertion fee ($${feeCheck.amount} ${feeCheck.currency}) right now — not publishing automatically.`
      );
      await prisma.item.update({ where: { id: itemId }, data: { ebayFeeBlocked: true } });
      return false;
    }
    if (feeCheck.status === 'unknown') {
      console.warn(
        `[eBay Queue] Item ${itemId} held in queue: could not confirm eBay listing fee (${feeCheck.reason}) — failing closed, not publishing.`
      );
      await prisma.item.update({ where: { id: itemId }, data: { ebayFeeBlocked: true } });
      return false;
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
        ebayFeeBlocked: false,
      },
    });
    await recordFreeEbayInsertion(organizerId);

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

    // Clear listingId only. ebayOfferId is intentionally PRESERVED (ADR-115) —
    // confirmed via eBay's own developer blog ("Withdraw Offers and Manage
    // Variation Groups in the Inventory API"): the offer object survives
    // withdrawOffer in an unpublished state, and the SAME offerId can be
    // republished later via publishOffer. Nulling it here (the pre-ADR-115
    // behavior) permanently stranded every rotated item, since nothing else in
    // this codebase recreates an offer for an item once ebayOfferId is null.
    await prisma.item.update({
      where: { id: itemId },
      data: {
        ebayListingId: null,
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

  // Count queued items (ADR-115: includes items with an offerId already set,
  // e.g. rotation-requeued items — matches the toFill/replacementCandidates
  // queries below, which no longer filter on ebayOfferId either).
  const queuedCount = await prisma.item.count({
    where: { ...availableBase, ebayQueuedAt: { not: null } },
  });

  console.log(
    `[eBay Queue] Organizer ${organizerId}: active=${activeListings}, limit=${limit}, queued=${queuedCount}`
  );

  // ── Phase B: Rotation ──────────────────────────────────────────────────────
  // ADR-115: rotation must not withdraw a stable, already-live listing unless
  // the queued replacement that would take its place is ITSELF confirmed free
  // by eBay right now. Withdrawing a free listing to make room for one that
  // would cost money (or that ends up not filled at all this cycle) is pure
  // fee/listing waste for zero benefit — check replacement candidates' fees
  // FIRST, then only rotate as many active listings as have a confirmed-free
  // replacement waiting.
  if (queueRotation && activeListings >= limit && queuedCount > 0) {
    const candidateCap = Math.min(
      Math.min(Math.floor(limit * 0.1), MAX_WITHDRAWALS_PER_RUN),
      queuedCount
    );

    let rotateN = 0;
    if (candidateCap > 0) {
      // Same ordering Phase A fills from: highest price first, then FIFO.
      const replacementCandidates = await prisma.item.findMany({
        where: { ...availableBase, ebayQueuedAt: { not: null } },
        select: { id: true, ebayOfferId: true },
        orderBy: [{ price: 'desc' }, { ebayQueuedAt: 'asc' }],
        take: candidateCap,
      });

      // NOTE: queue candidates added via the manual "add to queue" endpoint
      // currently have ebayOfferId: null (a separate, pre-existing gap — see
      // ADR-115 Dev Handoff) and getListingFees requires a real offerId, so
      // they cannot be fee-checked and are skipped here rather than rotated
      // for blindly. Only candidates that already have an offerId (e.g. a
      // previously-rotated item now waiting its turn again) can be verified.
      for (const candidate of replacementCandidates) {
        if (!candidate.ebayOfferId) continue;
        const feeCheck = await checkEbayListingFee(candidate.ebayOfferId, accessToken);
        await sleep(EBAY_API_DELAY_MS);
        if (feeCheck.status === 'free') {
          rotateN++;
        } else {
          // Queue is price-desc/FIFO ordered — once one candidate isn't
          // confirmed free, don't keep probing further down the queue this
          // cycle; only rotate for the confirmed-free prefix found so far.
          break;
        }
      }
    }

    if (rotateN === 0) {
      console.log(
        `[eBay Queue] Organizer ${organizerId}: rotation skipped — no confirmed-free replacement available this cycle`
      );
    } else {
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

  // ── Phase A: Fill from queue ────────────────────────────────────────────────
  // ADR-115, two fixes:
  //
  // (1) The old `openSlots = limit - currentActive` gate is REMOVED as a hard
  // stop. resolveLimit()'s binary 250/1000 guess is demoted to a display
  // estimate only (see platformStatsService.ts) — it must not gate whether the
  // cron attempts to fill from queue, because eBay's real constraint is a
  // MONTHLY free-insertion allotment, not a concurrent-active-listing ceiling,
  // and the local guess is provably wrong for Premium/Anchor stores
  // (10,000/mo, not 1,000) and Starter stores (some smaller, unpublished
  // number) alike — an organizer wrongly capped at 1000 would otherwise get
  // stuck here forever even though eBay would happily list more for free. The
  // live per-item getListingFees check inside pushQueuedItem() is the real
  // gate now; MAX_QUEUE_FILLS_PER_RUN below only bounds cron work/API-call
  // volume per 30-minute tick, same spirit as MAX_WITHDRAWALS_PER_RUN.
  //
  // (2) The old query filtered `ebayOfferId: null` — meaning it could ONLY
  // ever select items that pushQueuedItem() then immediately rejects with
  // "has no ebayOfferId — cannot publish from queue" (that check is a few
  // lines below, unchanged). Every item Phase A ever selected was guaranteed
  // to fail before this fix — Queue Mode's fill phase could never successfully
  // publish a single item for any organizer, confirmed by reading both sides
  // of this contradiction directly. Filtering on `ebayQueuedAt: { not: null }`
  // alone (any status of ebayOfferId) is correct: pushQueuedItem() already
  // handles both cases properly (already-live shortcut, or requires an
  // offerId and fails closed with a clear log line if genuinely missing).
  const toFill = await prisma.item.findMany({
    where: { ...availableBase, ebayQueuedAt: { not: null } },
    select: { id: true },
    orderBy: [{ price: 'desc' }, { ebayQueuedAt: 'asc' }],
    take: MAX_QUEUE_FILLS_PER_RUN,
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
