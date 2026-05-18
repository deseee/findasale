/**
 * demandSignalsController — Feature #454: Organizer Demand Dashboard
 *
 * GET /api/organizer/demand-signals
 * Returns top unmet demand signals for the organizer's city over the past 30 days,
 * plus top national signals as a secondary list.
 */

import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const getDemandSignals = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole =
      req.user?.roles?.includes('ORGANIZER') ||
      req.user?.role === 'ORGANIZER' ||
      req.user?.roles?.includes('ADMIN') ||
      req.user?.role === 'ADMIN';

    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found.' });
    }

    // Derive organizer city/state from their most recent sale
    const recentSale = await prisma.sale.findFirst({
      where: { organizerId: organizer.id },
      orderBy: { createdAt: 'desc' },
      select: { city: true, state: true },
    });

    const organizerCity = recentSale?.city?.toLowerCase().trim() ?? null;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Local signals: queries in the organizer's city (or all if no city known)
    type SignalRow = { query: string; searchcount: bigint; lastsearched: Date };

    let localSignals: Array<{ query: string; searchCount: number; lastSearched: Date }> = [];

    if (organizerCity) {
      const localRows = await prisma.$queryRaw<SignalRow[]>`
        SELECT
          query,
          COUNT(*) AS searchcount,
          MAX("createdAt") AS lastsearched
        FROM "UnmetDemandSignal"
        WHERE LOWER(city) = ${organizerCity}
          AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY query
        ORDER BY searchcount DESC
        LIMIT 20
      `;
      localSignals = localRows.map((r) => ({
        query: r.query,
        searchCount: Number(r.searchcount),
        lastSearched: r.lastsearched,
      }));
    }

    // National signals: top queries across all locations
    const nationalRows = await prisma.$queryRaw<SignalRow[]>`
      SELECT
        query,
        COUNT(*) AS searchcount,
        MAX("createdAt") AS lastsearched
      FROM "UnmetDemandSignal"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY query
      ORDER BY searchcount DESC
      LIMIT 5
    `;
    const nationalSignals = nationalRows.map((r) => ({
      query: r.query,
      searchCount: Number(r.searchcount),
      lastSearched: r.lastsearched,
    }));

    return res.json({
      city: recentSale?.city ?? null,
      state: recentSale?.state ?? null,
      local: localSignals,
      national: nationalSignals,
    });
  } catch (err) {
    console.error('GET /api/organizer/demand-signals error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
