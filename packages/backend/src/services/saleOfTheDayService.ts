/**
 * saleOfTheDayService.ts — Feature #401: Sale of the Day
 *
 * Selects the highest-quality PUBLISHED sale starting within the next 7 days.
 * Quality score: (itemCount * 0.4) + (photoCount * 0.3) + (hasDescription ? 0.3 : 0)
 * Ties broken by earliest startDate.
 *
 * No Redis — re-runs the query each time. The GET endpoint sets Cache-Control: max-age=3600
 * so this query runs at most once per hour per CDN region in practice.
 */

import { prisma } from '../lib/prisma';

export interface SaleOfTheDayResult {
  saleId: string;
  title: string;
  organizerName: string;
  startDate: string;
  city: string;
  state: string;
  itemCount: number;
  photoUrl: string | null;
  saleType: string;
}

/**
 * Queries PUBLISHED sales starting within the next 7 days and picks the best one
 * by quality score. Returns null if no qualifying sale exists.
 */
export async function selectSaleOfTheDay(): Promise<SaleOfTheDayResult | null> {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sales = await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      deletedAt: null,
      startDate: {
        gte: now,
        lte: sevenDaysFromNow,
      },
      items: {
        some: {},
      },
    },
    select: {
      id: true,
      title: true,
      description: true,
      startDate: true,
      city: true,
      state: true,
      saleType: true,
      saleSubtype: true,
      isCharitySale: true,
      photoUrls: true,
      organizer: {
        select: {
          businessName: true,
        },
      },
      _count: {
        select: { items: true },
      },
    },
    orderBy: {
      startDate: 'asc', // tie-breaker: earliest start wins
    },
  });

  if (sales.length === 0) return null;

  // Score each sale
  const scored = sales.map((sale) => {
    const itemCount = sale._count.items;
    const photoCount = sale.photoUrls.length;
    const hasDescription = Boolean(sale.description && sale.description.trim().length > 0);
    const score = itemCount * 0.4 + photoCount * 0.3 + (hasDescription ? 0.3 : 0);
    return { sale, score, itemCount, photoCount };
  });

  // Sort descending by score; startDate asc is already the primary sort from DB (tie-breaker)
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const { sale, itemCount } = best;

  return {
    saleId: sale.id,
    title: sale.title,
    organizerName: sale.organizer.businessName,
    startDate: sale.startDate.toISOString(),
    city: sale.city,
    state: sale.state,
    itemCount,
    photoUrl: sale.photoUrls.length > 0 ? sale.photoUrls[0] : null,
    saleType: sale.saleType,
  };
}

/**
 * Public-facing wrapper — re-runs the selection query.
 * Returns the winning sale or null.
 */
export async function getSaleOfTheDay(): Promise<SaleOfTheDayResult | null> {
  return selectSaleOfTheDay();
}
