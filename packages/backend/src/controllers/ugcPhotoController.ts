import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// Types for request bodies
interface SubmitPhotoRequest {
  photoUrl: string;
  caption?: string;
  tags?: string[];
  itemId?: number;
  saleId?: number;
}

interface ModeratePhotoRequest {
  status: 'APPROVED' | 'REJECTED';
}

/**
 * Submit a new UGC photo (creates with PENDING status)
 */
export const submitPhoto = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { photoUrl, caption, tags, itemId, saleId } = req.body as SubmitPhotoRequest;

    // Validate required fields
    if (!photoUrl) {
      return res.status(400).json({ error: 'photoUrl is required' });
    }

    // Validate itemId or saleId provided
    if (!itemId && !saleId) {
      return res.status(400).json({ error: 'itemId or saleId is required' });
    }

    const photo = await prisma.uGCPhoto.create({
      data: {
        userId: (req as any).user.id,
        photoUrl,
        caption: caption || null,
        tags: tags || [],
        itemId: itemId ? String(itemId) : null,
        saleId: saleId ? String(saleId) : null,
        status: 'PENDING',
        likesCount: 0,
      },
    });

    res.status(201).json(photo);
  } catch (error) {
    console.error('Error submitting photo:', error);
    res.status(500).json({ error: 'Failed to submit photo' });
  }
};

/**
 * Get approved photos for a sale (public endpoint)
 */
export const getApprovedPhotosForSale = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;

    const photos = await prisma.uGCPhoto.findMany({
      where: {
        saleId,
        status: 'APPROVED',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(photos);
  } catch (error) {
    console.error('Error fetching photos for sale:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
};

/**
 * Get approved photos for an item (public endpoint)
 */
export const getApprovedPhotosForItem = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;

    const photos = await prisma.uGCPhoto.findMany({
      where: {
        itemId,
        status: 'APPROVED',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(photos);
  } catch (error) {
    console.error('Error fetching photos for item:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
};

/**
 * Get authenticated user's submitted photos (all statuses)
 */
export const getMyPhotos = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const photos = await prisma.uGCPhoto.findMany({
      where: {
        userId: (req as any).user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(photos);
  } catch (error) {
    console.error('Error fetching user photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
};

/**
 * Like a photo (creates UGCPhotoLike and increments likesCount)
 */
export const likePhoto = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { photoId } = req.params;
    const photoIdNum = parseInt(photoId);

    // Use transaction to create like and increment count
    const [like] = await prisma.$transaction([
      prisma.uGCPhotoLike.upsert({
        where: {
          userId_photoId: {
            userId: (req as any).user.id,
            photoId: photoIdNum,
          },
        },
        create: {
          userId: (req as any).user.id,
          photoId: photoIdNum,
        },
        update: {}, // No-op if already exists
      }),
      prisma.uGCPhoto.update({
        where: { id: photoIdNum },
        data: {
          likesCount: {
            increment: 1,
          },
        },
      }),
    ]);

    res.json({ success: true, liked: true });
  } catch (error) {
    console.error('Error liking photo:', error);
    res.status(500).json({ error: 'Failed to like photo' });
  }
};

/**
 * Unlike a photo (deletes UGCPhotoLike and decrements likesCount)
 */
export const unlikePhoto = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { photoId } = req.params;
    const photoIdNum = parseInt(photoId);

    // Use transaction to delete like and decrement count
    await prisma.$transaction([
      prisma.uGCPhotoLike.delete({
        where: {
          userId_photoId: {
            userId: (req as any).user.id,
            photoId: photoIdNum,
          },
        },
      }),
      prisma.uGCPhoto.update({
        where: { id: photoIdNum },
        data: {
          likesCount: {
            decrement: 1,
          },
        },
      }),
    ]);

    res.json({ success: true, liked: false });
  } catch (error) {
    console.error('Error unliking photo:', error);
    res.status(500).json({ error: 'Failed to unlike photo' });
  }
};

/**
 * Moderate a photo (approve or reject) - organizer only
 */
export const moderatePhoto = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id || !(req as any).user?.organizerProfile?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { photoId } = req.params;
    const { status } = req.body as ModeratePhotoRequest;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const photoIdNum = parseInt(photoId);

    // Get photo and check if organizer owns the sale
    const photo = await prisma.uGCPhoto.findUnique({
      where: { id: photoIdNum },
      include: {
        sale: {
          select: { organizerId: true },
        },
        item: {
          select: {
            sale: {
              select: { organizerId: true },
            },
          },
        },
      },
    });

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Verify organizer ownership
    const ownedSaleId = photo.sale?.organizerId || photo.item?.sale?.organizerId;
    if (ownedSaleId !== (req as any).user.organizerProfile.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await prisma.uGCPhoto.update({
      where: { id: photoIdNum },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedBy: (req as any).user.id,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error moderating photo:', error);
    res.status(500).json({ error: 'Failed to moderate photo' });
  }
};

/**
 * Get pending photos for organizer's sales
 */
export const getPendingPhotosForOrganizer = async (req: AuthRequest, res: Response) => {
  try {
    if (!(req as any).user?.id || !(req as any).user?.organizerProfile?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all pending photos linked to organizer's sales
    const photos = await prisma.uGCPhoto.findMany({
      where: {
        status: 'PENDING',
        OR: [
          {
            sale: {
              organizerId: (req as any).user.organizerProfile.id,
            },
          },
          {
            item: {
              sale: {
                organizerId: (req as any).user.organizerProfile.id,
              },
            },
          },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        sale: {
          select: {
            id: true,
            title: true,
          },
        },
        item: {
          select: {
            id: true,
            title: true,
            sale: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(photos);
  } catch (error) {
    console.error('Error fetching pending photos:', error);
    res.status(500).json({ error: 'Failed to fetch pending photos' });
  }
};
