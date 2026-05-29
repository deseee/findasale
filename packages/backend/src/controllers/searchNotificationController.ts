/**
 * Feature #455: SearchNotification controller
 * Anonymous email capture for zero-result search queries.
 * POST /api/search/notify — no auth required.
 */
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const notifyOnSearch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, query, city } = req.body as { email?: string; query?: string; city?: string };

    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ message: 'Valid email address required.' });
      return;
    }
    if (!query || query.trim().length === 0) {
      res.status(400).json({ message: 'Search query required.' });
      return;
    }

    const q = query.trim().toLowerCase().slice(0, 200);
    const e = email.trim().toLowerCase();
    const c = city?.trim().slice(0, 100) ?? null;

    // Upsert via raw SQL — new model may not be in the deployed Prisma client yet
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "SearchNotification"
      WHERE email = ${e} AND "searchQuery" = ${q}
      LIMIT 1
    `;

    if (existing.length > 0) {
      res.status(200).json({ message: "You're already on the list!" });
      return;
    }

    const id = `sn${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await prisma.$executeRaw`
      INSERT INTO "SearchNotification" (id, email, "searchQuery", city, "isActive", "createdAt")
      VALUES (${id}, ${e}, ${q}, ${c}, true, NOW())
      ON CONFLICT (email, "searchQuery") DO NOTHING
    `;

    res.status(201).json({ message: "You'll be notified when matching items appear!" });
  } catch (err) {
    console.error('[searchNotification] POST /notify error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};
