import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const HOLD_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// POST /api/reservations — shopper places a 24-hour hold on an item
export const placeHold = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role === 'ORGANIZER') return res.status(403).json({ message: 'Organizers cannot place holds' });

    const { itemId, note } = req.body;
    if (!itemId) return res.status(400).json({ message: 'itemId is required' });

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (item.status !== 'AVAILABLE') return res.status(409).json({ message: 'Item is not available for hold' });

    const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);

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
export const getOrganizerHolds = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role !== 'ORGANIZER') return res.status(403).json({ message: 'Organizers only' });

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    const reservations = await prisma.itemReservation.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        item: { sale: { organizerId: organizer.id } },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: {
          select: {
            id: true,
            title: true,
            sale: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(reservations);
  } catch (error) {
    console.error('[reservations] getOrganizerHolds error:', error);
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
