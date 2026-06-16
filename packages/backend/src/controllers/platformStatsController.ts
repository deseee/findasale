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

// ─── Helper: resolve organizerId from authenticated user ──────────────────────

async function resolveOrganizerId(req: AuthRequest): Promise<string | null> {
  if (!req.user) return null;
  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    select: { id: true },
  });
  return organizer?.id ?? null;
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
      select: { id: true, ebayQueuedAt: true, ebayOfferId: true },
    });

    const foundIds = new Set(items.map(i => i.id));
    const notFound = ids.filter(id => !foundIds.has(id));

    let queued = 0;
    let alreadyQueued = 0;

    const now = new Date();
    for (const item of items) {
      if (item.ebayQueuedAt !== null || item.ebayOfferId !== null) {
        // Already queued or already live on eBay — skip
        alreadyQueued++;
        continue;
      }
      await prisma.item.update({
        where: { id: item.id },
        data: { ebayQueuedAt: now },
      });
      queued++;
    }

    invalidatePlatformStatsCache(organizerId);

    return res.json({
      queued,
      alreadyQueued,
      notFound: notFound.length > 0 ? notFound : undefined,
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
