import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { awardPoints } from '../services/pointsService';

export const toggleItemFavorite = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: itemId } = req.params;

    // Check if favorite already exists
    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_itemId: {
          userId: req.user.id,
          itemId: itemId,
        },
      },
    });

    if (existingFavorite) {
      // Remove from favorites
      await prisma.favorite.deleteMany({
        where: {
          userId: req.user.id,
          itemId: itemId,
        },
      });
      res.json({ message: 'Item removed from favorites', isFavorited: false });
    } else {
      // Add to favorites
      const favorite = await prisma.favorite.create({
        data: {
          userId: req.user.id,
          itemId: itemId,
        },
      });

      // Phase 19: Award 2 points for favoriting an item
      awardPoints(req.user.id, 'FAVORITE', 2, undefined, itemId, 'Favorited an item')
        .catch(err => console.warn('[points] Failed to award favorite points:', err));

      res.json({ message: 'Item added to favorites', isFavorited: true });
    }
  } catch (error) {
    console.error('Favorite toggle error:', error);
    res.status(500).json({ message: 'Server error while toggling favorite' });
  }
};

// GET /api/favorites?category=X — list all favorited items for the logged-in user
// Optional ?category=furniture (any Item.category value). Returns items with sale info.
export const getUserFavorites = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { category } = req.query as { category?: string };

    const favorites = await prisma.favorite.findMany({
      where: {
        userId: req.user.id,
        itemId: { not: null },
        ...(category ? { item: { is: { category } } } : {}),
      },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            category: true,
            condition: true,
            photoUrls: true,
            sale: {
              select: {
                id: true,
                title: true,
                startDate: true,
                endDate: true,
                status: true,
                organizer: { select: { id: true, businessName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Pull distinct categories from all user favorites (for tab building)
    const allFavs = await prisma.favorite.findMany({
      where: { userId: req.user.id, itemId: { not: null } },
      select: { item: { select: { category: true } } },
    });
    const categories = [...new Set(
      allFavs.map(f => f.item?.category).filter(Boolean) as string[]
    )].sort();

    res.json({
      favorites: favorites.map(f => f.item).filter(Boolean),
      categories,
      total: favorites.length,
    });
  } catch (error) {
    console.error('Get user favorites error:', error);
    res.status(500).json({ message: 'Server error while fetching favorites' });
  }
};

export const getItemFavoriteStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: itemId } = req.params;

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_itemId: {
          userId: req.user.id,
          itemId: itemId,
        },
      },
    });

    res.json({ isFavorited: !!favorite });
  } catch (error) {
    console.error('Favorite status error:', error);
    res.status(500).json({ message: 'Server error while fetching favorite status' });
  }
};
