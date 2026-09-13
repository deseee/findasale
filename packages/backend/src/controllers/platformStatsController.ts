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
