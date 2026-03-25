import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * GET /api/haul-posts — public trending feed
 * Paginated list of approved haul posts sorted by likes then recency
 */
export const listHaulPosts = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const skip = (page - 1) * limit;

    const hauls = await prisma.uGCPhoto.findMany({
      where: { isHaulPost: true, status: 'APPROVED' },
      orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true } },
        sale: { select: { id: true, title: true } },
      },
    });

    res.json(hauls);
  } catch (error) {
    console.error('Error listing haul posts:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/haul-posts — create haul post (auth required)
 * Authenticated user creates a new haul post
 */
export const createHaulPost = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { photoUrl, caption, saleId, linkedItemIds } = req.body;
    if (!photoUrl) {
      return res.status(400).json({ message: 'Photo URL is required' });
    }

    const haul = await prisma.uGCPhoto.create({
      data: {
        userId: (req as any).user.id,
        photoUrl,
        caption: caption?.trim() || null,
        saleId: saleId || null,
        linkedItemIds: linkedItemIds || [],
        isHaulPost: true,
        status: 'APPROVED',
        likesCount: 0,
      },
    });

    res.status(201).json(haul);
  } catch (error) {
    console.error('Error creating haul post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/sales/:saleId/haul-posts — hauls for a specific sale
 * Public endpoint to fetch approved haul posts linked to a sale
 */
export const getSaleHaulPosts = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;
    const hauls = await prisma.uGCPhoto.findMany({
      where: { saleId, isHaulPost: true, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    });
    res.json(hauls);
  } catch (error) {
    console.error('Error fetching sale haul posts:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/ugc-photos/:photoId/reactions — add reaction (auth required)
 * Create a reaction (like) on a UGC photo using new UGCPhotoReaction model
 */
export const addReaction = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const photoId = parseInt(req.params.photoId);
    if (isNaN(photoId)) {
      return res.status(400).json({ message: 'Invalid photo ID' });
    }

    // Check if reaction already exists
    const existing = await prisma.uGCPhotoReaction.findUnique({
      where: { userId_photoId_type: { userId: (req as any).user.id, photoId, type: 'LIKE' } },
    });

    if (existing) {
      return res.status(400).json({ message: 'Already reacted' });
    }

    // Create reaction and increment likesCount in transaction
    await prisma.$transaction([
      prisma.uGCPhotoReaction.create({
        data: { userId: (req as any).user.id, photoId, type: 'LIKE' },
      }),
      prisma.uGCPhoto.update({
        where: { id: photoId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);

    res.status(201).json({ message: 'Reaction added' });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * DELETE /api/ugc-photos/:photoId/reactions — remove reaction (auth required)
 * Remove a reaction (like) from a UGC photo
 */
export const removeReaction = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const photoId = parseInt(req.params.photoId);
    if (isNaN(photoId)) {
      return res.status(400).json({ message: 'Invalid photo ID' });
    }

    // Check if reaction exists
    const reaction = await prisma.uGCPhotoReaction.findUnique({
      where: { userId_photoId_type: { userId: (req as any).user.id, photoId, type: 'LIKE' } },
    });

    if (!reaction) {
      return res.status(404).json({ message: 'Reaction not found' });
    }

    // Delete reaction and decrement likesCount in transaction
    await prisma.$transaction([
      prisma.uGCPhotoReaction.delete({
        where: { userId_photoId_type: { userId: (req as any).user.id, photoId, type: 'LIKE' } },
      }),
      prisma.uGCPhoto.update({
        where: { id: photoId },
        data: { likesCount: { decrement: 1 } },
      }),
    ]);

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
