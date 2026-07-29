import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Haversine distance calculation (kilometers)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Validation schemas
const createHubSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
});

const updateHubSchema = createHubSchema.partial().omit({ slug: true });

const setEventDateSchema = z.object({
  saleDate: z.string().datetime().optional(),
  eventName: z.string().max(150).optional(),
});

// GET /api/hubs?lat=42.7&lng=-85.6&radiusKm=10
// Public: discover nearby hubs
export const discoverHubs = async (req: Request, res: Response) => {
  try {
    const { lat, lng, radiusKm = 10, page = 1, limit = 20 } = req.query;

    // If lat/lng provided, return hubs within radius
    if (lat && lng) {
      const latNum = parseFloat(lat as string);
      const lngNum = parseFloat(lng as string);
      const radiusNum = parseFloat((radiusKm as string) || '10');
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 20;

      // Fetch all active hubs and filter by distance in memory
      // P1-C: Cap at 500 hubs to prevent unbounded memory consumption
      const allHubs = await prisma.saleHub.findMany({
        where: { isActive: true },
        take: 500,
        include: {
          _count: { select: { vendorBooths: true } },
          organizer: { select: { businessName: true } },
        },
      });

      const nearbyHubs = allHubs
        .filter((hub) => haversineDistance(latNum, lngNum, hub.lat, hub.lng) <= radiusNum)
        .map((hub) => ({
          id: hub.id,
          name: hub.name,
          slug: hub.slug,
          lat: hub.lat,
          lng: hub.lng,
          boothCount: hub._count.vendorBooths,
          organizerName: hub.organizer?.businessName,
          saleDate: hub.saleDate,
          eventName: hub.eventName,
        }))
        .slice((pageNum - 1) * limitNum, pageNum * limitNum);

      return res.json({
        hubs: nearbyHubs,
        total: allHubs.length,
        page: pageNum,
        limit: limitNum,
      });
    }

    // No location provided: return all active hubs
    const pageNum = parseInt(String(page) || '1');
    const limitNum = parseInt(String(limit) || '20');

    // S1149: paginate in application code, not via Prisma skip/take (LIMIT/OFFSET), which
    // currently triggers a Postgres wire-protocol error against this table (Prisma 5.22 /
    // Postgres 18 gap -- see claude_docs/feature-notes/adr-s1149-salehub-prisma-pg18-2026-07-22.md).
    // Mirrors the pattern the lat/lng branch above already uses (take: 500 + in-memory slice).
    const allActiveHubs = await prisma.saleHub.findMany({
      where: { isActive: true },
      take: 500,
      include: {
        _count: { select: { vendorBooths: true } },
        organizer: { select: { businessName: true } },
      },
    });

    const pagedHubs = allActiveHubs
      .map((hub) => ({
        id: hub.id,
        name: hub.name,
        slug: hub.slug,
        lat: hub.lat,
        lng: hub.lng,
        boothCount: hub._count.vendorBooths,
        organizerName: hub.organizer?.businessName,
        saleDate: hub.saleDate,
        eventName: hub.eventName,
      }))
      .slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      hubs: pagedHubs,
      total: allActiveHubs.length,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('Error discovering hubs:', error);
    res.status(500).json({ message: 'Failed to discover hubs' });
  }
};

// GET /api/hubs/:slug
// Public: get hub landing page data
export const getHub = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // isActive: true matches what discoverHubs already filters on above (:51, :91).
    // deleteHub soft-deletes by setting isActive: false (:274) -- SaleHub has no
    // deletedAt column (schema.prisma:3043-3067), so isActive IS the valid-state flag.
    // findFirst (not findUnique) because slug alone is the unique key; a deactivated
    // hub falls through to the SAME 404 a nonexistent slug gets, so this public
    // endpoint never distinguishes "deactivated" from "does not exist".
    const hub = await prisma.saleHub.findFirst({
      where: { slug, isActive: true },
      include: {
        _count: { select: { vendorBooths: true } },
        organizer: { select: { businessName: true, profilePhoto: true } },
      },
    });

    if (!hub) {
      return res.status(404).json({ message: 'Hub not found' });
    }

    res.json({
      hub: {
        id: hub.id,
        name: hub.name,
        slug: hub.slug,
        description: hub.description,
        lat: hub.lat,
        lng: hub.lng,
        boothCount: hub._count.vendorBooths,
        saleDate: hub.saleDate,
        eventName: hub.eventName,
        organizerName: hub.organizer?.businessName,
        organizerPhoto: hub.organizer?.profilePhoto,
      },
    });
  } catch (error) {
    console.error('Error getting hub:', error);
    res.status(500).json({ message: 'Failed to get hub' });
  }
};

// POST /api/organizer/hubs
// Auth + PRO tier required
export const createHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Not authenticated as organizer' });
    }

    const validated = createHubSchema.parse(req.body);

    // Check slug uniqueness
    const existing = await prisma.saleHub.findUnique({
      where: { slug: validated.slug },
    });

    if (existing) {
      return res.status(400).json({ message: 'Slug already in use' });
    }

    // S1149: explicit select shrinks the RETURNING clause to just what's used below --
    // Prisma's default full-scalar-field RETURNING on this table currently triggers a
    // Postgres wire-protocol error (Prisma 5.22 / Postgres 18 gap -- see
    // claude_docs/feature-notes/adr-s1149-salehub-prisma-pg18-2026-07-22.md).
    const hub = await prisma.saleHub.create({
      data: {
        ...validated,
        organizerId: req.user.organizerProfile?.id,
      },
      select: { id: true, slug: true },
    });

    res.json({ hubId: hub.id, slug: hub.slug });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors });
    }
    console.error('Error creating hub:', error);
    res.status(500).json({ message: 'Failed to create hub' });
  }
};

// PUT /api/organizer/hubs/:hubId
// Auth + ownership required
export const updateHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Not authenticated as organizer' });
    }

    const { hubId } = req.params;
    const validated = updateHubSchema.parse(req.body);

    // Verify ownership
    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      return res.status(404).json({ message: 'Hub not found' });
    }

    if (hub.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await prisma.saleHub.update({
      where: { id: hubId },
      data: validated,
    });

    res.json({ updated: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors });
    }
    console.error('Error updating hub:', error);
    res.status(500).json({ message: 'Failed to update hub' });
  }
};

// ---------------------------------------------------------------------------
// Close-a-market safety counts (2026-07-28)
//
// deleteHub below is a SOFT delete: it sets isActive: false and nothing else.
// Nothing OUTSIDE this controller reads SaleHub.isActive -- the only hits for
// `isActive` across controllers/, middleware/ and services/ are in this file.
// So a "deleted" hub keeps working for everyone already inside it:
//   - vendorBoothCartController sells from its CONFIRMED booths with no hub
//     isActive check anywhere in that path;
//   - jobs/vendorBoothFeeBillingCron.ts:70-71 selects booths by
//     `status: 'CONFIRMED', deletedAt: null, boothFee: { gt: 0 }` with NO hub
//     filter at all, so a closed hub would keep charging its vendors booth
//     rent every billing period.
// Hiding a hub from shoppers while its vendors keep trading and keep being
// billed is the orphaning case. deleteHub now refuses on these counts, and
// listMyHubs / getMyHub return them so the UI can refuse first instead of
// letting an organizer close a market out from under a claimed vendor.
// ---------------------------------------------------------------------------
export interface HubCloseBlockers {
  // status CONFIRMED, not soft-deleted. The state addBoothCartItems requires to
  // sell (vendorBoothCartController.ts filters to 'CONFIRMED') and the state
  // the booth-fee cron bills on.
  confirmedBoothCount: number;
  // status PENDING with a real claiming User attached. Same definition the hub
  // list has used for "N booths awaiting your confirmation".
  awaitingConfirmationCount: number;
  // A register cart still open at this hub -- someone is mid-checkout.
  openCartCount: number;
  // Settlement batches that have not reached COMPLETED: money owed to vendors
  // that has not finished moving.
  unfinishedPayoutCount: number;
}

const emptyBlockers = (): HubCloseBlockers => ({
  confirmedBoothCount: 0,
  awaitingConfirmationCount: 0,
  openCartCount: 0,
  unfinishedPayoutCount: 0,
});

export const hubHasCloseBlockers = (b: HubCloseBlockers): boolean =>
  b.confirmedBoothCount > 0 ||
  b.awaitingConfirmationCount > 0 ||
  b.openCartCount > 0 ||
  b.unfinishedPayoutCount > 0;

// Counted in application code rather than filtered _count relations, matching
// the in-memory pattern the rest of this controller already uses, and kept to a
// fixed 3 queries no matter how many hubs are passed in.
const getHubCloseBlockers = async (hubIds: string[]): Promise<Map<string, HubCloseBlockers>> => {
  const byHub = new Map<string, HubCloseBlockers>();
  for (const id of hubIds) byHub.set(id, emptyBlockers());
  if (hubIds.length === 0) return byHub;

  const booths = await prisma.vendorBooth.findMany({
    where: { hubId: { in: hubIds }, deletedAt: null, status: { in: ['PENDING', 'CONFIRMED'] } },
    select: { hubId: true, status: true, userId: true },
  });
  for (const booth of booths) {
    const row = byHub.get(booth.hubId);
    if (!row) continue;
    if (booth.status === 'CONFIRMED') {
      row.confirmedBoothCount += 1;
    } else if (booth.userId) {
      row.awaitingConfirmationCount += 1;
    }
  }

  const openCarts = await prisma.boothCartTransaction.findMany({
    where: { hubId: { in: hubIds }, status: 'PENDING' },
    select: { hubId: true },
  });
  for (const cart of openCarts) {
    const row = byHub.get(cart.hubId);
    if (row) row.openCartCount += 1;
  }

  const batches = await prisma.vendorBoothSettlementBatch.findMany({
    where: { hubId: { in: hubIds }, status: { not: 'COMPLETED' } },
    select: { hubId: true },
  });
  for (const batch of batches) {
    const row = byHub.get(batch.hubId);
    if (row) row.unfinishedPayoutCount += 1;
  }

  return byHub;
};

// DELETE /api/organizer/hubs/:hubId
// Auth + ownership required. SOFT close: sets isActive: false, keeps every row.
export const deleteHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Not authenticated as organizer' });
    }

    const { hubId } = req.params;

    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      return res.status(404).json({ message: 'Hub not found' });
    }

    if (hub.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Already closed. Report success rather than an error: a double tap, a stale
    // list, or a retry after a dropped response must not show the organizer a
    // failure for the exact state they asked for.
    if (!hub.isActive) {
      return res.json({ deleted: true, alreadyClosed: true });
    }

    // Refuse to close a market that still has vendors trading in it or money in
    // flight. Without this the soft delete only hides the hub from shoppers --
    // its CONFIRMED booths keep selling and keep getting billed booth rent (see
    // the note above getHubCloseBlockers).
    const blockers = (await getHubCloseBlockers([hubId])).get(hubId) ?? emptyBlockers();
    if (hubHasCloseBlockers(blockers)) {
      return res.status(409).json({
        code: 'HUB_NOT_EMPTY',
        message: 'This market still has vendors or unfinished money records.',
        blockers,
      });
    }

    await prisma.saleHub.update({
      where: { id: hubId },
      data: { isActive: false },
    });

    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting hub:', error);
    res.status(500).json({ message: 'Failed to delete hub' });
  }
};

// POST /api/organizer/hubs/:hubId/reopen
// Auth + ownership required. The exact inverse of deleteHub above.
//
// deleteHub does not erase anything, so "closed" has to be undoable or the UI
// would be promising permanence the database never delivers. updateHub cannot
// do this: updateHubSchema is createHubSchema.partial().omit({ slug: true }),
// which has no isActive field, so before this endpoint there was no way back
// from isActive: false at all.
export const reopenHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Not authenticated as organizer' });
    }

    const { hubId } = req.params;

    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      return res.status(404).json({ message: 'Hub not found' });
    }

    if (hub.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (hub.isActive) {
      return res.json({ reopened: true, alreadyOpen: true });
    }

    await prisma.saleHub.update({
      where: { id: hubId },
      data: { isActive: true },
    });

    res.json({ reopened: true });
  } catch (error) {
    console.error('Error reopening hub:', error);
    res.status(500).json({ message: 'Failed to reopen hub' });
  }
};

// GET /api/organizer/hubs
// Auth required: list my hubs
export const listMyHubs = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Not authenticated as organizer' });
    }

    const hubs = await prisma.saleHub.findMany({
      where: { organizerId: req.user.organizerProfile?.id },
      include: {
        _count: { select: { vendorBooths: true } },
      },
    });

    // "N booths awaiting your confirmation" -- the count-based in-app signal behind the
    // dashboard hub card and the hubs list. A booth in this state (a vendor has claimed
    // it, but the organizer has not confirmed it) CANNOT be sold from: claimVendorBooth
    // sets only userId, and addBoothCartItems filters to status 'CONFIRMED'
    // (vendorBoothCartController.ts :396). Before this, the only way to discover one was
    // to open the Vendor Booths page and notice a column had changed.
    //
    // That same count is now one of four "can this market be closed" numbers, so it comes
    // from the shared getHubCloseBlockers helper instead of its own inline query -- the
    // list and deleteHub must agree exactly, or the UI would offer a Close button the
    // server then refuses.
    const hubIds = hubs.map((hub) => hub.id);
    const blockersByHub = await getHubCloseBlockers(hubIds);

    res.json({
      hubs: hubs.map((hub) => {
        const blockers = blockersByHub.get(hub.id) ?? emptyBlockers();
        return {
          id: hub.id,
          name: hub.name,
          slug: hub.slug,
          createdAt: hub.createdAt,
          boothCount: hub._count.vendorBooths,
          awaitingConfirmationCount: blockers.awaitingConfirmationCount,
          confirmedBoothCount: blockers.confirmedBoothCount,
          openCartCount: blockers.openCartCount,
          unfinishedPayoutCount: blockers.unfinishedPayoutCount,
          canClose: !hubHasCloseBlockers(blockers),
          isActive: hub.isActive,
          saleDate: hub.saleDate,
          eventName: hub.eventName,
        };
      }),
    });
  } catch (error) {
    console.error('Error listing hubs:', error);
    res.status(500).json({ message: 'Failed to list hubs' });
  }
};

// GET /api/organizer/hubs/:hubId
// Auth + ownership required: full detail for one of the organizer's own hubs.
// Distinct from the PUBLIC by-slug GET /api/hubs/:slug above -- that endpoint
// leaks hub data to non-owners and doesn't accept a hubId, which is all the
// authenticated management page (manage.tsx) has from its route.
export const getMyHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Not authenticated as organizer' });
    }
    const { hubId } = req.params;
    const hub = await prisma.saleHub.findUnique({ where: { id: hubId } });
    if (!hub) return res.status(404).json({ message: 'Hub not found' });
    if (hub.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    // Same four counts listMyHubs returns, so the Hub Details page can state
    // plainly why a market cannot be closed yet instead of guessing.
    const blockers = (await getHubCloseBlockers([hubId])).get(hubId) ?? emptyBlockers();
    res.json({
      hub: {
        id: hub.id,
        name: hub.name,
        slug: hub.slug,
        description: hub.description,
        lat: hub.lat,
        lng: hub.lng,
        saleDate: hub.saleDate,
        eventName: hub.eventName,
        isActive: hub.isActive,
        createdAt: hub.createdAt,
        awaitingConfirmationCount: blockers.awaitingConfirmationCount,
        confirmedBoothCount: blockers.confirmedBoothCount,
        openCartCount: blockers.openCartCount,
        unfinishedPayoutCount: blockers.unfinishedPayoutCount,
        canClose: !hubHasCloseBlockers(blockers),
      },
    });
  } catch (error) {
    console.error('Error getting my hub:', error);
    res.status(500).json({ message: 'Failed to get hub' });
  }
};

// PATCH /api/organizer/hubs/:hubId/event
// Auth + ownership required: set event date (Neighborhood Sale Day)
export const setHubEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Not authenticated as organizer' });
    }

    const { hubId } = req.params;
    const validated = setEventDateSchema.parse(req.body);

    // Verify ownership
    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      return res.status(404).json({ message: 'Hub not found' });
    }

    if (hub.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await prisma.saleHub.update({
      where: { id: hubId },
      data: {
        saleDate: validated.saleDate ? new Date(validated.saleDate) : null,
        eventName: validated.eventName,
      },
    });

    res.json({ updated: true, saleDate: updated.saleDate, eventName: updated.eventName });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors });
    }
    console.error('Error setting hub event:', error);
    res.status(500).json({ message: 'Failed to set hub event' });
  }
};
