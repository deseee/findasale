import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// GET /api/items/:id/price-history
export const getPriceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
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
