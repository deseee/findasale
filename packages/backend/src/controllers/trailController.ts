import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { randomBytes } from 'crypto';

/**
 * POST /api/trails
 * Create a new treasure trail
 */
export const createTrail = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, description, stops } = req.body;

    // Validate inputs
    if (!name || !stops || !Array.isArray(stops)) {
      return res.status(400).json({ message: 'Missing required fields: name, stops' });
    }

    // Generate share token (8-char alphanumeric)
    const shareToken = randomBytes(6).toString('hex').slice(0, 8);

    // Create trail
    const trail = await prisma.treasureTrail.create({
      data: {
        userId: req.user.id,
        name,
        description: description || null,
        stops: JSON.stringify(stops),
        shareToken,
      },
    });

    res.status(201).json({
      trailId: trail.id,
      shareToken: trail.shareToken,
    });
  } catch (error) {
    console.error('[Trail] Error creating trail:', error);
    res.status(500).json({ message: 'Failed to create trail' });
  }
};

/**
 * GET /api/trails
 * Get authenticated user's trails (paginated)
 */
export const getMyTrails = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [trails, total] = await Promise.all([
      prisma.treasureTrail.findMany({
        where: { userId: req.user.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          highlights: true,
        },
      }),
      prisma.treasureTrail.count({
        where: { userId: req.user.id },
      }),
    ]);

    res.json({
      trails: trails.map((trail) => ({
        ...trail,
        stops: JSON.parse(trail.stops as any),
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('[Trail] Error fetching trails:', error);
    res.status(500).json({ message: 'Failed to fetch trails' });
  }
};

/**
 * GET /api/trails/public/:shareToken
 * Get public trail view (no auth required)
 */
export const getPublicTrail = async (req: AuthRequest, res: Response) => {
  try {
    const { shareToken } = req.params;

    const trail = await prisma.treasureTrail.findUnique({
      where: { shareToken },
      include: {
        user: {
          select: { id: true, name: true },
        },
        highlights: {
          include: { item: true },
        },
      },
    });

    if (!trail) {
      return res.status(404).json({ message: 'Trail not found' });
    }

    if (!trail.isPublic) {
      return res.status(403).json({ message: 'Trail is not public' });
    }

    res.json({
      ...trail,
      stops: JSON.parse(trail.stops as any),
    });
  } catch (error) {
    console.error('[Trail] Error fetching public trail:', error);
    res.status(500).json({ message: 'Failed to fetch trail' });
  }
};

/**
 * PUT /api/trails/:trailId
 * Update trail (auth + ownership required)
 */
export const updateTrail = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { trailId } = req.params;
    const { name, description, stops, isPublic } = req.body;

    // Verify ownership
    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
    });

    if (!trail) {
      return res.status(404).json({ message: 'Trail not found' });
    }

    if (trail.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Update trail
    const updated = await prisma.treasureTrail.update({
      where: { id: trailId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(stops && { stops: JSON.stringify(stops) }),
        ...(isPublic !== undefined && { isPublic }),
      },
      include: {
        highlights: true,
      },
    });

    res.json({
      ...updated,
      stops: JSON.parse(updated.stops as any),
    });
  } catch (error) {
    console.error('[Trail] Error updating trail:', error);
    res.status(500).json({ message: 'Failed to update trail' });
  }
};

/**
 * DELETE /api/trails/:trailId
 * Delete trail (auth + ownership required)
 */
export const deleteTrail = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { trailId } = req.params;

    // Verify ownership
    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
    });

    if (!trail) {
      return res.status(404).json({ message: 'Trail not found' });
    }

    if (trail.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Delete trail (cascades delete highlights)
    await prisma.treasureTrail.delete({
      where: { id: trailId },
    });

    res.json({ deleted: true });
  } catch (error) {
    console.error('[Trail] Error deleting trail:', error);
    res.status(500).json({ message: 'Failed to delete trail' });
  }
};

/**
 * POST /api/trails/:trailId/complete
 * Mark trail as completed
 */
export const completeTrail = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { trailId } = req.params;

    // Verify ownership
    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
    });

    if (!trail) {
      return res.status(404).json({ message: 'Trail not found' });
    }

    if (trail.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Mark as completed
    const updated = await prisma.treasureTrail.update({
      where: { id: trailId },
      data: {
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    res.json({
      ...updated,
      stops: JSON.parse(updated.stops as any),
    });
  } catch (error) {
    console.error('[Trail] Error completing trail:', error);
    res.status(500).json({ message: 'Failed to complete trail' });
  }
};
