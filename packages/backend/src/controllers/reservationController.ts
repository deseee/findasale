import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getIO } from '../lib/socket';
import { pushEvent } from '../services/liveFeedService';
import { pushSaleStatus } from '../services/saleStatusService';
import { sendHoldPlacedAlert } from '../services/saleAlertEmailService';
import { checkForFraud, calculateConfidenceScore } from '../services/fraudDetectionService';

const DEFAULT_HOLD_MINUTES = 30; // Feature #121: fallback hold duration in minutes
const EN_ROUTE_RADIUS_M = 16093; // 10 miles in meters — en route grace zone

// Feature #121: GPS radius by sale type (meters)
function getGpsRadiusBySaleType(saleType: string): number {
  switch (saleType?.toUpperCase()) {
    case 'YARD':
    case 'FLEA_MARKET': return 150;
    case 'AUCTION':     return 400;
    case 'ESTATE':
    default:            return 250;
  }
}

// Feature #121: Hold duration in minutes by explorer rank
function getHoldDurationMinutes(rank: string): number {
  switch (rank) {
    case 'RANGER':      return 45;
    case 'SAGE':        return 60;
    case 'GRANDMASTER': return 90;
    case 'INITIATE':
    case 'SCOUT':
    default:            return 30;
  }
}

// Feature #121: Max en-route holds by explorer rank
function getEnRouteHoldLimit(rank: string): number {
  switch (rank) {
    case 'RANGER':      return 2;
    case 'SAGE':
    case 'GRANDMASTER': return 3;
    case 'INITIATE':
    case 'SCOUT':
    default:            return 1;
  }
}

// POST /api/reservations — shopper places a hold on an item (duration set per-rank)
// Feature #121: Enhanced with GPS validation, QR check, fraud scoring, rank-based limits
export const placeHold = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (hasOrganizerRole) return res.status(403).json({ message: 'Organizers cannot place holds' });

    const { itemId, note, latitude, longitude, qrScanId } = req.body;
    if (!itemId) return res.status(400).json({ message: 'itemId is required' });

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: {
          include: {
            organizer: {
              include: {
                holdSettings: true,
                user: { select: { tier: true } },
              },
            },
          },
        },
      },
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (item.status !== 'AVAILABLE') return res.status(409).json({ message: 'Item is not available for hold' });

    const sale = (item.sale as any);
    const holdSettings = sale?.organizer?.holdSettings;

    // Feature #121: Per-sale holdsEnabled toggle
    if (sale?.holdsEnabled === false) {
      return res.status(403).json({ message: 'Holds are disabled for this sale' });
    }

    // Fetch user with explorerRank for rank-based logic
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, explorerRank: true },
    });
    const explorerRank = (user?.explorerRank as string) ?? 'INITIATE';

    // Feature #121: GPS validation — sale-type-based radius
    let enRoute = false;
    if (latitude && longitude) {
      const saleLat = sale?.lat;
      const saleLng = sale?.lng;
      if (saleLat && saleLng) {
        const distance = calculateDistance(latitude, longitude, saleLat, saleLng);
        const gpsRadius = getGpsRadiusBySaleType(sale?.saleType ?? 'ESTATE');

        if (distance > gpsRadius) {
          // Outside geofence — check en route grace (within 10 miles)
          if (distance <= EN_ROUTE_RADIUS_M) {
            enRoute = true;
            // Enforce rank-based en route hold limit
            const enRouteLimit = getEnRouteHoldLimit(explorerRank);
            const enRouteHolds = await prisma.itemReservation.count({
              where: {
                userId: req.user!.id,
                enRoute: true,
                status: { in: ['PENDING', 'CONFIRMED'] },
              },
            });
            if (enRouteHolds >= enRouteLimit) {
              return res.status(403).json({
                message: `En route hold limit reached for your rank (${enRouteLimit} hold${enRouteLimit > 1 ? 's' : ''} allowed while navigating)`
              });
            }
          } else if (holdSettings?.enableGpsValidation) {
            // GPS validation required and user is too far away (beyond en route zone)
            return res.status(403).json({
              message: 'You are not close enough to the sale location to place a hold',
              distance
            });
          }
        }
      }
    }

    // Feature #121: QR validation — if organizer requires it, check that QR was scanned
    if (holdSettings?.enableQrValidation && !qrScanId) {
      return res.status(403).json({ message: 'Organizer requires QR validation to place a hold' });
    }

    // Feature #121: Rate limiting — check holds per session for this user
    if (holdSettings?.maxHoldsPerSession) {
      const sessionHolds = await prisma.itemReservation.count({
        where: {
          userId: req.user!.id,
          item: { saleId: item.saleId },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      });
      if (sessionHolds >= holdSettings.maxHoldsPerSession) {
        return res.status(403).json({
          message: `You have reached the hold limit (${holdSettings.maxHoldsPerSession}) for this sale`
        });
      }
    }

    // Feature #121: Fraud detection — synchronous check
    let fraudScore = 0;
    let fraudFlags: string[] = [];
    if (holdSettings?.fraudCheckEnabled) {
      try {
        const fraudResult = await calculateConfidenceScore(req.user!.id, itemId, item.saleId);
        fraudScore = fraudResult.score / 100; // normalize to 0.0-1.0
        fraudFlags = fraudResult.signals;

        // Feature #121: Auto-suspend if fraud score is too high
        if (holdSettings.autoSuspendThreshold && fraudScore >= holdSettings.autoSuspendThreshold) {
          return res.status(403).json({
            message: 'Your account has been temporarily flagged for suspicious activity. Contact support.',
            fraudScore
          });
        }
      } catch (err) {
        console.warn('[holds] Fraud check error (non-blocking):', err);
      }
    }

    // Feature #121: Rank-based hold duration
    const holdMinutes = getHoldDurationMinutes(explorerRank);
    const expiresAt = new Date(Date.now() + holdMinutes * 60000);

    const reservation = await prisma.$transaction(async (tx) => {
      const r = await tx.itemReservation.create({
        data: {
          itemId,
          userId: req.user!.id,
          status: 'PENDING',
          expiresAt,
          note: note?.trim() || null,
          gpsLatitude: latitude || null,
          gpsLongitude: longitude || null,
          qrScanId: qrScanId || null,
          fraudScore,
          fraudFlags,
          enRoute,
        },
      });
      await tx.item.update({ where: { id: itemId }, data: { status: 'RESERVED' } });
      return r;
    });

    // Feature #70: Emit live feed event
    try {
      const io = getIO();
      pushEvent(io, item.saleId, {
        type: 'HOLD_PLACED',
        itemTitle: item.title,
        saleId: item.saleId,
        timestamp: new Date(),
      });
    } catch (err) {
      console.warn('[liveFeed] Failed to emit hold placed event:', err);
    }

    // Feature #17: Check for fraud (fire-and-forget)
    try {
      setImmediate(() => {
        checkForFraud(req.user!.id, itemId, item.saleId).catch(err =>
          console.error('[fraud] Fraud check error:', err)
        );
      });
    } catch (err) {
      console.warn('[fraud] Failed to trigger fraud check:', err);
    }

    // Feature #14: Push sale status update
    try {
      const io = getIO();
      await pushSaleStatus(io, item.saleId);
    } catch (err) {
      console.warn('[saleStatus] Failed to push status update:', err);
    }

    // Feature #14: Send organizer alert email (fire-and-forget)
    try {
      const sale = (item.sale as any);
      const organizer = await prisma.organizer.findUnique({
        where: { id: sale?.organizerId },
        include: { user: { select: { email: true, name: true } } },
      });
      if (organizer?.user) {
        setImmediate(() => {
          sendHoldPlacedAlert({
            organizerEmail: organizer.user.email,
            organizerName: organizer.user.name,
            itemTitle: item.title,
            saleTitle: sale?.title || 'Sale',
            saleId: item.saleId,
          }).catch(err => console.warn('[alert] Failed to send hold placed email:', err));
        });
      }
    } catch (err) {
      console.warn('[alert] Failed to fetch organizer for hold alert:', err);
    }

    res.status(201).json(reservation);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Item already has an active hold' });
    }
    console.error('[reservations] placeHold error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/reservations/:id — shopper cancels their own hold (organizer can cancel any)
export const cancelHold = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { id } = req.params;
    const reservation = await prisma.itemReservation.findUnique({ where: { id } });
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    const isOrganizer = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!isOrganizer && reservation.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Fetch item details for live feed event
    const item = await prisma.item.findUnique({
      where: { id: reservation.itemId },
      select: { id: true, title: true, saleId: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.itemReservation.update({ where: { id }, data: { status: 'CANCELLED' } });
      await tx.item.update({ where: { id: reservation.itemId }, data: { status: 'AVAILABLE' } });
    });

    // Feature #70: Emit live feed event
    if (item) {
      try {
        const io = getIO();
        pushEvent(io, item.saleId, {
          type: 'HOLD_RELEASED',
          itemTitle: item.title,
          saleId: item.saleId,
          timestamp: new Date(),
        });
      } catch (err) {
        console.warn('[liveFeed] Failed to emit hold released event:', err);
      }

      // Feature #14: Push sale status update
      try {
        const io = getIO();
        await pushSaleStatus(io, item.saleId);
      } catch (err) {
        console.warn('[saleStatus] Failed to push status update:', err);
      }
    }

    res.json({ message: 'Hold cancelled' });
  } catch (error) {
    console.error('[reservations] cancelHold error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/item/:itemId — get the active reservation for an item (any auth'd user)
export const getItemReservation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { itemId } = req.params;
    const reservation = await prisma.itemReservation.findUnique({
      where: { itemId },
      include: { user: { select: { id: true, name: true } } },
    });

    res.json(reservation || null);
  } catch (error) {
    console.error('[reservations] getItemReservation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/organizer — all active holds across organizer's sales
// #24: supports ?saleId=xxx&sort=expiry|created query params
// P2 #11: Added pagination with ?limit=50&offset=0 query params
export const getOrganizerHolds = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    const { saleId, sort, page, limit } = req.query as { saleId?: string; sort?: string; page?: string; limit?: string };

    // P2 #11: Parse pagination params with defaults and validation
    let pageNum = Math.max(1, parseInt(page as string) || 1);
    let pageLimit = 50; // default
    if (limit) {
      const parsed = parseInt(limit, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 200) {
        pageLimit = parsed;
      }
    }
    const pageSkip = (pageNum - 1) * pageLimit;

    const where: any = {
      status: { in: ['PENDING', 'CONFIRMED'] },
      item: { sale: { organizerId: organizer.id } },
    };
    // Optional sale filter
    if (saleId) {
      where.item.saleId = saleId;
    }

    const orderBy = sort === 'created'
      ? { createdAt: 'desc' as const }
      : { expiresAt: 'asc' as const }; // default: soonest-expiring first

    // P2 #11: Fetch total count and paginated results
    const [reservations, total] = await Promise.all([
      prisma.itemReservation.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          item: {
            select: {
              id: true,
              title: true,
              price: true,
              photoUrls: true,
              sale: { select: { id: true, title: true } },
            },
          },
        },
        orderBy,
        take: pageLimit,
        skip: pageSkip,
      }),
      prisma.itemReservation.count({ where }),
    ]);

    res.json({
      holds: reservations,
      page: pageNum,
      limit: pageLimit,
      total,
      pages: Math.ceil(total / pageLimit),
    });
  } catch (error) {
    console.error('[reservations] getOrganizerHolds error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/organizer/count — lightweight hold count for dashboard badge
export const getOrganizerHoldCount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    const count = await prisma.itemReservation.count({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        item: { sale: { organizerId: organizer.id } },
      },
    });

    res.json({ count });
  } catch (error) {
    console.error('[reservations] getOrganizerHoldCount error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/reservations/batch — batch operations: release, extend, markSold
export const batchUpdateHolds = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const { ids, action } = req.body as { ids: string[]; action: string };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array is required' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ message: 'Maximum 50 holds per batch operation' });
    }
    if (!['release', 'extend', 'markSold'].includes(action)) {
      return res.status(400).json({ message: 'action must be release, extend, or markSold' });
    }

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    // P1 Bug 2: Wrap verification + update in transaction with re-verification on each hold
    const result = await prisma.$transaction(async (tx) => {
      // Fetch holds within transaction (re-verification point)
      const holds = await tx.itemReservation.findMany({
        where: { id: { in: ids }, status: { in: ['PENDING', 'CONFIRMED'] } },
        include: {
          item: {
            include: { sale: true },
          },
        },
      });

      // Verify each hold belongs to this organizer (re-check inside transaction)
      const validHolds = holds.filter((h) => h.item.sale?.organizerId === organizer.id);
      if (validHolds.length === 0) {
        throw new Error('No valid holds found');
      }

      const validIds = validHolds.map((h) => h.id);
      const validItemIds = validHolds.map((h) => h.item.id);

      if (action === 'release') {
        await tx.itemReservation.updateMany({
          where: {
            id: { in: validIds },
            item: { sale: { organizerId: organizer.id } } // re-verify ownership in where clause
          },
          data: { status: 'CANCELLED' },
        });
        await tx.item.updateMany({
          where: { id: { in: validItemIds } },
          data: { status: 'AVAILABLE' },
        });
      } else if (action === 'extend') {
        // Extend each hold by its sale's holdDurationHours from now
        for (const h of validHolds) {
          const hours = (h.item.sale as any)?.holdDurationHours ?? DEFAULT_HOLD_HOURS;
          await tx.itemReservation.update({
            where: {
              id: h.id,
            },
            data: { expiresAt: new Date(Date.now() + hours * 3600000) },
          });
        }
      } else if (action === 'markSold') {
        await tx.itemReservation.updateMany({
          where: {
            id: { in: validIds },
            item: { sale: { organizerId: organizer.id } } // re-verify ownership in where clause
          },
          data: { status: 'CONFIRMED' },
        });
        await tx.item.updateMany({
          where: { id: { in: validItemIds } },
          data: { status: 'SOLD' },
        });
      }

      return { updated: validHolds.length, failed: ids.length - validHolds.length };
    }).catch((err) => {
      if (err.message === 'No valid holds found') {
        return { updated: 0, failed: ids.length };
      }
      throw err;
    });

    res.json(result);
  } catch (error) {
    console.error('[reservations] batchUpdateHolds error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/reservations/:id — organizer confirms or cancels a hold
export const updateHold = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const { id } = req.params;
    const { status } = req.body;

    if (!['CONFIRMED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'status must be CONFIRMED or CANCELLED' });
    }

    const reservation = await prisma.itemReservation.findUnique({ where: { id } });
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.itemReservation.update({ where: { id }, data: { status } });
      if (status === 'CANCELLED') {
        await tx.item.update({ where: { id: reservation.itemId }, data: { status: 'AVAILABLE' } });
      }
      return r;
    });

    res.json(updated);
  } catch (error) {
    console.error('[reservations] updateHold error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/organizer/settings — get organizer's hold settings
export const getHoldSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    let settings = await prisma.organizerHoldSettings.findUnique({
      where: { organizerId: organizer.id },
    });

    // Create default settings if they don't exist
    if (!settings) {
      settings = await prisma.organizerHoldSettings.create({
        data: { organizerId: organizer.id },
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('[reservations] getHoldSettings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/reservations/organizer/settings — update organizer's hold settings
export const updateHoldSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const {
      maxHoldsPerRank,
      enableGpsValidation,
      enableQrValidation,
      maxHoldsPerSession,
      fraudCheckEnabled,
      autoSuspendThreshold,
    } = req.body;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    const settings = await prisma.organizerHoldSettings.upsert({
      where: { organizerId: organizer.id },
      create: {
        organizerId: organizer.id,
        maxHoldsPerRank: maxHoldsPerRank ?? 3,
        enableGpsValidation: enableGpsValidation ?? false,
        enableQrValidation: enableQrValidation ?? false,
        maxHoldsPerSession: maxHoldsPerSession ?? 10,
        fraudCheckEnabled: fraudCheckEnabled ?? true,
        autoSuspendThreshold: autoSuspendThreshold ?? 0.85,
      },
      update: {
        ...(maxHoldsPerRank !== undefined && { maxHoldsPerRank }),
        ...(enableGpsValidation !== undefined && { enableGpsValidation }),
        ...(enableQrValidation !== undefined && { enableQrValidation }),
        ...(maxHoldsPerSession !== undefined && { maxHoldsPerSession }),
        ...(fraudCheckEnabled !== undefined && { fraudCheckEnabled }),
        ...(autoSuspendThreshold !== undefined && { autoSuspendThreshold }),
        updatedAt: new Date(),
      },
    });

    res.json(settings);
  } catch (error) {
    console.error('[reservations] updateHoldSettings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/reservations/checkin — record shopper check-in at sale (GPS-based)
export const checkinAtSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { saleId, latitude, longitude, qrScanned, qrScanId } = req.body;
    if (!saleId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'saleId, latitude, longitude are required' });
    }

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    // Create or update check-in
    const checkin = await prisma.saleCheckin.upsert({
      where: { saleId_userId: { saleId, userId: req.user.id } },
      create: {
        saleId,
        userId: req.user.id,
        latitude,
        longitude,
        qrScanned: qrScanned ?? false,
        qrScanId: qrScanId || null,
      },
      update: {
        latitude,
        longitude,
        qrScanned: qrScanned ?? false,
        qrScanId: qrScanId || null,
        checkinAt: new Date(),
      },
    });

    res.status(201).json(checkin);
  } catch (error) {
    console.error('[reservations] checkinAtSale error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Feature #121: Calculate distance in meters between two GPS coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}
