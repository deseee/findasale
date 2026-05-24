import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// GET /api/admin/affiliate/creators
// Returns paginated list of users who have an AffiliateCode or at least one AffiliateLink,
// along with their stats: totalClicks, totalConversions, totalReferrals, convertedReferrals,
// totalEarnings (payoutAmountCents sum), affiliateCode, joinedAt
export const getCreators = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));
    const search = ((req.query.search as string) || '').trim();
    const offset = (page - 1) * limit;

    // Build search condition
    const searchCondition = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Find userIds who have an AffiliateCode
    const codeUserIds = await prisma.affiliateCode
      .findMany({ select: { userId: true } })
      .then((rows) => rows.map((r) => r.userId));

    // Base where: has AffiliateCode OR has at least one AffiliateLink
    const baseWhere: any = {
      ...searchCondition,
      OR: [
        { affiliateLinks: { some: {} } },
        { id: { in: codeUserIds } },
      ],
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          affiliateLinks: {
            select: {
              clicks: true,
              conversions: true,
            },
          },
          affiliateReferralsGiven: {
            select: {
              id: true,
              status: true,
              qualifiedAt: true,
              payoutAmountCents: true,
              paidAt: true,
              referredUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where: baseWhere }),
    ]);

    // Fetch affiliate codes for these users in one query
    const userIds = users.map((u) => u.id);
    const affiliateCodes = await prisma.affiliateCode.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, code: true },
    });
    const codeByUserId = new Map(affiliateCodes.map((c) => [c.userId, c.code]));

    // Compute aggregate stats per user
    const creators = users.map((u) => {
      const totalClicks = u.affiliateLinks.reduce((sum, l) => sum + l.clicks, 0);
      const totalConversions = u.affiliateLinks.reduce((sum, l) => sum + l.conversions, 0);
      const totalReferrals = u.affiliateReferralsGiven.length;
      const convertedReferrals = u.affiliateReferralsGiven.filter(
        (r) => r.status === 'QUALIFIED' || r.status === 'PAID'
      ).length;
      const totalEarningsCents = u.affiliateReferralsGiven.reduce(
        (sum, r) => sum + (r.payoutAmountCents ?? 0),
        0
      );

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        joinedAt: u.createdAt,
        affiliateCode: codeByUserId.get(u.id) ?? null,
        totalClicks,
        totalConversions,
        totalReferrals,
        convertedReferrals,
        totalEarningsCents,
        referrals: u.affiliateReferralsGiven.map((r) => ({
          id: r.id,
          status: r.status,
          qualifiedAt: r.qualifiedAt,
          payoutAmountCents: r.payoutAmountCents,
          paidAt: r.paidAt,
          referredUser: r.referredUser,
        })),
      };
    });

    // Summary stats across all creators (not just current page)
    const [allLinksAgg, allReferralsAgg] = await Promise.all([
      prisma.affiliateLink.aggregate({
        _sum: { clicks: true, conversions: true },
      }),
      prisma.affiliateReferral.groupBy({
        by: ['status'],
        _count: true,
        _sum: { payoutAmountCents: true },
      }),
    ]);

    const totalAllClicks = allLinksAgg._sum.clicks ?? 0;
    const totalAllConversions = allLinksAgg._sum.conversions ?? 0;
    const totalAllReferrals = allReferralsAgg.reduce((sum, r) => sum + r._count, 0);
    const totalAllConverted = allReferralsAgg
      .filter((r) => r.status === 'QUALIFIED' || r.status === 'PAID')
      .reduce((sum, r) => sum + r._count, 0);

    res.json({
      creators,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        totalCreators: total,
        totalClicks: totalAllClicks,
        totalConversions: totalAllConversions,
        totalReferrals: totalAllReferrals,
        convertedReferrals: totalAllConverted,
      },
    });
  } catch (error) {
    console.error('Error fetching creators:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
