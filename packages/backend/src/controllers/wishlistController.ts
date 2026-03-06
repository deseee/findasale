import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

// GET /api/wishlists — get all wishlists for authenticated user
export const getMyWishlists = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const wishlists = await prisma.wishlist.findMany({
      where: { userId: req.user.id },
      include: {
        items: {
          include: {
            item: {
              include: {
                sale: {
                  select: { id: true, title: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(wishlists);
  } catch (error) {
    console.error('Error fetching wishlists:', error);
    res.status(500).json({ message: 'Failed to fetch wishlists' });
  }
};

// POST /api/wishlists — create a new wishlist
export const createWishlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, occasion, isPublic } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Wishlist name is required' });
    }

    const wishlist = await prisma.wishlist.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        occasion: occasion || null,
        isPublic: isPublic === true,
      },
    });

    res.status(201).json(wishlist);
  } catch (error) {
    console.error('Error creating wishlist:', error);
    res.status(500).json({ message: 'Failed to create wishlist' });
  }
};

// POST /api/wishlists/items — add item to wishlist
export const addToWishlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { wishlistId, itemId, note } = req.body;

    if (!wishlistId || !itemId) {
      return res.status(400).json({ message: 'wishlistId and itemId are required' });
    }

    // Verify wishlist belongs to the user
    const wishlist = await prisma.wishlist.findUnique({
      where: { id: wishlistId },
    });

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    if (wishlist.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if item already in wishlist
    const existing = await prisma.wishlistItem.findUnique({
      where: {
        wishlistId_itemId: { wishlistId, itemId },
      },
    });

    if (existing) {
      return res.status(409).json({ message: 'Item already in this wishlist' });
    }

    const wishlistItem = await prisma.wishlistItem.create({
      data: {
        wishlistId,
        itemId,
        note: note || null,
      },
      include: {
        item: {
          include: {
            sale: {
              select: { id: true, title: true },
            },
          },
        },
      },
    });

    res.status(201).json(wishlistItem);
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ message: 'Failed to add item to wishlist' });
  }
};

// DELETE /api/wishlists/items/:wishlistItemId — remove item from wishlist
export const removeFromWishlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { wishlistItemId } = req.params;

    // Get the wishlist item and verify ownership
    const wishlistItem = await prisma.wishlistItem.findUnique({
      where: { id: wishlistItemId },
      include: { wishlist: true },
    });

    if (!wishlistItem) {
      return res.status(404).json({ message: 'Wishlist item not found' });
    }

    if (wishlistItem.wishlist.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await prisma.wishlistItem.delete({
      where: { id: wishlistItemId },
    });

    res.json({ message: 'Item removed from wishlist' });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ message: 'Failed to remove item from wishlist' });
  }
};

// GET /api/wishlists/public/:slug — get public wishlist by share slug
export const getPublicWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;

    const wishlist = await prisma.wishlist.findUnique({
      where: { shareSlug: slug },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        items: {
          include: {
            item: {
              include: {
                sale: {
                  select: { id: true, title: true },
                },
              },
            },
          },
          orderBy: { addedAt: 'desc' },
        },
      },
    });

    if (!wishlist || !wishlist.isPublic) {
      return res.status(404).json({ message: 'Wishlist not found or is private' });
    }

    res.json(wishlist);
  } catch (error) {
    console.error('Error fetching public wishlist:', error);
    res.status(500).json({ message: 'Failed to fetch wishlist' });
  }
};

// POST /api/wishlists/:id/share — generate or get share link
export const generateShareLink = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: wishlistId } = req.params;

    const wishlist = await prisma.wishlist.findUnique({
      where: { id: wishlistId },
    });

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    if (wishlist.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // If already has a share slug, return it
    if (wishlist.shareSlug) {
      const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wishlists/share/${wishlist.shareSlug}`;
      return res.json({
        shareSlug: wishlist.shareSlug,
        shareUrl,
      });
    }

    // Generate new unique slug
    let shareSlug: string = '';
    let isUnique = false;
    while (!isUnique) {
      shareSlug = uuidv4().split('-')[0]; // Use first part of UUID for short slug
      const existing = await prisma.wishlist.findUnique({
        where: { shareSlug },
      });
      if (!existing) {
        isUnique = true;
      }
    }

    const updated = await prisma.wishlist.update({
      where: { id: wishlistId },
      data: { shareSlug, isPublic: true },
    });

    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wishlists/share/${updated.shareSlug}`;

    res.json({
      shareSlug: updated.shareSlug,
      shareUrl,
    });
  } catch (error) {
    console.error('Error generating share link:', error);
    res.status(500).json({ message: 'Failed to generate share link' });
  }
};

// PATCH /api/wishlists/:id/visibility — toggle wishlist public/private
export const toggleWishlistPublic = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: wishlistId } = req.params;
    const { isPublic } = req.body;

    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({ message: 'isPublic must be a boolean' });
    }

    const wishlist = await prisma.wishlist.findUnique({
      where: { id: wishlistId },
    });

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    if (wishlist.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // If making public and no share slug, generate one
    let updatedData: any = { isPublic };
    if (isPublic && !wishlist.shareSlug) {
      let shareSlug: string = '';
      let isUnique = false;
      while (!isUnique) {
        shareSlug = uuidv4().split('-')[0];
        const existing = await prisma.wishlist.findUnique({
          where: { shareSlug },
        });
        if (!existing) {
          isUnique = true;
        }
      }
      updatedData.shareSlug = shareSlug;
    }

    const updated = await prisma.wishlist.update({
      where: { id: wishlistId },
      data: updatedData,
    });

    const shareUrl = updated.shareSlug ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wishlists/share/${updated.shareSlug}` : null;

    res.json({
      id: updated.id,
      isPublic: updated.isPublic,
      shareSlug: updated.shareSlug,
      shareUrl,
    });
  } catch (error) {
    console.error('Error toggling wishlist visibility:', error);
    res.status(500).json({ message: 'Failed to toggle wishlist visibility' });
  }
};