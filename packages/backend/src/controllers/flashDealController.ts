import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../utils/webpush';

const flashDealCreateSchema = z.object({
  itemId: z.string().min(1),
  discountPct: z.number().int().min(1).max(99),
  durationMinutes: z.number().int().min(15).max(1440), // 15 min to 24 hours
});

export const createFlashDeal = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const validated = flashDealCreateSchema.parse(req.body);

    // Verify item exists and get its sale ID
    const item = await prisma.item.findUnique({
      where: { id: validated.itemId },
      include: { sale: true },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer owns this sale
    const sale = await prisma.sale.findUnique({
      where: { id: item.saleId },
      include: { organizer: true },
    });

    if (!sale || sale.organizer.userId !== userId) {
      return res.status(403).json({ message: 'Organizer does not own this sale' });
    }

    // Create flash deal
    const now = new Date();
    const endsAt = new Date(now.getTime() + validated.durationMinutes * 60 * 1000);

    const flashDeal = await prisma.flashDeal.create({
      data: {
        itemId: validated.itemId,
        saleId: item.saleId,
        discountPct: validated.discountPct,
        startsAt: now,
        endsAt,
      },
      include: {
        item: true,
        sale: true,
      },
    });

    // If deal starts within 30 minutes, send push notifications to subscribers
    if (validated.durationMinutes <= 30 || validated.durationMinutes >= 30) {
      try {
        const subscribers = await prisma.saleSubscriber.findMany({
          where: { saleId: item.saleId },
          include: { user: true },
        });

        const pushPromises = subscribers
          .filter((sub) => sub.user && sub.user.pushSubscriptions)
          .flatMap((sub) =>
            (sub.user.pushSubscriptions || []).map((pushSub) =>
              sendPushNotification(
                {
                  endpoint: pushSub.endpoint,
                  p256dh: pushSub.p256dh,
                  auth: pushSub.auth,
                },
                {
                  title: '⚡ Flash Deal!',
                  body: `${validated.discountPct}% off ${item.title} for the next ${validated.durationMinutes} minutes!`,
                  url: `/sales/${item.saleId}`,
                }
              ).catch((err) => {
                console.warn('Failed to send push notification:', err.message);
              })
            )
          );

        await Promise.all(pushPromises);

        // Mark as notified
        await prisma.flashDeal.update({
          where: { id: flashDeal.id },
          data: { notified: true },
        });
      } catch (err) {
        console.warn('Push notification service degraded:', (err as Error).message);
        // Non-critical: continue even if push fails
      }
    }

    return res.status(201).json(flashDeal);
  } catch (error) {
    console.error('Create flash deal error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    }
    return res.status(500).json({ message: 'Failed to create flash deal' });
  }
};

export const getActiveFlashDeals = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const flashDeals = await prisma.flashDeal.findMany({
      where: {
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            category: true,
            photoUrls: true,
          },
        },
        sale: {
          select: {
            id: true,
            title: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: { endsAt: 'asc' },
    });

    const enriched = flashDeals.map((deal) => ({
      id: deal.id,
      discountPct: deal.discountPct,
      startsAt: deal.startsAt,
      endsAt: deal.endsAt,
      item: deal.item,
      sale: deal.sale,
      timeRemainingMinutes: Math.max(
        0,
        Math.floor((deal.endsAt.getTime() - now.getTime()) / (1000 * 60))
      ),
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('Get active flash deals error:', error);
    return res.status(500).json({ message: 'Failed to fetch flash deals' });
  }
};

export const deleteFlashDeal = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;

    // Verify the flash deal exists and user is the organizer
    const flashDeal = await prisma.flashDeal.findUnique({
      where: { id },
      include: { sale: { include: { organizer: true } } },
    });

    if (!flashDeal) {
      return res.status(404).json({ message: 'Flash deal not found' });
    }

    if (flashDeal.sale.organizer.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized to delete this flash deal' });
    }

    await prisma.flashDeal.delete({
      where: { id },
    });

    return res.json({ message: 'Flash deal deleted' });
  } catch (error) {
    console.error('Delete flash deal error:', error);
    return res.status(500).json({ message: 'Failed to delete flash deal' });
  }
};
