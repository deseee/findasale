/**
 * Internal Reports Controller
 * Read-only reporting endpoints for internal/ops use. Added 2026-08-03 because
 * Claude Cowork cloud sessions have no direct path to the production database
 * (no SSH tunnel, no raw TCP, no Railway MCP exec capability -- confirmed absent
 * across all three). This exposes specific, whitelisted, read-only queries as
 * normal HTTPS endpoints instead -- NOT a generic "run arbitrary SQL" endpoint.
 * Protected by x-scraper-key header, reusing the existing INTERNAL_SCRAPER_KEY
 * pattern (see internalGeocodingController.ts). No writes. No mutations.
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * GET /api/internal/reports/unconfirmed-weight-backlog
 * For every eBay-connected organizer, counts AVAILABLE items that are live on eBay
 * (ebayListingId set) but were published using an unconfirmed weight/shipping estimate
 * (packageConfirmedByOrganizer: false). Platform-wide -- not limited to one organizer.
 * Ports the logic from scripts/patrick-queries/platform-wide-unconfirmed-weight-count.mjs.
 * Read-only. Protected by x-scraper-key header.
 */
export async function getUnconfirmedWeightBacklog(req: Request, res: Response): Promise<void> {
  try {
    const key = req.headers['x-scraper-key'];
    if (!process.env.INTERNAL_SCRAPER_KEY || key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    // Every eBay-connected organizer. EbayConnection.organizerId is @unique (one row per
    // organizer, schema.prisma:611-659) -- a row existing means that organizer has completed
    // eBay OAuth. Does not check whether the connection's token is still valid -- answers
    // "connected at all", which is the platform-wide question this endpoint answers.
    const connections = await prisma.ebayConnection.findMany({
      select: {
        organizerId: true,
        organizer: { select: { businessName: true } },
      },
    });

    if (connections.length === 0) {
      res.json({ organizers: [], grandTotal: 0 });
      return;
    }

    const orgIds = connections.map((c) => c.organizerId);

    // Item.organizerId is denormalized from sale.organizerId (schema.prisma:1154 comment:
    // "Denormalized from sale.organizerId for library queries") and nullable on the model --
    // the where clause below scopes it to orgIds (all non-null), so results are safe to treat
    // as non-null, but if a given item's organizerId were ever unpopulated where
    // sale.organizerId is not, this would undercount that organizer. Not independently
    // verified against production data -- same caveat the reference script carries.
    const grouped = await prisma.item.groupBy({
      by: ['organizerId'],
      where: {
        organizerId: { in: orgIds },
        status: 'AVAILABLE',
        isActive: true,
        deletedAt: null,
        ebayListingId: { not: null },
        packageConfirmedByOrganizer: false,
      },
      _count: { _all: true },
    });

    const countByOrg = new Map<string, number>(
      grouped
        .filter((g): g is typeof g & { organizerId: string } => g.organizerId !== null)
        .map((g) => [g.organizerId, g._count._all])
    );

    const organizers = connections
      .map((c) => ({
        organizerId: c.organizerId,
        businessName: c.organizer?.businessName ?? '(unknown)',
        count: countByOrg.get(c.organizerId) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);

    const grandTotal = organizers.reduce((sum, o) => sum + o.count, 0);

    res.json({ organizers, grandTotal });
  } catch (err) {
    console.error('[internalReportsController] getUnconfirmedWeightBacklog failed:', err);
    res.status(500).json({ message: 'Internal error' });
  }
}


/**
 * GET /api/internal/reports/diagnose-purchase-notification?purchaseId=<id>
 * One-off diagnostic for root-causing "organizer never notified of a payment" reports
 * (e.g. purchase cms6cald1003hgspm3xw6qssk / organizer "Artifact", 2026-07-29). Given a
 * purchaseId, resolves the full chain purchase -> sale -> organizer -> organizer.userId
 * (the exact chain the payment_received notification guard in stripeController.ts checks,
 * `purchase.sale?.organizer?.userId`) and reports whether/where it breaks, plus whether a
 * matching Notification row exists.
 *
 * Notification-match caveat: the Notification model (schema.prisma:2089-2104) has NO field
 * linking back to a Purchase/PaymentIntent (no purchaseId, no relatedId, no JSON data blob)
 * -- createNotification() (notificationService.ts) only persists userId/type/title/body/
 * link/channel. So "does a notification exist for this purchase" cannot be an exact FK
 * lookup; this endpoint approximates it by matching type='payment_received',
 * userId=organizer.userId, link=`/organizer/sales/{saleId}` (the exact link the webhook
 * passes), and createdAt within a window around the purchase's createdAt. This is a
 * best-effort match, not a guaranteed one -- reported as `notificationMatch` with the
 * matched row(s) and the window used, so a human can eyeball false positives/negatives.
 * Read-only. Protected by x-scraper-key header, same pattern as the rest of this file.
 */
export async function diagnosePurchaseNotification(req: Request, res: Response): Promise<void> {
  try {
    const key = req.headers['x-scraper-key'];
    if (!process.env.INTERNAL_SCRAPER_KEY || key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const purchaseId = req.query.purchaseId;
    if (!purchaseId || typeof purchaseId !== 'string') {
      res.status(400).json({ message: 'purchaseId query param is required' });
      return;
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        status: true,
        amount: true,
        createdAt: true,
        userId: true,
        itemId: true,
        saleId: true,
        stripePaymentIntentId: true,
        sale: {
          select: {
            id: true,
            title: true,
            organizerId: true,
            organizer: {
              select: {
                id: true,
                businessName: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!purchase) {
      res.json({
        purchaseFound: false,
        purchaseId,
      });
      return;
    }

    const salePresent = !!purchase.sale;
    const organizerPresent = !!purchase.sale?.organizer;
    const organizerUserId = purchase.sale?.organizer?.userId ?? null;

    // Same window logic used to approximate a match, see caveat in the doc comment above:
    // +/- 1 hour around the purchase's createdAt (webhook fires the notification
    // synchronously right after the purchase.status update, so this is generous).
    const windowMs = 60 * 60 * 1000;
    const windowStart = new Date(purchase.createdAt.getTime() - windowMs);
    const windowEnd = new Date(purchase.createdAt.getTime() + windowMs);

    let notificationMatches: Array<{
      id: string;
      title: string;
      body: string;
      link: string | null;
      createdAt: Date;
    }> = [];

    if (organizerUserId && purchase.saleId) {
      notificationMatches = await prisma.notification.findMany({
        where: {
          userId: organizerUserId,
          type: 'payment_received',
          link: `/organizer/sales/${purchase.saleId}`,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          title: true,
          body: true,
          link: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    res.json({
      purchaseFound: true,
      purchaseId: purchase.id,
      purchase: {
        status: purchase.status,
        amount: purchase.amount,
        createdAt: purchase.createdAt,
        userId: purchase.userId,
        itemId: purchase.itemId,
        saleId: purchase.saleId,
        stripePaymentIntentId: purchase.stripePaymentIntentId,
      },
      chain: {
        salePresent,
        organizerPresent,
        organizerUserId,
        guardWouldHavePassed: !!organizerUserId,
      },
      notificationMatch: {
        windowStart,
        windowEnd,
        matchedCount: notificationMatches.length,
        matches: notificationMatches,
        caveat:
          'Notification model has no direct purchase FK -- matched by userId + type + link + time window, not an exact join. See doc comment.',
      },
    });
  } catch (err) {
    console.error('[internalReportsController] diagnosePurchaseNotification failed:', err);
    res.status(500).json({ message: 'Internal error' });
  }
}

