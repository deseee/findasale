import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getClearanceItems = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(48, Math.max(1, parseInt((req.query.limit as string) || '24', 10)));
    const skip = (page - 1) * limit;

    const city = (req.query.city as string) || undefined;
    const category = (req.query.category as string) || undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;

    const where: Record<string, unknown> = {
      status: 'AVAILABLE',
      isActive: true,
      deletedAt: null,
      sale: {
        status: 'ENDED',
        deletedAt: null,
        ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
      },
      ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
      ...(maxPrice !== undefined ? { price: { lte: maxPrice } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { price: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          condition: true,
          category: true,
          photoUrls: true,
          saleId: true,
          sale: {
            select: {
              id: true,
              city: true,
              state: true,
              endDate: true,
            },
          },
        },
      }),
      prisma.item.count({ where }),
    ]);

    const enriched = items.map((item) => ({
      id: item.id,
      name: item.title,
      description: item.description,
      price: item.price,
      condition: item.condition,
      category: item.category,
      primaryPhoto: item.photoUrls[0] ?? null,
      saleId: item.saleId,
      sale: item.sale
        ? {
            city: item.sale.city,
            state: item.sale.state,
            endDate: item.sale.endDate,
          }
        : null,
    }));

    return res.json({
      items: enriched,
      total,
      page,
    });
  } catch (error) {
    console.error('[clearance] getClearanceItems error:', error);
    return res.status(500).json({ message: 'Failed to fetch clearance items' });
  }
};
