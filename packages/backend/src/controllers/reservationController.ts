import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const DEFAULT_HOLD_HOURS = 48; // #24: default hold duration (was 24h)

// POST /api/reservations — shopper places a hold on an item (duration set per-sale)
export const placeHold = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role === 'ORGANIZER') return res.status(403).json({ message: 'Organizers cannot place holds' });

    const { itemId, note } = req.body;
    if (!itemId) return res.status(400).json({ message: 'itemId is required' });

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: true },
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (item.status !== 'AVAILABLE') return res.status(409).json({ message: 'Item is not available for hold' });

    const durationMs = ((item.sale as any)?.holdDurationHours ?? DEFAULT_HOLD_HOURS) * 3600000;
    const expiresAt = new Date(Date.now() + durationMs);

    const reservation = await prisma.$transaction(async (tx) => {
      const r = await tx.itemReservation.create({
        data: {
          itemId,
          userId: req.user!.id,
          status: 'PENDING',
          expiresAt,
          note: note?.trim() || null,
        },
      });
      await tx.item.update({ where: { id: itemId }, data: { status: 'RESERVED' } });
      return r;
    });

    res.status(201).json(reservation);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Item already has an active hold' });
    }
    console.error('[reservations] placeHold error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/reservations/:id — shopper cancels their own hold (organizer can cancel any)
export const cancelHold = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { id } = req.params;
    const reservation = await prisma.itemReservation.findUnique({ where: { id } });
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    const isOrganizer = req.user.role === 'ORGANIZER';
    if (!isOrganizer && reservation.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.itemReservation.update({ where: { id }, data: { status: 'CANCELLED' } });
      await tx.item.update({ where: { id: reservation.itemId }, data: { status: 'AVAILABLE' } });
    });

    res.json({ message: 'Hold cancelled' });
  } catch (error) {
    console.error('[reservations] cancelHold error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/item/:itemId — get the active reservation for an item (any auth'd user)
export const getItemReservation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { itemId } = req.params;
    const reservation = await prisma.itemReservation.findUnique({
      where: { itemId },
      include: { user: { select: { id: true, name: true } } },
    });

    res.json(reservation || null);
  } catch (error) {
    console.error('[reservations] getItemReservation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/organizer — all active holds across organizer's sales
// #24: supports ?saleId=xxx&sort=expiry|created query params
export const getOrganizerHolds = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role !== 'ORGANIZER') return res.status(403).json({ message: 'Organizers only' });

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    const { saleId, sort } = req.query as { saleId?: string; sort?: string };

    const where: any = {
      status: { in: ['PENDING', 'CONFIRMED'] },
      item: { sale: { organizerId: organizer.id } },
    };
    // Optional sale filter
    if (saleId) {
      where.item.saleId = saleId;
    }

    const orderBy = sort === 'created'
      ? { createdAt: 'desc' as const }
      : { expiresAt: 'asc' as const }; // default: soonest-expiring first

    const reservations = await prisma.itemReservation.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            photoUrls: true,
            sale: { select: { id: true, title: true } },
          },
        },
      },
      orderBy,
    });

    res.json(reservations);
  } catch (error) {
    console.error('[reservations] getOrganizerHolds error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/organizer/count — lightweight hold count for dashboard badge
export const getOrganizerHoldCount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role !== 'ORGANIZER') return res.status(403).json({ message: 'Organizers only' });

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    const count = await prisma.itemReservation.count({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        item: { sale: { organizerId: organizer.id } },
      },
    });

    res.json({ count });
  } catch (error) {
    console.error('[reservations] getOrganizerHoldCount error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/reservations/batch — batch operations: release, extend, markSold
export const batchUpdateHolds = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role !== 'ORGANIZER') return res.status(403).json({ message: 'Organizers only' });

    const { ids, action } = req.body as { ids: string[]; action: string };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array is required' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ message: 'Maximum 50 holds per batch operation' });
    }
    if (!['release', 'extend', 'markSold'].includes(action)) {
      return res.status(400).json({ message: 'action must be release, extend, or markSold' });
    }

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    // Verify all holds belong to this organizer
    const holds = await prisma.itemReservation.findMany({
      where: { id: { in: ids }, status: { in: ['PENDING', 'CONFIRMED'] } },
      include: {
        item: {
          include: { sale: true },
        },
      },
    });

    const validHolds = holds.filter((h) => h.item.sale?.organizerId === organizer.id);
    if (validHolds.length === 0) {
      return res.status(404).json({ message: 'No valid holds found' });
    }

    const validIds = validHolds.map((h) => h.id);
    const validItemIds = validHolds.map((h) => h.item.id);

    if (action === 'release') {
      await prisma.$transaction([
        prisma.itemReservation.updateMany({
          where: { id: { in: validIds } },
          data: { status: 'CANCELLED' },
        }),
        prisma.item.updateMany({
          where: { id: { in: validItemIds } },
          data: { status: 'AVAILABLE' },
        }),
      ]);
    } else if (action === 'extend') {
      // Extend each hold by its sale's holdDurationHours from now
      await prisma.$transaction(
        validHolds.map((h) => {
          const hours = (h.item.sale as any)?.holdDurationHours ?? DEFAULT_HOLD_HOURS;
          return prisma.itemReservation.update({
            where: { id: h.id },
            data: { expiresAt: new Date(Date.now() + hours * 3600000) },
          });
        })
      );
    } else if (action === 'markSold') {
      await prisma.$transaction([
        prisma.itemReservation.updateMany({
          where: { id: { in: validIds } },
          data: { status: 'CONFIRMED' },
        }),
        prisma.item.updateMany({
          where: { id: { in: validItemIds } },
          data: { status: 'SOLD' },
        }),
      ]);
    }

    res.json({ updated: validHolds.length, failed: ids.length - validHolds.length });
  } catch (error) {
    console.error('[reservations] batchUpdateHolds error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/reservations/:id — organizer confirms or cancels a hold
export const updateHold = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role !== 'ORGANIZER') return res.status(403).json({ message: 'Organizers only' });

    const { id } = req.params;
    const { status } = req.body;

    if (!['CONFIRMED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'status must be CONFIRMED or CANCELLED' });
    }

    const reservation = await prisma.itemReservation.findUnique({ where: { id } });
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.itemReservation.update({ where: { id }, data: { status } });
      if (status === 'CANCELLED') {
        await tx.item.update({ where: { id: reservation.itemId }, data: { status: 'AVAILABLE' } });
      }
      return r;
    });

    res.json(updated);
  } catch (error) {
    console.error('[reservations] updateHold error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
