import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis'; // graceful Redis cache (in-memory fallback)

/**
 * Weekend Sale Index — public aggregation endpoint.
 *
 * GET /api/index/metros
 *
 * Returns a ranked list of U.S. metros by the count of upcoming, published
 * secondary sales (estate sales, yard sales, auctions, flea markets), with a
 * per-saleType breakdown. Built for the public /sale-index PR/backlink asset.
 *
 * Design (sale-index-architecture-spec.md §B):
 *  - Single `groupBy(['city','state','saleType'])` round-trip, folded in JS.
 *  - RETAIL excluded at the DB level (permanent storefronts are not "sales").
 *  - Canadian provinces dropped (US-only asset).
 *  - 6h graceful cache mirroring trendingController; in-memory fallback safe
 *    everywhere REDIS_URL is unset.
 *  - No migration; all referenced fields exist on the Sale model.
 */

const CACHE_KEY = 'index:metros:v1';
const CACHE_TTL = 21600; // 6 hours, in seconds

// Canadian province codes — dropped so this stays a US-only asset.
// Duplicated locally (per spec §B) to avoid coupling to routes/sales.ts.
const CANADIAN_PROVINCES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

// Minimum total sales for a metro to appear in the index. Default 1 keeps the
// index complete; the spec notes ≥2 can be considered if single-sale "metros"
// ever look like spam to a journalist.
const MIN_TOTAL = 1;

type Bucket = 'estate' | 'yard' | 'auction' | 'flea';

interface MetroBreakdown {
  estate: number;
  yard: number;
  auction: number;
  flea: number;
  other: number;
}

interface MetroRow {
  city: string;
  state: string;
  slug: string;
  total: number;
  breakdown: MetroBreakdown;
}

/**
 * Map a raw saleType to one of the 4 canonical PR buckets, or null for the
 * numeric "other" remainder (counted in total, not surfaced as a column).
 */
function bucketForSaleType(saleType: string): Bucket | null {
  switch (saleType) {
    case 'ESTATE':
      return 'estate';
    case 'YARD':
    case 'GARAGE':
      return 'yard';
    case 'AUCTION':
      return 'auction';
    case 'FLEA_MARKET':
      return 'flea';
    default:
      return null; // counted in total + breakdown.other
  }
}

function makeSlug(city: string, state: string): string {
  return `${city.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}`;
}

export const getMetroIndex = async (req: Request, res: Response) => {
  try {
    // Serve from cache when available (graceful — any cache error falls through).
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader(
          'Cache-Control',
          'public, max-age=21600, stale-while-revalidate=86400'
        );
        res.type('application/json').send(cached);
        return;
      }
    } catch {
      // ignore cache read errors; fall through to live query
    }

    const now = new Date();

    const groups = await prisma.sale.groupBy({
      by: ['city', 'state', 'saleType'],
      where: {
        status: 'PUBLISHED',
        startDate: { gte: now },
        deletedAt: null, // soft-delete exclude
        saleType: { notIn: ['RETAIL'] }, // exclude permanent retail storefronts
        city: { not: '' },
        NOT: { city: null },
      },
      _count: { _all: true },
    });

    // Fold rows into a per-metro map keyed `${city}|${state}`.
    const metroMap = new Map<string, MetroRow>();

    for (const g of groups) {
      const city = g.city?.trim();
      const state = g.state?.trim().toUpperCase();
      if (!city || !state) continue;
      if (CANADIAN_PROVINCES.has(state)) continue; // US-only asset

      const count = g._count._all;
      const key = `${city}|${state}`;

      let row = metroMap.get(key);
      if (!row) {
        row = {
          city,
          state,
          slug: makeSlug(city, state),
          total: 0,
          breakdown: { estate: 0, yard: 0, auction: 0, flea: 0, other: 0 },
        };
        metroMap.set(key, row);
      }

      row.total += count;
      const bucket = bucketForSaleType(g.saleType);
      if (bucket) {
        row.breakdown[bucket] += count;
      } else {
        row.breakdown.other += count;
      }
    }

    const metros = Array.from(metroMap.values())
      .filter((m) => m.total >= MIN_TOTAL)
      .sort((a, b) => b.total - a.total);

    const totalSales = metros.reduce((sum, m) => sum + m.total, 0);

    const payload = JSON.stringify({
      generatedAt: now.toISOString(),
      metroCount: metros.length,
      totalSales,
      metros,
    });

    // Best-effort cache write (graceful — never blocks the response on failure).
    try {
      await redis.setex(CACHE_KEY, CACHE_TTL, payload);
    } catch {
      // ignore cache write errors
    }

    res.setHeader('X-Cache', 'MISS');
    res.setHeader(
      'Cache-Control',
      'public, max-age=21600, stale-while-revalidate=86400'
    );
    res.type('application/json').send(payload);
  } catch (error) {
    console.error('getMetroIndex error:', error);
    res.status(500).json({ message: 'Failed to build the Weekend Sale Index' });
  }
};
