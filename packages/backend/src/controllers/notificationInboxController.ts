import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * GET /api/notifications/inbox
 * Returns last 50 notifications for the authenticated user, ordered by newest first.
 * Includes unread count.
 * Query params:
 *   - channel: "OPERATIONAL" | "DISCOVERY" | "ALL" (default: "ALL")
 */
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user.id;
    const channel = (req.query.channel as string) || 'ALL';

    // Build where clause with channel filter
    const whereClause: any = { userId };
    if (channel !== 'ALL' && ['OPERATIONAL', 'DISCOVERY'].includes(channel)) {
      whereClause.channel = channel;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({
        where: { ...whereClause, read: false },
      }),
    ]);

    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('getNotifications error:', error);
    return res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

/**
 * PATCH /api/notifications/inbox/:id/read
 * Marks a single notification as read.
 */
export const markRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const userId = req.user.id;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    return res.json(updated);
  } catch (error) {
    console.error('markRead error:', error);
    return res.status(500).json({ message: 'Failed to mark notification as read' });
  }
};

/**
 * PATCH /api/notifications/inbox/read-all
 * Marks all notifications as read for the authenticated user.
 */
export const markAllRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user.id;

    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return res.json({ updated: result.count });
  } catch (error) {
    console.error('markAllRead error:', error);
    return res.status(500).json({ message: 'Failed to mark all notifications as read' });
  }
};

/**
 * DELETE /api/notifications/inbox/:id
 * Deletes a single notification.
 */
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const userId = req.user.id;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await prisma.notification.delete({
      where: { id },
    });

    return res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('deleteNotification error:', error);
    return res.status(500).json({ message: 'Failed to delete notification' });
  }
};
