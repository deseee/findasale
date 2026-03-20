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
  radiusKm: z.number().positive().default(5),
});

const updateHubSchema = createHubSchema.partial().omit({ slug: true });

const joinHubSchema = z.object({
  saleIds: z.array(z.string()).min(1),
});

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
          memberships: { select: { id: true } },
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
          saleCount: hub.memberships.length,
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

    const hubs = await prisma.saleHub.findMany({
      where: { isActive: true },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        memberships: { select: { id: true } },
        organizer: { select: { businessName: true } },
      },
    });

    const total = await prisma.saleHub.count({ where: { isActive: true } });

    res.json({
      hubs: hubs.map((hub) => ({
        id: hub.id,
        name: hub.name,
        slug: hub.slug,
        lat: hub.lat,
        lng: hub.lng,
        saleCount: hub.memberships.length,
        organizerName: hub.organizer?.businessName,
        saleDate: hub.saleDate,
        eventName: hub.eventName,
      })),
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('Error discovering hubs:', error);
    res.status(500).json({ error: 'Failed to discover hubs' });
  }
};

// GET /api/hubs/:slug
// Public: get hub landing page data
export const getHub = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const hub = await prisma.saleHub.findUnique({
      where: { slug },
      include: {
        memberships: {
          include: {
            sale: {
              select: {
                id: true,
                title: true,
                address: true,
                city: true,
                state: true,
                lat: true,
                lng: true,
                startDate: true,
                endDate: true,
                organizer: { select: { businessName: true } },
                items: { select: { price: true } },
              },
            },
          },
        },
        organizer: { select: { businessName: true, profilePhoto: true } },
      },
    });

    if (!hub) {
      return res.status(404).json({ error: 'Hub not found' });
    }

    // Calculate price range
    let minPrice = Infinity,
      maxPrice = 0;
    let totalItems = 0;
    hub.memberships.forEach((m) => {
      m.sale.items.forEach((item) => {
        if (item.price) {
          minPrice = Math.min(minPrice, item.price);
          maxPrice = Math.max(maxPrice, item.price);
        }
      });
      totalItems += m.sale.items.length;
    });

    res.json({
      hub: {
        id: hub.id,
        name: hub.name,
        slug: hub.slug,
        description: hub.description,
        lat: hub.lat,
        lng: hub.lng,
        radiusKm: hub.radiusKm,
        saleDate: hub.saleDate,
        eventName: hub.eventName,
        organizerName: hub.organizer?.businessName,
        organizerPhoto: hub.organizer?.profilePhoto,
        sales: hub.memberships.map((m) => ({
          id: m.sale.id,
          title: m.sale.title,
          address: m.sale.address,
          city: m.sale.city,
          state: m.sale.state,
          lat: m.sale.lat,
          lng: m.sale.lng,
          startDate: m.sale.startDate,
          endDate: m.sale.endDate,
          organizerName: m.sale.organizer.businessName,
        })),
        stats: {
          totalItems,
          totalSales: hub.memberships.length,
          priceRangeUSD: minPrice === Infinity ? [0, 0] : [minPrice, maxPrice],
        },
      },
    });
  } catch (error) {
    console.error('Error getting hub:', error);
    res.status(500).json({ error: 'Failed to get hub' });
  }
};

// POST /api/organizer/hubs
// Auth + PRO tier required
export const createHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerId) {
      return res.status(401).json({ error: 'Not authenticated as organizer' });
    }

    const validated = createHubSchema.parse(req.body);

    // Check slug uniqueness
    const existing = await prisma.saleHub.findUnique({
      where: { slug: validated.slug },
    });

    if (existing) {
      return res.status(400).json({ error: 'Slug already in use' });
    }

    const hub = await prisma.saleHub.create({
      data: {
        ...validated,
        organizerId: req.user.organizerId,
      },
    });

    res.json({ hubId: hub.id, slug: hub.slug });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error creating hub:', error);
    res.status(500).json({ error: 'Failed to create hub' });
  }
};

// PUT /api/organizer/hubs/:hubId
// Auth + ownership required
export const updateHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerId) {
      return res.status(401).json({ error: 'Not authenticated as organizer' });
    }

    const { hubId } = req.params;
    const validated = updateHubSchema.parse(req.body);

    // Verify ownership
    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      return res.status(404).json({ error: 'Hub not found' });
    }

    if (hub.organizerId !== req.user.organizerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.saleHub.update({
      where: { id: hubId },
      data: validated,
    });

    res.json({ updated: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error updating hub:', error);
    res.status(500).json({ error: 'Failed to update hub' });
  }
};

// DELETE /api/organizer/hubs/:hubId
// Auth + ownership required (soft delete)
export const deleteHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerId) {
      return res.status(401).json({ error: 'Not authenticated as organizer' });
    }

    const { hubId } = req.params;

    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      return res.status(404).json({ error: 'Hub not found' });
    }

    if (hub.organizerId !== req.user.organizerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.saleHub.update({
      where: { id: hubId },
      data: { isActive: false },
    });

    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting hub:', error);
    res.status(500).json({ error: 'Failed to delete hub' });
  }
};

// GET /api/organizer/hubs
// Auth required: list my hubs
export const listMyHubs = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerId) {
      return res.status(401).json({ error: 'Not authenticated as organizer' });
    }

    const hubs = await prisma.saleHub.findMany({
      where: { organizerId: req.user.organizerId },
      include: {
        memberships: { select: { id: true } },
      },
    });

    res.json({
      hubs: hubs.map((hub) => ({
        id: hub.id,
        name: hub.name,
        slug: hub.slug,
        createdAt: hub.createdAt,
        saleCount: hub.memberships.length,
        isActive: hub.isActive,
      })),
    });
  } catch (error) {
    console.error('Error listing hubs:', error);
    res.status(500).json({ error: 'Failed to list hubs' });
  }
};

// POST /api/organizer/hubs/:hubId/join
// Auth required: add current organizer's sales to hub
export const joinHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerId) {
      return res.status(401).json({ error: 'Not authenticated as organizer' });
    }

    const { hubId } = req.params;
    const validated = joinHubSchema.parse(req.body);

    // Verify hub exists
    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      return res.status(404).json({ error: 'Hub not found' });
    }

    // Verify all sales belong to current organizer
    const sales = await prisma.sale.findMany({
      where: {
        id: { in: validated.saleIds },
        organizerId: req.user.organizerId,
      },
    });

    if (sales.length !== validated.saleIds.length) {
      return res.status(400).json({ error: 'Not all sales belong to you' });
    }

    // Add memberships
    let added = 0;
    const skipped = [];

    for (const saleId of validated.saleIds) {
      const existing = await prisma.saleHubMembership.findUnique({
        where: {
          hubId_saleId: { hubId, saleId },
        },
      });

      if (!existing) {
        await prisma.saleHubMembership.create({
          data: { hubId, saleId },
        });
        added++;
      } else {
        skipped.push({ saleId, reason: 'Already in hub' });
      }
    }

    res.json({ added, skipped });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error joining hub:', error);
    res.status(500).json({ error: 'Failed to join hub' });
  }
};

// DELETE /api/organizer/hubs/:hubId/sales/:saleId
// Auth required: remove sale from hub
export const leaveHub = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerId) {
      return res.status(401).json({ error: 'Not authenticated as organizer' });
    }

    const { hubId, saleId } = req.params;

    // Verify sale belongs to current organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale || sale.organizerId !== req.user.organizerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.saleHubMembership.delete({
      where: {
        hubId_saleId: { hubId, saleId },
      },
    });

    res.json({ removed: true });
  } catch (error) {
    console.error('Error leaving hub:', error);
    res.status(500).json({ error: 'Failed to leave hub' });
  }
};

// PATCH /api/organizer/hubs/:hubId/event
// Auth + ownership required: set event date (Neighborhood Sale Day)
export const setHubEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerId) {
      return res.status(401).json({ error: 'Not authenticated as organizer' });
    }

    const { hubId } = req.params;
    const validated = setEventDateSchema.parse(req.body);

    // Verify ownership
    const hub = await prisma.saleHub.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      return res.status(404).json({ error: 'Hub not found' });
    }

    if (hub.organizerId !== req.user.organizerId) {
      return res.status(403).json({ error: 'Unauthorized' });
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
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error setting hub event:', error);
    res.status(500).json({ error: 'Failed to set hub event' });
  }
};
