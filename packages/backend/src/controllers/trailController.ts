// Treasure Trails controller — Explorer's Guild gamification
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { searchNearbyPlaces, haversineDistance, completionBonus } from '../lib/placesService';
import { spendXp, getSpendableXp, awardXp, applyHuntPassMultiplier } from '../services/xpService';
import { qrScanConfig } from '../services/qrScanGuardService'; // #188: same impossible-speed thresholds as QR scans
import { referralTrancheService } from '../services/referralTrancheService'; // Feature: Referral tranche system
import { GATE_ORGANIZER_SELECT, gateSalesForViewer } from '../lib/publicSaleGate';
import { redactSaleLocation } from '../lib/saleLocationPrivacy';

// Address gate (2026-10-13): a SALE stop's street address / exact pin follows the sale address rule
// (signed-in viewers from the day before the sale starts; the sale's owner and admin always).
// Non-sale stops (cafes, shops, landmarks) are public businesses and are left as entered.
const TRAIL_GATE_SALE_SELECT = { select: { startDate: true, organizer: { select: GATE_ORGANIZER_SELECT } } } as const;

function gateTrailStops(stops: any[], anchorSale: any, viewer: any): any[] {
  return (stops || []).map((stop) => {
    const { sale: stopSale, ...rest } = stop || {};
    if (rest.stopType !== 'SALE') return rest;
    const ref = stopSale ?? anchorSale;
    if (!ref) {
      // Unknown sale: only admin sees the street-level location.
      return viewer?.role === 'ADMIN'
        ? rest
        : redactSaleLocation(rest, { visible: false, reason: 'SIGN_IN', revealsOn: '' });
    }
    const [gated] = gateSalesForViewer([{ ...rest, startDate: ref.startDate, organizer: ref.organizer }], viewer);
    const { startDate: _s, organizer: _o, ...out } = gated as any;
    return out;
  });
}

/*
 * Trail XP rules (security fixes #188/#189, game designer decision 2026-11-04):
 *   1. Stop XP is a server constant (TRAIL_STOP_XP). Client baseXp is ignored on addStop, and check-in awards
 *      the constant whatever a legacy stop row stores.
 *   2. minStopsRequired and maxStops are clamped to TRAIL_MIN_STOPS..TRAIL_MAX_STOPS (maxStops >= minStopsRequired).
 *   3. The trail's organizer and that organizer's workspace team may check in but earn 0 XP and no completion bonus.
 *   4. Check-in requires the stop to belong to the URL's trail, the trail to be active, and public unless the caller
 *      owns it, and passes the QR-scan impossible-speed guard between the user's consecutive trail check-ins.
 *   5. At most TRAIL_DAILY_XP_CAP XP per user per UTC day from trails (TRAIL_STOP_CHECKIN + TRAIL_COMPLETION).
 */
export const TRAIL_STOP_XP = 3;
export const TRAIL_MIN_STOPS = 3;
export const TRAIL_MAX_STOPS = 7;
export const TRAIL_DAILY_XP_CAP = 150;
const TRAIL_XP_TYPES = ['TRAIL_STOP_CHECKIN', 'TRAIL_COMPLETION'];

const clampStops = (raw: unknown, dflt: number): number => {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(Math.round(n), TRAIL_MIN_STOPS), TRAIL_MAX_STOPS);
};

/** XP this user has already earned from trails since 00:00 UTC today. */
async function trailXpEarnedTodayUtc(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const agg = await prisma.pointsTransaction.aggregate({
    where: { userId, type: { in: TRAIL_XP_TYPES }, createdAt: { gte: startOfDay } },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

/**
 * The trail XP this award may pay right now. The Hunt Pass multiplier is applied first, then the result is
 * clamped to what is left of today's cap, so the cap holds for Hunt Pass holders too. `alreadyPlanned` is XP
 * planned earlier in the same request but not yet written.
 */
async function planTrailXp(userId: string, baseXp: number, alreadyPlanned = 0): Promise<number> {
  if (baseXp <= 0) return 0;
  const remaining = TRAIL_DAILY_XP_CAP - (await trailXpEarnedTodayUtc(userId)) - alreadyPlanned;
  if (remaining <= 0) return 0;
  const multiplied = await applyHuntPassMultiplier(userId, baseXp);
  return Math.max(0, Math.min(multiplied, remaining));
}

/** Write a planned trail award (already multiplied and capped by planTrailXp). */
async function payTrailXp(userId: string, type: string, amount: number, description: string): Promise<void> {
  if (amount <= 0) return;
  await awardXp(userId, type, amount, { description, preMultipliedHuntPassXp: true });
}

/** True when the caller is the trail's organizer (or legacy creator) or on that organizer's workspace team. */
async function isTrailOwnerOrTeam(trail: { organizerId: string | null; userId?: string | null }, callerUserId: string): Promise<{ owner: boolean; team: boolean }> {
  if (trail.userId && trail.userId === callerUserId) return { owner: true, team: false };
  const callerOrganizer = await prisma.organizer.findUnique({ where: { userId: callerUserId }, select: { id: true } });
  if (trail.organizerId && callerOrganizer?.id === trail.organizerId) return { owner: true, team: false };
  if (!trail.organizerId) return { owner: false, team: false };
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspace: { ownerId: trail.organizerId },
      OR: [{ userId: callerUserId }, ...(callerOrganizer ? [{ organizerId: callerOrganizer.id }] : [])],
    },
    select: { id: true },
  });
  return { owner: false, team: !!membership };
}

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

    // Phase 2c: XP Gate — Creating a Treasure Trail costs 100 XP
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { guildXp: true },
    });

    if (!user || user.guildXp < 100) {
      const currentXp = user?.guildXp || 0;
      return res.status(400).json({
        message: `Creating a Treasure Trail costs 100 XP. You have ${currentXp} XP.`,
      });
    }

    // Check if user has spendable XP (not on hold)
    const spendableXp = await getSpendableXp(userId);
    if (spendableXp < 100) {
      return res.status(402).json({
        message: 'Insufficient spendable XP. Some XP may be on hold.',
        required: 100,
        spendable: spendableXp,
      });
    }

    // Spend the XP
    const spendSuccess = await spendXp(userId, 100, 'TREASURE_TRAIL_SPONSOR', {
      saleId,
      description: `Treasure Trail creation: ${name.trim()}`,
    });

    if (!spendSuccess) {
      return res.status(400).json({
        message: 'Failed to spend XP. Please try again.',
      });
    }

    const trail = await prisma.treasureTrail.create({
      data: {
        organizerId: organizer.id,
        userId, // legacy field
        saleId,
        name: name.trim(),
        description: description?.trim(),
        type: type || 'DISCOVERY',
        // #189: clamped to 3..7, and maxStops never below minStopsRequired.
        minStopsRequired: clampStops(minStopsRequired, TRAIL_MIN_STOPS),
        maxStops: Math.max(clampStops(maxStops, TRAIL_MAX_STOPS), clampStops(minStopsRequired, TRAIL_MIN_STOPS)),
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
 * Accepts either a full trail ID or a shareToken
 */
export const getTrail = async (req: AuthRequest | Request, res: Response) => {
  try {
    const { trailId } = req.params;
    const userId = (req as AuthRequest).user?.id;

    // Try lookup by ID first
    let trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
      include: {
        organizer: { select: { id: true, businessName: true, userId: true } },
        sale: TRAIL_GATE_SALE_SELECT,
        stops: { orderBy: { order: 'asc' }, include: { sale: TRAIL_GATE_SALE_SELECT } },
        completions: { where: { userId: userId ?? '__anonymous__' }, select: { completionBonusXp: true, totalXpEarned: true } }, // anonymous: none (undefined would match every user)
      },
    });

    // Fallback: try lookup by shareToken
    if (!trail) {
      trail = await prisma.treasureTrail.findUnique({
        where: { shareToken: trailId },
        include: {
          organizer: { select: { id: true, businessName: true, userId: true } },
          sale: TRAIL_GATE_SALE_SELECT,
          stops: { orderBy: { order: 'asc' }, include: { sale: TRAIL_GATE_SALE_SELECT } },
          completions: { where: { userId: userId ?? '__anonymous__' }, select: { completionBonusXp: true, totalXpEarned: true } }, // anonymous: none (undefined would match every user)
        },
      });
    }

    if (!trail) return res.status(404).json({ message: 'Trail not found.' });

    // Non-public trails visible to organizer only (compare the viewer's user id with the trail organizer's user id)
    if (!trail.isPublic && (!userId || userId !== trail.organizer?.userId)) {
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

    const { sale: anchorSale, stops, organizer, ...trailRest } = trail as any;
    const publicOrganizer = organizer ? { id: organizer.id, businessName: organizer.businessName } : organizer;
    return res.json({
      ...trailRest,
      organizer: publicOrganizer,
      stops: gateTrailStops(stops, anchorSale, (req as AuthRequest).user),
      userProgress,
    });
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
 * GET /api/trails/mine
 * Get the authenticated user's own trails (shopper-created or organizer-created, by userId)
 */
export const getMyTrails = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const page = parseInt((req.query.page as string) || '1');
    const limit = parseInt((req.query.limit as string) || '20');
    const skip = (page - 1) * limit;

    const [trails, total] = await Promise.all([
      prisma.treasureTrail.findMany({
        where: { userId },
        include: {
          stops: { orderBy: { order: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.treasureTrail.count({ where: { userId } }),
    ]);

    return res.json({ trails, total });
  } catch (error) {
    console.error('getMyTrails error:', error);
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
    // #189: client baseXp is ignored; every stop is worth TRAIL_STOP_XP.
    const { stopType, stopName, address, latitude, longitude, googlePlaceId, organizer_note } = req.body;

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
        baseXp: TRAIL_STOP_XP,
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
    // #188: a stop only counts on its own trail (one stop could otherwise pay out once per trail id).
    if (!stop || stop.trailId !== trailId) return res.status(404).json({ message: 'Stop not found.' });

    const trail = await prisma.treasureTrail.findUnique({
      where: { id: trailId },
      select: { minStopsRequired: true, windowDays: true, organizerId: true, userId: true, isActive: true, isPublic: true },
    });
    if (!trail) return res.status(404).json({ message: 'Trail not found.' });
    const { owner: callerIsOwner, team: callerIsTeam } = await isTrailOwnerOrTeam(trail, userId);
    if (!trail.isPublic && !callerIsOwner) return res.status(404).json({ message: 'Trail not found.' });
    if (!trail.isActive) return res.status(400).json({ message: 'This trail is not active.' });
    // #189 rule 3: the organizer and their team may walk their own trail but never earn XP from it.
    const earnsXp = !callerIsOwner && !callerIsTeam;

    // Check if already checked in at this stop (before the distance check, so repeated probes after a
    // check-in learn nothing about where the stop is).
    const existing = await prisma.trailCheckIn.findUnique({
      where: { trailId_stopId_userId: { trailId, stopId, userId } },
    });
    if (existing) {
      return res.status(409).json({ message: 'Already checked in at this stop.' });
    }

    const distance = haversineDistance(latitude, longitude, stop.latitude, stop.longitude);
    const MAX_DISTANCE = 100; // 100 meters
    if (distance > MAX_DISTANCE) {
      // Location oracle guard (2026-10-13): never echo the exact distance; it would let a caller
      // trilaterate a SALE stop's exact pin before the address is revealed.
      return res.status(400).json({ message: `Too far away. Get within ${MAX_DISTANCE}m of this stop to check in.` });
    }

    // #188: the QR-scan impossible-speed guard, between this user's consecutive trail check-ins.
    const previousCheckIn = await prisma.trailCheckIn.findFirst({
      where: { userId },
      orderBy: { checkedInAt: 'desc' },
      select: { latitude: true, longitude: true, checkedInAt: true },
    });
    if (previousCheckIn) {
      const speedCfg = qrScanConfig();
      const jumpM = haversineDistance(previousCheckIn.latitude, previousCheckIn.longitude, latitude, longitude);
      if (jumpM > speedCfg.minSpeedCheckDistanceM) {
        const dtSec = Math.max((Date.now() - new Date(previousCheckIn.checkedInAt).getTime()) / 1000, 1);
        if (jumpM / dtSec > speedCfg.maxSpeedMps) {
          console.warn(`[trailCheckIn] rejected reason=impossible_speed userId=${userId} trailId=${trailId} jumpM=${Math.round(jumpM)} dtSec=${Math.round(dtSec)}`);
          return res.status(403).json({
            message: 'Your location changed too quickly to verify this check-in. Please try again in a moment.',
            code: 'IMPLAUSIBLE_MOVEMENT',
          });
        }
      }
    }

    // #188/#189: always TRAIL_STOP_XP (never the stored stop.baseXp), 0 for the trail's own organizer/team,
    // and within the daily trail cap. Planned first so the check-in row records what is earned, and paid
    // only after the row is created (the unique (trail, stop, user) row stops a concurrent double award).
    const stopXpAwarded = earnsXp ? await planTrailXp(userId, TRAIL_STOP_XP) : 0;

    // Create check-in
    await prisma.trailCheckIn.create({
      data: {
        trailId,
        stopId,
        userId,
        latitude,
        longitude,
        baseXpAwarded: stopXpAwarded,
      },
    });

    // 2026-08-08 fix (roadmap #268): awards go through the shared awardXp() helper (fraud-suspect gate,
    // lifetime XP, rank sync).
    await payTrailXp(userId, 'TRAIL_STOP_CHECKIN', stopXpAwarded, 'Trail stop check-in');

    // Check if all stops now complete
    const allCheckIns = await prisma.trailCheckIn.findMany({
      where: { trailId, userId },
      distinct: ['stopId'],
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
        // #189: completionBonus() unchanged; 0 for the organizer/team, and within the daily trail cap.
        completionBonusXp = earnsXp ? await planTrailXp(userId, completionBonus(allCheckIns.length)) : 0;

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

        // The organizer's own or their team's walk-through is not a shopper completion: no bonus, no referral
        // tranche, no organizer reward, no completion count (#189 rule 3).
        if (earnsXp) {
          // Award completion bonus XP to shopper (planned and capped above, after the unique completion row).
          // 2026-08-08 fix (roadmap #268): routed through the shared awardXp() helper.
          await payTrailXp(userId, 'TRAIL_COMPLETION', completionBonusXp, `Trail completion bonus (${allCheckIns.length} stops)`);

          // Feature: Record referral tranche trail completion (non-blocking)
          try {
            await referralTrancheService.recordTrailCompletion(userId);
          } catch (err) {
            console.error('[referralTranche] recordTrailCompletion failed:', err);
            // Never fail the trail completion due to tranche logic
          }

          // Award organizer 15 XP per unique completion.
          // 2026-08-08 fix (roadmap #268): same fraud-gate-bypass fix -- routed through the
          // shared awardXp() helper.
          if (trail?.organizerId) {
            const organizerId = trail.organizerId;
            await awardXp(organizerId, 'TRAIL_COMPLETION', 15, {
              description: `Trail completion reward (shopper completed)`,
            });
          }

          // Update trail completion count
          await prisma.treasureTrail.update({
            where: { id: trailId },
            data: { completionCount: { increment: 1 } },
          });
        }
      }
    }

    return res.json({
      xpAwarded: stopXpAwarded,
      completionTriggered,
      completionBonusXp,
      totalXpAtStop: stopXpAwarded,
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

    // Award +2 XP for posting photo.
    // Fix (same pattern as roadmap #268): was raw prisma.pointsTransaction.create +
    // prisma.user.update, bypassing the shared awardXp() helper -- meant this XP skipped
    // the fraud-suspect gate every other XP path enforces, plus lifetimeXpEarned/xpExpiresAt
    // refresh and rank-up sync. awardXp() now the sole write path for this award.
    // #189: the photo bonus is trail XP too (TRAIL_STOP_CHECKIN), so it is 0 for the trail's own
    // organizer/team and counts toward the daily trail cap.
    const photoTrail = await prisma.treasureTrail.findUnique({ where: { id: trailId }, select: { organizerId: true, userId: true } });
    const photoRole = photoTrail ? await isTrailOwnerOrTeam(photoTrail, userId) : { owner: false, team: false };
    const photoXp = photoRole.owner || photoRole.team ? 0 : await planTrailXp(userId, 2);
    await payTrailXp(userId, 'TRAIL_STOP_CHECKIN', photoXp, 'Trail stop photo bonus');

    // Link photo to check-in (for reference)
    await prisma.trailCheckIn.update({
      where: { id: checkIn.id },
      data: { photoXpAwarded: photoXp },
    });

    return res.status(201).json({ success: true, xpAwarded: photoXp });
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
