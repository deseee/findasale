import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// POST /push/subscribe — save or update a browser push subscription
export const subscribe = async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Invalid push subscription payload' });
    }

    await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId: req.user.id, endpoint }
      },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth
      },
      create: {
        userId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth
      }
    });

    res.status(201).json({ message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('push subscribe error:', error);
    res.status(500).json({ message: 'Failed to save push subscription' });
  }
};

// DELETE /push/unsubscribe — remove a push subscription by endpoint
export const unsubscribe = async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint is required' });
    }

    await prisma.pushSubscription.deleteMany({
      where: { userId: req.user.id, endpoint }
    });

    res.json({ message: 'Unsubscribed from push notifications' });
  } catch (error) {
    console.error('push unsubscribe error:', error);
    res.status(500).json({ message: 'Failed to remove push subscription' });
  }
};
