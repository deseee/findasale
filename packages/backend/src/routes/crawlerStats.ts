import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/crawler-stats/sale/:saleId — organizer sees crawler visits for their sale
router.get('/sale/:saleId', authenticate, async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;

    const [visits, total] = await Promise.all([
      prisma.crawlerVisit.findMany({
        where: { saleId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { crawlerName: true, createdAt: true },
      }),
      prisma.crawlerVisit.count({ where: { saleId } }),
    ]);

    const byBot = visits.reduce((acc: Record<string, number>, v) => {
      acc[v.crawlerName] = (acc[v.crawlerName] || 0) + 1;
      return acc;
    }, {});

    res.json({ total, byBot, recentVisits: visits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch crawler stats' });
  }
});

// GET /api/crawler-stats/organizer — aggregate crawler visits for all of this organizer's sales (past 7 days)
router.get('/organizer', authenticate, async (req: Request, res: Response) => {
  try {
    const organizerProfile = await prisma.organizer.findUnique({
      where: { userId: (req as any).user!.id },
      select: { id: true },
    });
    if (!organizerProfile) {
      return res.status(403).json({ error: 'Organizer profile not found' });
    }

    const organizerSales = await prisma.sale.findMany({
      where: { organizerId: organizerProfile.id },
      select: { id: true },
    });
    const saleIdList = organizerSales.map((s) => s.id);

    if (saleIdList.length === 0) {
      return res.json({ totalThisWeek: 0, byBot: {}, topSaleId: null });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const visits = await prisma.crawlerVisit.findMany({
      where: {
        saleId: { in: saleIdList },
        createdAt: { gte: sevenDaysAgo },
      },
      select: { crawlerName: true, saleId: true },
    });

    const byBot = visits.reduce((acc: Record<string, number>, v) => {
      acc[v.crawlerName] = (acc[v.crawlerName] || 0) + 1;
      return acc;
    }, {});

    // Find the sale with the most crawler visits this week
    const saleCounts = visits.reduce((acc: Record<string, number>, v) => {
      if (v.saleId) acc[v.saleId] = (acc[v.saleId] || 0) + 1;
      return acc;
    }, {});
    const topSaleId =
      (Object.entries(saleCounts) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return res.json({ totalThisWeek: visits.length, byBot, topSaleId });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch organizer crawler stats' });
  }
});

export default router;
