import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const getMyReceipts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const receipts = await prisma.digitalReceipt.findMany({
      where: {
        purchase: {
          userId: req.user.id,
        },
      },
      include: {
        purchase: {
          select: {
            id: true,
            amount: true,
            createdAt: true,
            sale: {
              select: {
                id: true,
                title: true,
              },
            },
            item: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        issuedAt: 'desc',
      },
    });

    res.json({ receipts });
  } catch (error) {
    console.error('getMyReceipts error:', error);
    res.status(500).json({ message: 'Failed to fetch receipts' });
  }
};

export const getReceipt = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;

    const receipt = await prisma.digitalReceipt.findUnique({
      where: { id: parseInt(id) },
      include: {
        purchase: {
          select: {
            id: true,
            userId: true,
            amount: true,
            createdAt: true,
            sale: {
              select: {
                id: true,
                title: true,
                address: true,
                city: true,
                state: true,
                zip: true,
                organizer: {
                  select: {
                    businessName: true,
                    phone: true,
                  },
                },
              },
            },
            item: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    if (receipt.purchase.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ receipt });
  } catch (error) {
    console.error('getReceipt error:', error);
    res.status(500).json({ message: 'Failed to fetch receipt' });
  }
};
