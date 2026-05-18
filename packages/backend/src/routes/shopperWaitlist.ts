/**
 * Shopper Notify Me Waitlist — Feature #455
 *
 * Routes:
 *   POST   /api/shopper/waitlist        — create a waitlist entry
 *   GET    /api/shopper/waitlist        — list user's active entries
 *   DELETE /api/shopper/waitlist/:id   — soft-delete (set isActive: false)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

const createSchema = z.object({
  itemType: z.string().min(2).max(200).transform((s) => s.toLowerCase().trim().replace(/\s+/g, ' ')),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
});

// POST /api/shopper/waitlist
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation error', errors: parsed.error.errors });
    }

    const { itemType, city, state } = parsed.data;

    // Prevent duplicate active entries for the same itemType+city combo
    const existing = await prisma.shopperWaitlistEntry.findFirst({
      where: { userId, itemType, city: city ?? null, isActive: true },
    });

    if (existing) {
      return res.status(409).json({ message: 'Already on waitlist for this item type and location', entry: existing });
    }

    const entry = await prisma.shopperWaitlistEntry.create({
      data: { userId, itemType, city: city ?? null, state: state ?? null },
    });

    return res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/shopper/waitlist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/shopper/waitlist
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const entries = await prisma.shopperWaitlistEntry.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(entries);
  } catch (err) {
    console.error('GET /api/shopper/waitlist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/shopper/waitlist/:id  (soft-delete)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const entry = await prisma.shopperWaitlistEntry.findFirst({
      where: { id, userId },
    });

    if (!entry) {
      return res.status(404).json({ message: 'Waitlist entry not found' });
    }

    await prisma.shopperWaitlistEntry.update({
      where: { id },
      data: { isActive: false },
    });

    return res.json({ message: 'Removed from waitlist' });
  } catch (err) {
    console.error('DELETE /api/shopper/waitlist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
