import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

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

      res.json({ message: 'Item added to favorites', isFavorited: true });
    }
  } catch (error) {
    console.error('Favorite toggle error:', error);
    res.status(500).json({ message: 'Server error while toggling favorite' });
  }
};

// GET /api/favorites?category=X — list all favorited items AND sales for the logged-in user
// Optional ?category=furniture (any Item.category value). Returns items + sales with relevant info.
export const getUserFavorites = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { category } = req.query as { category?: string };

    // Fetch item-level favorites
    const itemFavorites = await prisma.favorite.findMany({
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

    // Fetch sale-level favorites (Bug #201: these were missing from the response)
    const saleFavorites = await prisma.favorite.findMany({
      where: {
        userId: req.user.id,
        saleId: { not: null },
        itemId: null, // sale-only favorites (not item favorites that have a sale via item)
      },
      include: {
        sale: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            status: true,
            city: true,
            state: true,
            photoUrls: true,
            saleType: true,
            organizer: { select: { id: true, businessName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Pull distinct categories from all user item favorites (for tab building)
    const allFavs = await prisma.favorite.findMany({
      where: { userId: req.user.id, itemId: { not: null } },
      select: { item: { select: { category: true } } },
    });
    const categories = [...new Set(
      allFavs.map(f => f.item?.category).filter(Boolean) as string[]
    )].sort();

    res.json({
      favorites: itemFavorites.map(f => f.item).filter(Boolean),
      saleFavorites: saleFavorites.map(f => f.sale).filter(Boolean),
      categories,
      total: itemFavorites.length,
      saleTotal: saleFavorites.length,
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

export const toggleSaleFavorite = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: saleId } = req.params;

    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_saleId: {
          userId: req.user.id,
          saleId: saleId,
        },
      },
    });

    if (existingFavorite) {
      await prisma.favorite.deleteMany({
        where: {
          userId: req.user.id,
          saleId: saleId,
        },
      });
      res.json({ message: 'Sale removed from favorites', isFavorited: false });
    } else {
      await prisma.favorite.create({
        data: {
          userId: req.user.id,
          saleId: saleId,
        },
      });
      res.json({ message: 'Sale added to favorites', isFavorited: true });
    }
  } catch (error) {
    console.error('Sale favorite toggle error:', error);
    res.status(500).json({ message: 'Server error while toggling sale favorite' });
  }
};

export const getSaleFavoriteStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: saleId } = req.params;

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_saleId: {
          userId: req.user.id,
          saleId: saleId,
        },
      },
    });

    res.json({ isFavorited: !!favorite });
  } catch (error) {
    console.error('Sale favorite status error:', error);
    res.status(500).json({ message: 'Server error while fetching sale favorite status' });
  }
};
