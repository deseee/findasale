import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * GET /api/bids
 * Returns all bids placed by the authenticated user.
 * Computes status (active/winning/outbid/closed) dynamically from item auction state.
 * Supports optional ?status= filter matching the frontend tab values.
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { status } = req.query;

    // Fetch all bids for this user, newest first, with item + sale info
    const bids = await prisma.bid.findMany({
      where: { userId: req.user.id },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            photoUrls: true,
            currentBid: true,
            auctionEndTime: true,
            sale: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Compute status for each bid based on current auction state
    const now = new Date();
    const bidsWithStatus = bids.map((bid) => {
      const item = bid.item;
      let computedStatus: 'active' | 'winning' | 'outbid' | 'closed';

      if (item.auctionEndTime && item.auctionEndTime < now) {
        computedStatus = 'closed';
      } else if (item.currentBid !== null && item.currentBid === bid.amount) {
        computedStatus = 'winning';
      } else if (item.currentBid !== null && item.currentBid > bid.amount) {
        computedStatus = 'outbid';
      } else {
        computedStatus = 'active';
      }

      return {
        id: bid.id,
        itemId: bid.itemId,
        amount: bid.amount,
        status: computedStatus,
        createdAt: bid.createdAt.toISOString(),
        item: {
          id: item.id,
          title: item.title,
          photoUrls: item.photoUrls,
        },
        sale: {
          id: item.sale.id,
          title: item.sale.title,
        },
      };
    });

    // Filter by status tab if provided
    const filtered =
      status && status !== 'all'
        ? bidsWithStatus.filter((b) => b.status === status)
        : bidsWithStatus;

    res.json({ bids: filtered });
  } catch (error) {
    console.error('[bids] GET / error:', error);
    res.status(500).json({ message: 'Failed to fetch bids' });
  }
});

export default router;
