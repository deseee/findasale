/**
 * arrivalController.ts — Feature #84: Approach Notes
 *
 * Endpoints for managing sale approach notes (parking, entrance, hours, etc.)
 * and triggering push notifications to shoppers.
 */

import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest, optionalAuthenticate } from '../middleware/auth';
import { sendPushNotification } from '../utils/webpush';
import { saleAddressGateForViewer } from '../lib/saleLocationPrivacy';
import { messageSaleLocation } from '../lib/messageSaleLocation';

/**
 * GET /api/sales/:saleId/approach-notes
 *
 * Returns the sale's approach notes, address, and start date.
 * Public for shoppers who have saved the sale; also accessible to organizer.
 */
export const getApproachNotes = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    // 2026-10-13: the route (routes/sales.ts) mounts no auth middleware, so req.user was always undefined
    // and every anonymous caller got the full street address + entrance note. Resolve the viewer here.
    if (!req.user) {
      let proceed = false;
      await optionalAuthenticate(req, res, () => { proceed = true; });
      if (!proceed) return; // optionalAuthenticate already answered (expired token -> 401 so the client refreshes)
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        entranceNote: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        startDate: true,
        endDate: true,
        organizerId: true,
        organizer: { select: { userId: true, timezone: true } },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const isOwner = Boolean(req.user?.id && sale.organizer?.userId === req.user.id);
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.roles?.includes?.('ADMIN');

    // If user is authenticated and is not the organizer, check if they have saved the sale
    if (req.user && !isOwner && !isAdmin) {
      const hasSaved = await prisma.saleSubscriber.findUnique({
        where: {
          saleId_userId: {
            saleId: saleId,
            userId: req.user.id,
          },
        },
      });

      if (!hasSaved) {
        return res.status(403).json({ message: 'You have not saved this sale' });
      }
    }

    // Street address + entrance note only for signed-in viewers from the day before the sale (owner/admin always).
    const gate = saleAddressGateForViewer(sale, sale.organizer?.timezone, req.user, isOwner || isAdmin);
    const locality = `${sale.city}, ${sale.state} ${sale.zip}`;
    res.json({
      saleId: sale.id,
      entranceNote: gate.visible ? (sale.entranceNote ?? null) : null,
      address: gate.visible && sale.address ? `${sale.address}, ${locality}` : locality,
      startDate: sale.startDate,
      endDate: sale.endDate,
      ...(gate.visible ? {} : { addressHidden: true, addressRevealsOn: gate.revealsOn, addressHiddenReason: gate.reason }),
    });
  } catch (error) {
    console.error('Get approach notes error:', error);
    res.status(500).json({ message: 'Server error retrieving approach notes' });
  }
};

/**
 * POST /api/sales/:saleId/approach-notes
 *
 * Organizer only. Updates the sale's approach notes.
 * Request body: { notes: string }
 */
export const updateApproachNotes = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId } = req.params;
    const { notes } = req.body;

    // Verify organizer owns this sale
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

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: { entranceNote: notes || null },
      select: {
        id: true,
        entranceNote: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        startDate: true,
      },
    });

    res.json({
      message: 'Approach notes updated',
      saleId: updated.id,
      entranceNote: updated.entranceNote ?? null,
      address: `${updated.address}, ${updated.city}, ${updated.state}`,
      startDate: updated.startDate,
    });
  } catch (error) {
    console.error('Update approach notes error:', error);
    res.status(500).json({ message: 'Server error updating approach notes' });
  }
};

/**
 * POST /api/sales/:saleId/send-approach-notification
 *
 * Organizer only. Sends approach notes notification to all shoppers
 * who have saved the sale.
 *
 * Deduplicates: won't send twice to the same user within 24 hours.
 */
export const sendApproachNotification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId } = req.params;

    // Verify organizer owns this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        title: true,
        entranceNote: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        startDate: true,
        organizerId: true,
        organizer: { select: { timezone: true } },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // 2026-10-13: recipients are account holders (savers with a userId), but the street address and the entrance
    // note (which gives the address away) only go out from the day before the sale starts (organizer time zone,
    // send time), same as GET /approach-notes. Before that the push points to the sale page.
    const location = messageSaleLocation(sale, sale.organizer?.timezone, true, new Date());
    const entranceNote = location.visible ? sale.entranceNote : null;

    // Get all shoppers who have saved this sale
    const subscribers = await prisma.saleSubscriber.findMany({
      where: { saleId },
      take: 500,
      select: { userId: true },
    });

    if (subscribers.length === 0) {
      return res.json({
        message: 'No subscribers to notify',
        notificationsSent: 0,
      });
    }

    // Check for recent notifications (within 24h) to avoid duplicates
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentNotifications = await prisma.pushNotificationLog.findMany({
      where: {
        type: 'APPROACH_NOTES',
        payload: {
          path: ['saleId'],
          equals: saleId,
        },
        sentAt: {
          gte: twentyFourHoursAgo,
        },
      },
      select: { userId: true },
      take: 2000,
    });

    const recentUserIds = new Set(recentNotifications.map(n => n.userId));

    // Filter out users who already received this notification in the last 24h
    const usersToNotify = (subscribers
      .map(s => s.userId)
      .filter((userId): userId is string => userId !== null && !recentUserIds.has(userId as string)));

    // Create notification logs for eligible users — chunked to avoid hammering DB
    const CHUNK_SIZE = 50;
    const notifications: Awaited<ReturnType<typeof prisma.pushNotificationLog.create>>[] = [];
    for (let i = 0; i < usersToNotify.length; i += CHUNK_SIZE) {
      const chunk = usersToNotify.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(userId =>
          prisma.pushNotificationLog.create({
            data: {
              userId,
              type: 'APPROACH_NOTES',
              payload: {
                saleId: sale.id,
                saleTitle: sale.title,
                entranceNote: entranceNote ?? undefined,
                address: location.line,
                startDate: sale.startDate,
              },
            },
          })
        )
      );
      notifications.push(...chunkResults);

      // Bug fix: this endpoint previously only wrote a PushNotificationLog row (for the
      // 24h dedup check above) and never actually delivered a browser push — organizers
      // were told "notifications sent" but shoppers received nothing. Fetch each user's
      // real PushSubscription rows and deliver the push for real.
      //
      // Bug fix (P0 push-log investigation): this call previously omitted the third
      // logInfo argument entirely, so sendPushNotification() never wrote a delivery
      // log for this call site even on success. Deliberately using type
      // 'APPROACH_NOTES_DELIVERY' here — NOT 'APPROACH_NOTES' — so this per-subscription
      // delivery-outcome row doesn't get swept up by the 24h dedup query above (which
      // filters on type === 'APPROACH_NOTES' + payload.saleId). The dedup row created
      // in the loop above is a per-user "we decided to notify" marker written before
      // any send is attempted; this row is a per-subscription "did the push actually
      // succeed or fail" record written by sendPushNotification itself. Keeping the
      // types distinct avoids polluting the dedup marker set with delivery-outcome rows.
      const chunkSubscriptions = await prisma.pushSubscription.findMany({
        where: { userId: { in: chunk } },
      });
      await Promise.all(
        chunkSubscriptions.map(ps =>
          sendPushNotification(ps, {
            title: `Approach notes: ${sale.title}`,
            body: entranceNote
              ? entranceNote.slice(0, 120)
              : location.visible
                ? `Parking and entrance info for ${sale.title}`
                : `Parking and entrance info for ${sale.title} is on the sale page the day before it starts`,
            url: `/sales/${sale.id}`,
          }, { userId: ps.userId, type: 'APPROACH_NOTES_DELIVERY' }).catch(err =>
            console.warn(
              `[arrivalController] Approach-notes push failed for user ${ps.userId}:`,
              err?.message
            )
          )
        )
      );
    }

    res.json({
      message: 'Approach notes notifications sent',
      notificationsSent: notifications.length,
      skippedDueToDuplicates: recentUserIds.size,
      totalSubscribers: subscribers.length,
    });
  } catch (error) {
    console.error('Send approach notification error:', error);
    res.status(500).json({ message: 'Server error sending notifications' });
  }
};
