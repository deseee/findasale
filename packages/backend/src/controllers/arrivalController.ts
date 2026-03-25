/**
 * arrivalController.ts — Feature #84: Approach Notes
 *
 * Endpoints for managing sale approach notes (parking, entrance, hours, etc.)
 * and triggering push notifications to shoppers.
 */

import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

/**
 * GET /api/sales/:saleId/approach-notes
 *
 * Returns the sale's approach notes, address, and start date.
 * Public for shoppers who have saved the sale; also accessible to organizer.
 */
export const getApproachNotes = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

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
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // If user is authenticated and is not the organizer, check if they have saved the sale
    if (req.user && req.user.id !== sale.organizerId) {
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

    res.json({
      saleId: sale.id,
      entranceNote: sale.entranceNote,
      address: `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}`,
      startDate: sale.startDate,
      endDate: sale.endDate,
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

    if (sale.organizerId !== req.user.id) {
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
      entranceNote: updated.entranceNote,
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
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // Get all shoppers who have saved this sale
    const subscribers = await prisma.saleSubscriber.findMany({
      where: { saleId },
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
    });

    const recentUserIds = new Set(recentNotifications.map(n => n.userId));

    // Filter out users who already received this notification in the last 24h
    const usersToNotify = subscribers
      .map(s => s.userId)
      .filter(userId => !recentUserIds.has(userId));

    // Create notification logs for eligible users
    const notifications = await Promise.all(
      usersToNotify.map(userId =>
        prisma.pushNotificationLog.create({
          data: {
            userId,
            type: 'APPROACH_NOTES',
            payload: {
              saleId: sale.id,
              saleTitle: sale.title,
              entranceNote: sale.entranceNote,
              address: `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}`,
              startDate: sale.startDate,
            },
          },
        })
      )
    );

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
