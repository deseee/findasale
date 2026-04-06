// Treasure Trails controller — Explorer's Guild gamification
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { searchNearbyPlaces, haversineDistance, completionBonus } from '../lib/placesService';

/**
 * POST /api/trails
 * Organizer creates a new Treasure Trail anchored to a sale
 */
export const createTrail = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, name, description, type, minStopsRequired, maxStops, windowDays } = req.body;
    const userId = req.user.id;

    if (!saleId || !name?.trim()) {
      return res.status(400).json({ message: 'saleId and name are required.' });
    }

    // Verify user is an organizer and owns this sale
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      select: { id: true, sales: { where: { id: saleId }, select: { id: true } } },
    });
    if (!organizer?.sales.length) {
      return res.status(403).json({ message: 'Not your sale or not an organizer.' });
    }

    const trail = await prisma.treasureTrail.create({
      data: {
        organizerId: organizer.id,
        userId, // legacy field
        saleId,
        name: name.trim(),
        description: description?.trim(),
        type: type || 'DISCOVERY',
        minStopsRequired: minStopsRequired || 3,
        maxStops: maxStops || 7,
        windowDays: windowDays || 7,
        isActive: true,
        isPublic: false,
      },
      include: { stops: true },
    });

    return res.status(201).json(trail);
  } catch (error) {
    console.error('createTrail error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/trails/:trailId
 * Get trail details + user's check-in progress (if logged in)
 */
export const getTrail = async (req: AuthRequest | Request, res: Response) => {
  try {
    const { trailId } = req.params;
    const userId = (req as AuthRequest).user?.id;

    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
      include: {
        organizer: { select: { id: true, businessName: true } },
        stops: { orderBy: { order: 'asc' } },
        completions: { where: { userId }, select: { completionBonusXp: true, totalXpEarned: true } },
      },
    });

    if (!trail) return res.status(404).json({ message: 'Trail not found.' });

    // Non-public trails visible to organizer only
    if (!trail.isPublic && userId !== trail.organizer?.id) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    // Get user's check-in progress if logged in
    let userProgress = {};
    if (userId) {
      const checkIns = await prisma.trailCheckIn.findMany({
        where: { trailId, userId },
        select: { stopId: true, baseXpAwarded: true, photoXpAwarded: true },
      });
      userProgress = checkIns.reduce(
        (acc, ci) => ({
          ...acc,
          [ci.stopId]: { baseXp: ci.baseXpAwarded, photoXp: ci.photoXpAwarded },
        }),
        {}
      );
    }

    return res.json({ ...trail, userProgress });
  } catch (error) {
    console.error('getTrail error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/trails
 * List public trails (with optional proximity filtering)
 */
export const listTrails = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, radiusKm = 10, sort = 'featured' } = req.query;

    const trails = await prisma.treasureTrail.findMany({
      where: {
        isPublic: true,
        isActive: true,
      },
      include: {
        organizer: { select: { businessName: true } },
        stops: { select: { id: true } },
        _count: { select: { completions: true } },
      },
      orderBy:
        sort === 'featured'
          ? [{ isFeatured: 'desc' }, { completionCount: 'desc' }]
          : { createdAt: 'desc' },
      take: 50,
    });

    return res.json({ trails });
  } catch (error) {
    console.error('listTrails error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/trails/:trailId/stops
 * Organizer adds a stop to a trail
 */
export const addStop = async (req: AuthRequest, res: Response) => {
  try {
    const { trailId } = req.params;
    const { stopType, stopName, address, latitude, longitude, googlePlaceId, baseXp, organizer_note } = req.body;

    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
      select: { organizerId: true, stops: { select: { order: true } } },
    });

    if (!trail) return res.status(404).json({ message: 'Trail not found.' });

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (trail.organizerId !== organizer?.id) {
      return res.status(403).json({ message: 'Not your trail.' });
    }

    const nextOrder = Math.max(...trail.stops.map((s) => s.order), -1) + 1;

    const stop = await prisma.trailStop.create({
      data: {
        trailId,
        stopType,
        stopName,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        googlePlaceId,
        baseXp: baseXp || 3,
        order: nextOrder,
        organizer_note,
      },
    });

    return res.status(201).json(stop);
  } catch (error) {
    console.error('addStop error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/trails/:trailId/search-nearby
 * Search nearby places to add as stops
 */
export const searchNearby = async (req: AuthRequest, res: Response) => {
  try {
    const { trailId } = req.params;
    const { latitude, longitude, radius = 500, type } = req.query;

    // Verify organizer owns this trail
    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
      select: { organizerId: true },
    });
    if (!trail) return res.status(404).json({ message: 'Trail not found.' });

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (trail.organizerId !== organizer?.id) {
      return res.status(403).json({ message: 'Not your trail.' });
    }

    const places = await searchNearbyPlaces({
      latitude: parseFloat(latitude as string),
      longitude: parseFloat(longitude as string),
      radiusMeters: parseInt(radius as string),
      type: type as string,
    });

    return res.json({ places });
  } catch (error) {
    console.error('searchNearby error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/trails/:trailId/stops/:stopId/checkin
 * Shopper checks in at a trail stop
 */
export const checkInAtStop = async (req: AuthRequest, res: Response) => {
  try {
    const { trailId, stopId } = req.params;
    const { latitude, longitude } = req.body;
    const userId = req.user.id;

    // Verify GPS proximity
    const stop = await prisma.trailStop.findUnique({
      where: { id: stopId },
      select: { latitude: true, longitude: true, baseXp: true, trailId: true },
    });
    if (!stop) return res.status(404).json({ message: 'Stop not found.' });

    const distance = haversineDistance(latitude, longitude, stop.latitude, stop.longitude);
    const MAX_DISTANCE = 100; // 100 meters
    if (distance > MAX_DISTANCE) {
      return res.status(400).json({ message: `Too far away (${Math.round(distance)}m, max ${MAX_DISTANCE}m).` });
    }

    // Check if already checked in at this stop
    const existing = await prisma.trailCheckIn.findUnique({
      where: { trailId_stopId_userId: { trailId, stopId, userId } },
    });
    if (existing) {
      return res.status(409).json({ message: 'Already checked in at this stop.' });
    }

    // Create check-in and award XP
    const checkIn = await prisma.trailCheckIn.create({
      data: {
        trailId,
        stopId,
        userId,
        latitude,
        longitude,
        baseXpAwarded: stop.baseXp,
      },
    });

    // Record XP transaction
    await prisma.pointsTransaction.create({
      data: {
        userId,
        type: 'TRAIL_STOP_CHECKIN',
        points: stop.baseXp,
        description: `Trail stop check-in`,
      },
    });

    // Update user's guildXp
    await prisma.user.update({
      where: { id: userId },
      data: { guildXp: { increment: stop.baseXp } },
    });

    // Check if all stops now complete
    const allCheckIns = await prisma.trailCheckIn.findMany({
      where: { trailId, userId },
      distinct: ['stopId'],
    });

    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
      select: { minStopsRequired: true, windowDays: true, organizerId: true },
    });

    let completionTriggered = false;
    let completionBonusXp = 0;

    if (allCheckIns.length >= (trail?.minStopsRequired || 3)) {
      // Check if completion already recorded
      const existing = await prisma.trailCompletion.findUnique({
        where: { trailId_userId: { trailId, userId } },
      });

      if (!existing) {
        completionTriggered = true;
        completionBonusXp = completionBonus(allCheckIns.length);

        const firstCheckIn = await prisma.trailCheckIn.findFirst({
          where: { trailId, userId },
          orderBy: { checkedInAt: 'asc' },
          select: { checkedInAt: true },
        });

        const now = new Date();
        const daysToComplete = firstCheckIn
          ? Math.floor((now.getTime() - firstCheckIn.checkedInAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        const totalXpEarned = allCheckIns.reduce((sum, ci) => sum + (ci.baseXpAwarded || 0), 0) + completionBonusXp;

        await prisma.trailCompletion.create({
          data: {
            trailId,
            userId,
            completionBonusXp,
            totalXpEarned,
            stopCountCompleted: allCheckIns.length,
            photoCountPosted: 0,
            firstCheckInAt: firstCheckIn?.checkedInAt || new Date(),
            completedAt: new Date(),
            daysToComplete,
          },
        });

        // Award completion bonus XP to shopper
        await prisma.pointsTransaction.create({
          data: {
            userId,
            type: 'TRAIL_COMPLETION',
            points: completionBonusXp,
            description: `Trail completion bonus (${allCheckIns.length} stops)`,
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: { guildXp: { increment: completionBonusXp } },
        });

        // Award organizer 15 XP per unique completion
        if (trail?.organizerId) {
          const organizerId = trail.organizerId;
          await prisma.pointsTransaction.create({
            data: {
              userId: organizerId,
              type: 'TRAIL_COMPLETION',
              points: 15,
              description: `Trail completion reward (shopper completed)`,
            },
          });

          await prisma.user.update({
            where: { id: organizerId },
            data: { guildXp: { increment: 15 } },
          });
        }

        // Update trail completion count
        await prisma.treasureTrail.update({
          where: { id: trailId },
          data: { completionCount: { increment: 1 } },
        });
      }
    }

    return res.json({
      xpAwarded: stop.baseXp,
      completionTriggered,
      completionBonusXp,
      totalXpAtStop: stop.baseXp,
    });
  } catch (error) {
    console.error('checkInAtStop error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/trails/:trailId/stops/:stopId/photo
 * Shopper posts a photo after check-in
 */
export const postStopPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const { trailId, stopId } = req.params;
    const { cloudinaryUrl, cloudinaryId } = req.body;
    const userId = req.user.id;

    if (!cloudinaryUrl || !cloudinaryId) {
      return res.status(400).json({ message: 'cloudinaryUrl and cloudinaryId are required.' });
    }

    // Get user's most recent check-in at this stop
    const checkIn = await prisma.trailCheckIn.findFirst({
      where: { trailId, stopId, userId },
      orderBy: { checkedInAt: 'desc' },
    });

    if (!checkIn) {
      return res.status(404).json({ message: 'No check-in found at this stop.' });
    }

    // Check if photo already posted at this stop (one photo per stop per user)
    const existing = await prisma.trailPhoto.findFirst({
      where: { stopId, userId, checkIn: { trailId } },
    });

    if (existing) {
      return res.status(409).json({ message: 'Photo already posted at this stop.' });
    }

    const photo = await prisma.trailPhoto.create({
      data: {
        checkInId: checkIn.id,
        stopId,
        userId,
        cloudinaryUrl,
        cloudinaryId,
        postedToFeed: true,
      },
    });

    // Award +2 XP for posting photo
    await prisma.pointsTransaction.create({
      data: {
        userId,
        type: 'TRAIL_STOP_CHECKIN',
        points: 2,
        description: `Trail stop photo bonus`,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { guildXp: { increment: 2 } },
    });

    // Link photo to check-in (for reference)
    await prisma.trailCheckIn.update({
      where: { id: checkIn.id },
      data: { photoXpAwarded: 2 },
    });

    return res.status(201).json({ success: true, xpAwarded: 2 });
  } catch (error) {
    console.error('postStopPhoto error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/trails/:trailId/rate
 * Shopper rates and reviews completed trail
 */
export const rateTrail = async (req: AuthRequest, res: Response) => {
  try {
    const { trailId } = req.params;
    const { rating, review } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be 1-5.' });
    }

    // Verify user completed this trail
    const completion = await prisma.trailCompletion.findUnique({
      where: { trailId_userId: { trailId, userId } },
    });

    if (!completion) {
      return res.status(400).json({ message: 'You must complete the trail first.' });
    }

    const trailRating = await prisma.trailRating.upsert({
      where: { trailId_userId: { trailId, userId } },
      create: { trailId, userId, rating, review: review?.trim() },
      update: { rating, review: review?.trim() },
    });

    // Update trail's average rating
    const ratings = await prisma.trailRating.findMany({
      where: { trailId },
      select: { rating: true },
    });

    const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

    await prisma.treasureTrail.update({
      where: { id: trailId },
      data: { avgRating },
    });

    return res.json(trailRating);
  } catch (error) {
    console.error('rateTrail error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * PATCH /api/trails/:trailId
 * Organizer updates trail metadata
 */
export const updateTrail = async (req: AuthRequest, res: Response) => {
  try {
    const { trailId } = req.params;
    const { name, description, isPublic, isFeatured } = req.body;

    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
      select: { organizerId: true },
    });

    if (!trail) return res.status(404).json({ message: 'Trail not found.' });

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (trail.organizerId !== organizer?.id) {
      return res.status(403).json({ message: 'Not your trail.' });
    }

    const updated = await prisma.treasureTrail.update({
      where: { id: trailId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isPublic !== undefined && { isPublic }),
        ...(isFeatured !== undefined && { isFeatured }),
      },
      include: { stops: true },
    });

    return res.json(updated);
  } catch (error) {
    console.error('updateTrail error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * DELETE /api/trails/:trailId
 * Organizer deletes a trail
 */
export const deleteTrail = async (req: AuthRequest, res: Response) => {
  try {
    const { trailId } = req.params;

    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
      select: { organizerId: true },
    });

    if (!trail) return res.status(404).json({ message: 'Trail not found.' });

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (trail.organizerId !== organizer?.id) {
      return res.status(403).json({ message: 'Not your trail.' });
    }

    await prisma.treasureTrail.delete({ where: { id: trailId } });

    return res.json({ success: true });
  } catch (error) {
    console.error('deleteTrail error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};
