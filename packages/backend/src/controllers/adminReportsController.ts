import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// Raw row shape returned by the per-organizer aggregate query.
// COUNT(...) comes back from Postgres as bigint; numeric SUM(...) as Prisma.Decimal | null.
interface OrganizerPerformanceRow {
  id: string;
  businessName: string;
  subscriptionTier: string;
  salesCount: bigint;
  itemsCount: bigint;
  soldItemsCount: bigint;
  totalGmv: Prisma.Decimal | null; // sum of Purchase.amount (dollars)
  lastSaleAt: Date | null;
  joinedAt: Date;
}

// GET /api/admin/reports/organizers
export const getOrganizerPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;
    const sortBy = (req.query.sortBy as string) || 'revenue';
    const order = (req.query.order as string) || 'desc';

    // Validate sort and order
    if (!['revenue', 'sales', 'sellThrough', 'lastActive'].includes(sortBy)) {
      return res.status(400).json({ message: 'Invalid sortBy parameter' });
    }
    if (!['asc', 'desc'].includes(order)) {
      return res.status(400).json({ message: 'Invalid order parameter' });
    }

    // ---- Sorting is done in SQL so it is correct across the FULL set while we
    //      only ever return a single page. The ORDER BY column and direction are
    //      injected via Prisma.raw, so they MUST come from a fixed whitelist —
    //      never from raw user input — to stay injection-safe.
    const direction = order === 'desc' ? 'DESC' : 'ASC';
    // Map the public sortBy to a computed SQL expression. sellThrough divides
    // sold/total items (guarding against divide-by-zero) so the ordering matches
    // the rate the client sees. revenue sorts by GMV (a monotonic proxy for
    // platformRevenue, which is just GMV * a per-tier constant — both produce the
    // same ordering since the fee rate is always positive).
    const sortColumnMap: Record<string, string> = {
      revenue: '"totalGmv"',
      sales: '"salesCount"',
      sellThrough:
        'CASE WHEN "itemsCount" > 0 THEN ("soldItemsCount"::float / "itemsCount"::float) ELSE 0 END',
      lastActive: '"lastSaleAt"',
    };
    const sortExpr = sortColumnMap[sortBy];
    // NULLS LAST keeps organizers with no sales / no revenue at the bottom on a
    // DESC sort (matches the old in-memory behavior where 0 / null sank to the end).
    const nullsOrder = direction === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';

    // ---- Single DB round-trip: aggregate per organizer, sort, then LIMIT/OFFSET.
    // Sales are filtered to deletedAt IS NULL. Item counts come from a LEFT JOIN
    // on Item; GMV comes from a CORRELATED SUBQUERY against Purchase so the
    // item-row fan-out does not multiply the purchase totals.
    const rows = await prisma.$queryRaw<OrganizerPerformanceRow[]>(
      Prisma.sql`
        SELECT
          o.id                                   AS "id",
          o."businessName"                       AS "businessName",
          o."subscriptionTier"::text             AS "subscriptionTier",
          COUNT(DISTINCT s.id)                   AS "salesCount",
          COUNT(i.id)                            AS "itemsCount",
          COUNT(i.id) FILTER (WHERE i.status = 'SOLD') AS "soldItemsCount",
          (
            SELECT COALESCE(SUM(p.amount), 0)
            FROM "Purchase" p
            JOIN "Sale" ps ON ps.id = p."saleId"
            WHERE ps."organizerId" = o.id
              AND ps."deletedAt" IS NULL
          )                                      AS "totalGmv",
          MAX(s."createdAt")                     AS "lastSaleAt",
          o."createdAt"                          AS "joinedAt"
        FROM "Organizer" o
        LEFT JOIN "Sale" s ON s."organizerId" = o.id AND s."deletedAt" IS NULL
        LEFT JOIN "Item" i ON i."saleId" = s.id
        GROUP BY o.id, o."businessName", o."subscriptionTier", o."createdAt"
        ORDER BY ${Prisma.raw(sortExpr)} ${Prisma.raw(direction)} ${Prisma.raw(nullsOrder)}, o.id ASC
        LIMIT ${limit} OFFSET ${skip}
      `
    );

    // Total organizer count for pagination — does NOT load any rows.
    const total = await prisma.organizer.count();

    const items = rows.map((row) => {
      const salesCount = Number(row.salesCount);
      const itemsCount = Number(row.itemsCount);
      const soldItemsCount = Number(row.soldItemsCount);
      const sellThroughRate = itemsCount > 0 ? soldItemsCount / itemsCount : 0;
      // totalGmv is the sum of Purchase.amount in dollars (Decimal | null).
      const totalGmvDollars = row.totalGmv ? Number(row.totalGmv) : 0;

      // Platform fee: SIMPLE=10%, PRO/TEAMS=8% — identical math to the prior impl.
      const feeRate = row.subscriptionTier === 'SIMPLE' ? 0.1 : 0.08;
      const platformRevenue = Math.round(totalGmvDollars * feeRate);

      return {
        id: row.id,
        businessName: row.businessName,
        tier: row.subscriptionTier,
        salesCount,
        itemsCount,
        soldItemsCount,
        sellThroughRate: parseFloat(sellThroughRate.toFixed(4)),
        totalGmv: Math.round(totalGmvDollars * 100), // cents
        platformRevenue, // dollars (matches prior output: round(gmvDollars * feeRate))
        lastSaleAt: row.lastSaleAt,
        joinedAt: row.joinedAt,
      };
    });

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching organizer performance:', error);
    res.status(500).json({ message: 'Failed to fetch organizer performance' });
  }
};

// GET /api/admin/reports/revenue
export const getRevenueReport = async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '30d';

    // Validate period
    if (!['7d', '30d', '90d'].includes(period)) {
      return res.status(400).json({ message: 'Invalid period parameter. Must be 7d, 30d, or 90d.' });
    }

    const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Fetch all purchases in period
    const purchases = await prisma.purchase.findMany({
      where: {
        createdAt: { gte: startDate },
        status: 'PAID',
      },
      include: {
        item: {
          select: {
            sale: {
              select: {
                organizer: {
                  select: {
                    subscriptionTier: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Compute transaction revenue
    let transactionRevenue = 0;
    purchases.forEach((p: any) => {
      const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
      const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
      transactionRevenue += Math.round(p.amount * feeRate * 100); // in cents
    });

    // Approximate subscription revenue (MRR × days / 30)
    const organizers = await prisma.organizer.findMany({
      where: {
        subscriptionStatus: 'active',
      },
      select: {
        subscriptionTier: true,
      },
    });

    let mrrCents = 0;
    organizers.forEach((org: any) => {
      const monthlyPrice = org.subscriptionTier === 'SIMPLE' ? 0 : org.subscriptionTier === 'PRO' ? 2900 : 7900; // cents
      mrrCents += monthlyPrice;
    });

    const subscriptionRevenue = Math.round((mrrCents * daysBack) / 30);

    // Build daily breakdown
    const byDay: Array<{ date: string; transactionRevenue: number; newOrganizers: number }> = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayPurchases = purchases.filter(
        (p: any) => p.createdAt >= dayStart && p.createdAt < dayEnd
      );

      let dayTransactionRevenue = 0;
      dayPurchases.forEach((p: any) => {
        const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
        const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
        dayTransactionRevenue += Math.round(p.amount * feeRate * 100);
      });

      const newOrgCount = await prisma.organizer.count({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      });

      byDay.push({
        date: dayStart.toISOString().split('T')[0],
        transactionRevenue: dayTransactionRevenue,
        newOrganizers: newOrgCount,
      });
    }

    res.json({
      period,
      transactionRevenue,
      subscriptionRevenue,
      total: transactionRevenue + subscriptionRevenue,
      byDay,
    });
  } catch (error) {
    console.error('Error fetching revenue report:', error);
    res.status(500).json({ message: 'Failed to fetch revenue report' });
  }
};
