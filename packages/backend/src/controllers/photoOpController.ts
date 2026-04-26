/**
 * Feature #39: Photo Op Stations Controller
 *
 * Endpoints for managing branded photo spots ("selfie stations") at sales,
 * and user photo shares linked to those stations.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { awardXp, XP_AWARDS } from '../services/xpService';
import { haversineDistance } from '../lib/placesService';

// Validation schemas
const createStationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  lat: z.number(),
  lng: z.number(),
  frameImageUrl: z.string().url().optional().nullable(),
});

const updateStationSchema = createStationSchema.partial();

const submitShareSchema = z.object({
  photoUrl: z.string().url(),
  caption: z.string().max(300).optional().nullable(),
});

/**
 * POST /api/sales/:saleId/photo-ops
 * Create a photo op station for a sale (authenticated, PRO tier required)
 */
export const createStation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { saleId } = req.params;
    const parsed = createStationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation error',
        errors: parsed.error.errors,
      });
    }

    // Verify user owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    const station = await prisma.photoOpStation.create({
      data: {
        saleId,
        name: parsed.data.name,
        description: parsed.data.description,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        frameImageUrl: parsed.data.frameImageUrl,
      },
    });

    res.status(201).json(station);
  } catch (error) {
    console.error('[photoOp] createStation error:', error);
    res.status(500).json({ message: 'Server error while creating station' });
  }
};

/**
 * GET /api/sales/:saleId/photo-ops
 * List active photo op stations for a sale (public)
 */
export const listStations = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;

    const stations = await prisma.photoOpStation.findMany({
      where: { saleId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        lat: true,
        lng: true,
        frameImageUrl: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(stations);
  } catch (error) {
    console.error('[photoOp] listStations error:', error);
    res.status(500).json({ message: 'Server error while listing stations' });
  }
};

/**
 * PUT /api/photo-ops/:stationId
 * Update a photo op station (authenticated, ownership required)
 */
export const updateStation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { stationId } = req.params;
    const parsed = updateStationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation error',
        errors: parsed.error.errors,
      });
    }

    // Verify user owns the station's sale
    const station = await prisma.photoOpStation.findUnique({
      where: { id: stationId },
      select: { saleId: true },
    });

    if (!station) {
      return res.status(404).json({ message: 'Station not found' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: station.saleId },
      select: { organizerId: true },
    });

    if (!sale || sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'You cannot modify this station' });
    }

    const updated = await prisma.photoOpStation.update({
      where: { id: stationId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.lat !== undefined && { lat: parsed.data.lat }),
        ...(parsed.data.lng !== undefined && { lng: parsed.data.lng }),
        ...(parsed.data.frameImageUrl !== undefined && { frameImageUrl: parsed.data.frameImageUrl }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('[photoOp] updateStation error:', error);
    res.status(500).json({ message: 'Server error while updating station' });
  }
};

/**
 * DELETE /api/photo-ops/:stationId
 * Delete a photo op station (authenticated, ownership required)
 */
export const deleteStation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { stationId } = req.params;

    // Verify user owns the station's sale
    const station = await prisma.photoOpStation.findUnique({
      where: { id: stationId },
      select: { saleId: true },
    });

    if (!station) {
      return res.status(404).json({ message: 'Station not found' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: station.saleId },
      select: { organizerId: true },
    });

    if (!sale || sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'You cannot delete this station' });
    }

    await prisma.photoOpStation.delete({ where: { id: stationId } });

    res.json({ message: 'Station deleted' });
  } catch (error) {
    console.error('[photoOp] deleteStation error:', error);
    res.status(500).json({ message: 'Server error while deleting station' });
  }
};

/**
 * POST /api/photo-ops/:stationId/shares
 * Submit a photo share for a station (optional auth)
 */
export const submitShare = async (req: Request | AuthRequest, res: Response) => {
  try {
    const { stationId } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;

    const parsed = submitShareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation error',
        errors: parsed.error.errors,
      });
    }

    // Verify station exists
    const station = await prisma.photoOpStation.findUnique({
      where: { id: stationId },
    });

    if (!station) {
      return res.status(404).json({ message: 'Station not found' });
    }

    const share = await prisma.photoOpShare.create({
      data: {
        stationId,
        userId: userId || null,
        photoUrl: parsed.data.photoUrl,
        caption: parsed.data.caption,
      },
    });

    res.status(201).json(share);
  } catch (error) {
    console.error('[photoOp] submitShare error:', error);
    res.status(500).json({ message: 'Server error while submitting share' });
  }
};

/**
 * GET /api/photo-ops/:stationId/shares
 * List shares for a station (public)
 */
export const listShares = async (req: Request, res: Response) => {
  try {
    const { stationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Verify station exists
    const station = await prisma.photoOpStation.findUnique({
      where: { id: stationId },
    });

    if (!station) {
      return res.status(404).json({ message: 'Station not found' });
    }

    const [shares, total] = await Promise.all([
      prisma.photoOpShare.findMany({
        where: { stationId },
        select: {
          id: true,
          photoUrl: true,
          caption: true,
          likesCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.photoOpShare.count({ where: { stationId } }),
    ]);

    res.json({
      shares,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('[photoOp] listShares error:', error);
    res.status(500).json({ message: 'Server error while listing shares' });
  }
};

/**
 * POST /api/photo-ops/shares/:shareId/like
 * Like/unlike a photo share (public, atomic increment)
 */
export const likeShare = async (req: Request, res: Response) => {
  try {
    const { shareId } = req.params;
    const { isLike } = req.body; // true to like, false to unlike

    // Verify share exists
    const share = await prisma.photoOpShare.findUnique({
      where: { id: shareId },
    });

    if (!share) {
      return res.status(404).json({ message: 'Share not found' });
    }

    const updated = await prisma.photoOpShare.update({
      where: { id: shareId },
      data: {
        likesCount: isLike ? { increment: 1 } : { decrement: 1 },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('[photoOp] likeShare error:', error);
    res.status(500).json({ message: 'Server error while updating like' });
  }
};

/**
 * POST /api/sales/:saleId/photo-station-scan
 * Shopper scans photo station QR code and earns XP
 * One-time per sale per user (prevents repeated scans)
 * Auth: authenticated shopper only
 */
export const photoStationScan = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId } = req.params;
    const { lat, lng } = req.body; // Optional geolocation from frontend

    // Verify sale exists and fetch location for geofencing
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, lat: true, lng: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Geofence check: HARD requirement when sale has coordinates
    if (sale.lat !== null && sale.lng !== null) {
      // Sale has coordinates set — require client coords and enforce 100m radius
      if (lat === undefined || lng === undefined) {
        return res.status(403).json({ message: 'Location access is required to earn XP at this Photo Station.' });
      }
      const distance = haversineDistance(lat, lng, sale.lat, sale.lng);
      const MAX_DISTANCE = 100; // 100 meters
      if (distance > MAX_DISTANCE) {
        return res.status(403).json({ message: 'You must be at the sale to earn XP here.' });
      }
    }
    // Sale has no coordinates set — allow scan without coords (graceful fallback)

    // Check if user has already scanned this photo station
    const existingScan = await prisma.pointsTransaction.findFirst({
      where: {
        userId: req.user.id,
        saleId,
        type: 'PHOTO_STATION_SCAN',
      },
    });

    if (existingScan) {
      // Already scanned, return 200 with alreadyScanned flag
      return res.json({
        alreadyScanned: true,
        xpAwarded: 0,
        shareXp: XP_AWARDS.SHARE,
        message: "You've already scanned this photo station.",
      });
    }

    // Award 5 XP for photo station scan (PHOTO_STATION_SCAN: 5 XP per S500 game design decision)
    let xpAwarded = 0;
    try {
      const xpResult = await awardXp(req.user.id, 'PHOTO_STATION_SCAN', XP_AWARDS.PHOTO_STATION_SCAN, {
        saleId,
        description: `Photo station scan at sale: ${saleId}`,
      });
      if (xpResult) {
        xpAwarded = xpResult.xpAwarded;
      }
    } catch (err) {
      console.warn('[photoOp] Failed to award photo station scan XP:', err);
    }

    // Return XP awarded + shareXp for social share award
    res.status(200).json({
      alreadyScanned: false,
      xpAwarded,
      shareXp: XP_AWARDS.SHARE,
      message: `You earned ${xpAwarded} XP! Share to earn ${XP_AWARDS.SHARE} more.`,
    });
  } catch (error) {
    console.error('[photoOp] photoStationScan error:', error);
    res.status(500).json({ message: 'Server error while processing scan' });
  }
};

/**
 * POST /api/sales/:saleId/photo-ops/share-xp
 * Award XP for sharing a sale externally (idempotent)
 * One-time per sale per user, verified after native share completes
 * Auth: authenticated shopper only
 */
export const awardShareXp = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId } = req.params;

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Check if user has already earned SHARE XP for this sale (idempotency)
    const existingShare = await prisma.pointsTransaction.findFirst({
      where: {
        userId: req.user.id,
        saleId,
        type: 'SHARE',
      },
    });

    if (existingShare) {
      // Already earned, return idempotent 200 response
      return res.json({
        xpAwarded: 0,
        alreadyShared: true,
        message: 'You have already earned XP for sharing this sale.',
      });
    }

    // Award XP for share
    let xpAwarded = 0;
    try {
      const xpResult = await awardXp(req.user.id, 'SHARE', XP_AWARDS.SHARE, {
        saleId,
        description: `Social share of sale: ${saleId}`,
      });
      if (xpResult) {
        xpAwarded = xpResult.xpAwarded;
      }
    } catch (err) {
      console.warn('[photoOp] Failed to award share XP:', err);
      // Don't fail the request — return what we tried
    }

    // Return success with awarded amount
    res.status(200).json({
      xpAwarded,
      alreadyShared: false,
      message: `You earned ${xpAwarded} XP for sharing!`,
    });
  } catch (error) {
    console.error('[photoOp] awardShareXp error:', error);
    res.status(500).json({ message: 'Server error while awarding share XP' });
  }
};
