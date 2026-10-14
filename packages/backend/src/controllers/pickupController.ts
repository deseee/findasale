import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { gateSaleForViewer, GATE_ORGANIZER_SELECT } from '../lib/publicSaleGate';

// 2026-10-13 public sale privacy gate. A pickup booking can be created by any signed-in user (bookSlot does not
// require a purchase), so the sale address on a booking is only treated as buyer-owned pickup info when the user
// really bought or holds something at that sale. Everyone else goes through the normal public address gate.
const BOOKING_SALE_SELECT = {
  id: true,
  title: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  startDate: true,
  organizer: { select: GATE_ORGANIZER_SELECT },
} as const;

/** Sale ids (from saleIds) where the user has a purchase or a live hold. */
async function buyerSaleIds(userId: string, saleIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (saleIds.length === 0) return out;
  const [purchases, holds] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        userId,
        status: { notIn: ['FAILED'] },
        OR: [{ saleId: { in: saleIds } }, { item: { saleId: { in: saleIds } } }],
      },
      select: { saleId: true, item: { select: { saleId: true } } },
    }),
    prisma.itemReservation.findMany({
      where: { userId, status: { notIn: ['CANCELLED', 'EXPIRED'] }, item: { saleId: { in: saleIds } } },
      select: { item: { select: { saleId: true } } },
    }),
  ]);
  for (const p of purchases) {
    if (p.saleId) out.add(p.saleId);
    if (p.item?.saleId) out.add(p.item.saleId);
  }
  for (const h of holds) if (h.item?.saleId) out.add(h.item.saleId);
  return out;
}

/** Buyer keeps the full address; anyone else gets the public gate. Gate-only organizer keys never leave. */
function gateBookingSale<T extends { id: string; organizer?: unknown }>(sale: T, viewer: AuthRequest['user'], buyerSales: Set<string>) {
  const shown: any = buyerSales.has(sale.id) ? sale : gateSaleForViewer(sale as any, viewer);
  const { organizer: _gateOnly, ...rest } = shown;
  return rest as Omit<T, 'organizer'>;
}

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
      return res.status(403).json({ message: 'Access denied. You do not own this sale.' });
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

// POST /api/pickup/slots/batch — organizer creates multiple pickup slots at once
export const createSlotsBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const { saleId, slots } = req.body;

    // Validate required fields
    if (!saleId || !slots || !Array.isArray(slots)) {
      return res.status(400).json({ message: 'saleId and slots array are required' });
    }

    if (slots.length === 0) {
      return res.status(400).json({ message: 'At least one slot is required' });
    }

    // Verify organizer owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You do not own this sale.' });
    }

    // Validate and prepare all slots
    const slotData: Array<{ saleId: string; startsAt: Date; endsAt: Date; capacity: number }> = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];

      if (!slot.startsAt || !slot.endsAt) {
        return res.status(400).json({
          message: `Slot ${i + 1}: startsAt and endsAt are required`,
        });
      }

      const startDate = new Date(slot.startsAt);
      const endDate = new Date(slot.endsAt);

      if (startDate >= endDate) {
        return res.status(400).json({
          message: `Slot ${i + 1}: startsAt must be before endsAt`,
        });
      }

      const cap = slot.capacity ? parseInt(slot.capacity, 10) : 5;
      if (cap < 1 || cap > 50) {
        return res.status(400).json({
          message: `Slot ${i + 1}: capacity must be between 1 and 50`,
        });
      }

      slotData.push({
        saleId,
        startsAt: startDate,
        endsAt: endDate,
        capacity: cap,
      });
    }

    // Create all slots atomically
    const result = await prisma.pickupSlot.createMany({
      data: slotData,
      skipDuplicates: false,
    });

    res.status(201).json({ created: result.count });
  } catch (error) {
    console.error('[pickup] createSlotsBatch error:', error);
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
          include: { sale: { select: BOOKING_SALE_SELECT } },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const bookingBuyerSales = await buyerSaleIds(req.user.id, [booking.slot.sale.id]);
    res.status(201).json({
      ...booking,
      slot: { ...booking.slot, sale: gateBookingSale(booking.slot.sale, req.user, bookingBuyerSales) },
    });
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
            sale: { select: BOOKING_SALE_SELECT },
          },
        },
      },
      orderBy: { slot: { startsAt: 'asc' } },
    });

    const myBuyerSales = await buyerSaleIds(
      req.user.id,
      Array.from(new Set(bookings.map((b) => b.slot.sale.id)))
    );
    res.json(
      bookings.map((b) => ({
        ...b,
        slot: { ...b.slot, sale: gateBookingSale(b.slot.sale, req.user, myBuyerSales) },
      }))
    );
  } catch (error) {
    console.error('[pickup] getMyBookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
