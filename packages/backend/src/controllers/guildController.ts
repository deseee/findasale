/**
 * Explorer's Guild Controller — Phase 2b
 * Handles Hall of Fame, rank info, and guild-related endpoints
 */

import { Request, Response } from 'express';
import { prisma } from '../index';

/**
 * GET /api/guild/hall-of-fame
 * Public endpoint — no authentication required
 * Returns all-time Grandmasters and seasonal top 100 Sage+
 */
export const getHallOfFame = async (req: Request, res: Response) => {
  try {
    // All-time Grandmasters
    const grandmasters = await prisma.user.findMany({
      where: { explorerRank: 'GRANDMASTER' },
      select: {
        id: true,
        name: true,
        profileSlug: true,
        guildXp: true,
        explorerRank: true,
        createdAt: true,
      },
      orderBy: [
        { guildXp: 'desc' },
        { createdAt: 'asc' }, // Tiebreaker: earliest achiever first
      ],
      take: 100,
    });

    // Top 100 Sage+ this season
    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), 0, 1); // Jan 1 UTC of current year

    const seasonalLeaders = await prisma.user.findMany({
      where: {
        explorerRank: { in: ['SAGE', 'GRANDMASTER'] },
        seasonalResetAt: { gte: seasonStart }, // Only users who reset this year
      },
      select: {
        id: true,
        name: true,
        profileSlug: true,
        guildXp: true,
        explorerRank: true,
      },
      orderBy: { guildXp: 'desc' },
      take: 100,
    });

    res.json({
      allTimeGrandmasters: grandmasters.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        name: u.name,
        profileSlug: u.profileSlug,
        guildXp: u.guildXp,
        explorerRank: u.explorerRank,
        achievedAt: u.createdAt.toISOString(),
      })),
      seasonalTop100: seasonalLeaders.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        name: u.name,
        profileSlug: u.profileSlug,
        guildXp: u.guildXp,
        explorerRank: u.explorerRank,
      })),
    });
  } catch (error) {
    console.error('Error fetching Hall of Fame:', error);
    res.status(500).json({ message: 'Failed to fetch Hall of Fame' });
  }
};
