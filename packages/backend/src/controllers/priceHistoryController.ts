import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { resolveItemOwnerOrganizer } from '../utils/itemOwner';

// GET /api/items/:id/price-history
export const getPriceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // P0-3: Verify item's parent sale is published before returning price history
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        saleId: true,
        organizerId: true, // inventory items (saleId null): ownership resolves through Item.organizerId plus the caller's userId
        draftStatus: true,
        sale: {
          select: {
            status: true,
            organizerId: true,
            // Full owner shape that resolveItemOwnerOrganizer expects (compared against req.user.id)
            organizer: { select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } },
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Organizers can always see price history for their own items (including ENDED sales)
    // Note: sale.organizerId is Organizer.id (not User.id) — must compare via organizer.userId
    const requestingUserId = req.user?.id;
    // Default deny: null unless the caller owns the item (the sale's organizer, or for an inventory item the
    // organizer whose userId matches). Anonymous callers never resolve and trigger no lookup.
    const owner = requestingUserId ? await resolveItemOwnerOrganizer(item, requestingUserId) : null;
    const isOwner = owner !== null;
    const isAdmin = req.user?.role === 'ADMIN';

    if (!item.sale) {
      // Inventory item (no sale): price history is private to its owner. Everyone else, including anonymous
      // callers and admins, gets the same 404 as a missing item so existence is not revealed. Fail closed.
      if (!isOwner) {
        return res.status(404).json({ message: 'Item not found' });
      }
    } else if (!isOwner && !isAdmin) {
      // Return 404 if sale is not published (don't leak resource existence via 403)
      if (item.sale.status !== 'PUBLISHED') {
        return res.status(404).json({ message: 'Item not found' });
      }

      // P1-B: Return 404 if item itself is not published/visible
      if (item.draftStatus && item.draftStatus !== 'PUBLISHED') {
        return res.status(404).json({ message: 'Item not found' });
      }
    }

    const history = await prisma.itemPriceHistory.findMany({
      where: { itemId: id },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(history);
  } catch (err) {
    console.error('getPriceHistory error:', err);
    return res.status(500).json({ message: 'Failed to fetch price history' });
  }
};

// Internal helper: record a price change (called from itemController on price update)
export const recordPriceChange = async (
  itemId: string,
  price: number,
  changedBy: string,
  note?: string
): Promise<void> => {
  try {
    await prisma.itemPriceHistory.create({
      data: { itemId, price, changedBy, note },
    });
  } catch (err) {
    console.error('recordPriceChange error:', err);
  }
};
