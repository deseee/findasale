// X1: Webhook CRUD — organizers register/manage their webhook endpoints
import { Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const VALID_EVENTS = [
  'bid.placed',
  'purchase.completed',
  'sale.published',
  'sale.ended',
  'item.sold',
  'bounty.created',
];

/**
 * GET /api/webhooks
 * List all webhooks for the authenticated organizer. Secrets are masked.
 */
export const listWebhooks = async (req: AuthRequest, res: Response) => {
  try {
    const hooks = await prisma.webhook.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    // Mask secret — show only last 4 chars
    const safe = hooks.map(h => ({ ...h, secret: `****${h.secret.slice(-4)}` }));
    return res.json(safe);
  } catch (error) {
    console.error('listWebhooks error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/webhooks
 * Register a new webhook.
 * Body: { url: string, events: string[] }
 */
export const createWebhook = async (req: AuthRequest, res: Response) => {
  try {
    const { url, events } = req.body;

    if (!url || !/^https?:\/\/.+/.test(url)) {
      return res.status(400).json({ message: 'A valid URL is required.' });
    }
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ message: 'At least one event is required.' });
    }
    const invalid = events.filter((e: string) => !VALID_EVENTS.includes(e));
    if (invalid.length) {
      return res.status(400).json({ message: `Unknown events: ${invalid.join(', ')}` });
    }

    // Max 10 webhooks per user
    const count = await prisma.webhook.count({ where: { userId: req.user.id } });
    if (count >= 10) {
      return res.status(400).json({ message: 'Maximum 10 webhooks per account.' });
    }

    const secret = crypto.randomBytes(24).toString('hex'); // 48-char hex

    const hook = await prisma.webhook.create({
      data: { userId: req.user.id, url, events, secret },
    });

    // Return the full secret once — it cannot be retrieved again
    return res.status(201).json({ ...hook, secret });
  } catch (error) {
    console.error('createWebhook error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * PATCH /api/webhooks/:id
 * Update URL, events, or active status.
 * Body: { url?: string, events?: string[], isActive?: boolean }
 */
export const updateWebhook = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { url, events, isActive } = req.body;

    const hook = await prisma.webhook.findUnique({ where: { id } });
    if (!hook || hook.userId !== req.user.id) {
      return res.status(404).json({ message: 'Webhook not found.' });
    }

    if (url && !/^https?:\/\/.+/.test(url)) {
      return res.status(400).json({ message: 'Invalid URL.' });
    }
    if (events) {
      const invalid = events.filter((e: string) => !VALID_EVENTS.includes(e));
      if (invalid.length) {
        return res.status(400).json({ message: `Unknown events: ${invalid.join(', ')}` });
      }
    }

    const updated = await prisma.webhook.update({
      where: { id },
      data: {
        ...(url !== undefined && { url }),
        ...(events !== undefined && { events }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return res.json({ ...updated, secret: `****${updated.secret.slice(-4)}` });
  } catch (error) {
    console.error('updateWebhook error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * DELETE /api/webhooks/:id
 * Remove a webhook registration.
 */
export const deleteWebhook = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const hook = await prisma.webhook.findUnique({ where: { id } });
    if (!hook || hook.userId !== req.user.id) {
      return res.status(404).json({ message: 'Webhook not found.' });
    }

    await prisma.webhook.delete({ where: { id } });
    return res.json({ message: 'Webhook deleted.' });
  } catch (error) {
    console.error('deleteWebhook error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};
