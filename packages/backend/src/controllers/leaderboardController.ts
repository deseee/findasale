import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Get top shoppers by guildXp
 * Returns anonymized names and XP score
 */
export const getShopperLeaderboard = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: 'USER',
      },
      select: {
        id: true,
        name: true,
        guildXp: true,
        explorerRank: true,
        huntPassActive: true,
        userBadges: {
          select: {
            id: true,
            badge: {
              select: {
                id: true,
                name: true,
                iconUrl: true,
              },
            },
            awardedAt: true,
          },
          orderBy: {
            awardedAt: 'desc',
          },
          take: 3,
        },
      },
      orderBy: {
        guildXp: 'desc',
      },
      take: 50,
    });

    // Map to leaderboard format with guildXp as score
    const sorted = users.map((user, index) => ({
      rank: index + 1,
      userId: user.id.slice(0, 4),
      name: user.name.split(' ')[0] || 'Shopper',
      score: user.guildXp ?? 0,
      explorerRank: user.explorerRank,
      huntPassActive: user.huntPassActive ?? false,
      badges: user.userBadges.map((ub) => ({
        id: ub.badge.id,
        name: ub.badge.name,
        iconUrl: ub.badge.iconUrl,
        awardedAt: ub.awardedAt.toISOString(),
      })),
    }));

    res.json(sorted);
  } catch (error) {
    console.error('Error fetching shopper leaderboard:', error);
    res.status(500).json({ message: 'Server error while fetching leaderboard' });
  }
};

/**
 * Get top organizers by number of completed sales
 * Returns organizer name, sale count, and total items sold
 */
export const getOrganizerLeaderboard = async (req: Request, res: Response) => {
  try {
    const organizers = await prisma.organizer.findMany({
      select: {
        id: true,
        businessName: true,
      },
      take: 100, // Fetch more to ensure we can sort all before slicing top 20
    });

    const organizerIds = organizers.map((o) => o.id);

    // --- Set-based aggregation (replaces per-organizer count fan-out / N+1) ---
    // 1) Completed (ENDED) sales per organizer — single grouped query.
    const completedSalesGroups = await prisma.sale.groupBy({
      by: ['organizerId'],
      where: {
        organizerId: { in: organizerIds },
        status: 'ENDED',
      },
      _count: { _all: true },
    });
    const completedSalesByOrg = new Map<string, number>();
    for (const g of completedSalesGroups) {
      completedSalesByOrg.set(g.organizerId, g._count._all);
    }

    // 2) Sold items per organizer. Items relate to organizers via Sale, so we
    //    group SOLD items by saleId (single query), then resolve each saleId to
    //    its organizerId (single query) — preserving the original
    //    `item.sale.organizerId` semantics without the denormalized field.
    const soldItemGroups = await prisma.item.groupBy({
      by: ['saleId'],
      where: {
        status: 'SOLD',
        sale: { organizerId: { in: organizerIds } },
      },
      _count: { _all: true },
    });
    const involvedSaleIds = soldItemGroups
      .map((g) => g.saleId)
      .filter((id): id is string => id !== null);

    const saleOwners = involvedSaleIds.length
      ? await prisma.sale.findMany({
          where: { id: { in: involvedSaleIds } },
          select: { id: true, organizerId: true },
        })
      : [];
    const organizerBySaleId = new Map<string, string>();
    for (const s of saleOwners) {
      organizerBySaleId.set(s.id, s.organizerId);
    }

    const soldItemsByOrg = new Map<string, number>();
    for (const g of soldItemGroups) {
      if (g.saleId === null) continue;
      const orgId = organizerBySaleId.get(g.saleId);
      if (!orgId) continue;
      soldItemsByOrg.set(orgId, (soldItemsByOrg.get(orgId) ?? 0) + g._count._all);
    }

    const leaderboardData = organizers.map((org) => ({
      organizerId: org.id, // Return full ID for frontend navigation
      organizerName: org.businessName,
      completedSales: completedSalesByOrg.get(org.id) ?? 0,
      totalItemsSold: soldItemsByOrg.get(org.id) ?? 0,
    }));

    // Sort by completed sales count (descending), then by total items sold (descending)
    const sorted = leaderboardData
      .sort((a, b) => {
        if (b.completedSales !== a.completedSales) {
          return b.completedSales - a.completedSales;
        }
        return b.totalItemsSold - a.totalItemsSold;
      })
      .slice(0, 20)
      .map((org, index) => ({
        rank: index + 1,
        ...org,
      }));

    res.json(sorted);
  } catch (error) {
    console.error('Error fetching organizer leaderboard:', error);
    res.status(500).json({ message: 'Server error while fetching leaderboard' });
  }
};

/**
 * Get top scouts (shoppers) by number of organizers they've introduced
 * Counts ShopperOrganizerIntroduction records where claimedAt IS NOT NULL (claimed storefront)
 * within the current calendar year (Jan 1 – Dec 31 UTC)
 * Returns top 25 scouts with current user's rank included if applicable
 */
export const getScoutLeaderboard = async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getUTCFullYear();
    const yearStart = new Date(`${currentYear}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${currentYear + 1}-01-01T00:00:00Z`);

    // Get current user from auth (if logged in)
    const authHeader = req.headers.authorization;
    let currentUserId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      // Basic JWT parsing to extract userId (full parsing happens in auth middleware elsewhere)
      try {
        const token = authHeader.substring(7);
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        currentUserId = decoded.userId || null;
      } catch (e) {
        // Token parse failed, continue without current user context
      }
    }

    // Query: Count claimed introductions (claimedAt IS NOT NULL) grouped by shopperId, within current year
    const scoutData = await prisma.shopperOrganizerIntroduction.groupBy({
      by: ['shopperId'],
      where: {
        claimedAt: {
          not: null,
        },
        introducedAt: {
          gte: yearStart,
          lt: yearEnd,
        },
      },
      _count: {
        organizerId: true,
      },
      orderBy: {
        _count: {
          organizerId: 'desc',
        },
      },
      take: 25,
    });

    // Fetch user details for all scouts in a single query (replaces per-id findUnique N+1)
    const scoutIds = scoutData.map((entry) => entry.shopperId);
    const scoutUsers = scoutIds.length
      ? await prisma.user.findMany({
          where: { id: { in: scoutIds } },
          select: {
            id: true,
            name: true,
            // avatarUrl not in schema, use placeholder or initials
          },
        })
      : [];
    const userById = new Map(scoutUsers.map((u) => [u.id, u]));

    const scouts = scoutData.map((entry) => ({
      userId: entry.shopperId,
      displayName: userById.get(entry.shopperId)?.name || 'Scout',
      count: entry._count.organizerId,
    }));

    // Determine current user's rank if logged in
    let currentUserRank: number | null = null;
    if (currentUserId) {
      const userIntroductionCount = await prisma.shopperOrganizerIntroduction.count({
        where: {
          shopperId: currentUserId,
          claimedAt: {
            not: null,
          },
          introducedAt: {
            gte: yearStart,
            lt: yearEnd,
          },
        },
      });

      if (userIntroductionCount > 0) {
        // Count how many scouts have MORE introductions
        const betterScouts = await prisma.shopperOrganizerIntroduction.groupBy({
          by: ['shopperId'],
          where: {
            claimedAt: {
              not: null,
            },
            introducedAt: {
              gte: yearStart,
              lt: yearEnd,
            },
          },
          _count: {
            organizerId: true,
          },
        });

        const currentUserRankValue = betterScouts.filter((s) => s._count.organizerId > userIntroductionCount).length + 1;
        currentUserRank = currentUserRankValue;
      }
    }

    // Map to final leaderboard format
    const entries = scouts.map((scout, index) => ({
      rank: index + 1,
      userId: scout.userId,
      displayName: scout.displayName,
      avatarUrl: null, // No avatar field in User schema
      count: scout.count,
      isCurrentUser: scout.userId === currentUserId,
    }));

    res.json({
      season: currentYear.toString(),
      resetDate: new Date(`${currentYear + 1}-01-01T00:00:00Z`).toISOString(),
      entries,
      currentUserRank,
    });
  } catch (error) {
    console.error('Error fetching scout leaderboard:', error);
    // Return empty result rather than 500 — allows the page to load shoppers/organizers
    // even when the ShopperOrganizerIntroduction table is missing (pending migration)
    const currentYear = new Date().getUTCFullYear();
    res.json({
      season: currentYear.toString(),
      resetDate: new Date(`${currentYear + 1}-01-01T00:00:00Z`).toISOString(),
      entries: [],
      currentUserRank: null,
    });
  }
};
