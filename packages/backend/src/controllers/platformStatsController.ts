/**
 * platformStatsController.ts — HTTP handlers for platform distribution stats,
 * gap analysis, and eBay queue mode management.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  computePlatformStats,
  computePlatformGap,
  invalidatePlatformStatsCache,
  GapPlatform,
} from '../services/platformStatsService';
import { pushItemsToEbayQueueOnly } from './ebayController';
import { computeEbayInsertionsForecast } from '../lib/ebayInsertionsForecast';
import { getNextMonthStart } from '../lib/ebayInsertionsQuotaTracker';
import { EBAY_FREE_INSERTIONS_CAP } from '../config/ebayInsertionLimits';
import { SYNC_FAILURE_THRESHOLD_MS, pullSyncForOrganizer } from '../jobs/ebayListingSyncCron';

// ─── Helper: resolve organizerId from authenticated user ──────────────────────

async function resolveOrganizerId(req: AuthRequest): Promise<string | null> {
  if (!req.user) return null;
  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    select: { id: true },
  });
  return organizer?.id ?? null;
}

// ADR-115 tier decision (2026-09-11, Patrick): eBay Queue Mode is PRO/TEAMS only,
// matching pushSaleToEbay's existing gate (ebayController.ts ~line 2246). Manually-
// queued items need the same offer-creation logic that push uses, so Queue Mode
// inherits the same tier restriction rather than duplicating a second free-tier path.
async function resolveOrganizerTier(organizerId: string): Promise<string | null> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { subscriptionTier: true },
  });
  return organizer?.subscriptionTier ?? null;
}

function requireOrganizer(req: AuthRequest, res: Response): boolean {
  const hasRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
  if (!req.user || !hasRole) {
    res.status(403).json({ message: 'Organizer access required' });
    return false;
  }
  return true;
}

// ─── GET /api/organizers/me/platform-stats ────────────────────────────────────

export async function getPlatformStats(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (!requireOrganizer(req, res)) return res;

    const organizerId = await resolveOrganizerId(req);
    if (!organizerId) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const stats = await computePlatformStats(organizerId);
    return res.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[platformStats] getPlatformStats error:', msg);
    return res.status(500).json({ message: 'Failed to compute platform stats' });
  }
}

// ─── GET /api/organizers/me/ebay-insertions-forecast ──────────────────────────
// ADR ebay-renewal-forecasting (2026-09-15). Response shape per the ADR's
// Decision section plus the two UX-required additions (resetAt, computed
// status) from ebay-markdown-budget-warnings-ux-spec-2026-09-15.md's Dev
// Handoff Notes #1 — threshold logic lives here, single-sourced, not
// duplicated client-side.

export async function getEbayInsertionsForecast(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (!requireOrganizer(req, res)) return res;

    const organizerId = await resolveOrganizerId(req);
    if (!organizerId) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    try {
      const forecast = await computeEbayInsertionsForecast(organizerId);
      return res.json(forecast);
    } catch (computeErr) {
      // UX spec edge case (Piece 1, "freeInsertionsCap unresolved / constant
      // lookup fails backend-side"): degrade to a best-effort response rather
      // than a 500, mirroring the ADR's own graceful-degradation posture for a
      // null ebayNextRenewalAt (an under-count, never a crash or over-count).
      console.error('[platformStats] getEbayInsertionsForecast compute error (degrading):', computeErr);
      return res.json({
        usedThisMonth: 0,
        freeInsertionsCap: EBAY_FREE_INSERTIONS_CAP,
        capSource: 'ESTIMATED',
        projectedRenewalsBeforeReset: 0,
        projectedTotalUsage: 0,
        resetAt: getNextMonthStart().toISOString(),
        status: 'ok',
        degraded: true,
        // 2026-09-21: keep the degraded fallback shape identical to the real
        // forecast object (ebayInsertionsForecast.ts) so frontend consumers
        // never have to special-case a missing field.
        ebayInsertionsReconciledAt: null,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[platformStats] getEbayInsertionsForecast error:', msg);
    return res.status(500).json({ message: 'Failed to compute eBay insertions forecast' });
  }
}

// ─── GET /api/organizers/me/ebay-sync-issues ─────────────────────────────────
// ebay-markdown-budget-warnings-ux-spec-2026-09-15.md, Piece 2, Dev Handoff Note #4.
// Returns the organizer's CURRENTLY-open eBay price sync issues (evaluated fresh on
// every request, not a snapshot of the last cron run) so the "Sync issues" mini-panel
// on /organizer/platforms always reflects live state -- an item that resolves itself
// on the next 4h sync-cron cycle simply stops appearing here, no separate "resolved"
// signal needed (mirrors how the existing "not listed" gap panel behaves).
//
// Staleness condition intentionally mirrors ebayListingSyncCron.ts's own
// pullSyncForOrganizer() staleItems check exactly (same SYNC_FAILURE_THRESHOLD_MS
// constant, imported rather than redefined): Item.priceUpdatedAt is set AND
// (Item.ebayPriceSyncedAt is null OR older than priceUpdatedAt) AND at least
// SYNC_FAILURE_THRESHOLD_MS (~8h / 2 cron cycles) has elapsed since priceUpdatedAt.
//
// organizerId OR sale.organizerId scoping matches computeEbayInsertionsForecast()'s
// pattern in ebayInsertionsForecast.ts (Item.organizerId is denormalized from
// sale.organizerId for inventory-library items with no saleId, per schema.prisma).

interface EbaySyncIssueItem {
  id: string;
  title: string;
  primaryPhotoUrl: string | null;
  price: number | null;
  platforms: string[];
  priceUpdatedAt: string;
}

export async function getEbaySyncIssues(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (!requireOrganizer(req, res)) return res;

    const organizerId = await resolveOrganizerId(req);
    if (!organizerId) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const thresholdCutoff = new Date(Date.now() - SYNC_FAILURE_THRESHOLD_MS);

    const candidates = await prisma.item.findMany({
      where: {
        status: 'AVAILABLE',
        deletedAt: null,
        ebayListingId: { not: null },
        priceUpdatedAt: { not: null, lte: thresholdCutoff },
        OR: [
          { organizerId },
          { sale: { organizerId } },
        ],
      },
      select: {
        id: true,
        title: true,
        photoUrls: true,
        price: true,
        priceUpdatedAt: true,
        ebayPriceSyncedAt: true,
      },
      orderBy: { priceUpdatedAt: 'asc' },
    });

    // ebayPriceSyncedAt-vs-priceUpdatedAt comparison can't be expressed as a single
    // Prisma where clause (no field-to-field comparison in the standard client API) --
    // filtered in JS here, same approach ebayListingSyncCron.ts's own staleItems check uses.
    const syncIssues: EbaySyncIssueItem[] = candidates
      .filter(item => !item.ebayPriceSyncedAt || item.ebayPriceSyncedAt.getTime() < item.priceUpdatedAt!.getTime())
      .map(item => ({
        id: item.id,
        title: item.title,
        primaryPhotoUrl: item.photoUrls[0] ?? null,
        price: item.price ?? null,
        // eBay-only for v1 -- Discogs/Reverb have no xPriceSyncedAt equivalent to
        // compute staleness from (UX spec Open Decision C, out of scope this dispatch).
        platforms: ['ebay'],
        priceUpdatedAt: item.priceUpdatedAt!.toISOString(),
      }));

    return res.json({
      totalSyncIssues: syncIssues.length,
      items: syncIssues,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[platformStats] getEbaySyncIssues error:', msg);
    return res.status(500).json({ message: 'Failed to compute eBay sync issues' });
  }
}

// ─── POST /api/organizers/me/ebay-sync-issues/retry ──────────────────────────
// On-demand retry of the same push-first sync step ebayListingSyncCron.ts runs
// every 4 hours -- scoped to the calling organizer only, so an organizer can
// verify a fix (or a manual repair, e.g. removing a bad eBay video attachment)
// immediately instead of waiting for the next 2/6/10/14/18/22 UTC cron slot.
// Self-service, own-account-only, idempotent (re-running just re-checks each
// item's current state) -- no new privilege beyond the existing organizer auth.
export async function retryEbaySync(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (!requireOrganizer(req, res)) return res;

    const organizerId = await resolveOrganizerId(req);
    if (!organizerId) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    await pullSyncForOrganizer(organizerId);

    return res.json({ message: 'eBay sync retried' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[platformStats] retryEbaySync error:', msg);
    return res.status(500).json({ message: 'Failed to retry eBay sync' });
  }
}

// ─── GET /api/organizers/me/platform-gap ─────────────────────────────────────

export async function getPlatformGap(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (!requireOrganizer(req, res)) return res;

    const organizerId = await resolveOrganizerId(req);
    if (!organizerId) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const { platform, page: pageStr, pageSize: pageSizeStr } = req.query as Record<string, string>;

    const validPlatforms: GapPlatform[] = ['ebay', 'google', 'facebook', 'shopify'];
    if (!platform || !validPlatforms.includes(platform as GapPlatform)) {
      return res.status(400).json({
        message: `platform is required. Valid values: ${validPlatforms.join(', ')}`,
      });
    }

    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr ?? '50', 10) || 50));

    const gap = await computePlatformGap(organizerId, platform as GapPlatform, page, pageSize);
    return res.json(gap);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[platformStats] getPlatformGap error:', msg);
    return res.status(500).json({ message: 'Failed to compute platform gap' });
  }
}

// ─── PATCH /api/organizers/me/ebay-queue-settings ────────────────────────────

export async function updateEbayQueueSettings(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (!requireOrganizer(req, res)) return res;

    const organizerId = await resolveOrganizerId(req);
    if (!organizerId) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const tier = await resolveOrganizerTier(organizerId);
    if (tier !== 'PRO' && tier !== 'TEAMS') {
      return res.status(403).json({ message: 'eBay Queue Mode requires PRO or TEAMS tier' });
    }

    const { ebayQueueMode, ebayQueueRotation } = req.body as {
      ebayQueueMode?: boolean;
      ebayQueueRotation?: boolean;
    };

    if (typeof ebayQueueMode !== 'boolean' && typeof ebayQueueRotation !== 'boolean') {
      return res.status(400).json({
        message: 'At least one of ebayQueueMode or ebayQueueRotation (boolean) is required',
      });
    }

    const updateData: { ebayQueueMode?: boolean; ebayQueueRotation?: boolean } = {};
    if (typeof ebayQueueMode === 'boolean') updateData.ebayQueueMode = ebayQueueMode;
    if (typeof ebayQueueRotation === 'boolean') updateData.ebayQueueRotation = ebayQueueRotation;

    const updated = await prisma.organizer.update({
      where: { id: organizerId },
      data: updateData,
      select: { ebayQueueMode: true, ebayQueueRotation: true },
    });

    invalidatePlatformStatsCache(organizerId);
    return res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[platformStats] updateEbayQueueSettings error:', msg);
    return res.status(500).json({ message: 'Failed to update eBay queue settings' });
  }
}

// ─── POST /api/organizers/me/ebay-queue ──────────────────────────────────────

export async function addToEbayQueue(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (!requireOrganizer(req, res)) return res;

    const organizerId = await resolveOrganizerId(req);
    if (!organizerId) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const tier = await resolveOrganizerTier(organizerId);
    if (tier !== 'PRO' && tier !== 'TEAMS') {
      return res.status(403).json({ message: 'eBay Queue Mode requires PRO or TEAMS tier' });
    }

    const { itemIds } = req.body as { itemIds?: unknown };
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds must be a non-empty array of strings' });
    }
    const ids = itemIds.filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) {
      return res.status(400).json({ message: 'itemIds must contain valid string IDs' });
    }

    // Fetch all candidate items — verify ownership and AVAILABLE status
    const items = await prisma.item.findMany({
      where: {
        id: { in: ids },
        organizerId,
        status: 'AVAILABLE',
        deletedAt: null,
      },
      select: { id: true, saleId: true, ebayQueuedAt: true, ebayOfferId: true },
    });

    const foundIds = new Set(items.map(i => i.id));
    const notFound = ids.filter(id => !foundIds.has(id));

    let queued = 0;
    let alreadyQueued = 0;
    const failed: Array<{ itemId: string; message: string }> = [];

    // eBay Queue Mode fix (2026-09-13, ADR-115 follow-up): manually-queued
    // items used to only get ebayQueuedAt set here, with nothing anywhere
    // creating an ebayOfferId for them — ebayListingQueueCron.ts's Phase A
    // fill would then always reject them with "has no ebayOfferId — cannot
    // publish from queue" (see that file's own header comment). Now that
    // Patrick has confirmed Queue Mode is PRO/TEAMS-only (same gate this
    // endpoint already enforces above), it's safe to route these items
    // through pushSaleToEbay's real offer-creation pipeline in "queueOnly"
    // mode instead of just flipping a flag — that pipeline is the ONLY place
    // in the codebase that knows how to build a valid eBay offer (weight/dims,
    // category, shipping policy, etc.), so this reuses it rather than
    // duplicating it.
    const toCreateOffer = items.filter(item => {
      if (item.ebayQueuedAt !== null || item.ebayOfferId !== null) {
        // Already queued or already live on eBay — skip
        alreadyQueued++;
        return false;
      }
      return true;
    });

    // Group by sale — pushSaleToEbay operates per-sale (needs the sale's
    // address for eBay's merchant-location requirement). Inventory items with
    // no saleId (Feature #300) have nowhere to source that from and can't be
    // pushed to eBay at all.
    const bySaleId = new Map<string, string[]>();
    for (const item of toCreateOffer) {
      if (!item.saleId) {
        failed.push({ itemId: item.id, message: 'Item is not attached to a sale — cannot create an eBay offer for it.' });
        continue;
      }
      const list = bySaleId.get(item.saleId) ?? [];
      list.push(item.id);
      bySaleId.set(item.saleId, list);
    }

    const userId = req.user?.id;
    if (bySaleId.size > 0 && !userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    for (const [saleId, saleItemIds] of bySaleId) {
      const { statusCode, body } = await pushItemsToEbayQueueOnly(userId as string, saleId, saleItemIds);
      if (statusCode !== 200 || !body || !Array.isArray(body.results)) {
        // Sale-level failure (e.g. eBay not connected, push quota exceeded) —
        // every item in this sale group failed to get an offer created.
        const message = (body && typeof body.message === 'string') ? body.message : `Failed to create eBay offer(s) (HTTP ${statusCode})`;
        for (const itemId of saleItemIds) {
          failed.push({ itemId, message });
        }
        continue;
      }
      for (const result of body.results as Array<{ itemId: string; status: string; message?: string; error?: string }>) {
        if (result.status === 'queued') {
          queued++;
        } else {
          failed.push({ itemId: result.itemId, message: result.message || result.error || 'Failed to create eBay offer' });
        }
      }
    }

    invalidatePlatformStatsCache(organizerId);

    return res.json({
      queued,
      alreadyQueued,
      notFound: notFound.length > 0 ? notFound : undefined,
      failed: failed.length > 0 ? failed : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[platformStats] addToEbayQueue error:', msg);
    return res.status(500).json({ message: 'Failed to add items to eBay queue' });
  }
}

// ─── DELETE /api/organizers/me/ebay-queue/:itemId ────────────────────────────

export async function removeFromEbayQueue(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (!requireOrganizer(req, res)) return res;

    const organizerId = await resolveOrganizerId(req);
    if (!organizerId) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const { itemId } = req.params;
    if (!itemId) {
      return res.status(400).json({ message: 'itemId is required' });
    }

    // Verify ownership
    const item = await prisma.item.findFirst({
      where: { id: itemId, organizerId, deletedAt: null },
      select: { id: true, ebayQueuedAt: true },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found or not owned by this organizer' });
    }

    await prisma.item.update({
      where: { id: itemId },
      data: { ebayQueuedAt: null },
    });

    invalidatePlatformStatsCache(organizerId);
    return res.json({ removed: true, itemId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[platformStats] removeFromEbayQueue error:', msg);
    return res.status(500).json({ message: 'Failed to remove item from eBay queue' });
  }
}
