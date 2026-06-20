import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Phase 1B: Rapidfire Mode public item filtering
import { redis } from '../lib/redis'; // graceful Redis cache (in-memory fallback)

export const getTrendingItems = async (req: Request, res: Response) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    // Get items with most favorites in last 7 days (as proxy for trending/views)
    const items = await prisma.item.findMany({
      where: {
        status: 'AVAILABLE',
        sale: {
          status: 'PUBLISHED',
        },
        ...PUBLIC_ITEM_FILTER,
      },
      select: {
        id: true,
        title: true,
        price: true,
        category: true,
        condition: true,
        photoUrls: true,
        sale: { select: { id: true, title: true, city: true, state: true } },
        _count: { select: { favorites: true } },
      },
      orderBy: { favorites: { _count: 'desc' } },
      take: 12,
    });

    res.json({ items });
  } catch (error) {
    console.error('getTrendingItems error:', error);
    res.status(500).json({ message: 'Failed to fetch trending items' });
  }
};

// Optional graceful cache for the public trending-sales response (120s).
// Uses the shared redis client which falls back to an in-memory TTL map when
// REDIS_URL is unset, so this is safe in every environment.
const TRENDING_SALES_CACHE_KEY = 'trending:sales:v1';
const TRENDING_SALES_CACHE_TTL = 120; // seconds

export const getTrendingSales = async (req: Request, res: Response) => {
  try {
    // Serve from cache when available (graceful — any cache error falls through).
    try {
      const cached = await redis.get(TRENDING_SALES_CACHE_KEY);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.type('application/json').send(cached);
        return;
      }
    } catch {
      // ignore cache read errors; fall through to live query
    }

    const now = new Date();
    const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const sales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        // Permanent storefronts (isOngoing) always qualify regardless of date window.
        // Time-boxed sales must still be active, end within 90 days, and start within 60.
        OR: [
          { isOngoing: true },
          {
            endDate: { gte: now, lte: ninetyDaysOut },
            startDate: { lte: sixtyDaysOut },
          },
        ],
      },
      // Top-level select: pull only the lightweight card fields the trending UI
      // needs. This deliberately excludes the heavy `scrapedMetadata` JSON (and
      // every other internal/scraping/settlement field the previous `include`
      // pulled implicitly), cutting per-row payload size dramatically.
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        lat: true,
        lng: true,
        neighborhood: true,
        photoUrls: true,
        tags: true,
        status: true,
        saleType: true,
        saleSubtype: true,
        isOnlineOnly: true,
        isOngoing: true,
        isPinned: true,
        organizerId: true,
        publishedAt: true,
        createdAt: true,
        organizer: { select: { user: { select: { name: true } } } },
        _count: { select: { items: true, rsvps: true } },
        // follower count resolved below via a single grouped query
      },
      orderBy: { rsvps: { _count: 'desc' } },
      take: 8,
    });

    // --- Single grouped follower count (replaces per-sale follow.count N+1) ---
    const organizerIds = Array.from(new Set(sales.map((s) => s.organizerId)));
    const followerGroups = organizerIds.length
      ? await prisma.follow.groupBy({
          by: ['organizerId'],
          where: { organizerId: { in: organizerIds } },
          _count: { _all: true },
        })
      : [];
    const followersByOrg = new Map<string, number>();
    for (const g of followerGroups) {
      followersByOrg.set(g.organizerId, g._count._all);
    }

    // Transform response to include follower count via relationship (shape unchanged)
    const salesWithFollowers = sales.map((sale) => ({
      ...sale,
      _count: {
        ...sale._count,
        followers: followersByOrg.get(sale.organizerId) ?? 0,
      },
      organizer: {
        name: sale.organizer.user.name,
      },
    }));

    const payload = JSON.stringify({ sales: salesWithFollowers });

    // Best-effort cache write (graceful — never blocks the response on failure).
    try {
      await redis.setex(TRENDING_SALES_CACHE_KEY, TRENDING_SALES_CACHE_TTL, payload);
    } catch {
      // ignore cache write errors
    }

    res.setHeader('X-Cache', 'MISS');
    res.type('application/json').send(payload);
  } catch (error) {
    console.error('getTrendingSales error:', error);
    res.status(500).json({ message: 'Failed to fetch trending sales' });
  }
};
