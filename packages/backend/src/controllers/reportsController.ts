/**
 * Reports Controller — #442
 *
 * GET /api/reports/:year/:month
 *
 * Returns aggregated platform-wide trend data for a given calendar month.
 * Public endpoint — no auth required.
 *
 * Data: top sale types, most active cities, top item categories,
 * crawler visit summary, total indexed sales, total active organizers.
 *
 * Graceful degradation: if CrawlerVisit table has no rows (or migration
 * not yet run), the endpoint returns crawler stats as zeros.
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

interface MonthlyReportData {
  year: number;
  month: number;
  periodLabel: string;
  // Platform-wide aggregates
  totalPublishedSales: number;
  totalActiveOrganizers: number;
  // Sale type breakdown (top 5)
  topSaleTypes: Array<{ saleType: string; count: number }>;
  // Most active cities (top 10 by sale count)
  topCities: Array<{ city: string; state: string; count: number }>;
  // Top item categories (top 10 by item count across PUBLISHED sales in the period)
  topCategories: Array<{ category: string; count: number }>;
  // Crawler traffic
  totalCrawlerVisits: number;
  crawlerBreakdown: Array<{ crawlerName: string; count: number }>;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const getMonthlyReport = async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || year < 2020 || year > 2100) {
    res.status(400).json({ message: 'Invalid year or month parameter.' });
    return;
  }

  // Block future months (more than 1 month ahead)
  const now = new Date();
  const requestedDate = new Date(year, month - 1, 1);
  const oneMonthAhead = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  if (requestedDate >= oneMonthAhead) {
    res.status(404).json({ message: 'Report not yet available for this period.' });
    return;
  }

  // Period window: full calendar month
  const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const periodEnd = new Date(year, month, 1, 0, 0, 0, 0); // exclusive upper bound

  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  try {
    // Sales that were PUBLISHED or ENDED during this period
    // We use updatedAt as proxy for "active in the month"
    const activeSalesWhere = {
      deletedAt: null,
      status: { in: ['PUBLISHED', 'ENDED'] },
      updatedAt: { gte: periodStart, lt: periodEnd },
    };

    // Total published/ended sales in period
    const totalPublishedSales = await prisma.sale.count({ where: activeSalesWhere });

    // Total unique active organizers in period
    const activeOrganizerCount = await prisma.sale.groupBy({
      by: ['organizerId'],
      where: activeSalesWhere,
    });
    const totalActiveOrganizers = activeOrganizerCount.length;

    // Sale type breakdown
    const saleTypeGroups = await prisma.sale.groupBy({
      by: ['saleType'],
      where: activeSalesWhere,
      _count: { saleType: true },
      orderBy: { _count: { saleType: 'desc' } },
      take: 5,
    });
    const topSaleTypes = saleTypeGroups.map((g) => ({
      saleType: g.saleType,
      count: g._count.saleType,
    }));

    // Most active cities by sale count
    const cityGroups = await prisma.sale.groupBy({
      by: ['city', 'state'],
      where: activeSalesWhere,
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
      take: 10,
    });
    const topCities = cityGroups.map((g) => ({
      city: g.city,
      state: g.state,
      count: g._count.city,
    }));

    // Top item categories across PUBLISHED sales in this period
    // We join through items -> sale, filtering by sale date window
    const categoryGroups = await prisma.item.groupBy({
      by: ['category'],
      where: {
        deletedAt: null,
        category: { not: null },
        sale: {
          deletedAt: null,
          status: { in: ['PUBLISHED', 'ENDED'] },
          updatedAt: { gte: periodStart, lt: periodEnd },
        },
      },
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
      take: 10,
    });
    const topCategories = categoryGroups
      .filter((g) => g.category !== null)
      .map((g) => ({
        category: g.category as string,
        count: g._count.category,
      }));

    // Crawler visits (graceful: table may not exist in all environments)
    let totalCrawlerVisits = 0;
    let crawlerBreakdown: Array<{ crawlerName: string; count: number }> = [];
    try {
      const crawlerGroups = await prisma.crawlerVisit.groupBy({
        by: ['crawlerName'],
        where: {
          createdAt: { gte: periodStart, lt: periodEnd },
        },
        _count: { crawlerName: true },
        orderBy: { _count: { crawlerName: 'desc' } },
      });
      crawlerBreakdown = crawlerGroups.map((g) => ({
        crawlerName: g.crawlerName,
        count: g._count.crawlerName,
      }));
      totalCrawlerVisits = crawlerBreakdown.reduce((sum, g) => sum + g.count, 0);
    } catch (_err) {
      // Table not yet available — return zeros
    }

    const report: MonthlyReportData = {
      year,
      month,
      periodLabel,
      totalPublishedSales,
      totalActiveOrganizers,
      topSaleTypes,
      topCities,
      topCategories,
      totalCrawlerVisits,
      crawlerBreakdown,
    };

    // Cache for 1 hour (public, non-personalized)
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(report);
  } catch (error) {
    console.error('[reportsController] getMonthlyReport error:', error);
    res.status(500).json({ message: 'Failed to generate report.' });
  }
};
