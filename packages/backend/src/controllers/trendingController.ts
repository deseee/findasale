import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getTrendingItems = async (req: Request, res: Response) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    // Get items with most favorites in last 7 days (as proxy for trending/views)
    const items = await prisma.item.findMany({
      where: {
        status: 'AVAILABLE',
        sale: { status: 'PUBLISHED' },
      },
      include: {
        sale: { select: { id: true, title: true, city: true, state: true } },
        _count: { select: { favorites: true } },
      },
      orderBy: { favorites: { _count: 'desc' } },
      take: 12,
    });

    res.json({ items });
  } catch (error) {
    console.error('getTrendingItems error:', error);
    res.status(500).json({ error: 'Failed to fetch trending items' });
  }
};

export const getTrendingSales = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const sales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        endDate: { gte: now },
      },
      include: {
        organizer: { select: { user: { select: { name: true } } } },
        _count: { select: { items: true, rsvps: true } },
        // follower count fetched per-sale below via prisma.follow.count
      },
      orderBy: { rsvps: { _count: 'desc' } },
      take: 8,
    });

    // Transform response to include follower count via relationship
    const salesWithFollowers = await Promise.all(
      sales.map(async (sale) => {
        const followerCount = await prisma.follow.count({
          where: { organizerId: sale.organizerId },
        });
        return {
          ...sale,
          _count: {
            ...sale._count,
            followers: followerCount,
          },
          organizer: {
            name: sale.organizer.user.name,
          },
        };
      })
    );

    res.json({ sales: salesWithFollowers });
  } catch (error) {
    console.error('getTrendingSales error:', error);
    res.status(500).json({ error: 'Failed to fetch trending sales' });
  }
};
