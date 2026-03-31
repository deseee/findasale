import { Response, Request } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getIO } from '../lib/socket';
import { pushEvent } from '../services/liveFeedService';
import { pushSaleStatus } from '../services/saleStatusService';
import { sendHoldPlacedAlert, sendHoldStatusToShopper } from '../services/saleAlertEmailService';
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

    // Organizers cannot place holds on their own sale's items
    if (sale?.organizerId === req.user.id) {
      return res.status(403).json({ message: 'You cannot place a hold on your own sale.' });
    }

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
      // Clear any stale (CANCELLED/EXPIRED) reservation so @unique slot is free
      await tx.itemReservation.deleteMany({
        where: { itemId, status: { in: ['CANCELLED', 'EXPIRED'] } },
      });
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

    // Feature #14: Send organizer alert email + in-app notification (fire-and-forget)
    try {
      const sale = (item.sale as any);
      const organizerId = sale?.organizerId;
      if (!organizerId) {
        console.warn('[alert] Sale missing organizerId:', { saleId: item.saleId });
      } else {
        const organizer = await prisma.organizer.findUnique({
          where: { id: organizerId },
          include: { user: { select: { id: true, email: true, name: true } } },
        });
        if (!organizer) {
          console.warn('[alert] Organizer not found for sale:', { organizerId, saleId: item.saleId });
        } else if (organizer?.user) {
          // In-app notification for organizer
          await prisma.notification.create({
            data: {
              userId: organizer.user.id,
              type: 'hold_update',
              title: 'New hold placed',
              body: `A shopper placed a hold on "${item.title}" from ${sale?.title || 'your sale'}.`,
              link: '/organizer/holds',
              notificationChannel: 'IN_APP',
              channel: 'OPERATIONAL',
            },
          });
          // Email alert
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
      }
    } catch (err) {
      console.error('[alert] Exception when creating organizer notification:', err);
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
    // Public endpoint — no auth required. Hold expiry is display-only info.
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
          user: { select: { id: true, name: true, email: true, explorerRank: true } },
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
          user: { select: { id: true, name: true, email: true, explorerRank: true } },
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
        // Notify each shopper their hold was released
        await tx.notification.createMany({
          data: validHolds.map((h) => ({
            userId: h.userId,
            type: 'hold_update',
            title: 'Hold released',
            body: `Your hold on "${h.item.title}" has been released by the organizer.`,
            link: `/items/${h.item.id}`,
            notificationChannel: 'IN_APP',
            channel: 'OPERATIONAL',
          })),
        });
      } else if (action === 'extend') {
        // Extend each hold by rank-based duration from now
        const extendedHolds: Array<{ hold: typeof validHolds[0]; newExpiry: Date }> = [];
        for (const h of validHolds) {
          const rank = (h.user as any)?.explorerRank ?? 'INITIATE';
          const holdMinutes = getHoldDurationMinutes(rank);
          const newExpiry = new Date(Date.now() + holdMinutes * 60000);
          await tx.itemReservation.update({
            where: { id: h.id },
            data: { expiresAt: newExpiry },
          });
          extendedHolds.push({ hold: h, newExpiry });
        }
        // Notify each shopper their hold was extended
        await tx.notification.createMany({
          data: extendedHolds.map(({ hold, newExpiry }) => ({
            userId: hold.userId,
            type: 'hold_update',
            title: 'Hold extended',
            body: `Your hold on "${hold.item.title}" has been extended by the organizer.`,
            link: `/items/${hold.item.id}`,
            notificationChannel: 'IN_APP',
            channel: 'OPERATIONAL',
          })),
        });
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
        // Notify each shopper their reserved item was marked sold
        await tx.notification.createMany({
          data: validHolds.map((h) => ({
            userId: h.userId,
            type: 'hold_update',
            title: 'Item sold',
            body: `"${h.item.title}" that you had on hold has been marked as sold by the organizer.`,
            link: `/items/${h.item.id}`,
            notificationChannel: 'IN_APP',
            channel: 'OPERATIONAL',
          })),
        });
      }

      return { updated: validHolds.length, failed: ids.length - validHolds.length, holds: validHolds };
    }).catch((err) => {
      if (err.message === 'No valid holds found') {
        return { updated: 0, failed: ids.length, holds: [] };
      }
      throw err;
    });

    // Fire-and-forget emails to shoppers for release/extend actions
    const batchHolds = (result as any).holds as Array<{
      userId: string;
      user: { name: string | null; email: string };
      item: { id: string; title: string };
    }> | undefined;
    if (batchHolds && batchHolds.length > 0) {
      const emailAction = action === 'release' ? 'released' : action === 'extend' ? 'extended' : null;
      if (emailAction) {
        setImmediate(() => {
          Promise.allSettled(
            batchHolds.map((h) =>
              sendHoldStatusToShopper({
                shopperEmail: h.user.email,
                shopperName: h.user.name,
                itemTitle: h.item.title,
                itemId: h.item.id,
                action: emailAction,
              })
            )
          ).catch(() => {});
        });
      }
    }

    const { holds: _holds, ...responseResult } = result as any;
    res.json(responseResult);
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

    const reservation = await prisma.itemReservation.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: { select: { id: true, title: true, saleId: true } },
      },
    });
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.itemReservation.update({ where: { id }, data: { status } });
      if (status === 'CANCELLED') {
        await tx.item.update({ where: { id: reservation.itemId }, data: { status: 'AVAILABLE' } });
      }
      // In-app notification for shopper
      await tx.notification.create({
        data: {
          userId: reservation.userId,
          type: 'hold_update',
          title: status === 'CONFIRMED' ? 'Hold confirmed ✓' : 'Hold cancelled',
          body: status === 'CONFIRMED'
            ? `Your hold on "${reservation.item.title}" has been confirmed by the organizer.`
            : `Your hold on "${reservation.item.title}" was cancelled by the organizer.`,
          link: `/items/${reservation.item.id}`,
          notificationChannel: 'IN_APP',
          channel: 'OPERATIONAL',
        },
      });
      return r;
    });

    // Fire-and-forget email to shopper
    setImmediate(() => {
      sendHoldStatusToShopper({
        shopperEmail: reservation.user.email,
        shopperName: reservation.user.name,
        itemTitle: reservation.item.title,
        itemId: reservation.item.id,
        action: status === 'CONFIRMED' ? 'confirmed' : 'cancelled',
        expiresAt: status === 'CONFIRMED' ? updated.expiresAt : undefined,
      }).catch(err => console.warn('[holdNotify] Failed to send hold status email:', err));
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

// POST /api/reservations/:id/mark-sold — organizer marks held item sold and creates invoice
// Hold-to-Pay Phase 2: Create Stripe Checkout session for payment collection
export const markSoldAndCreateInvoice = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const { id: reservationId } = req.params;

    // Fetch the reservation with full context
    const reservation = await prisma.itemReservation.findUnique({
      where: { id: reservationId },
      include: {
        item: {
          include: {
            sale: {
              include: {
                organizer: {
                  include: { user: { select: { id: true, roleSubscriptions: true } } },
                },
              },
            },
          },
        },
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
      return res.status(409).json({ message: 'Reservation is not in a valid state for invoicing' });
    }

    // Verify organizer owns the sale
    const organizer = reservation.item.sale.organizer;
    if (organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied — you do not own this sale' });
    }

    // Query ALL active reservations for this shopper at this sale
    const allShopperHolds = await prisma.itemReservation.findMany({
      where: {
        item: { saleId: reservation.item.saleId },
        userId: reservation.user.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: { item: true },
    });

    // Check for existing PENDING invoice for this shopper+sale combo
    const existingInvoice = await prisma.holdInvoice.findFirst({
      where: {
        saleId: reservation.item.saleId,
        shopperUserId: reservation.user.id,
        status: 'PENDING',
      },
    });

    if (existingInvoice) {
      return res.json({ invoiceId: existingInvoice.id, stripeSessionId: existingInvoice.stripeSessionId, expiresAt: existingInvoice.expiresAt });
    }

    // LOCKED DECISION #1: Fee calculation based on organizer tier
    // Calculate total from all bundled items
    const hasPro = organizer.user?.roleSubscriptions?.some(rs => rs.subscriptionTier === 'PRO') ?? false;
    const platformFeePercent = hasPro ? 0.08 : 0.10;

    let totalAmount = 0;
    let totalPlatformFeeAmount = 0;
    const bundledItemIds: string[] = [];

    for (const hold of allShopperHolds) {
      const itemPrice = hold.item.price || 0;
      totalAmount += itemPrice;
      const itemPlatformFee = Math.round(itemPrice * platformFeePercent * 100) / 100;
      totalPlatformFeeAmount += itemPlatformFee;
      bundledItemIds.push(hold.item.id);
    }

    // LOCKED DECISION #7: Payment window = hold timer remainder (earliest expiry)
    const expiresAt = new Date(Math.min(...allShopperHolds.map(h => h.expiresAt.getTime())));

    // Create Stripe Checkout Session
    const stripe = require('../utils/stripe').getStripe();
    const baseUrl = process.env.FRONTEND_URL || 'https://finda.sale';

    let stripeSession;
    try {
      // Build line_items from all bundled items
      const line_items = allShopperHolds.map(hold => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: hold.item.title,
            description: `Estate sale item`,
            images: hold.item.photoUrls && hold.item.photoUrls.length > 0 ? [hold.item.photoUrls[0]] : [],
          },
          unit_amount_decimal: String(Math.round((hold.item.price || 0) * 100)),
        },
        quantity: 1,
      }));

      stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: reservation.user.email,
        line_items,
        success_url: `${baseUrl}/items?paymentStatus=success`,
        cancel_url: `${baseUrl}/items?paymentStatus=cancelled`,
        expires_at: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp
        // LOCKED DECISION #1: Organizer absorbs Stripe fee via application_fee_amount + transfer_data
        payment_intent_data: {
          metadata: {
            invoiceId: null, // Will be filled after HoldInvoice is created
            itemIds: bundledItemIds.join(','), // Comma-separated item IDs
            shopperId: reservation.user.id,
            organizerId: organizer.id,
            saleId: reservation.item.saleId,
          },
          application_fee_amount: Math.round(totalPlatformFeeAmount * 100),
          transfer_data: {
            destination: organizer.stripeConnectId,
          },
        },
        metadata: {
          organizerId: organizer.id,
        },
      });
    } catch (stripeError: any) {
      console.error('[hold-invoice] Stripe session creation failed:', stripeError);
      return res.status(400).json({ message: 'Failed to create Stripe checkout session', error: stripeError.message });
    }

    // Create HoldInvoice record in transaction with item + reservation updates
    const transaction = await prisma.$transaction(async (tx) => {
      const holdInvoice = await tx.holdInvoice.create({
        data: {
          reservationId: reservationId, // Store first reservation for backward compatibility
          shopperUserId: reservation.user.id,
          organizerUserId: organizer.id,
          saleId: reservation.item.saleId,
          stripeSessionId: stripeSession.id,
          totalAmount: Math.round(totalAmount * 100),
          platformFeeAmount: Math.round(totalPlatformFeeAmount * 100),
          itemIds: bundledItemIds,
          status: 'PENDING',
          expiresAt,
        },
      });

      // Update ALL bundled ItemReservations with invoiceId
      await tx.itemReservation.updateMany({
        where: { id: { in: allShopperHolds.map(h => h.id) } },
        data: {
          invoiceId: holdInvoice.id,
        },
      });

      // Update ALL bundled items to INVOICE_ISSUED (LOCKED DECISION #6)
      await tx.item.updateMany({
        where: { id: { in: bundledItemIds } },
        data: { status: 'INVOICE_ISSUED' },
      });

      // Create in-app notification for shopper (LOCKED DECISION #5) — mention all items
      const itemList = bundledItemIds.length > 1
        ? `${bundledItemIds.length} items`
        : `"${allShopperHolds[0]?.item.title}"`;

      await tx.notification.create({
        data: {
          userId: reservation.user.id,
          type: 'invoice_sent',
          title: 'Payment requested',
          body: `Payment requested for ${itemList}. Complete payment before your hold expires.`,
          link: `/items/${bundledItemIds[0]}`,
          channel: 'OPERATIONAL',
        },
      });

      return holdInvoice;
    });

    // Send checkout email to shopper (fire-and-forget)
    setImmediate(async () => {
      try {
        const resend = require('resend').Resend ? new (require('resend').Resend)(process.env.RESEND_API_KEY) : null;
        if (resend) {
          const expiryTime = new Date(expiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
          const itemList = bundledItemIds.length > 1
            ? `${bundledItemIds.length} items from ${reservation.item.sale.title}`
            : `${allShopperHolds[0]?.item.title} from ${reservation.item.sale.title}`;

          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'invoices@finda.sale',
            to: reservation.user.email,
            subject: `Complete your purchase: ${itemList}`,
            html: `
              <h2>Complete Your Purchase</h2>
              <p>Hi ${reservation.user.name},</p>
              <p>The organizer is ready for payment on <strong>${itemList}</strong>.</p>
              <p><a href="${stripeSession.url}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review and Pay</a></p>
              <p style="color: #6b7280; font-size: 14px;">This link expires at ${expiryTime} (in approximately ${Math.round((expiresAt.getTime() - Date.now()) / 3600000)} hours).</p>
            `,
          });
        }
      } catch (err) {
        console.warn('[hold-invoice] Failed to send checkout email:', err);
      }
    });

    res.status(201).json({
      invoiceId: transaction.id,
      checkoutUrl: stripeSession.url,
      expiresAt,
      totalAmount,
      totalPlatformFeeAmount,
      estimatedOrganizerPayout: totalAmount - totalPlatformFeeAmount,
      itemCount: bundledItemIds.length,
    });
  } catch (error: any) {
    console.error('[hold-invoice] markSoldAndCreateInvoice error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/invoices/:invoiceId — fetch invoice details
// Auth: Shopper (owns invoice) or Organizer (sold the item)
export const getInvoiceDetails = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { invoiceId } = req.params;

    const invoice = await prisma.holdInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        reservation: {
          include: {
            item: {
              include: {
                sale: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    // Authorization: shopper or organizer
    const isShopper = invoice.shopperUserId === req.user.id;

    // Get organizer's ID from request user
    const userOrganizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });
    const isOrganizer = invoice.organizerUserId === userOrganizer?.id;

    if (!isShopper && !isOrganizer) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      id: invoice.id,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      platformFeeAmount: invoice.platformFeeAmount,
      stripeFeeAmount: invoice.stripeFeeAmount,
      expiresAt: invoice.expiresAt,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
      item: invoice.reservation?.item,
    });
  } catch (error: any) {
    console.error('[invoices] getInvoiceDetails error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/my-invoices — fetch all invoices for current shopper
// Auth: Shopper (authenticated)
export const getMyInvoices = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const invoices = await prisma.holdInvoice.findMany({
      where: {
        shopperUserId: req.user.id,
        status: 'PENDING', // Only show unpaid invoices
      },
      include: {
        reservation: {
          include: {
            item: {
              include: {
                sale: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(invoices.map(inv => ({
      id: inv.id,
      status: inv.status,
      totalAmount: inv.totalAmount,
      platformFeeAmount: inv.platformFeeAmount,
      stripeSessionId: inv.stripeSessionId,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      item: inv.reservation?.item,
    })));
  } catch (error: any) {
    console.error('[invoices] getMyInvoices error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/items/:itemId/invoice-status — public query for item invoice status
// Auth: None (public)
export const getItemInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        reservation: {
          include: {
            invoice: true,
          },
        },
      },
    });

    if (!item || !item.reservation || !item.reservation.invoice) {
      return res.json({
        invoiceExists: false,
        invoiceStatus: null,
        expiresAt: null,
        stripeSessionId: null,
      });
    }

    res.json({
      invoiceExists: true,
      invoiceStatus: item.reservation.invoice.status,
      expiresAt: item.reservation.invoice.expiresAt,
      stripeSessionId: item.reservation.invoice.stripeSessionId,
    });
  } catch (error: any) {
    console.error('[invoices] getItemInvoiceStatus error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/reservations/:id/release-invoice — organizer cancels a PENDING invoice
// Auth: ORGANIZER only
export const releaseInvoice = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) return res.status(403).json({ message: 'Organizers only' });

    const { id: reservationId } = req.params;

    const reservation = await prisma.itemReservation.findUnique({
      where: { id: reservationId },
      include: {
        item: {
          include: {
            sale: true,
          },
        },
        invoice: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (!reservation.invoice) return res.status(404).json({ message: 'No invoice found for this reservation' });
    if (reservation.invoice.status !== 'PENDING') {
      return res.status(409).json({ message: 'Only PENDING invoices can be released' });
    }

    // Verify organizer owns the sale
    const userOrganizer2 = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });
    if (reservation.item.sale.organizerId !== userOrganizer2?.id) {
      return res.status(403).json({ message: 'Access denied — you do not own this sale' });
    }

    const stripe = require('../utils/stripe').getStripe();

    // Cancel the Stripe Checkout session
    try {
      await stripe.checkout.sessions.expire(reservation.invoice.stripeSessionId);
    } catch (stripeError: any) {
      console.warn('[hold-invoice] Failed to expire Stripe session:', stripeError);
      // Non-fatal: continue with local state update
    }

    // Update invoice status to CANCELLED
    await prisma.$transaction(async (tx) => {
      await tx.holdInvoice.update({
        where: { id: reservation.invoice!.id },
        data: { status: 'CANCELLED' },
      });

      // Return item to RESERVED status
      await tx.item.update({
        where: { id: reservation.item.id },
        data: { status: 'RESERVED' },
      });

      // Notify shopper
      await tx.notification.create({
        data: {
          userId: reservation.user.id,
          type: 'invoice_cancelled',
          title: 'Invoice cancelled',
          body: `The invoice for "${reservation.item.title}" has been cancelled. Your hold remains active.`,
          link: `/items/${reservation.item.id}`,
          channel: 'OPERATIONAL',
        },
      });
    });

    res.json({ message: 'Invoice released and hold reactivated' });
  } catch (error: any) {
    console.error('[hold-invoice] releaseInvoice error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
