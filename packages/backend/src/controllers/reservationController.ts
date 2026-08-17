import { Response, Request } from 'express';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../lib/notificationService'; // S1195 sweep continuation (2026-08-08): payment-deadline notification-gap fixes
import { getIO } from '../lib/socket';
import { pushEvent } from '../services/liveFeedService';
import { pushSaleStatus } from '../services/saleStatusService';
import { sendHoldPlacedAlert, sendHoldPlacedToShopper, sendHoldStatusToShopper } from '../services/saleAlertEmailService';
import { checkForFraud, calculateConfidenceScore } from '../services/fraudDetectionService';
import { getRankBenefits, calculateRankFromXp } from '../utils/rankUtils';
import { endEbayListingIfExists } from './ebayController'; // Feature #244 Phase 2: eBay direct push — withdraw on sale
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { checkCrewInvasion } from '../services/crewInvasionService'; // Feature #397: Crew Invasion flash discount
import { emailService } from '../lib/emailService';
import { suppressionService } from '../services/suppressionService';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';
import { snapshotForCommissionOnly } from '../utils/feeCalculator'; // RECORD-mode cash fee (2026-08-17): Purchase fee snapshot
import { resolveCashCommissionRate, cashCommissionOn, accrueCashFeeBalance, roundMoney } from '../services/cashFeeService'; // RECORD-mode cash commission accrual (2026-08-17)
import { shouldUseDirectCharge } from '../services/stripeConnectService'; // Direct-charges migration (2026-08-08): staged-rollout routing decision
import { assertCheckoutAllowed, CheckoutGuardError } from '../services/checkoutGuard'; // S1072 Finding #4: collusion/wash-trade guard
import { createPaymentLinkInternal } from './posController'; // markSold settlement router: reuse Stripe Payment Link + QR
import { invoiceableWhere, isInvoicedOrClaimed, InvoiceClaimLostError, releaseDeadInvoiceAnchors } from '../services/holdInvoiceClaim'; // Hold-to-Pay P0 (2026-08-16): non-FK invoice claim; P0 (2026-08-17): dead-anchor release
import { stripeCheckoutExpiry } from '../utils/stripeCheckoutExpiry'; // Hold-to-Pay P0 (2026-08-16): Stripe expires_at floor/ceiling clamp
import { expireCheckoutSessionSafely } from '../utils/expireCheckoutSession'; // Hold-to-Pay P1 (2026-08-17): released invoices left PAYABLE Stripe sessions live

// markSold settlement router (Decision A): settlement modes
type SettlementMode = 'RECORD' | 'POS_CART' | 'CHECKOUT_LINK';

/**
 * Resolve the default settlement mode server-side from the sale (Decision A2).
 * AUCTION and high-volume FLEA_MARKET/YARD → POS_CART.
 * Online-only sales (and ESTATE) → CHECKOUT_LINK.
 * Everything else → RECORD.
 */
function resolveDefaultSettlementMode(sale: { saleType?: string | null; isOnlineOnly?: boolean | null } | null | undefined): SettlementMode {
  if (sale?.isOnlineOnly) return 'CHECKOUT_LINK';
  const t = (sale?.saleType ?? '').toUpperCase();
  if (t === 'AUCTION' || t === 'FLEA_MARKET' || t === 'YARD' || t === 'BOOTH') return 'POS_CART';
  if (t === 'ESTATE') return 'CHECKOUT_LINK';
  return 'RECORD';
}

// Sentinel thrown from inside the markSold transaction when the idempotency claim below
// matches fewer rows than expected (a concurrent or repeat settlement). Rolls the whole
// transaction back and is translated to a 409 by the caller — never a silent no-op.
const MARKSOLD_ALREADY_SETTLED = 'MARKSOLD_ALREADY_SETTLED';

const DEFAULT_HOLD_MINUTES = 30; // Feature #121: fallback hold duration in minutes
const EN_ROUTE_RADIUS_M = 16093; // 10 miles in meters — en route grace zone

// Feature #121: GPS radius by sale type (meters)
function getGpsRadiusBySaleType(saleType: string): number {
  switch (saleType?.toUpperCase()) {
    case 'BOOTH':
    case 'YARD':
    case 'FLEA_MARKET': return 150;
    case 'AUCTION':     return 400;
    case 'ESTATE':
    default:            return 250;
  }
}

// Feature #121: Hold duration in minutes by explorer rank — DEPRECATED
// Replaced with getRankBenefits() from rankUtils.ts
// Kept for reference but not used; holdDurationMinutes now retrieved via getRankBenefits(rank).holdDurationMinutes

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
    if (item.sale?.sourceName != null && item.sale?.organizer?.isUnmanagedListing) {
      return res.status(403).json({
        message: 'This listing is not yet claimed by an organizer. Try one of our verified organizer sales.',
        code: 'UNMANAGED_LISTING'
      });
    }

    // If item is RESERVED, check whether the active reservation has actually expired.
    // The cron job runs every 10 min — don't block new holds on a stale status.
    if (item.status === 'RESERVED') {
      const activeReservation = await prisma.itemReservation.findFirst({
        where: { itemId, status: { in: ['PENDING', 'CONFIRMED'] } },
        select: { id: true, expiresAt: true },
      });
      if (activeReservation && activeReservation.expiresAt <= new Date()) {
        // Expired hold — clean up inline so the new hold can proceed
        await prisma.$transaction([
          prisma.itemReservation.update({
            where: { id: activeReservation.id },
            data: { status: 'EXPIRED' },
          }),
          prisma.item.update({
            where: { id: itemId },
            data: { status: 'AVAILABLE' },
          }),
        ]);
      } else {
        return res.status(409).json({ message: 'Item is not available for hold' });
      }
    } else if (item.status !== 'AVAILABLE') {
      return res.status(409).json({ message: 'Item is not available for hold' });
    }

    const sale = (item.sale as any);
    const holdSettings = sale?.organizer?.holdSettings;

    // Security: reject holds on items whose parent sale is not published
    if (sale?.status !== 'PUBLISHED') {
      return res.status(403).json({ message: 'This sale is not currently available for holds.' });
    }

    // S1075: ad-hoc self-dealing check removed -- checkoutGuard's assertCheckoutAllowed
    // (immediately below) is now the sole source of truth for self-dealing on this
    // endpoint, matching placeBid/createPaymentIntent and ensuring a FraudSignal
    // SELF_DEALING row is written (P3 Blocked Queue item, S1074/S1075).
    // S1072 Finding #4: collusion/wash-trade guard — identity-grade device/card fingerprint match
    try {
      await assertCheckoutAllowed({
        buyerUserId: req.user.id,
        saleId: sale.id,
        itemId: item.id,
        prisma,
        context: 'placeHold',
      });
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ message: guardError.message });
      }
      throw guardError;
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

    // Phase 2a: Enforce max concurrent holds based on rank
    const rankBenefits = getRankBenefits(explorerRank);
    const currentHolds = await prisma.itemReservation.count({
      where: {
        userId: req.user!.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
    if (currentHolds >= rankBenefits.maxConcurrentHolds) {
      return res.status(403).json({
        message: `You can only hold ${rankBenefits.maxConcurrentHolds} item${rankBenefits.maxConcurrentHolds > 1 ? 's' : ''} at a time at your current rank (${explorerRank})`,
        maxHolds: rankBenefits.maxConcurrentHolds,
        currentHolds,
      });
    }

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
          // item.saleId! — reservation path only runs for items in active sales
          item: { saleId: item.saleId! },
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
        // item.saleId! — fraud check only runs for items in active sales (reservation path)
        const fraudResult = await calculateConfidenceScore(req.user!.id, itemId, item.saleId!);
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

    // Hold duration by shopper rank — uses canonical getRankBenefits() from rankUtils.ts
    const holdMinutes = rankBenefits.holdDurationMinutes;
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

    const reservation = await prisma.$transaction(async (tx) => {
      // Clear any stale (CANCELLED/EXPIRED/COMPLETED) reservation so @unique slot is free.
      // 'COMPLETED' added 2026-08-16 alongside the markSold idempotency guard below: a
      // settled hold is terminal, and on a multi-unit item that still has stock left the
      // item legitimately returns to AVAILABLE — without this the settled row would keep
      // occupying the one-hold-per-item slot and every subsequent placeHold would fail
      // with P2002 "Item already has an active hold".
      await tx.itemReservation.deleteMany({
        where: { itemId, status: { in: ['CANCELLED', 'EXPIRED', 'COMPLETED'] } },
      });
      const r = await tx.itemReservation.create({
        data: {
          itemId,
          userId: req.user!.id,
          status: 'PENDING',
          expiresAt,
          holdDurationMinutes: holdMinutes,  // Phase 2a: Store snapshot of duration
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

    // Feature #70: Emit live feed event (item.saleId! — reservation path only runs for sale items)
    try {
      const io = getIO();
      pushEvent(io, item.saleId!, {
        type: 'HOLD_PLACED',
        itemTitle: item.title,
        saleId: item.saleId!,
        timestamp: new Date(),
      });
    } catch (err) {
      console.warn('[liveFeed] Failed to emit hold placed event:', err);
    }

    // Feature #17: Check for fraud (fire-and-forget)
    try {
      setImmediate(() => {
        checkForFraud(req.user!.id, itemId, item.saleId!).catch(err =>
          console.error('[fraud] Fraud check error:', err)
        );
      });
    } catch (err) {
      console.warn('[fraud] Failed to trigger fraud check:', err);
    }

    // Feature #14: Push sale status update (item.saleId! — reservation path always has a sale)
    try {
      const io = getIO();
      await pushSaleStatus(io, item.saleId!);
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
          // Email alert (item.saleId! — reservation path always has a sale)
          setImmediate(() => {
            sendHoldPlacedAlert({
              organizerEmail: organizer.user.email,
              organizerName: organizer.user.name,
              itemTitle: item.title,
              saleTitle: sale?.title || 'Sale',
              saleId: item.saleId!,
              shopperUserId: req.user!.id, // dedup key -- same shopper re-holding same item within cooldown won't re-notify
            }).catch(err => console.warn('[alert] Failed to send hold placed email:', err));
          });
        }
      }
    } catch (err) {
      console.error('[alert] Exception when creating organizer notification:', err);
    }

    // Feature #14: Send shopper hold-placed confirmation email (fire-and-forget)
    try {
      const shopper = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, name: true },
      });
      if (shopper) {
        setImmediate(() => {
          sendHoldPlacedToShopper({
            shopperEmail: shopper.email,
            shopperName: shopper.name,
            itemTitle: item.title,
            itemId: item.id,
            saleTitle: (item.sale as any)?.title || 'Sale',
            expiresAt: reservation.expiresAt,
          }).catch(err => console.warn('[alert] Failed to send hold placed confirmation to shopper:', err));
        });
      }
    } catch (err) {
      console.error('[alert] Exception when sending shopper hold notification:', err);
    }

    // Feature #397: Crew Invasion — check if ≥4 crew members are holding at this sale (non-blocking)
    if (item.saleId) {
      checkCrewInvasion(item.saleId, req.user!.id).catch(err =>
        console.error('[crewInvasion] check error:', err)
      );
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
    if (item && item.saleId) {
      try {
        const io = getIO();
        // item.saleId! — guarded by if (item && item.saleId) above
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
    // PRIVACY (2026-08-16): this used to return the ENTIRE ItemReservation row to any
    // anonymous caller — holder user id and name, the shopper's private note, the GPS
    // coordinates captured at hold time, and the internal fraudScore/fraudFlags. Its one
    // and only consumer is HoldTimer.tsx, which reads `expiresAt` and nothing else
    // (confirmed: `grep -rn "reservations/item" packages/frontend` → one hit). Narrowed
    // to the countdown fields; status is included so a caller can tell a live hold from
    // a settled/expired one. Do not widen this select — buyer identity on an item is
    // owner-gated in itemController.getItemById (buildHoldFieldsForViewer).
    const reservation = await prisma.itemReservation.findUnique({
      where: { itemId },
      select: { id: true, itemId: true, status: true, expiresAt: true },
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
      // P1 fix (2026-08-17): HOLD_IN_CART holds that carry an invoiceId are included.
      //
      // A POS cart invoice with no Stripe session (createCombinedInvoice, 100%-cash
      // split) can NEVER be marked paid -- markHoldInvoicePaid is the only thing that
      // writes HoldInvoice.status='PAID' and it requires a PaymentIntent, so there is no
      // cash-completion path at all. invoiceExpiryJob deliberately refuses to auto-revert
      // those (it cannot tell a collected cash sale from an abandoned one), which left
      // their items pinned at INVOICE_ISSUED with NO reclaim path whatsoever -- the
      // organizer is the only party who knows, and this page was the natural place to
      // act, but HOLD_IN_CART was filtered out of it entirely so the holds were invisible
      // here. Scoped deliberately to invoiceId != null: this surfaces only the holds that
      // are actually stuck behind an invoice, not the organizer's whole live POS cart.
      OR: [
        { status: { in: ['PENDING', 'CONFIRMED'] } },
        { status: 'HOLD_IN_CART', invoiceId: { not: null } },
      ],
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
        // Must mirror getOrganizerHolds' filter exactly (2026-08-17) -- a badge that
        // disagrees with the list it links to is its own bug. See the note there for why
        // invoiced HOLD_IN_CART rows are included.
        OR: [
          { status: { in: ['PENDING', 'CONFIRMED'] } },
          { status: 'HOLD_IN_CART', invoiceId: { not: null } },
        ],
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

    const { ids, action, settlementMode: requestedMode } = req.body as {
      ids: string[];
      action: string;
      settlementMode?: SettlementMode;
    };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array is required' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ message: 'Maximum 50 holds per batch operation' });
    }
    if (!['release', 'extend', 'markSold'].includes(action)) {
      return res.status(400).json({ message: 'action must be release, extend, or markSold' });
    }
    if (requestedMode && !['RECORD', 'POS_CART', 'CHECKOUT_LINK'].includes(requestedMode)) {
      return res.status(400).json({ message: 'settlementMode must be RECORD, POS_CART, or CHECKOUT_LINK' });
    }

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    // ─── markSold settlement router (Decision A) ──────────────────────────────
    // POS_CART and CHECKOUT_LINK are handled here (they need Stripe / session work
    // outside the simple status transaction). RECORD falls through to the existing
    // transaction below, which is the only path that flips AVAILABLE→SOLD directly.
    if (action === 'markSold') {
      // Fetch holds + sale context to resolve the default settlement mode and verify ownership.
      const routedHolds = await prisma.itemReservation.findMany({
        where: { id: { in: ids }, status: { in: ['PENDING', 'CONFIRMED'] } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          item: { include: { sale: true } },
        },
      });
      const validRouted = routedHolds.filter((h) => h.item.sale?.organizerId === organizer.id);
      if (validRouted.length === 0) {
        return res.status(404).json({ message: 'No valid holds found' });
      }

      // A hold that already has an invoice (or a live in-flight claim from
      // markSoldAndCreateInvoice) has a Stripe payment pending against it. Settling it
      // again through ANY mode double-sells the item — RECORD would write a second,
      // cash-flavoured PAID Purchase row for something the shopper is about to pay for
      // online. POS_CART already refused this case; hoisted here 2026-08-16 so RECORD and
      // CHECKOUT_LINK are covered by the same rule instead of only one of the three.
      // The in-flight claim now lives in invoiceClaimToken/invoiceClaimedAt rather than
      // in invoiceId, so this MUST use isInvoicedOrClaimed — a bare `h.invoiceId` check
      // here would be blind to it and re-open the cross-path double-sell window.
      const alreadyInvoiced = validRouted.find(isInvoicedOrClaimed);
      if (alreadyInvoiced) {
        return res.status(409).json({
          message: 'One or more of these holds already has a payment request out. Release that invoice first.',
        });
      }

      // Resolve mode: explicit request wins; otherwise default from the (first) sale.
      const settlementMode: SettlementMode =
        requestedMode ?? resolveDefaultSettlementMode(validRouted[0].item.sale);

      // ── POS_CART: do NOT finalize. Add items to the active POS cart (HOLD_IN_CART). ──
      // Item status is unchanged until POS checkout completes. Never flips to SOLD here.
      if (settlementMode === 'POS_CART') {
        const saleId = validRouted[0].item.saleId;
        if (!saleId) return res.status(400).json({ message: 'Holds are not attached to a sale' });

        // All selected holds must belong to the same sale (POS cart is sale-scoped).
        const mismatched = validRouted.find((h) => h.item.saleId !== saleId);
        if (mismatched) {
          return res.status(400).json({ message: 'POS cart requires all holds to be from the same sale' });
        }
        // (Already-invoiced holds are rejected for every mode above — this local check
        // is left in place as defence in depth for this path specifically.)
        const invoiced = validRouted.find(isInvoicedOrClaimed);
        if (invoiced) {
          return res.status(409).json({ message: 'One or more holds already have an invoice' });
        }

        // Find (or create) the active OPEN POS session for this sale + shopper.
        const shopperId = validRouted[0].userId;
        let posSession = await prisma.pOSSession.findFirst({
          where: {
            saleId,
            shopperId,
            status: { in: ['OPEN', 'PULLED'] },
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!posSession) {
          posSession = await prisma.pOSSession.create({
            data: {
              organizerId: organizer.id,
              saleId,
              shopperId,
              cartItems: [],
              status: 'OPEN',
              expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
            },
          });
        }

        // Transition reservations to HOLD_IN_CART (reuses pullHoldsToCart semantics).
        const validIds = validRouted.map((h) => h.id);
        await prisma.itemReservation.updateMany({
          where: { id: { in: validIds } },
          data: { status: 'HOLD_IN_CART' },
        });

        const cartCount = await prisma.itemReservation.count({
          where: {
            item: { saleId },
            userId: shopperId,
            status: 'HOLD_IN_CART',
          },
        });

        return res.json({
          settlementMode,
          sessionId: posSession.id,
          cartCount,
          updated: validRouted.length,
          failed: ids.length - validRouted.length,
        });
      }

      // ── CHECKOUT_LINK: generate Stripe Payment Link + QR. Set INVOICE_ISSUED. ──
      // Item flips to SOLD ONLY via the Stripe webhook — never here.
      if (settlementMode === 'CHECKOUT_LINK') {
        const saleId = validRouted[0].item.saleId;
        if (!saleId) return res.status(400).json({ message: 'Holds are not attached to a sale' });
        const mismatched = validRouted.find((h) => h.item.saleId !== saleId);
        if (mismatched) {
          return res.status(400).json({ message: 'Checkout link requires all holds to be from the same sale' });
        }

        const itemIds = validRouted.map((h) => h.item.id);
        const amount = validRouted.reduce((sum, h) => sum + (h.item.price || 0), 0);
        if (amount <= 0) {
          return res.status(400).json({ message: 'Cannot create a checkout link for $0' });
        }

        // Reclaim-gap fix (2026-08-04): CHECKOUT_LINK previously created a Stripe Payment
        // Link with no expiry tracking at all -- an abandoned link left its item(s) stuck
        // at INVOICE_ISSUED forever, with zero rows in HoldInvoice for invoiceExpiryJob.ts
        // to find (Payment Links are a different Stripe object than Checkout Sessions and
        // predate/postdate that job's design). Fix: derive a real expiry from the
        // underlying hold(s), same as LOCKED DECISION #7 does for the Checkout-Session
        // path ("payment window = hold timer remainder / earliest expiry"), and pass it
        // through so the resulting POSPaymentLink row is reclaimable. See
        // posStrandedSaleReconcileCron.ts's expiry-based reclaim branch, which now scans
        // ACTIVE POSPaymentLink rows past their own expiresAt, verifies via Stripe that
        // the link genuinely was never paid, and reverts the item(s) if so.
        const linkExpiresAt = new Date(Math.min(...validRouted.map((h) => h.expiresAt.getTime())));

        let linkResult;
        try {
          linkResult = await createPaymentLinkInternal({
            organizerId: organizer.id,
            stripeConnectId: (organizer as any).stripeConnectId ?? null,
            subscriptionTier: (organizer as any).subscriptionTier ?? null,
            saleId,
            itemIds,
            amount,
            buyerEmail: validRouted[0].user.email,
            expiresAt: linkExpiresAt,
          });
        } catch (stripeErr: any) {
          console.error('[settlement] CHECKOUT_LINK payment link creation failed:', stripeErr);
          return res.status(400).json({
            message: 'Failed to create checkout link',
            error: stripeErr?.message,
          });
        }

        // Set items to INVOICE_ISSUED (intermediate). Webhook flips to SOLD on payment.
        await prisma.item.updateMany({
          where: { id: { in: itemIds } },
          data: { status: 'INVOICE_ISSUED' },
        });

        // Notify the shopper an invoice/checkout link is ready.
        // Notification-gap fix (S1195 sweep continuation, 2026-08-08): "payment
        // requested" is a real deadline -- the checkout link expires at linkExpiresAt
        // (derived from the hold's own timer above) -- so the shopper needs this
        // promptly, not just whenever they next happen to open the app. Previously
        // in-app-only via a raw prisma.notification.create with no email path
        // available.
        try {
          await createNotification({
            userId: validRouted[0].userId,
            type: 'invoice_sent',
            title: 'Payment requested',
            body: `Payment requested for ${itemIds.length > 1 ? `${itemIds.length} items` : `"${validRouted[0].item.title}"`}. Tap to pay securely.`,
            link: `/items/${itemIds[0]}`,
            channel: 'OPERATIONAL',
            sendEmail: true,
          });
        } catch (notifErr) {
          console.warn('[settlement] Failed to create checkout notification:', notifErr);
        }

        return res.json({
          settlementMode,
          linkId: linkResult.linkId,
          paymentLinkUrl: linkResult.paymentLinkUrl,
          qrCodeDataUrl: linkResult.qrCodeDataUrl,
          amount: linkResult.amount,
          itemCount: itemIds.length,
          updated: validRouted.length,
          failed: ids.length - validRouted.length,
        });
      }

      // settlementMode === 'RECORD' falls through to the transaction below.
    }

    // RECORD-mode commission rate (2026-08-17). RECORD is a CASH / in-person settlement: the
    // organizer collects the money themselves and FindA.Sale's Stripe account never sees it,
    // so there is no application_fee_amount to take the commission out of. The commission is
    // still owed on every sale type (see utils/feeCalculator.ts) and is accrued to
    // Organizer.cashFeeBalance inside the transaction below, exactly as
    // terminalController's cash sale does -- both now go through services/cashFeeService.ts so
    // they cannot drift. Resolved OUT here (one FeeStructure read) rather than per item inside
    // the transaction, so the transaction stays short.
    //
    // The rate is resolved SERVER-SIDE from the organizer's own record. It is never read from
    // the request: the body of this endpoint is destructured to { ids, action, settlementMode }
    // above and carries no fee, rate or balance field a client could supply.
    const recordCommissionRate =
      action === 'markSold' ? await resolveCashCommissionRate(organizer) : 0;

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
      // Also exclude already-SOLD items to prevent duplicate Purchase records on re-submit
      const validHolds = holds.filter((h) => h.item.sale?.organizerId === organizer.id && h.item.status !== 'SOLD');
      if (validHolds.length === 0) {
        throw new Error('No valid holds found');
      }

      const validIds = validHolds.map((h) => h.id);
      const validItemIds = validHolds.map((h) => h.item.id);
      // Collect items that ACTUALLY transitioned to fully SOLD on this markSold path.
      // Only these should have their external listings (eBay/Shopify/FB) pulled — a
      // multi-unit item that still has remaining stock stays listed.
      const soldOutItemIds: string[] = [];
      // ADR-087 Phase 4: items that sold PARTIALLY (stock remains) on this markSold
      // path — these need their live eBay listing quantity revised, not withdrawn.
      const partialSaleUpdates: { itemId: string; remainingStock: number }[] = [];
      // RECORD mode only: the total commission accrued to the organizer's cash-fee balance
      // by this settlement, reported back to the organizer in the response.
      let recordCommissionAccrued = 0;

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
          const rankBenefits = getRankBenefits(rank);
          const holdMinutes = rankBenefits.holdDurationMinutes;
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
        // RECORD settlement mode (Decision A): the ONLY path that flips AVAILABLE→SOLD
        // directly (the other direct-SOLD writer is the Stripe webhook). Records the
        // sale as a cash/in-person Purchase for each item.
        //
        // IDEMPOTENCY GUARD (2026-08-16). This block used to write status:'CONFIRMED' —
        // i.e. it left every settled hold in exactly the state that makes it eligible to
        // be marked sold AGAIN. The row stayed on /organizer/holds still showing
        // CONFIRMED and still offering "Mark Sold", so it read as a no-op button; each
        // further click wrote another PAID Purchase row and decremented stock again.
        // Confirmed in production: one organizer clicked three times and created three
        // duplicate PAID Purchase rows with stock down by 3. The `item.status !== 'SOLD'`
        // filter above only ever caught the single-unit case — a multi-unit item keeps
        // its non-SOLD status after a partial sale and sailed straight through it.
        //
        // Fix: settle the hold into the terminal 'COMPLETED' state with a CONDITIONAL
        // updateMany whose WHERE re-checks PENDING/CONFIRMED. Under Postgres READ
        // COMMITTED the second of two concurrent transactions blocks on the row lock,
        // re-evaluates that WHERE after the first commits, matches zero rows, and aborts
        // the whole transaction — so a double-submit can never double-write. 'COMPLETED'
        // is a new terminal value for this String column (no migration needed) and is
        // excluded by every `status: { in: ['PENDING','CONFIRMED'] }` filter in the
        // codebase, which is what makes the row disappear from the organizer's holds
        // list once it is settled.
        const claim = await tx.itemReservation.updateMany({
          where: {
            id: { in: validIds },
            status: { in: ['PENDING', 'CONFIRMED'] }, // idempotency claim — re-checked at row-lock time
            item: { sale: { organizerId: organizer.id } } // re-verify ownership in where clause
          },
          data: { status: 'COMPLETED' },
        });
        if (claim.count !== validIds.length) {
          // Someone else settled at least one of these holds between our read and this
          // write. Abort everything — no partial settlement, no duplicate Purchase rows.
          throw new Error(MARKSOLD_ALREADY_SETTLED);
        }
        // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement replaces the
        // old unconditional status update. Capture which items became fully SOLD so the
        // post-transaction eBay/Shopify/FB removal hooks only fire for those (a multi-unit
        // item with remaining stock stays AVAILABLE and must keep its external listing).
        for (const itemId of validItemIds) {
          try {
            const stockResult = await sellItemUnits(itemId, 1, tx);
            if (stockResult.fullySoldOut) {
              soldOutItemIds.push(itemId);
            } else {
              partialSaleUpdates.push({ itemId, remainingStock: stockResult.remainingStock });
            }
          } catch (stockErr: any) {
            if (stockErr instanceof InsufficientStockError) {
              console.error(`[reservations] Oversold race on item ${itemId} during markSold:`, stockErr.message);
            }
            throw stockErr;
          }
        }
        // The hold that reserved these items is now terminal (COMPLETED, above). For a
        // multi-unit item with stock remaining, sellItemUnits deliberately leaves
        // Item.status untouched — which previously stranded the item at RESERVED with no
        // live hold behind it: not buyable, not holdable, until the expiry cron happened
        // to sweep it. Release the remaining stock back to AVAILABLE. Guarded on
        // status:'RESERVED' so an INVOICE_ISSUED or already-SOLD item is never walked
        // backwards.
        if (partialSaleUpdates.length > 0) {
          await tx.item.updateMany({
            where: { id: { in: partialSaleUpdates.map((p) => p.itemId) }, status: 'RESERVED' },
            data: { status: 'AVAILABLE' },
          });
        }
        // Record the cash transaction for each sold item (RECORD mode).
        //
        // REVENUE-LEAK FIX (2026-08-17). This block used to write `platformFeeAmount: 0` and
        // touch nothing else, on the reasoning that a cash sale is money the platform never
        // handles. That is true of the MONEY and false of the FEE: the organizer commission
        // (10% SIMPLE / 8% PRO+TEAMS, utils/feeCalculator.ts) is owed on every sale type, cash
        // included, and the mechanism for collecting it on money we never touch already
        // existed and already worked -- terminalController's cash sale accrues it to
        // Organizer.cashFeeBalance, and payoutController nets that balance out of the
        // organizer's next Stripe payout. RECORD mode simply never called it, so FindA.Sale
        // earned $0.00 on every cash sale settled from the holds screen. On a $100 cash sale a
        // SIMPLE organizer now owes $10.00 against their next payout, where they previously
        // owed nothing.
        //
        // FEE SNAPSHOT: written now, deliberately, reversing the "leave it NULL" note that
        // stood here while the fee question was open. A populated snapshot puts these rows on
        // the authoritative branch of resolveOrganizerFeeReport, which is the point -- the fee
        // an organizer is shown for this sale is then the exact number that was added to their
        // cash-fee balance, pinned at settlement time, instead of `amount * theirCurrentTierRate`
        // recomputed on every page load. Commission-only: RECORD is never an auction lot (an
        // auction settles through the bid/checkout path), so the buyer-premium fields record a
        // hard 0 rather than null. INVARIANT held here:
        // platformFeeAmount == buyerPremiumAmount + commissionAmount.
        const recordPurchaseRows = validHolds.map((h) => {
          const amount = h.item.price || 0;
          const commission = cashCommissionOn(amount, recordCommissionRate);
          return {
            itemId: h.item.id,
            saleId: h.item.saleId,
            userId: h.userId,
            amount,
            platformFeeAmount: commission,
            ...snapshotForCommissionOnly(commission, recordCommissionRate),
            status: 'PAID',
            source: 'POS',
          };
        });
        await tx.purchase.createMany({ data: recordPurchaseRows });

        // Accrue the commission against the organizer's next payout. Inside the SAME
        // transaction as the idempotency claim and the Purchase rows above, so the debt can
        // never outlive a settlement that rolled back -- and, because the claim already
        // guarantees each hold is settled at most once, it can never be accrued twice for the
        // same sale. (terminalController's equivalent runs outside its transaction; this one
        // is strictly safer, and both now share services/cashFeeService.ts.)
        recordCommissionAccrued = await accrueCashFeeBalance({
          organizerId: organizer.id,
          commission: recordPurchaseRows.reduce((sum, r) => sum + r.platformFeeAmount, 0),
          tx,
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

      return { updated: validHolds.length, failed: ids.length - validHolds.length, holds: validHolds, soldOutItemIds, partialSaleUpdates, recordCommissionAccrued };
    }).catch((err) => {
      if (err.message === 'No valid holds found') {
        return { updated: 0, failed: ids.length, holds: [], soldOutItemIds: [], partialSaleUpdates: [], recordCommissionAccrued: 0 };
      }
      if (err.message === MARKSOLD_ALREADY_SETTLED) {
        return { updated: 0, failed: ids.length, holds: [], soldOutItemIds: [], partialSaleUpdates: [], recordCommissionAccrued: 0, alreadySettled: true };
      }
      throw err;
    });

    // Idempotency guard tripped: nothing was written. 409 (not a 200 with updated:0) so
    // the organizer gets a real "already handled" message instead of a silent no-op.
    if ((result as any).alreadySettled) {
      return res.status(409).json({
        message: 'Those holds have already been settled. Refresh to see the latest.',
        updated: 0,
        failed: ids.length,
      });
    }

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

      // Fire-and-forget: pull external listings (eBay/Shopify/FB) for items actually
      // marked SOLD on the RECORD markSold path. Bug fix: previously guarded by
      // `action === 'sold'`, a value this endpoint never produces (valid actions are
      // release | extend | markSold), so the hooks were dead code and cash/in-person
      // sales never pulled the cross-channel listing. Fire only for items that fully
      // sold out (soldOutItemIds) — a multi-unit item with remaining stock stays listed.
      if (action === 'markSold') {
        const soldOutIds = new Set<string>(((result as any).soldOutItemIds as string[]) ?? []);
        const seen = new Set<string>();
        const soldOutHolds = batchHolds.filter((h) => {
          if (!soldOutIds.has(h.item.id) || seen.has(h.item.id)) return false;
          seen.add(h.item.id);
          return true;
        });
        if (soldOutHolds.length > 0) {
          setImmediate(() => {
            Promise.allSettled(
              soldOutHolds.map((h) => endEbayListingIfExists(h.item.id))
            ).catch(() => {});
            Promise.allSettled(
              soldOutHolds.map((h) => markShopifyItemSold(h.item.id))
            ).catch(() => {});
            Promise.allSettled(
              soldOutHolds.map((h) => notifyFacebookExportedItemSold(h.item.id))
            ).catch(() => {});
          });
        }

        // ADR-087 Phase 4: partial sales (stock remains) — revise eBay listing
        // quantities for any eBay-linked items in this batch. Fire-and-forget,
        // mirrors the soldOutHolds shape above exactly.
        const partialUpdatesList = ((result as any).partialSaleUpdates as { itemId: string; remainingStock: number }[]) ?? [];
        if (partialUpdatesList.length > 0) {
          setImmediate(() => {
            Promise.allSettled(
              partialUpdatesList.map(({ itemId, remainingStock }) =>
                syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock })
              )
            ).catch(() => {});
          });
        }
      }
    }

    const { holds: _holds, soldOutItemIds: _soldOutItemIds, partialSaleUpdates: _partialSaleUpdates, recordCommissionAccrued: _recordCommissionAccrued, alreadySettled: _alreadySettled, ...responseResult } = result as any;

    if (action !== 'markSold') {
      return res.json(responseResult);
    }

    // RECORD mode: tell the organizer what this cash sale just cost them. A cash sale creates a
    // real debt against their next payout (payoutController nets cashFeeBalance out of it), and
    // an organizer who is never shown that number has no way to reconcile a payout that arrives
    // smaller than they expected. `platformFee` is what THIS settlement added; `cashFeeBalance`
    // is their running total after it. Read AFTER the transaction committed so the balance
    // returned is the real post-accrual figure, not a client-side sum.
    const platformFee = roundMoney((result as any).recordCommissionAccrued ?? 0);
    let cashFeeBalance: number | null = null;
    try {
      const updatedOrganizer = await prisma.organizer.findUnique({
        where: { id: organizer.id },
        select: { cashFeeBalance: true },
      });
      cashFeeBalance = updatedOrganizer?.cashFeeBalance ?? null;
    } catch (balanceErr) {
      // Never fail an already-committed settlement over a display read.
      console.warn('[reservations] Failed to read cashFeeBalance after RECORD settlement:', balanceErr);
    }

    // Include settlementMode for RECORD so the frontend can show the correct toast copy
    res.json({
      ...responseResult,
      settlementMode: 'RECORD',
      platformFee,
      platformFeeRate: recordCommissionRate,
      cashFeeBalance,
    });
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
  // Hold-to-Pay P0 fix (2026-08-16): the in-flight claim below now lives in the
  // dedicated NON-FK columns invoiceClaimToken / invoiceClaimedAt (see
  // services/holdInvoiceClaim.ts). It previously wrote a `CLAIMING:<holdId>` sentinel
  // into ItemReservation.invoiceId, which carries a live Postgres FK to HoldInvoice.id
  // (ItemReservation_invoiceId_fkey, created by migration 20260330_add_hold_invoice but
  // never declared in schema.prisma) -- tsc accepted it, Postgres rejected it with P2003
  // on every request, and Hold-to-Pay invoice creation was 100% broken in production.
  // invoiceId once again means exactly one thing: a real HoldInvoice row exists.
  //
  // All three declared here, BEFORE the try block, so they are true function-level scope
  // and both the Stripe-error catch and the outer function catch can see them to release
  // any claim left in flight on any failure path. (Fix 2026-08-04: claimedHoldIds was
  // originally declared just inside the try block, which is its own block scope in
  // JS/TS -- the outer catch could not see it there, causing a real
  // `Cannot find name 'claimedHoldIds'` compile error caught by CI after the first push.)
  let claimToken: string | null = null;
  let holdIds: string[] = [];
  const claimedHoldIds: string[] = [];

  // Orphaned-payable-session guard (P1, 2026-08-17). The Stripe Checkout Session is
  // created BEFORE the HoldInvoice transaction below. If that transaction throws
  // (P2002 on the unique reservationId anchor, a lost claim, a DB blip), the old code
  // released the claim and returned an error while the Session stayed OPEN and
  // PAYABLE -- a live payment link for an invoice that does not exist, against items
  // that just went back on sale. Tracked at function scope (NOT inside the try, which
  // is its own block scope -- the same mistake that produced a real CI compile error
  // on claimedHoldIds) so the outer catch can close it. The account is tracked
  // alongside the id because a Direct-charge Session lives on the connected account
  // and cannot be expired with a platform-scoped call.
  let createdStripeSessionId: string | null = null;
  let createdStripeSessionAccount: string | null = null;

  // Token-scoped claim release. NEVER release by id alone: another request may have
  // legitimately stolen a stale claim on the same rows, and an id-only release would
  // clobber that live claim. Matching on invoiceClaimToken makes the release a no-op
  // unless the claim still belongs to THIS attempt.
  const releaseClaim = async () => {
    if (!claimToken) return;
    await prisma.itemReservation
      .updateMany({
        where: { id: { in: claimedHoldIds.length ? claimedHoldIds : holdIds }, invoiceClaimToken: claimToken },
        data: { invoiceClaimToken: null, invoiceClaimedAt: null },
      })
      .catch(e => console.error('[hold-invoice] Failed to release invoice claim:', e));
  };

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
    const organizer = reservation.item.sale!.organizer;
    if (organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You do not own this sale.' });
    }

    // Query ALL active reservations for this shopper at this sale
    // reservation.item.saleId! — HoldInvoice path only runs for items in active sales
    const allShopperHolds = await prisma.itemReservation.findMany({
      where: {
        item: { saleId: reservation.item.saleId! },
        userId: reservation.user.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: { item: true },
    });

    // Check for existing PENDING invoice for this shopper+sale combo
    const existingInvoice = await prisma.holdInvoice.findFirst({
      where: {
        saleId: reservation.item.saleId!,
        shopperUserId: reservation.user.id,
        status: 'PENDING',
      },
    });

    if (existingInvoice) {
      return res.json({ invoiceId: existingInvoice.id, stripeSessionId: existingInvoice.stripeSessionId, expiresAt: existingInvoice.expiresAt });
    }

    // P2 idempotency fix (fix-and-reverify batch): the existingInvoice check above is a
    // plain check-then-act read -- the window between it and the eventual
    // tx.holdInvoice.create below spans a Stripe network round-trip, so two
    // near-simultaneous mark-sold clicks (double-tap, or a client retry) could both pass
    // the check and each create their own Stripe Checkout Session + HoldInvoice for the
    // same holds. Closed with an atomic compare-and-swap claim across all the holds
    // BEFORE the Stripe call.
    //
    // P0 fix (2026-08-16): the claim is written to the dedicated non-FK columns
    // invoiceClaimToken / invoiceClaimedAt instead of the FK-bearing invoiceId column
    // (see services/holdInvoiceClaim.ts for the full incident note). claimToken is a
    // per-attempt fencing token: the finalize step inside the transaction below only
    // writes the real invoiceId onto rows still carrying THIS token, which is what makes
    // the bounded claim TTL safe -- a request whose stale claim was stolen can never
    // finalize over the top of the request that stole it. Released on any failure path
    // below (Stripe error catch + the function's outer catch) via releaseClaim().
    holdIds = allShopperHolds.map(h => h.id);
    claimToken = randomUUID();
    const claimed = await prisma.itemReservation.updateMany({
      where: {
        id: { in: holdIds },
        status: { in: ['PENDING', 'CONFIRMED'] },
        ...invoiceableWhere(),
      },
      data: { invoiceClaimToken: claimToken, invoiceClaimedAt: new Date() },
    });
    if (claimed.count !== holdIds.length) {
      // Lost the race (or a hold changed state) -- release whatever we did manage to
      // claim and reject. A concurrent call is (or just did) create the real invoice.
      await releaseClaim();
      return res.status(409).json({ message: 'One or more holds are already being invoiced.' });
    }
    claimedHoldIds.push(...holdIds);

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
            description: hold.item.title || 'Secondhand item',
            images: hold.item.photoUrls && hold.item.photoUrls.length > 0 ? [hold.item.photoUrls[0]] : [],
          },
          unit_amount_decimal: String(Math.round((hold.item.price || 0) * 100)),
        },
        quantity: 1,
      }));

      // P0-C fix (2026-08-16): this key used to be `mark-sold-invoice-${reservationId}` --
      // pinned to the reservation FOREVER (Stripe keys live 24h). Stripe saves the result of
      // the FIRST request under a key, error responses included, and returns
      // "Keys for idempotent requests can only be used with the same parameters" as soon as
      // any parameter changes. So the instant one attempt failed (e.g. the expires_at 400
      // fixed above), EVERY subsequent attempt on that hold was poisoned for 24 hours --
      // and the remedy the UI offers, "Extend (+30min)", is precisely what changes
      // expires_at and guarantees the parameter mismatch. A hold that failed to invoice
      // could never be invoiced again.
      //
      // WHAT THE KEY STILL GUARDS after this change: the double-submit / concurrent-request
      // race is NOT its job any more -- the atomic invoiceClaimToken compare-and-swap above
      // (shipped and confirmed working) is the real guard, and a genuinely concurrent second
      // request is rejected with a 409 before it ever reaches this call. What remains, and
      // what this key still covers, is a retry of THIS SAME attempt below the application
      // layer: the Stripe SDK's own automatic retry of a transient timeout/5xx, or a
      // connection reset where the Session may or may not have been created server-side.
      // Scoping the key to claimToken (a fresh randomUUID per attempt, generated before the
      // Stripe call) is exactly right for that: constant within one attempt, different on
      // every new attempt.
      const idempotencyKey = `mark-sold-invoice-${reservationId}-${claimToken}`;

      // P0-B fix (2026-08-16): Stripe rejects expires_at under 30 minutes from Session
      // creation. LOCKED DECISION #7 makes the invoice window the hold-timer REMAINDER, and
      // the default shopper rank (INITIATE) holds for 30 minutes total -- so the remainder
      // was ALWAYS below Stripe's floor and every call 400'd. Clamp ONLY the value handed to
      // Stripe; HoldInvoice.expiresAt below stays the true business deadline (#7 intact).
      // See utils/stripeCheckoutExpiry.ts for the accepted-divergence note when the floor
      // bites (Stripe session outlives the hold by up to ~31 min).
      const checkoutExpiry = stripeCheckoutExpiry(expiresAt);
      if (checkoutExpiry.clampedTo) {
        console.warn(
          `[hold-invoice] Stripe expires_at clamped to ${checkoutExpiry.clampedTo} for reservation ${reservationId}: ` +
          `hold/invoice deadline ${expiresAt.toISOString()} -> Stripe session expiry ${checkoutExpiry.effectiveExpiresAt.toISOString()}. ` +
          `The Checkout Session and HoldInvoice.expiresAt intentionally disagree; invoiceExpiryJob still governs the real deadline.`
        );
      }

      // Direct-charges migration (2026-08-08): staged-rollout routing decision. NOTE: this
      // call site's existing shape (below) already omits on_behalf_of -- a pre-existing,
      // partial destination-charge shape confirmed this session -- left as-is on the non-
      // Direct path; out of scope to "fix" beyond what this migration specs.
      const useDirect = organizer.stripeConnectId
        ? await shouldUseDirectCharge(organizer.id, organizer.stripeConnectId)
        : false;

      stripeSession = await stripe.checkout.sessions.create(
        {
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: reservation.user.email,
          line_items,
          success_url: `${baseUrl}/items?paymentStatus=success`,
          cancel_url: `${baseUrl}/items?paymentStatus=cancelled`,
          expires_at: checkoutExpiry.expiresAtUnix, // clamped into Stripe's 30min..24h window (P0-B)
          // LOCKED DECISION #1: Organizer absorbs Stripe fee via application_fee_amount
          // (+ transfer_data on the non-Direct path only -- see useDirect above).
          payment_intent_data: {
            metadata: {
              invoiceId: null, // Will be filled after HoldInvoice is created
              itemIds: bundledItemIds.join(','), // Comma-separated item IDs
              shopperId: reservation.user.id,
              organizerId: organizer.id,
              // reservation.item.saleId! — HoldInvoice path only runs for items in active sales
              saleId: reservation.item.saleId!,
            },
            application_fee_amount: Math.round(totalPlatformFeeAmount * 100),
            // Direct-charges migration (2026-08-08): a Direct charge lives on the connected
            // account itself -- no platform-side Transfer exists, so transfer_data is
            // dropped on that path (the { stripeAccount } request option below routes the
            // Session create call itself to the connected account).
            ...(useDirect ? {} : { transfer_data: { destination: organizer.stripeConnectId } }),
          },
          metadata: {
            organizerId: organizer.id,
          },
        },
        { idempotencyKey, ...(useDirect ? { stripeAccount: organizer.stripeConnectId! } : {}) }
      );

      // Record what we just created so any later failure can close it (see the
      // orphaned-payable-session guard note at the top of this function).
      createdStripeSessionId = stripeSession?.id ?? null;
      createdStripeSessionAccount = useDirect ? organizer.stripeConnectId ?? null : null;
    } catch (stripeError: any) {
      console.error('[hold-invoice] Stripe session creation failed:', stripeError);
      // P2 idempotency fix: release the claim taken above so these holds aren't
      // permanently stuck unable to be invoiced.
      await releaseClaim();
      return res.status(400).json({ message: 'Failed to create Stripe checkout session', error: stripeError.message });
    }

    // Create HoldInvoice record in transaction with item + reservation updates
    const transaction = await prisma.$transaction(async (tx) => {
      // P0 fix (2026-08-17): HoldInvoice.reservationId is @unique and, before this,
      // nothing ever nulled it -- so a single released or expired invoice bricked that
      // hold forever with P2002 on the next attempt. Every terminal transition now
      // nulls the anchor, and this clears any dead anchor left behind before that
      // shipped. Scoped to CANCELLED/EXPIRED only: a PENDING or PAID invoice's anchor
      // is live/historical and must never be stolen. See services/holdInvoiceClaim.ts.
      await releaseDeadInvoiceAnchors(tx, holdIds);

      const holdInvoice = await tx.holdInvoice.create({
        data: {
          reservationId: reservationId, // Store first reservation for backward compatibility
          shopperUserId: reservation.user.id,
          // P0-A fix (2026-08-16): this wrote `organizer.id` -- an Organizer.id -- into a
          // column whose FK is HoldInvoice_organizerUserId_fkey -> User(id) (schema.prisma
          // HoldInvoice.organizer @relation("OrganizerInvoices")). Postgres rejected every
          // insert with P2003 and Hold-to-Pay was 100% broken with an empty HoldInvoice
          // table platform-wide. `organizer` here is the Organizer row off
          // reservation.item.sale.organizer (see the ownership check above, which compares
          // organizer.userId to req.user.id), so its OWNING user is organizer.userId.
          organizerUserId: organizer.userId,
          // reservation.item.saleId! — HoldInvoice path only runs for items in active sales
          saleId: reservation.item.saleId!,
          stripeSessionId: stripeSession.id,
          totalAmount: Math.round(totalAmount * 100),
          platformFeeAmount: Math.round(totalPlatformFeeAmount * 100),
          itemIds: bundledItemIds,
          status: 'PENDING',
          expiresAt,
        },
      });

      // Update ALL bundled ItemReservations with the real invoiceId and clear the claim.
      // Fencing check (P0 fix, 2026-08-16): scoping this to rows still carrying THIS
      // attempt's claimToken is what makes the bounded claim TTL safe. If another request
      // stole a stale claim on these holds while this one was inside the Stripe call, the
      // token no longer matches, count falls short, and the whole transaction rolls back
      // rather than stamping a second invoice over the winner's rows.
      const finalize = await tx.itemReservation.updateMany({
        where: { id: { in: holdIds }, invoiceClaimToken: claimToken },
        data: { invoiceId: holdInvoice.id, invoiceClaimToken: null, invoiceClaimedAt: null },
      });
      if (finalize.count !== holdIds.length) throw new InvoiceClaimLostError();

      // Update ALL bundled items to INVOICE_ISSUED (LOCKED DECISION #6)
      await tx.item.updateMany({
        where: { id: { in: bundledItemIds } },
        data: { status: 'INVOICE_ISSUED' },
      });

      return holdInvoice;
    });

    // The Session now belongs to a real, live HoldInvoice -- it must NOT be closed by
    // the orphan guard in the outer catch if anything downstream (notification, metadata
    // backfill, email) throws. Clearing the handle is what makes that guard safe to leave
    // unconditional.
    createdStripeSessionId = null;
    createdStripeSessionAccount = null;

    // Create notification for shopper (LOCKED DECISION #5) — mention all items.
    // Notification-gap fix (S1195 sweep continuation, 2026-08-08): moved outside the
    // transaction above (was a raw tx.notification.create, which made email
    // structurally impossible -- the shared createNotification() helper writes through
    // the global `prisma` client, not a $transaction's `tx`) and given sendEmail: true.
    // "Complete payment before your hold expires" is a real deadline -- exactly the
    // class of event this sweep is closing the email gap for.
    const itemList = bundledItemIds.length > 1
      ? `${bundledItemIds.length} items`
      : `"${allShopperHolds[0]?.item.title}"`;

    createNotification({
      userId: reservation.user.id,
      type: 'invoice_sent',
      title: 'Payment requested',
      body: `Payment requested for ${itemList}. Complete payment before your hold expires.`,
      link: `/items/${bundledItemIds[0]}`,
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err: unknown) => console.error(`[hold-invoice] Failed to create invoice_sent notification for user ${reservation.user.id}:`, err));

    // Payments fix (2026-08-03): backfill invoiceId onto the PaymentIntent's metadata
    // now that the HoldInvoice row (and its ID) exists -- it didn't exist yet when the
    // Checkout Session was created above (see the metadata.invoiceId: null placeholder
    // in payment_intent_data above -- this is what actually fills it in). The
    // charge.succeeded webhook keys off paymentIntent.metadata.invoiceId, so without
    // this backfill a payment on this invoice would never be recorded by the webhook
    // (see holdInvoicePaymentRecorder.ts header comment; invoiceExpiryJob's
    // STRANDED-PAID reconcile branch is the backstop for any invoice this still
    // misses). Stripe's metadata.update REPLACES the whole map, so every existing key
    // must be re-sent, not just the new one. Non-fatal -- never blocks invoice
    // creation, matches the checkout.session.completed handler's existing non-fatal
    // PaymentIntent-retrieve pattern in stripeController.ts.
    const stripePaymentIntentId = typeof stripeSession.payment_intent === 'string'
      ? stripeSession.payment_intent
      : (stripeSession.payment_intent as any)?.id ?? null;
    if (stripePaymentIntentId) {
      try {
        await stripe.paymentIntents.update(stripePaymentIntentId, {
          metadata: {
            itemIds: bundledItemIds.join(','),
            shopperId: reservation.user.id,
            organizerId: organizer.id,
            saleId: reservation.item.saleId!,
            invoiceId: transaction.id,
          },
        });
      } catch (metaErr: any) {
        const metaErrMsg = `[hold-invoice] Non-fatal: failed to backfill invoiceId metadata onto PaymentIntent ${stripePaymentIntentId} for invoice ${transaction.id}: ${metaErr?.message ?? metaErr}`;
        console.error(metaErrMsg);
        // Visible alerting, not just a log line: this invoice now depends entirely on
        // invoiceExpiryJob's STRANDED-PAID reconcile backstop (which only fires after
        // the invoice's own expiresAt passes) with zero interim visibility otherwise.
        try {
          Sentry.captureException(metaErr instanceof Error ? metaErr : new Error(metaErrMsg), {
            tags: { area: 'hold-invoice-metadata-backfill' },
            extra: { invoiceId: transaction.id, stripePaymentIntentId },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    }

    // Send checkout email to shopper (fire-and-forget)
    setImmediate(async () => {
      try {
        
        const expiryTime = new Date(expiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
          const itemList = bundledItemIds.length > 1
            ? `${bundledItemIds.length} items from ${reservation.item.sale!.title}`
            : `${allShopperHolds[0]?.item.title} from ${reservation.item.sale!.title}`;

          if (await suppressionService.isHardSuppressed(reservation.user.email)) {
            console.log(`[hold-invoice] Skipping hard-suppressed recipient: ${reservation.user.email}`);
            return;
          }
          await emailService.emails.send({
            from: process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale',
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
    // P2 idempotency fix: release any claim still held (e.g. the final invoice
    // transaction itself threw) so these holds aren't permanently stuck.
    await releaseClaim();

    // P1 fix (2026-08-17): close the Checkout Session too. Reaching this catch after
    // the Session was created means no HoldInvoice exists for it, the holds have just
    // been un-claimed and the items are back in play -- leaving that link OPEN would
    // let the shopper pay for an item nobody is tracking a payment for. Never allowed
    // to mask the original error.
    if (createdStripeSessionId) {
      await expireCheckoutSessionSafely(createdStripeSessionId, {
        stripeAccount: createdStripeSessionAccount,
        context: `markSoldAndCreateInvoice orphan reservation=${req.params?.id}`,
      }).catch(e => console.error('[hold-invoice] Failed to close orphaned checkout session:', e));
    }

    if (error instanceof InvoiceClaimLostError) {
      return res.status(409).json({ message: 'Another payment request for these holds completed first.' });
    }

    // Information-disclosure fix (P2, 2026-08-16): this used to return `error.message`
    // straight to the client, which handed any authenticated organizer the raw Prisma
    // error string -- internal model, field and constraint names included (e.g.
    // "Invalid `prisma.itemReservation.updateMany()` invocation: Foreign key constraint
    // violated: ItemReservation_invoiceId_fkey"). The detail is logged above; the client
    // gets a generic message.
    res.status(500).json({ message: 'Could not create the payment request. Please try again.' });
  }
};

// GET /api/reservations/:invoiceIdOrReservationId/invoice — fetch invoice details
// Auth: Shopper (owns invoice) or Organizer (issued it)
export const getInvoiceDetails = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    // P1 fix (2026-08-17, found by live Chrome QA): this read `req.params.invoiceId`,
    // but the route that mounts it declares `:invoiceIdOrReservationId`
    // (routes/reservations.ts). Express only populates the names the route declares, so
    // the destructure produced `undefined` and every single call became
    // `findUnique({ where: { id: undefined } })` -> Prisma throws -> 500. Not one
    // request to this endpoint had ever succeeded.
    //
    // The param name is honoured rather than renamed: the route deliberately accepts
    // EITHER identifier (a shopper following an emailed link has the invoice id; an
    // organizer looking at a hold card has the reservation id), and only the invoice-id
    // half was ever implemented. Both are resolved below. The legacy `invoiceId` /
    // generic `id` names are still read as a fallback so a future route rename cannot
    // silently reintroduce this exact bug.
    const identifier =
      req.params.invoiceIdOrReservationId ?? req.params.invoiceId ?? req.params.id;
    if (!identifier) return res.status(400).json({ message: 'Invoice or reservation id is required' });

    let invoice = await prisma.holdInvoice.findUnique({
      where: { id: identifier },
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

    if (!invoice) {
      // Treat the identifier as an ItemReservation id. Match on BOTH links between the
      // two models: `reservationId` (the invoice's single anchor) and the
      // ItemReservation.invoiceId back-relation, which is what a bundled invoice sets on
      // every hold it covers -- an organizer clicking a non-anchor hold of a 3-item
      // bundle must still reach the invoice. Newest first: a reservation can legitimately
      // have several invoices over its life (released, retried), and the current one is
      // the one being asked about.
      invoice = await prisma.holdInvoice.findFirst({
        where: {
          OR: [
            { reservationId: identifier },
            { reservations: { some: { id: identifier } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
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
    }

    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    // Authorization: shopper or organizer
    const isShopper = invoice.shopperUserId === req.user.id;

    // P0-A fix (2026-08-16): this used to look up the caller's Organizer row and compare
    // `invoice.organizerUserId === userOrganizer.id` -- i.e. it read the column as an
    // Organizer.id, while services/holdInvoicePaymentRecorder.ts reads the SAME column as a
    // User.id (notification userId + the `organizer` User relation's email/name). The two
    // consumers disagreed; the schema settles it -- HoldInvoice.organizerUserId FKs to
    // User(id). Compare against req.user.id directly; the Organizer lookup is no longer
    // needed for this check.
    const isOrganizer = invoice.organizerUserId === req.user.id;

    if (!isShopper && !isOrganizer) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Every item on the invoice, not just the anchor's. `invoice.reservation` is the
    // single anchor hold and is now deliberately nulled when an invoice is
    // cancelled/expired (P0 anchor fix), so it is not a dependable source for the item
    // list at all -- `itemIds` is the invoice's own record of what it billed and is
    // correct for bundles and for dead invoices alike.
    const items = invoice.itemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: invoice.itemIds } },
          include: { sale: true },
        })
      : [];

    res.json({
      id: invoice.id,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      platformFeeAmount: invoice.platformFeeAmount,
      stripeFeeAmount: invoice.stripeFeeAmount,
      expiresAt: invoice.expiresAt,
      paidAt: invoice.paidAt,
      releasedAt: invoice.releasedAt,
      createdAt: invoice.createdAt,
      itemCount: items.length,
      items,
      // Back-compat: existing callers read a single `item`. Prefer the anchor's item
      // when it is still linked, else the first billed item.
      item: invoice.reservation?.item ?? items[0] ?? null,
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
            // `invoice` is the ANCHOR relation (HoldInvoice.reservationId) and is set on
            // only ONE hold of a bundle -- and is now deliberately nulled when an invoice
            // is cancelled/expired (P0 anchor fix, 2026-08-17). Reading it alone made
            // this endpoint report "no invoice" for every non-anchor item of a bundled
            // invoice. `invoiceRel` is the ItemReservation.invoiceId back-relation, which
            // is set on EVERY hold the invoice covers.
            invoiceRel: true,
            invoice: true,
          },
        },
      },
    });

    const invoice = item?.reservation?.invoiceRel ?? item?.reservation?.invoice ?? null;

    // Only a LIVE invoice is reported. A CANCELLED/EXPIRED/REFUNDED invoice is not
    // something a shopper can act on, and reporting it as existing made an item that is
    // back on sale look permanently locked.
    if (!invoice || !['PENDING', 'PAID'].includes(invoice.status)) {
      return res.json({
        invoiceExists: false,
        invoiceStatus: null,
        expiresAt: null,
        stripeSessionId: null,
      });
    }

    res.json({
      invoiceExists: true,
      invoiceStatus: invoice.status,
      expiresAt: invoice.expiresAt,
      // Security fix (2026-08-17): this route is mounted BEFORE `router.use(authenticate)`
      // in routes/reservations.ts -- it is fully anonymous -- and it was handing out the
      // live Stripe Checkout Session id for any item id a caller cared to enumerate. A
      // session id plus the publishable key is enough to open someone else's payment page
      // client-side, and it confirms which items have money in flight. The field is kept
      // (shape unchanged, and the endpoint has zero frontend callers -- grep-verified) but
      // never populated on this anonymous route. Authenticated shoppers/organizers get the
      // full detail from GET /api/reservations/:invoiceIdOrReservationId/invoice, which
      // enforces shopper-or-organizer authorization.
      stripeSessionId: null,
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
        // P1 fix (2026-08-17): `invoice` is the ANCHOR relation
        // (HoldInvoice.reservationId) -- it is only ever set on ONE of the holds a
        // bundled invoice covers. An organizer clicking any other hold of the bundle
        // got a flat 404 "No invoice found for this reservation" even though the
        // invoice plainly existed. `invoiceRel` is the back-relation of
        // ItemReservation.invoiceId, which markSoldAndCreateInvoice sets on EVERY
        // bundled hold, so it resolves from any of them.
        invoiceRel: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    // Ownership FIRST (information-disclosure fix, 2026-08-17). The invoice-existence
    // 404 and the not-PENDING 409 below both leak real state about someone else's sale,
    // and they used to run BEFORE this check -- any authenticated organizer could probe
    // reservation ids and learn which ones carried a live invoice. Nothing about the
    // resource is revealed until ownership is established.
    const userOrganizer2 = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });
    if (!userOrganizer2 || reservation.item.sale!.organizerId !== userOrganizer2.id) {
      return res.status(403).json({ message: 'Access denied. You do not own this sale.' });
    }

    const invoice = reservation.invoiceRel ?? reservation.invoice;
    if (!invoice) return res.status(404).json({ message: 'No invoice found for this reservation' });
    if (invoice.status !== 'PENDING') {
      return res.status(409).json({ message: 'Only PENDING invoices can be released' });
    }

    // Cancel the Stripe Checkout session. Null-guarded: posController.sendHoldInvoice
    // creates HoldInvoice rows with NO Stripe session at all ("simplified MVP" path), and
    // posController.createCombinedInvoice omits one for a 100%-cash split.
    //
    // P1 fix (2026-08-17, live Chrome QA): this used to be a bare
    // `stripe.checkout.sessions.expire()` in a try/catch that only console.warn'ed. It
    // was observed failing with "No such checkout session" while the release went ahead
    // anyway -- leaving the shopper's original payment link OPEN and PAYABLE for an
    // invoice that had just been cancelled and items that had just gone back on sale.
    // expireCheckoutSessionSafely retrieves before expiring (so a connected-account
    // Session is found, and a terminal one is not mis-reported as an error) and alerts
    // Sentry if a payable session survives. See utils/expireCheckoutSession.ts.
    if (invoice.stripeSessionId) {
      const closure = await expireCheckoutSessionSafely(invoice.stripeSessionId, {
        stripeAccount: userOrganizer2.stripeConnectId,
        context: `releaseInvoice invoice=${invoice.id}`,
      });

      // Resource-state gate: NEVER cancel an invoice the shopper has already paid.
      // Doing so would hand the items back to RESERVED (and back on sale) after money
      // changed hands. Stripe is the authority here, not our own PENDING flag -- the
      // charge.succeeded webhook can legitimately be seconds behind, and this endpoint
      // is exactly the window in which an organizer would click.
      if (closure.state === 'PAID') {
        console.warn(`[hold-invoice] releaseInvoice refused: invoice ${invoice.id} is already PAID at Stripe (session ${invoice.stripeSessionId}).`);
        return res.status(409).json({
          message: 'This payment has already gone through. Refund it from the sale\'s payments instead of cancelling the request.',
        });
      }

      // A session we could not close is real money exposure, already reported to
      // Sentry by the helper. Refuse rather than release the items alongside a live
      // payment link -- the organizer can retry once Stripe is reachable.
      if (closure.stillPayable) {
        return res.status(502).json({
          message: 'We could not cancel the payment link with our payment processor just now, so the request was left in place. Please try again in a moment.',
        });
      }
    }

    // P1 fix (2026-08-16): this used to reset ONLY `reservation.item` and never cleared
    // ItemReservation.invoiceId. Two consequences, both confirmed by code read:
    //   1. BUNDLED invoices (markSoldAndCreateInvoice bundles every hold this shopper has
    //      at this sale into ONE invoice) left every item except the one whose reservation
    //      id was passed stranded at INVOICE_ISSUED forever.
    //   2. invoiceableWhere() requires `invoiceId: null`, so a hold whose invoice was
    //      released kept a dangling invoiceId pointing at a CANCELLED invoice and became
    //      PERMANENTLY un-invoiceable -- and nothing else clears it: invoiceExpiryJob only
    //      scans status PENDING, and stripeController's charge.failed handler only fires on
    //      an actual failed charge.
    // Now mirrors the two paths that already got this right (invoiceExpiryJob.ts and
    // stripeController.ts charge.failed): scope by invoice.itemIds / invoiceId, and clear
    // the claim columns too so a fresh invoice attempt isn't blocked by a stale claim.
    const releasedItemIds = invoice.itemIds.length > 0 ? invoice.itemIds : [reservation.item.id];
    await prisma.$transaction(async (tx) => {
      await tx.holdInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'CANCELLED',
          releasedAt: new Date(),
          // P0 fix (2026-08-17): release the @unique anchor. HoldInvoice.reservationId
          // carries HoldInvoice_reservationId_key and NOTHING nulled it -- so a single
          // released invoice permanently bricked that hold, every later invoice attempt
          // dying with P2002 on reservationId. Confirmed in production: invoice
          // cmswti848000jgse8z2y9gyhx, CANCELLED 2026-08-17 05:58, still anchored.
          // itemIds keeps the full record of what this invoice billed, so nothing is lost.
          reservationId: null,
        },
      });

      // Return EVERY item on this invoice to RESERVED. Guarded on INVOICE_ISSUED, same as
      // invoiceExpiryJob's revert, so an item already moved on by another path (SOLD via a
      // different channel) is never dragged backwards.
      await tx.item.updateMany({
        where: { id: { in: releasedItemIds }, status: 'INVOICE_ISSUED' },
        data: { status: 'RESERVED' },
      });

      // Clear the invoice link + any in-flight claim on EVERY reservation on this invoice.
      // ItemReservation.status is deliberately left alone: markSoldAndCreateInvoice never
      // changed it when the invoice was created, and POS-sourced holds sit in HOLD_IN_CART
      // which must not be clobbered back to CONFIRMED here.
      await tx.itemReservation.updateMany({
        where: { invoiceId: invoice.id },
        data: { invoiceId: null, invoiceClaimToken: null, invoiceClaimedAt: null },
      });

      // Notify shopper
      await tx.notification.create({
        data: {
          userId: reservation.user.id,
          type: 'invoice_cancelled',
          title: 'Invoice cancelled',
          body: releasedItemIds.length > 1
            ? `The invoice for ${releasedItemIds.length} items has been cancelled. Your holds remain active.`
            : `The invoice for "${reservation.item.title}" has been cancelled. Your hold remains active.`,
          link: `/items/${reservation.item.id}`,
          channel: 'OPERATIONAL',
        },
      });
    });

    res.json({ message: 'Invoice released and hold reactivated', itemsReleased: releasedItemIds.length });
  } catch (error: any) {
    console.error('[hold-invoice] releaseInvoice error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/reservations/my-holds-full — shopper's active holds with full item/sale detail
// Auth: authenticated shopper (JWT)
// Used by CartDrawer to poll every 30 seconds for hold status updates
export const getMyHoldsFull = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const holds = await prisma.itemReservation.findMany({
      where: {
        userId: req.user.id,
        status: { in: ['PENDING', 'CONFIRMED'] }, // Only active holds
      },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            photoUrls: true,
            status: true,
            sale: {
              select: {
                id: true,
                title: true,
                startDate: true,
                organizer: {
                  select: {
                    venmoHandle: true,
                    zelleHandle: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform response to match CartDrawer interface
    const response = holds.map(hold => ({
      id: hold.id,
      expiresAt: hold.expiresAt,
      createdAt: hold.createdAt,
      status: hold.status,
      item: {
        id: hold.item.id,
        title: hold.item.title,
        price: hold.item.price,
        photoUrls: hold.item.photoUrls,
        status: hold.item.status,
        sale: {
          id: hold.item.sale!.id,
          title: hold.item.sale!.title,
          organizerVenmoHandle: hold.item.sale!.organizer?.venmoHandle ?? null,
          organizerZelleHandle: hold.item.sale!.organizer?.zelleHandle ?? null,
        },
      },
    }));

    res.json(response);
  } catch (error: any) {
    console.error('[reservations] getMyHoldsFull error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
