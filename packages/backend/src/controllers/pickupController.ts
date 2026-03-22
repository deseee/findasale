import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// POST /api/pickup/slots — organizer creates a pickup slot for their sale
export const createSlot = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const { saleId, startsAt, endsAt, capacity } = req.body;

    // Validate required fields
    if (!saleId || !startsAt || !endsAt) {
      return res.status(400).json({ message: 'saleId, startsAt, and endsAt are required' });
    }

    // Validate times
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (startDate >= endDate) {
      return res.status(400).json({ message: 'startsAt must be before endsAt' });
    }

    // Validate capacity
    const cap = capacity ? parseInt(capacity, 10) : 1;
    if (cap < 1) {
      return res.status(400).json({ message: 'capacity must be at least 1' });
    }

    // Verify organizer owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied — you do not own this sale' });
    }

    const slot = await prisma.pickupSlot.create({
      data: {
        saleId,
        startsAt: startDate,
        endsAt: endDate,
        capacity: cap,
      },
    });

    res.status(201).json(slot);
  } catch (error) {
    console.error('[pickup] createSlot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/pickup/slots/:saleId — public; returns available slots with booking counts
export const getSlots = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    const slots = await prisma.pickupSlot.findMany({
      where: { saleId },
      include: {
        bookings: {
          select: { id: true, userId: true },
        },
      },
      orderBy: { startsAt: 'asc' },
    });

    // Enrich with availability info
    const enriched = slots.map((slot) => ({
      ...slot,
      bookingCount: slot.bookings.length,
      available: slot.bookings.length < slot.capacity,
      remaining: Math.max(0, slot.capacity - slot.bookings.length),
      userHasBooked: req.user ? slot.bookings.some((b) => b.userId === req.user!.id) : false,
    }));

    res.json(enriched);
  } catch (error) {
    console.error('[pickup] getSlots error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/pickup/slot/:slotId — organizer deletes a slot (only if no bookings)
export const deleteSlot = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const { slotId } = req.params;

    const slot = await prisma.pickupSlot.findUnique({
      where: { id: slotId },
      include: { sale: { include: { organizer: true } }, bookings: true },
    });
    if (!slot) return res.status(404).json({ message: 'Slot not found' });

    // Verify organizer owns the sale
    if (slot.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only allow deletion if no bookings
    if (slot.bookings.length > 0) {
      return res.status(409).json({ message: 'Cannot delete slot with existing bookings' });
    }

    await prisma.pickupSlot.delete({ where: { id: slotId } });
    res.json({ message: 'Slot deleted' });
  } catch (error) {
    console.error('[pickup] deleteSlot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/pickup/book/:slotId — authenticated shopper books a pickup slot
export const bookSlot = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { slotId } = req.params;
    const { notes } = req.body;

    const slot = await prisma.pickupSlot.findUnique({
      where: { id: slotId },
      include: { bookings: true },
    });
    if (!slot) return res.status(404).json({ message: 'Slot not found' });

    // Check if slot is full
    if (slot.bookings.length >= slot.capacity) {
      return res.status(409).json({ message: 'Slot is full' });
    }

    // Check if user already booked this slot (unique constraint on [slotId, userId])
    const existing = await prisma.pickupBooking.findUnique({
      where: { slotId_userId: { slotId, userId: req.user.id } },
    });
    if (existing) {
      return res.status(409).json({ message: 'You have already booked this slot' });
    }

    const booking = await prisma.pickupBooking.create({
      data: {
        slotId,
        userId: req.user.id,
        notes: notes?.trim() || null,
      },
      include: {
        slot: {
          include: { sale: true },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(booking);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'You have already booked this slot' });
    }
    console.error('[pickup] bookSlot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/pickup/booking/:bookingId — authenticated user cancels their own booking
export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { bookingId } = req.params;

    const booking = await prisma.pickupBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // User can only cancel their own booking
    if (booking.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await prisma.pickupBooking.delete({ where: { id: bookingId } });
    res.json({ message: 'Booking cancelled' });
  } catch (error) {
    console.error('[pickup] cancelBooking error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/pickup/my-bookings — authenticated shopper views their upcoming bookings
export const getMyBookings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const bookings = await prisma.pickupBooking.findMany({
      where: { userId: req.user.id },
      include: {
        slot: {
          include: {
            sale: {
              select: {
                id: true,
                title: true,
                address: true,
                city: true,
                state: true,
                zip: true,
              },
            },
          },
        },
      },
      orderBy: { slot: { startsAt: 'asc' } },
    });

    res.json(bookings);
  } catch (error) {
    console.error('[pickup] getMyBookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
