import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';

// GET /api/items/:id/price-history
export const getPriceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // P0-3: Verify item's parent sale is published before returning price history
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        saleId: true,
        draftStatus: true,
        sale: {
          select: {
            status: true,
            organizerId: true,
            organizer: { select: { userId: true } }, // needed to compare against req.user.id
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
    const isOwner = requestingUserId && item.sale!.organizer?.userId === requestingUserId;
    const isAdmin = req.user?.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      // Return 404 if sale is not published (don't leak resource existence via 403)
      if (item.sale!.status !== 'PUBLISHED') {
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
