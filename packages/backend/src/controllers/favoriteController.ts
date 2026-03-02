import { Request, Response } from 'express';
import { prisma } from '../index';

interface AuthRequest extends Request {
  user?: any;
}

export const toggleItemFavorite = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: itemId } = req.params;
    const { isFavorite } = req.body;

    if (isFavorite) {
      // Add to favorites
      const favorite = await prisma.favorite.create({
        data: {
          userId: req.user.id,
          itemId: itemId,
        },
      });
      res.json({ message: 'Item added to favorites', favorite });
    } else {
      // Remove from favorites
      await prisma.favorite.deleteMany({
        where: {
          userId: req.user.id,
          itemId: itemId,
        },
      });
      res.json({ message: 'Item removed from favorites' });
    }
  } catch (error) {
    console.error('Favorite toggle error:', error);
    res.status(500).json({ message: 'Server error while toggling favorite' });
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

    res.json({ isFavorite: !!favorite });
  } catch (error) {
    console.error('Favorite status error:', error);
    res.status(500).json({ message: 'Server error while fetching favorite status' });
  }
};
