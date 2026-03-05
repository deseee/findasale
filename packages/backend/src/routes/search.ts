import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * GET /api/search?q=&type=all|sales|items&page=&limit=
 * Phase 29: Full-text search across published sales and available items.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    const type = (req.query.type as string) || 'all';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!q || q.length < 2) {
      return res.status(400).json({ message: 'q must be at least 2 characters' });
    }

    const textWhere = {
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [salesResult, itemsResult] = await Promise.all([
      type !== 'items'
        ? prisma.sale.findMany({
            where: { ...textWhere, status: 'PUBLISHED' },
            select: {
              id: true,
              title: true,
              description: true,
              city: true,
              state: true,
              startDate: true,
              endDate: true,
              photoUrls: true,
              isAuctionSale: true,
              organizer: { select: { id: true, businessName: true, reputationTier: true } },
            },
            take: limit,
            skip: type === 'sales' ? skip : 0,
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
      type !== 'sales'
        ? prisma.item.findMany({
            where: {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
              status: 'AVAILABLE',
              sale: { status: 'PUBLISHED' },
            },
            select: {
              id: true,
              title: true,
              description: true,
              price: true,
              photoUrls: true,
              category: true,
              condition: true,
              status: true,
              sale: {
                select: {
                  id: true,
                  title: true,
                  city: true,
                  state: true,
                  status: true,
                },
              },
            },
            take: limit,
            skip: type === 'items' ? skip : 0,
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    res.json({
      query: q,
      sales: salesResult,
      items: itemsResult.map((item: any) => ({
        ...item,
        price: item.price != null ? Number(item.price) : null,
      })),
    });
  } catch (err) {
    console.error('GET /api/search error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/search/categories/:category?page=&limit=
 * Phase 29: Browse available items by category across all published sales.
 */
router.get('/categories/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = {
      category: { equals: category, mode: 'insensitive' as const },
      status: 'AVAILABLE',
      sale: { status: 'PUBLISHED' },
    };

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          photoUrls: true,
          category: true,
          condition: true,
          sale: {
            select: {
              id: true,
              title: true,
              city: true,
              state: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.item.count({ where }),
    ]);

    res.json({
      category,
      items: items.map((item: any) => ({
        ...item,
        price: item.price != null ? Number(item.price) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('GET /api/search/categories error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
