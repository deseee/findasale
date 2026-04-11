import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const getMyReceipts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Query Purchase directly — DigitalReceipt records are not auto-created
    // for all purchase types (auction wins, hold invoices). Purchase is the
    // source of truth for what a shopper has bought.
    const purchases = await prisma.purchase.findMany({
      where: {
        userId: req.user.id,
        status: 'PAID',
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        stripePaymentIntentId: true,
        sale: {
          select: {
            id: true,
            title: true,
            organizer: {
              select: {
                id: true,
                businessName: true,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Group per-item POS purchases into a single receipt card per transaction.
    // Per-item purchases store stripePaymentIntentId as "{piId}_{itemId}" or "{piId}_misc".
    // We strip the suffix to get the base PI ID and group by it.
    const getBasePIId = (piId: string | null): string | null => {
      if (!piId) return null;
      const lastUnderscore = piId.lastIndexOf('_');
      if (lastUnderscore > 0) {
        const suffix = piId.substring(lastUnderscore + 1);
        // cuid item IDs start with 'cm' and are ~25 chars; 'misc' is the misc-remainder marker
        if ((suffix.startsWith('cm') && suffix.length >= 20) || suffix === 'misc') {
          return piId.substring(0, lastUnderscore);
        }
      }
      return piId;
    };

    const transactionGroups = new Map<string, typeof purchases>();
    for (const p of purchases) {
      const key = getBasePIId(p.stripePaymentIntentId) ?? p.id;
      const group = transactionGroups.get(key) ?? [];
      group.push(p);
      transactionGroups.set(key, group);
    }

    // Shape response to match ReceiptCard component expectations
    const receipts = Array.from(transactionGroups.values()).map((group) => {
      const first = group[0];
      const total = group.reduce((sum, p) => sum + p.amount, 0);
      return {
        id: first.id,
        issuedAt: first.createdAt,
        total,
        items: group.map((p) => ({
          itemTitle: p.item?.title ?? (p.sale?.title ? `${p.sale.title} — Purchase` : 'POS Purchase'),
          photoUrl: undefined,
          price: p.amount,
        })),
        purchase: first,
      };
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
