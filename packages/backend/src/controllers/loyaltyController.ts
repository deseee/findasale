import { Request, Response } from 'express';
import { getPassport, getUnseenUnlocks, markPassportSeen } from '../services/loyaltyService';
import { prisma } from '../index';
import { opaqueUserId } from '../utils/opaqueUserId';
import { publicMemberLabel } from '../utils/publicDisplayName';

/**
 * GET /api/loyalty/passport
 * Authenticated endpoint. Returns user's loyalty passport data.
 */
export async function getMyPassport(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const passport = await getPassport(userId);
    res.json(passport);
  } catch (error) {
    console.error('Error fetching passport:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * GET /api/loyalty/passport/unseen[?sync=1]
 * Authenticated. Lightweight read for the global unlock watcher: Sale Passport stamps and
 * milestones earned but not yet shown as a toast. sync=1 re-derives stamps first (throttled).
 */
export async function getMyPassportUnseen(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const sync = req.query.sync === '1' || req.query.sync === 'true';
    const unseen = await getUnseenUnlocks(userId, { sync });
    res.json(unseen);
  } catch (error) {
    console.error('Error fetching unseen passport unlocks:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * POST /api/loyalty/passport/seen
 * Body: { all?: boolean, stampIds?: string[], milestones?: number[] }
 * Authenticated. Marks unlock toasts as shown. Only ever touches the caller's own rows.
 */
export async function markMyPassportSeen(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const body = (req.body ?? {}) as { all?: unknown; stampIds?: unknown; milestones?: unknown };
    const result = await markPassportSeen(userId, {
      all: body.all === true,
      stampIds: Array.isArray(body.stampIds) ? (body.stampIds as string[]) : undefined,
      milestones: Array.isArray(body.milestones) ? (body.milestones as number[]) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error marking passport unlocks seen:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Hunt Pass Feature #29: Loot Legend Portfolio
 * GET /api/loyalty/loot-legend
 * Returns LEGENDARY and EPIC items purchased by current user
 */
export async function getLootLegend(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const purchases = await prisma.purchase.findMany({
      where: {
        userId,
        item: {
          rarity: {
            in: ['LEGENDARY']
          }
        }
      },
      select: {
        id: true,
        itemId: true,
        createdAt: true,
        item: {
          select: {
            id: true,
            title: true,
            photoUrls: true,
            rarity: true,
            sale: {
              select: {
                id: true,
                title: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching loot legend:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Hunt Pass Feature: Collector's League Leaderboard
 * GET /api/loyalty/collector-league
 * Returns top 50 Hunt Pass holders by guildXp
 */
export async function getCollectorLeague(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    const now = new Date();
    const topUsers = await prisma.user.findMany({
      where: {
        huntPassActive: true,
        huntPassExpiry: { gt: now }
      },
      select: {
        id: true,
        name: true,
        explorerRank: true,
        guildXp: true,
        huntPassActive: true,
        notificationPrefs: true
      },
      orderBy: {
        guildXp: 'desc'
      },
      take: 50
    });

    // Add rank position and highlight current user
    // Public-safe shape (2026-09-29): no real user ids or full names for other members. `id` is the
    // opaque id (same scheme as the Hall of Fame), `name` is "First L.". The viewer is flagged with
    // isCurrentUser, computed here from the real id, so the page never needs to compare ids.
    const leaderboard = topUsers.map((user, index) => ({
      position: index + 1,
      id: opaqueUserId(user.id),
      name: publicMemberLabel(user.name, user.notificationPrefs),
      explorerRank: user.explorerRank,
      guildXp: user.guildXp,
      huntPassActive: user.huntPassActive,
      isCurrentUser: userId ? user.id === userId : false
    }));

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching collector league:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
