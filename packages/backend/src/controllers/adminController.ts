import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getMonthlyAICost, getMonthlyAICostFromLog, resetMonthlyAICost, getMonthlyWebDetectionCost, getEbayImageSearchUsage, getMonthlyGroundingCost } from '../lib/aiCostTracker';
import { getMonthlyCloudinaryEstimate, getBandwidthThreshold, getTodayCloudinaryUsage, resetTodayCloudinaryUsage } from '../lib/cloudinaryBandwidthTracker';
import { getEbayRateLimitStatus } from '../lib/ebayRateLimiter';
import { emailService } from '../lib/emailService';
import { createNotification } from '../lib/notificationService';
import { MAX_REMOVAL_SKIP_ATTEMPTS } from './extensionController';
import { executeVerifiedRefund, RefundError } from '../services/refundService';

// BUG #2: role display helper — the scalar `user.role` (deprecated) can drift out of
// sync with the canonical `user.roles[]` array. Compute the highest-precedence role
// from the array (ADMIN > ORGANIZER > USER), falling back to the scalar when the
// array is empty/missing. Used everywhere the admin UI renders a user's role badge.
function displayRole(roles?: string[] | null, scalar?: string | null): string {
  const arr = roles || [];
  if (arr.includes('ADMIN')) return 'ADMIN';
  if (arr.includes('ORGANIZER')) return 'ORGANIZER';
  if (arr.includes('USER')) return 'USER';
  return scalar || 'USER';
}

// GET /api/admin/stats — platform overview
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    // #370 Canada Admin Analytics — optional country filter
    const countryFilter = (req.query.country as string) || null;
    const isCanadaFilter = countryFilter === 'CA';

    const totalUsers = await prisma.user.count({
      where: { deletedAt: null, NOT: [{ email: { endsWith: '@system.finda.sale' } }, { email: { endsWith: '@example.com' } }] },
    });
    // CONTAMINATION FIX: Count only real organizers, exclude isUnmanagedListing: true
    const totalOrganizers = await prisma.organizer.count({
      where: { isUnmanagedListing: false },
    });
    const totalItems = await prisma.item.count();

    const salesByStatus = await prisma.sale.groupBy({
      by: ['status'],
      _count: true,
    });

    // Real vs scraped sale counts for Data Integrity section
    // FIX (P1 data integrity, 2026-08-08): this must be a SALE-level provenance check
    // (sourceName), not the ORGANIZER-level isUnmanagedListing flag. isUnmanagedListing
    // flips to false the instant an organizer claims their profile (routes/organizers.ts
    // claim handler), but any Sale rows the directory scraper already synced for that
    // organizer are never touched by the claim and keep sourceName='EstateSalesNet' (etc.)
    // -- so the old filter silently reclassified scraper-synced sales as "real" the moment
    // an organizer claimed their listing. sourceName is set once, at scrape-time ingest
    // (services/scraper/index.ts ingestScrapedListing), and is never set on a sale an
    // organizer creates in-app (saleController.ts createSale only spreads the request body).
    const [realSalesCount, scrapedSalesCount] = await Promise.all([
      prisma.sale.count({ where: { sourceName: null } }),
      prisma.sale.count({ where: { sourceName: { not: null } } }),
    ]);

    const totalPurchases = await prisma.purchase.aggregate({
      _sum: { amount: true },
      _count: true,
    });

    // New users in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newUsersLast7d = await prisma.user.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        deletedAt: null,
        NOT: [{ email: { endsWith: '@system.finda.sale' } }, { email: { endsWith: '@example.com' } }],
      },
    });

    // New sales in last 7 days
    const newSalesLast7d = await prisma.sale.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    });

    // Tier breakdown (real organizers only)
    const tierBreakdown = await prisma.organizer.groupBy({
      by: ['subscriptionTier'],
      _count: true,
      where: { isUnmanagedListing: false },
    });

    const tierBreakdownMap: Record<string, number> = {
      SIMPLE: 0,
      PRO: 0,
      TEAMS: 0,
    };
    tierBreakdown.forEach((t: any) => {
      tierBreakdownMap[t.subscriptionTier as string] = t._count;
    });

    // MRR calculation (real organizers only — exclude internal/test accounts)
    // INTERNAL_EMAILS_CSV = comma-separated list of internal/test account emails to exclude, e.g. "admin@example.com,test@example.com"
    const INTERNAL_EMAILS = (process.env.INTERNAL_EMAILS_CSV || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const activePaidOrganizers = await prisma.organizer.findMany({
      where: {
        isUnmanagedListing: false,
        subscriptionStatus: 'active',
        subscriptionTier: { in: ['PRO', 'TEAMS'] },
        user: { email: { notIn: INTERNAL_EMAILS } },
      },
      select: { subscriptionTier: true },
      take: 10000,
    });

    let mrrCents = 0;
    activePaidOrganizers.forEach((org: any) => {
      const monthlyPrice = org.subscriptionTier === 'PRO' ? 2900 : 7900;
      mrrCents += monthlyPrice;
    });

    // MRR by tier
    const mrrByTier = {
      PRO: 0,
      TEAMS: 0,
    };
    activePaidOrganizers.forEach((org: any) => {
      const monthlyPrice = org.subscriptionTier === 'PRO' ? 2900 : 7900;
      mrrByTier[org.subscriptionTier as 'PRO' | 'TEAMS'] += monthlyPrice;
    });

    // Transaction revenue (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const purchasesLast30d = await prisma.purchase.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: 'PAID',
        source: { not: 'ALA_CARTE' },
      },
      include: {
        item: {
          select: {
            sale: {
              select: {
                organizer: {
                  select: { subscriptionTier: true },
                },
              },
            },
          },
        },
      },
      take: 10000,
    });

    let transactionRevenueLast30d = 0;
    purchasesLast30d.forEach((p: any) => {
      const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
      const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
      transactionRevenueLast30d += Math.round(p.amount * feeRate * 100);
    });

    // Transaction revenue (today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const purchasestoday = await prisma.purchase.findMany({
      where: {
        createdAt: { gte: todayStart },
        status: 'PAID',
        source: { not: 'ALA_CARTE' },
      },
      include: {
        item: {
          select: {
            sale: {
              select: {
                organizer: {
                  select: { subscriptionTier: true },
                },
              },
            },
          },
        },
      },
      take: 10000,
    });

    let transactionRevenueToday = 0;
    purchasestoday.forEach((p: any) => {
      const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
      const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
      transactionRevenueToday += Math.round(p.amount * feeRate * 100);
    });

    // Ala-carte revenue today
    const alaCartePurchasesToday = await prisma.purchase.aggregate({
      where: { source: 'ALA_CARTE', status: 'PAID', createdAt: { gte: todayStart } },
      _sum: { amount: true },
    });
    const alaCarteRevenueToday = Math.round((alaCartePurchasesToday._sum.amount || 0) * 100);
    transactionRevenueToday += alaCarteRevenueToday;

    // Hunt Pass revenue (items with HUNT_PASS type if field exists; for now 0)
    const huntPassRevenueLast30d = 0;

    // À la carte revenue — real query against Purchase.source = 'ALA_CARTE'
    const alaCartePurchasesLast30d = await prisma.purchase.aggregate({
      where: { source: 'ALA_CARTE', status: 'PAID', createdAt: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
    });
    const alaCarteRevenueLast30d = Math.round((alaCartePurchasesLast30d._sum.amount || 0) * 100);

    // Conversion funnel
    const totalSignups = totalUsers;
    const haveOrganizer = totalOrganizers;

    // Real organizers only for funnel metrics
    // FIX (P1 data integrity, 2026-08-08): "sales: { some: {} }" and "some sale with
    // status PUBLISHED/ENDED" both matched a claimed organizer's leftover scraper-synced
    // Sale rows (status defaults to PUBLISHED at scrape-ingest, sourceName set, publishedAt
    // never set -- see services/scraper/index.ts ingestScrapedListing). That produced a
    // false "organizer activation" reading (documented incident: pipeline-briefing-2026-08-07.md
    // reported 3/3 organizers published a sale; real in-app activation was 0/3 -- see
    // STATE.md Blocked Queue P1 row, 2026-08-08). createdOneSale now requires a Sale row
    // with sourceName: null (built in-app, any status). publishedOneSale now requires
    // publishedAt: { not: null }, which is set only by the real in-app publish action
    // (saleController.ts status-transition handler) -- the scraper never sets it.
    const createdOneSale = await prisma.organizer.count({
      where: {
        isUnmanagedListing: false,
        sales: {
          some: { sourceName: null },
        },
      },
    });

    const publishedOneSale = await prisma.organizer.count({
      where: {
        isUnmanagedListing: false,
        sales: {
          some: {
            publishedAt: { not: null },
          },
        },
      },
    });

    const paidTier = await prisma.organizer.count({
      where: {
        isUnmanagedListing: false,
        subscriptionTier: { in: ['PRO', 'TEAMS'] },
      },
    });

    // 7-day sparklines
    const sparklines = {
      signups: [] as number[],
      transactionRevenue: [] as number[],
      newSales: [] as number[],
    };

    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      // New signups
      const signupCount = await prisma.user.count({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          NOT: [{ email: { endsWith: '@system.finda.sale' } }, { email: { endsWith: '@example.com' } }],
        },
      });
      sparklines.signups.push(signupCount);

      // Transaction revenue
      const dayPurchases = await prisma.purchase.findMany({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          status: 'PAID',
        },
        include: {
          item: {
            select: {
              sale: {
                select: {
                  organizer: {
                    select: { subscriptionTier: true },
                  },
                },
              },
            },
          },
        },
        take: 10000,
      });

      let dayTransactionRevenue = 0;
      dayPurchases.forEach((p: any) => {
        const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
        const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
        dayTransactionRevenue += Math.round(p.amount * feeRate * 100);
      });
      sparklines.transactionRevenue.push(dayTransactionRevenue);

      // New sales
      const saleCount = await prisma.sale.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      });
      sparklines.newSales.push(saleCount);
    }

    const stats = {
      totalUsers,
      totalOrganizers,
      totalItems,
      totalSales: salesByStatus.reduce((acc: number, s: any) => acc + s._count, 0),
      salesByStatus: Object.fromEntries(
        salesByStatus.map((s: any) => [s.status, s._count])
      ),
      totalRevenue: totalPurchases._sum.amount || 0,
      totalPurchases: totalPurchases._count,
      newUsersLast7d,
      newSalesLast7d,
      tierBreakdown: tierBreakdownMap,
      mrr: mrrCents,
      mrrByTier,
      transactionRevenueLast30d: transactionRevenueLast30d + alaCarteRevenueLast30d,
      transactionRevenueToday,
      huntPassRevenueLast30d,
      aLaCarteRevenueLast30d: alaCarteRevenueLast30d,
      funnel: {
        totalSignups,
        haveOrganizer,
        createdOneSale,
        publishedOneSale,
        paidTier,
      },
      sparklines,
      ebayRateLimit: getEbayRateLimitStatus(),
      realSalesCount,
      scrapedSalesCount,
    };

    // #370 Canada Admin Analytics — compute canadaStats when country=CA
    if (isCanadaFilter) {
      const caOrganizerWhere = { isUnmanagedListing: false, country: 'CA' };

      const [caOrganizers, caSalesRaw, caRevenueRaw, caProvinceRaw] = await Promise.all([
        prisma.organizer.count({ where: caOrganizerWhere }),
        prisma.sale.count({
          where: { organizer: { country: 'CA', isUnmanagedListing: false } },
        }),
        prisma.purchase.findMany({
          where: { status: 'PAID', item: { sale: { organizer: { country: 'CA', isUnmanagedListing: false } } } },
          select: { amount: true },
          take: 10000,
        }),
        prisma.organizer.groupBy({
          by: ['province'],
          _count: true,
          where: { ...caOrganizerWhere, province: { not: null } },
          orderBy: { _count: { province: 'desc' } },
          take: 5,
        }),
      ]);

      const caRevenueCents = caRevenueRaw.reduce((sum: number, p: any) => sum + Math.round(p.amount * 100), 0);

      (stats as any).canadaStats = {
        totalOrganizers: caOrganizers,
        totalSales: caSalesRaw,
        totalRevenue: caRevenueCents,
        topProvinces: caProvinceRaw.map((r: any) => ({ province: r.province ?? 'Unknown', count: r._count })),
      };
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
};

// GET /api/admin/users — paginated user list
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const role = (req.query.role as string) || '';
    const hideScraped = req.query.hideScraped === 'true';

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      // BUG #2: filter on the canonical roles[] array so array-only organizers/admins match.
      where.roles = { has: role };
    }

    // Filter out scraper-created accounts: users whose organizer has isUnmanagedListing=true
    // Real registered organizers always have isUnmanagedListing=false (default)
    if (hideScraped) {
      where.AND = [
        {
          OR: [
            { organizer: null },
            { organizer: { is: { isUnmanagedListing: false } } },
          ],
        },
      ];
    }

    // 2026-08-28: this WHERE (esp. hideScraped's organizer anti-join) forces a
    // Parallel Hash Anti Join across the full User/Organizer tables (~180k rows
    // each, confirmed via live EXPLAIN ANALYZE). Under concurrent load, the
    // parallel workers' /dev/shm (POSIX dynamic shared memory) allocations can
    // collectively exceed the container's shm capacity, throwing Postgres
    // error 53100 "could not resize shared memory segment ... No space left on
    // device" -- an intermittent 500 on this endpoint, unrelated to schema.
    // Forcing a serial plan for just this transaction avoids the DSM path
    // entirely with no schema change and no global Postgres config touch.
    const [users, total] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL max_parallel_workers_per_gather = 0');
      return Promise.all([
        tx.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            roles: true,
            createdAt: true,
            oauthProvider: true,
            emailVerified: true,
            suspendedAt: true,
            deletedAt: true,
            _count: { select: { purchases: true } },
            organizer: {
              select: {
                id: true,
                customStorefrontSlug: true,
                subscriptionTier: true,
                _count: { select: { sales: true } },
              },
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.user.count({ where }),
      ]);
    });

    const formattedUsers = users.map((user: any) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: displayRole(user.roles, user.role),
      createdAt: user.createdAt,
      oauthProvider: user.oauthProvider,
      emailVerified: user.emailVerified,
      suspendedAt: user.suspendedAt,
      deletedAt: user.deletedAt,
      purchaseCount: user._count.purchases,
      saleCount: user.organizer?._count.sales || 0,
      storefrontSlug: user.organizer?.customStorefrontSlug || null,
      // QA session 2026-08-08 (P3 fix): expose organizerId + tier so admin/users.tsx
      // can offer a real tier-change control -- PATCH /organizers/:organizerId/tier
      // (updateOrganizerTier) previously had zero frontend callers anywhere.
      organizerId: user.organizer?.id || null,
      subscriptionTier: user.organizer?.subscriptionTier || null,
    }));

    res.json({
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    Sentry.captureException(error); // Surface the still-open "Failed to load users" 500 in Sentry
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// PATCH /api/admin/users/:userId/role — update user role
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!['USER', 'ORGANIZER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Prevent removing all admins
    if (role !== 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (adminCount === 1) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user?.role === 'ADMIN') {
          return res.status(400).json({ message: 'Cannot remove the last admin' });
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role, roles: [role], tokenVersion: { increment: 1 } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // Security notification: any admin-initiated role change (including privilege
    // escalation to ORGANIZER/ADMIN) is an account-security-relevant event for the
    // affected user, not just an internal audit-log entry. Alert them immediately.
    // (ADD, S1192 security-notification audit). sendEmail: true.
    createNotification({
      userId: updatedUser.id,
      type: 'account_role_changed',
      title: 'Your account role was changed',
      body: `Your FindA.Sale account role was changed to ${role} by an administrator. If you did not expect this, contact support immediately.`,
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err) => {
      console.error('[SecurityNotification] Failed to send account_role_changed notification:', err);
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Failed to update user role' });
  }
};

// PATCH /api/admin/users/:userId/suspend — suspend a user account
export const suspendUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { suspendReason } = req.body;

    await prisma.user.update({
      where: { id: userId },
      data: {
        suspendedAt: new Date(),
        suspendReason: suspendReason || 'ADMIN_ACTION',
        tokenVersion: { increment: 1 },
      },
    });

    // Security notification: the affected user needs to know an admin suspended their
    // account -- this also doubles as an audit trail for a trust-and-safety action.
    // (ADD, S1192 security-notification audit). sendEmail: true.
    createNotification({
      userId,
      type: 'account_suspended',
      title: 'Your account has been suspended',
      body: `Your FindA.Sale account was suspended by an administrator${suspendReason ? `: ${suspendReason}` : '.'} Contact support if you believe this is an error.`,
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err) => {
      console.error('[SecurityNotification] Failed to send account_suspended notification:', err);
    });

    res.json({ success: true, message: 'Account suspended' });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ message: 'Failed to suspend user' });
  }
};

// PATCH /api/admin/users/:userId/unsuspend — unsuspend a user account
export const unsuspendUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    await prisma.user.update({
      where: { id: userId },
      data: {
        suspendedAt: null,
        suspendReason: null,
      },
    });

    // Security notification: let the user know their account was reinstated.
    // (ADD, S1192 security-notification audit). sendEmail: true.
    createNotification({
      userId,
      type: 'account_unsuspended',
      title: 'Your account has been reinstated',
      body: 'Your FindA.Sale account suspension has been lifted by an administrator. You can now log in normally.',
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err) => {
      console.error('[SecurityNotification] Failed to send account_unsuspended notification:', err);
    });

    res.json({ success: true, message: 'Account unsuspended' });
  } catch (error) {
    console.error('Error unsuspending user:', error);
    res.status(500).json({ message: 'Failed to unsuspend user' });
  }
};

// DELETE /api/admin/users/:userId/purge -- PERMANENT hard delete for already-soft-deleted
// test/junk accounts. Requires deletedAt already set (purge is a second step, never a
// first action) and requires the caller to echo the target's real email back (confirmEmail)
// as a fat-finger guard, since this is irreversible. Blocks unconditionally (no force
// override) if the target has any Sale or AffiliateLink rows -- those are real
// transactional/payment data and must never be silently cascade-deleted by an admin tool.
// Relies entirely on the existing onDelete: Cascade/SetNull rules already in schema.prisma
// (Organizer.user, OrganizerWorkspace.owner, WorkspaceMember.organizer/.user, VendorBooth.user,
// etc.) -- does not manually delete child rows.
export const purgeUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { confirmEmail } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!confirmEmail || confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return res.status(400).json({ message: 'confirmEmail does not match target account' });
    }

    if (!user.deletedAt) {
      return res.status(400).json({ message: 'Account must be soft-deleted before it can be purged' });
    }

    const organizer = await prisma.organizer.findUnique({ where: { userId: user.id } });

    if (organizer) {
      const saleCount = await prisma.sale.count({ where: { organizerId: organizer.id } });
      if (saleCount > 0) {
        return res.status(409).json({
          message: `Cannot purge: ${saleCount} Sale row(s) reference this organizer`,
          blockedBy: 'Sale',
        });
      }
    }

    const affiliateLinkCount = await prisma.affiliateLink.count({
      where: {
        OR: [
          { userId: user.id },
          ...(organizer ? [{ sale: { organizerId: organizer.id } }] : []),
        ],
      },
    });
    if (affiliateLinkCount > 0) {
      return res.status(409).json({
        message: `Cannot purge: ${affiliateLinkCount} AffiliateLink row(s) reference this account`,
        blockedBy: 'AffiliateLink',
      });
    }

    let workspaceCount = 0;
    let vendorBoothCount = 0;
    if (organizer) {
      workspaceCount = await prisma.organizerWorkspace.count({ where: { ownerId: organizer.id } });
    }
    vendorBoothCount = await prisma.vendorBooth.count({ where: { userId: user.id } });

    const cascaded = {
      organizer: organizer ? 1 : 0,
      workspaces: workspaceCount,
      vendorBooths: vendorBoothCount,
    };

    console.warn('[ADMIN PURGE]', {
      actorAdminId: req.user?.id,
      targetUserId: user.id,
      targetEmail: user.email,
      cascaded,
      at: new Date().toISOString(),
    });

    await prisma.user.delete({ where: { id: user.id } });

    res.json({
      success: true,
      purgedUserId: user.id,
      purgedEmail: user.email,
      cascaded,
    });
  } catch (error) {
    console.error('Error purging user:', error);
    res.status(500).json({ message: 'Failed to purge user' });
  }
};

// DELETE /api/admin/users/:userId -- soft-delete a user account
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });

    // Notification-gap fix (S1195, 2026-08-08): deleteUser is a soft-delete (deletedAt set,
    // reversible via restoreUser below) that previously notified nobody -- inconsistent with
    // suspendUser/unsuspendUser above, which both already notify on an equivalent
    // trust-and-safety action. sendEmail: true so the user finds out even if they never log
    // back in (tokenVersion is also bumped, invalidating their existing session).
    createNotification({
      userId,
      type: 'account_deleted',
      title: 'Your account has been deleted',
      body: 'Your FindA.Sale account was deleted by an administrator. Contact support if you believe this is an error.',
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err) => {
      console.error('[SecurityNotification] Failed to send account_deleted notification:', err);
    });

    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
};

// PATCH /api/admin/users/:userId/restore — restore a soft-deleted user account
export const restoreUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: null,
      },
    });

    res.json({ success: true, message: 'Account restored' });
  } catch (error) {
    console.error('Error restoring user:', error);
    res.status(500).json({ message: 'Failed to restore user' });
  }
};

// GET /api/admin/users/:userId — single user detail for admin
export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roles: true,
        createdAt: true,
        oauthProvider: true,
        emailVerified: true,
        emailVerifiedAt: true,
        suspendedAt: true,
        suspendReason: true,
        fraudSuspect: true,
        purchases: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            itemId: true, // BUG #3: enable admin click-through to the purchased item
            saleId: true, // BUG #3: fallback link target when the purchase has no item
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        organizer: {
          select: {
            id: true,
            businessName: true,
            customStorefrontSlug: true,
            subscriptionTier: true,
            totalSales: true,
            avgRating: true,
            verificationStatus: true,
            sales: {
              select: {
                id: true,
                title: true,
                status: true,
                startDate: true,
                city: true,
              },
              orderBy: { startDate: 'desc' },
              take: 5,
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user by id:', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

// GET /api/admin/sales — paginated sales list
export const getSales = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const status = (req.query.status as string) || '';
    const search = (req.query.search as string) || '';

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { organizer: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          endDate: true,
          organizer: { select: { businessName: true } },
          _count: { select: { items: true } },
          purchases: { select: { amount: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sale.count({ where }),
    ]);

    const formattedSales = sales.map((sale: any) => ({
      id: sale.id,
      title: sale.title,
      status: sale.status,
      startDate: sale.startDate,
      endDate: sale.endDate,
      organizerName: sale.organizer.businessName,
      itemCount: sale._count.items,
      revenue: sale.purchases.reduce((sum: number, p: any) => sum + p.amount, 0),
    }));

    res.json({
      sales: formattedSales,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ message: 'Failed to fetch sales' });
  }
};

// DELETE /api/admin/sales/:saleId — delete a sale
export const deleteSale = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    // BQ fix (S1178, 2026-07-29): same class of gap as the organizer-side
    // deleteAccount hard-delete fix -- a bare prisma.sale.delete() here does NOT
    // raise a clean error on real transactional data, it silently succeeds and
    // orphans it. Purchase.saleId is onDelete: SetNull (not Cascade/Restrict), so
    // deleting a sale with real purchases doesn't destroy those Purchase rows, but
    // it DOES sever their saleId link -- breaking receipts/reporting/attribution
    // for real buyer transactions with zero warning. AffiliateLink.sale is
    // onDelete: Restrict, so a sale with any affiliate link would already throw a
    // raw Postgres FK violation (unhelpful 500) rather than a clear message. Check
    // first and fail gracefully with an actionable message, same pattern as
    // userController.deleteAccount.
    const [purchaseCount, affiliateLinkCount] = await Promise.all([
      prisma.purchase.count({ where: { saleId } }),
      prisma.affiliateLink.count({ where: { saleId } }),
    ]);

    const blockers: string[] = [];
    if (purchaseCount > 0) blockers.push(`${purchaseCount} purchase${purchaseCount === 1 ? '' : 's'}`);
    if (affiliateLinkCount > 0) blockers.push(`${affiliateLinkCount} affiliate link${affiliateLinkCount === 1 ? '' : 's'}`);

    if (blockers.length > 0) {
      const blockerList = blockers.length === 1 ? blockers[0] : blockers.join(' and ');
      return res.status(400).json({
        message: `This sale can't be deleted -- it still has ${blockerList} tied to it, which would be silently orphaned or blocked by the database. Resolve or reassign those first.`,
      });
    }

    // Delete the sale -- cascading deletes handle items, favorites, etc.
    await prisma.sale.delete({
      where: { id: saleId },
    });

    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting sale:', error);
    res.status(500).json({ message: 'Failed to delete sale' });
  }
};

// GET /api/admin/activity — recent platform activity
export const getRecentActivity = async (req: AuthRequest, res: Response) => {
  try {
    const [recentPurchases, recentUsers, recentSales] = await Promise.all([
      prisma.purchase.findMany({
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          itemId: true, // BUG #3: enable dashboard click-through to the purchased item
          saleId: true, // BUG #3: fallback link target when the purchase has no item
          user: { select: { name: true, email: true } },
          guestName: true, // BUG FIX 2026-08-04: guest checkout name was captured but never surfaced here
          buyerEmail: true, // BUG FIX 2026-08-04: same -- admin panel showed "Unknown" for every guest purchase
          item: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.user.findMany({
        where: { NOT: [{ email: { endsWith: '@system.finda.sale' } }, { email: { endsWith: '@example.com' } }] },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          roles: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.sale.findMany({
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          organizer: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    // BUG #2: return a computed display role for New Sign-ups so array-only
    // organizers/admins show the correct badge (the frontend renders `.role`).
    const formattedRecentUsers = recentUsers.map((u: any) => ({
      ...u,
      role: displayRole(u.roles, u.role),
    }));

    res.json({
      recentPurchases,
      recentUsers: formattedRecentUsers,
      recentSales,
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ message: 'Failed to fetch activity' });
  }
};

// PATCH /api/admin/organizers/:organizerId/tier — update organizer subscription tier
export const updateOrganizerTier = async (req: AuthRequest, res: Response) => {
  try {
    const { organizerId } = req.params;
    const { tier } = req.body;

    // Validate tier value against enum
    if (!['SIMPLE', 'PRO', 'TEAMS'].includes(tier)) {
      return res.status(400).json({ message: 'Invalid subscription tier. Must be SIMPLE, PRO, or TEAMS.' });
    }

    // Update organizer tier and increment tokenVersion to invalidate stale JWTs
    const updatedOrganizer = await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        subscriptionTier: tier,
        tokenVersion: {
          increment: 1,
        },
      },
      select: {
        id: true,
        subscriptionTier: true,
        tokenVersion: true,
        businessName: true,
        userId: true,
      },
    });

    // Notification-gap fix (S1195, 2026-08-08): an admin changing an organizer's billing
    // tier is a real account/billing change (Free->PRO grants features, PRO->SIMPLE removes
    // them) and previously notified nobody at all -- inconsistent with suspendUser/
    // unsuspendUser above, which both already notify. sendEmail: true since a tier change
    // affects what the organizer can do right now, not something they'd only see by
    // happening to open the app.
    createNotification({
      userId: updatedOrganizer.userId,
      type: 'organizer_tier_changed',
      title: 'Your FindA.Sale plan has changed',
      body: `Your organizer account was moved to the ${tier} plan by an administrator.`,
      link: '/organizer/settings',
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err) => {
      console.error('[SecurityNotification] Failed to send organizer_tier_changed notification:', err);
    });

    res.json(updatedOrganizer);
  } catch (error) {
    console.error('Error updating organizer tier:', error);
    res.status(500).json({ message: 'Failed to update organizer tier' });
  }
};

// GET /api/admin/ai-usage — #104 AI Cost Ceiling + Usage Tracking
export const getAIUsage = async (req: AuthRequest, res: Response) => {
  try {
    const usage = await getMonthlyAICost();
    const costPercentage = (usage.estimatedCost / usage.ceiling) * 100;

    // Ground-truth comparison (2026-07-19): the Redis estimate above uses one flat per-token
    // rate for every model, while ApiUsageLog is written with real per-model pricing -- these
    // can diverge by 5x+ in a Haiku- or Opus-heavy month. Additive-only fields; nothing existing
    // removed or renamed, so this stays backward-compatible for the current frontend.
    const logCost = await getMonthlyAICostFromLog();
    const costDivergencePct = logCost.actualCostFromLog > 0
      ? parseFloat((((usage.estimatedCost - logCost.actualCostFromLog) / logCost.actualCostFromLog) * 100).toFixed(1))
      : null;

    // Web Detection: separate line item, separate ceiling — ADR-web-detection-hard-gating-2026-07-01
    const webDetection = await getMonthlyWebDetectionCost();
    const webDetectionCostPercentage = webDetection.ceiling > 0 ? (webDetection.estimatedCost / webDetection.ceiling) * 100 : 0;

    // eBay searchByImage: free (client-credentials Browse quota) — quota usage only, no $ ceiling.
    // ADR-ebay-searchbyimage-tagging-2026-07-02
    const ebayImageSearch = await getEbayImageSearchUsage();

    // Grounded identity: separate line item, separate ceiling — ADR grounded-identification-production-2026-07-02
    const grounding = await getMonthlyGroundingCost();
    const groundingCostPercentage = grounding.ceiling > 0 ? (grounding.estimatedCost / grounding.ceiling) * 100 : 0;

    res.json({
      monthKey: usage.monthKey,
      tokensUsed: usage.tokensUsed,
      estimatedCost: parseFloat(usage.estimatedCost.toFixed(2)),
      ceiling: usage.ceiling,
      costPercentage: parseFloat(costPercentage.toFixed(1)),
      status: usage.estimatedCost >= usage.ceiling ? 'EXCEEDED' : 'NORMAL',
      actualCostFromLog: parseFloat(logCost.actualCostFromLog.toFixed(2)),
      callCountFromLog: logCost.callCountFromLog,
      costDivergencePct,
      webDetection: {
        enabled: webDetection.enabled,
        monthKey: webDetection.monthKey,
        callsThisMonth: webDetection.callsThisMonth,
        estimatedCost: parseFloat(webDetection.estimatedCost.toFixed(2)),
        ceiling: webDetection.ceiling,
        costPercentage: parseFloat(webDetectionCostPercentage.toFixed(1)),
        dailyCapRemaining: webDetection.dailyCapRemaining,
        status: webDetection.estimatedCost >= webDetection.ceiling ? 'EXCEEDED' : 'NORMAL',
      },
      ebayImageSearch: {
        enabled: ebayImageSearch.enabled,
        callsToday: ebayImageSearch.callsToday,
        dailyCap: ebayImageSearch.dailyCap,
        dailyCapRemaining: ebayImageSearch.dailyCapRemaining,
        status: ebayImageSearch.dailyCapRemaining <= 0 ? 'CAP_REACHED' : 'NORMAL',
      },
      grounding: {
        enabled: grounding.enabled,
        textEnabled: grounding.textEnabled,
        visualEnabled: grounding.visualEnabled,
        rolloutPct: grounding.rolloutPct,
        monthKey: grounding.monthKey,
        estimatedCost: parseFloat(grounding.estimatedCost.toFixed(2)),
        ceiling: grounding.ceiling,
        costPercentage: parseFloat(groundingCostPercentage.toFixed(1)),
        dailyCap: grounding.dailyCap,
        dailyCapRemaining: grounding.dailyCapRemaining,
        status: grounding.estimatedCost >= grounding.ceiling ? 'EXCEEDED' : 'NORMAL',
      },
    });
  } catch (error) {
    console.error('Error fetching AI usage:', error);
    res.status(500).json({ message: 'Failed to fetch AI usage' });
  }
};

// POST /api/admin/ai-usage/reset — #104 Reset monthly AI cost counter (admin only)
export const resetAIUsage = async (req: AuthRequest, res: Response) => {
  try {
    await resetMonthlyAICost();
    res.json({ message: 'AI usage counter reset successfully' });
  } catch (error) {
    console.error('Error resetting AI usage:', error);
    res.status(500).json({ message: 'Failed to reset AI usage' });
  }
};

// GET /api/admin/cloudinary-usage — #105 Cloudinary Bandwidth Monitoring + Alerts
export const getCloudinaryUsage = async (req: AuthRequest, res: Response) => {
  try {
    const monthlyUsage = getMonthlyCloudinaryEstimate();
    const todayUsage = getTodayCloudinaryUsage();
    const threshold = getBandwidthThreshold();

    const usagePercentage = (monthlyUsage.estimatedBandwidthGB / threshold.limitGB) * 100;

    res.json({
      today: {
        dateKey: todayUsage.dateKey,
        serveCount: todayUsage.serveCount,
        estimatedBandwidthGB: parseFloat(todayUsage.estimatedBandwidthGB.toFixed(2)),
      },
      month: {
        monthKey: monthlyUsage.monthKey,
        serveCount: monthlyUsage.serveCount,
        estimatedBandwidthGB: parseFloat(monthlyUsage.estimatedBandwidthGB.toFixed(2)),
      },
      threshold: {
        limitGB: threshold.limitGB,
        thresholdGB: parseFloat(threshold.thresholdGB.toFixed(2)),
        thresholdPct: threshold.thresholdPct,
      },
      status: monthlyUsage.estimatedBandwidthGB >= threshold.thresholdGB ? 'WARNING' : 'NORMAL',
      usagePercentage: parseFloat(usagePercentage.toFixed(1)),
    });
  } catch (error) {
    console.error('Error fetching Cloudinary usage:', error);
    res.status(500).json({ message: 'Failed to fetch Cloudinary usage' });
  }
};

// POST /api/admin/cloudinary-usage/reset — #105 Reset daily Cloudinary serve count (admin only)
export const resetCloudinaryUsage = async (req: AuthRequest, res: Response) => {
  try {
    resetTodayCloudinaryUsage();
    res.json({ message: 'Cloudinary usage counter reset successfully' });
  } catch (error) {
    console.error('Error resetting Cloudinary usage:', error);
    res.status(500).json({ message: 'Failed to reset Cloudinary usage' });
  }
};

// GET /api/admin/bid-review — #94 Admin Bid Review Queue (fraud detection)

export const getBidReviewQueue = async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.bidIpRecord.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bidId: true,
        ipAddress: true,
        createdAt: true,
        bid: {
          select: {
            id: true,
            amount: true,
            item: { select: { id: true, title: true, currentBid: true } },
            user: { select: { id: true, name: true, email: true } },
          }
        }
      }
    });

    const formatted = records.map((record: any) => ({
      id: record.id,
      bidId: record.bidId,
      itemId: record.bid?.item?.id,
      itemTitle: record.bid?.item?.title,
      bidAmount: record.bid?.amount,
      bidderId: record.bid?.user?.id,
      bidderName: record.bid?.user?.name,
      bidderEmail: record.bid?.user?.email,
      ipAddress: record.ipAddress,
      createdAt: record.createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching bid review queue:', error);
    res.status(500).json({ message: 'Failed to fetch bid review queue' });
  }
};

// PATCH /api/admin/bids/:bidId/action — #94 Admin Bid Action (flag, approve, dismiss)
export const adminBidAction = async (req: AuthRequest, res: Response) => {
  try {
    const { bidId } = req.params;
    const { action } = req.body;

    if (!['flag', 'approve', 'dismiss'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be flag, approve, or dismiss.' });
    }

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
    });

    if (!bid) {
      return res.status(404).json({ message: 'Bid not found' });
    }

    // For now, just acknowledge the action (can be extended to store action in DB later)
    console.log(`[admin] Bid ${bidId} action: ${action}`);

    res.json({ message: `Bid ${action}ed successfully`, bidId, action });
  } catch (error) {
    console.error('Error performing bid action:', error);
    res.status(500).json({ message: 'Failed to perform bid action' });
  }
};

// GET /api/admin/items — global items search
export const getAdminItems = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';

    const where: any = {};

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          category: true,
          photoUrls: true,
          sale: {
            select: {
              title: true,
              organizer: {
                select: { businessName: true },
              },
            },
          },
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.item.count({ where }),
    ]);

    const formatted = items.map((item: any) => ({
      id: item.id,
      title: item.title,
      price: item.price ? Math.round(item.price * 100) : 0, // cents
      status: item.status,
      category: item.category,
      photoUrl: item.photoUrls && item.photoUrls.length > 0 ? item.photoUrls[0] : null,
      organizerName: item.sale?.organizer?.businessName || 'Unknown',
      saleTitle: item.sale?.title || 'Unknown',
      createdAt: item.createdAt,
    }));

    res.json({
      items: formatted,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching admin items:', error);
    res.status(500).json({ message: 'Failed to fetch items' });
  }
};

// GET /api/admin/feature-flags — list all feature flags
export const getFeatureFlags = async (req: AuthRequest, res: Response) => {
  try {
    const flags = await prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
      take: 1000,
    });

    res.json(flags);
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    res.status(500).json({ message: 'Failed to fetch feature flags' });
  }
};

// POST /api/admin/feature-flags — create new feature flag
export const createFeatureFlag = async (req: AuthRequest, res: Response) => {
  try {
    const { key, description, enabled, tierRestricted } = req.body;

    // Validate required fields
    if (!key || !key.trim()) {
      return res.status(400).json({ message: 'Flag key is required' });
    }

    // Check for unique key
    const existing = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (existing) {
      return res.status(409).json({ message: 'A flag with this key already exists' });
    }

    const flag = await prisma.featureFlag.create({
      data: {
        key: key.trim(),
        description: description?.trim() || '',
        enabled: enabled === true,
        tierRestricted: tierRestricted || null,
        updatedBy: req.user?.email || req.user?.id || 'unknown',
      },
    });

    res.status(201).json(flag);
  } catch (error) {
    console.error('Error creating feature flag:', error);
    res.status(500).json({ message: 'Failed to create feature flag' });
  }
};

// PATCH /api/admin/feature-flags/:id — update feature flag
export const updateFeatureFlag = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, description, tierRestricted } = req.body;

    // Build update data with only provided fields
    const updateData: any = {
      updatedBy: req.user?.email || req.user?.id || 'unknown',
    };

    if (enabled !== undefined) {
      updateData.enabled = enabled;
    }

    if (description !== undefined) {
      updateData.description = description.trim();
    }

    if (tierRestricted !== undefined) {
      updateData.tierRestricted = tierRestricted || null;
    }

    const flag = await prisma.featureFlag.update({
      where: { id },
      data: updateData,
    });

    res.json(flag);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Feature flag not found' });
    }
    console.error('Error updating feature flag:', error);
    res.status(500).json({ message: 'Failed to update feature flag' });
  }
};

// DELETE /api/admin/feature-flags/:id — delete feature flag
export const deleteFeatureFlag = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.featureFlag.delete({
      where: { id },
    });

    res.json({ message: 'Feature flag deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Feature flag not found' });
    }
    console.error('Error deleting feature flag:', error);
    res.status(500).json({ message: 'Failed to delete feature flag' });
  }
};

// ─── Curator Review Job Controllers ─────────────────────────────────────────────

// POST /api/admin/curator/run — manually trigger curator review job
export const runCuratorReviewJob = async (req: AuthRequest, res: Response) => {
  try {
    const { runCuratorReview } = await import('../jobs/curatorReviewJob');
    const result = await runCuratorReview();
    res.json(result);
  } catch (error: any) {
    console.error('Error running curator review job:', error);
    res.status(500).json({ message: 'Failed to run curator review job', error: error.message });
  }
};

// GET /api/admin/curator/status — get curator job status and Encyclopedia entry counts
export const getCuratorStatus = async (req: AuthRequest, res: Response) => {
  try {
    const [autoGeneratedCount, publishedCount] = await Promise.all([
      prisma.encyclopediaEntry.count({ where: { status: 'AUTO_GENERATED' } }),
      prisma.encyclopediaEntry.count({ where: { status: 'PUBLISHED' } }),
    ]);

    // Count entries that have been enriched (content contains Wikipedia extract)
    const enrichedButFlaggedCount = await prisma.encyclopediaEntry.count({
      where: {
        status: 'AUTO_GENERATED',
        content: { contains: '## Overview' },
      },
    });

    res.json({
      autoGeneratedCount,
      publishedCount,
      enrichedButFlaggedCount,
      totalEncyclopediaEntries: autoGeneratedCount + publishedCount,
    });
  } catch (error: any) {
    console.error('Error fetching curator status:', error);
    res.status(500).json({ message: 'Failed to fetch curator status', error: error.message });
  }
};

// POST /api/admin/curator/run/:entryId — manually trigger curator review for a single entry (testing)
export const runCuratorReviewJobSingle = async (req: AuthRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const { runCuratorReviewSingle } = await import('../jobs/curatorReviewJob');
    const result = await runCuratorReviewSingle(entryId);
    res.json(result);
  } catch (error: any) {
    console.error('Error running single curator review:', error);
    res.status(500).json({ message: 'Failed to run curator review', error: error.message });
  }
};

// GET /api/admin/curator/entries — get all AUTO_GENERATED encyclopedia entries awaiting review
export const getCuratorEntries = async (req: AuthRequest, res: Response) => {
  try {
    const entries = await prisma.encyclopediaEntry.findMany({
      where: { status: 'AUTO_GENERATED' },
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        content: true,
        triggerItemId: true,
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    res.json({ entries });
  } catch (error: any) {
    console.error('Error fetching curator entries:', error);
    res.status(500).json({ message: 'Failed to fetch curator entries', error: error.message });
  }
};

// PATCH /api/admin/curator/entries/:entryId — update encyclopedia entry status (e.g., mark as REJECTED)
export const updateCuratorEntry = async (req: AuthRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'FLAGGED', 'AUTO_GENERATED', 'UNDER_REVIEW', 'REJECTED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updated = await prisma.encyclopediaEntry.update({
      where: { id: entryId },
      data: { status },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Encyclopedia entry not found' });
    }
    console.error('Error updating curator entry:', error);
    res.status(500).json({ message: 'Failed to update curator entry', error: error.message });
  }
};

// GET /api/admin/scrape-pool-stats — scrape pool analytics dashboard
export const getScrapePoolStats = async (req: AuthRequest, res: Response) => {
  try {
    const activeScrapedWhere = { isUnmanagedListing: true, directoryStatus: { not: 'CLOSED' as const } };

    // Total scraped organizers
    const totalScrapedOrgs = await prisma.organizer.count({
      where: activeScrapedWhere,
    });

    // Tier distribution for scraped orgs
    const tierDistribution = await prisma.organizer.groupBy({
      by: ['leadTier'],
      _count: true,
      where: activeScrapedWhere,
    });

    const tierMap: Record<string, number> = {
      COLD: 0,
      WARM: 0,
      HOT: 0,
      ENTERPRISE: 0,
    };
    tierDistribution.forEach((t: any) => {
      if (t.leadTier && t.leadTier in tierMap) {
        tierMap[t.leadTier as string] = t._count;
      }
    });

    // Lead score stats for scraped orgs
    const scrapedOrgs = await prisma.organizer.findMany({
      where: activeScrapedWhere,
      select: { leadScore: true },
      take: 10000,
    });

    const leadScores = scrapedOrgs
      .map((o) => o.leadScore)
      .filter((score) => score !== null) as number[];

    let leadScoreStats = {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
    };

    if (leadScores.length > 0) {
      leadScoreStats = {
        min: Math.min(...leadScores),
        max: Math.max(...leadScores),
        avg: Math.round((leadScores.reduce((a, b) => a + b, 0) / leadScores.length) * 100) / 100,
        median: (() => {
          const sorted = [...leadScores].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        })(),
      };
    }

    // Enrichment coverage
    const enrichmentOrgs = await prisma.organizer.findMany({
      where: activeScrapedWhere,
      select: {
        scrapedEmail: true,
        contactEmail: true,
        lat: true,
        lng: true,
        isStateLicensed: true,
        googlePlaceId: true,
      },
      take: 10000,
    });

    const enrichmentCoverage = {
      withEmail: enrichmentOrgs.filter((o) => o.scrapedEmail || o.contactEmail).length,
      geocoded: enrichmentOrgs.filter((o) => o.lat !== null && o.lng !== null).length,
      licensed: enrichmentOrgs.filter((o) => o.isStateLicensed === true).length,
      googlePlaced: enrichmentOrgs.filter((o) => o.googlePlaceId).length,
    };

    const enrichmentPercentages = {
      withEmail: totalScrapedOrgs > 0 ? Math.round((enrichmentCoverage.withEmail / totalScrapedOrgs) * 100) : 0,
      geocoded: totalScrapedOrgs > 0 ? Math.round((enrichmentCoverage.geocoded / totalScrapedOrgs) * 100) : 0,
      licensed: totalScrapedOrgs > 0 ? Math.round((enrichmentCoverage.licensed / totalScrapedOrgs) * 100) : 0,
      googlePlaced: totalScrapedOrgs > 0 ? Math.round((enrichmentCoverage.googlePlaced / totalScrapedOrgs) * 100) : 0,
    };

    // Outreach status — queried from DirectoryClaimEmail live status (not audit logs)
    const outreachStatusCounts = await prisma.directoryClaimEmail.groupBy({
      by: ['status'],
      _count: true,
    });

    const outreachStatusMap: Record<string, number> = {};
    outreachStatusCounts.forEach((r: any) => {
      outreachStatusMap[r.status] = r._count;
    });

    const outreachOrgsWithSent = { length: outreachStatusMap['SENT'] ?? 0 };
    const outreachOrgsWithOpened = { length: await prisma.directoryClaimEmail.count({
      where: {
        OR: [
          { touch1OpenedAt: { not: null } },
          { touch2OpenedAt: { not: null } },
          { touch3OpenedAt: { not: null } },
          { touch4OpenedAt: { not: null } },
        ],
      },
    })};
    const outreachOrgsWithBounced = { length: outreachStatusMap['BOUNCED'] ?? 0 };

    // Last scrape runs grouped by source
    const scrapeRuns = await prisma.scrapedSalesJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { source: true, createdAt: true },
    });

    const lastScrapeRunsBySource: Record<string, string> = {};
    const sourceNames = new Set<string>();
    scrapeRuns.forEach((run: any) => {
      if (run.source && !sourceNames.has(run.source)) {
        lastScrapeRunsBySource[run.source] = run.createdAt.toISOString();
        sourceNames.add(run.source);
      }
    });

    // Recent additions (last 50 scraped orgs)
    const recentAdditions = await prisma.organizer.findMany({
      where: activeScrapedWhere,
      select: {
        id: true,
        businessName: true,
        address: true,
        leadTier: true,
        leadScore: true,
        scrapedEmail: true,
        directoryMostRecentSource: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const stats = {
      totalScrapedOrgs,
      tierDistribution: tierMap,
      leadScoreStats,
      enrichmentCoverage: enrichmentPercentages,
      outreachStatus: {
        contacted: outreachOrgsWithSent.length,
        opened: outreachOrgsWithOpened.length,
        bounced: outreachOrgsWithBounced.length,
      },
      lastScrapeRuns: lastScrapeRunsBySource,
      recentAdditions,
    };

    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching scrape pool stats:', error);
    res.status(500).json({ message: 'Failed to fetch scrape pool stats', error: error.message });
  }
};

// GET /api/admin/scraper/metros — return the full NATIONAL_METROS list for the admin picker
export async function getScrapeMetros(req: Request, res: Response): Promise<void> {
  try {
    const { NATIONAL_METROS } = await import('../jobs/scraperCron');
    res.json({ metros: NATIONAL_METROS });
  } catch {
    // Fallback if import fails — return empty so UI still works
    res.json({ metros: [] });
  }
}
// GET /api/admin/outreach-stats — Outreach email funnel metrics
export const getOutreachStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalInQueue,
      totalSent,
      totalClaimed,
      totalBounced,
      totalOptedOut,
      touch1Sent,
      touch1Opened,
      touch1Clicked,
      touch2Sent,
      touch2Opened,
      touch2Clicked,
      touch3Sent,
      touch3Opened,
      touch3Clicked,
      touch4Sent,
      touch4Opened,
      touch4Clicked,
    ] = await Promise.all([
      prisma.directoryClaimEmail.count(),
      prisma.directoryClaimEmail.count({ where: { OR: [{ status: 'SENT' }, { sentAt: { not: null } }] } }),
      prisma.directoryClaimEmail.count({ where: { status: 'CLAIMED' } }),
      prisma.directoryClaimEmail.count({ where: { status: 'BOUNCED' } }),
      prisma.directoryClaimEmail.count({ where: { status: 'OPTED_OUT' } }),
      prisma.directoryClaimEmail.count({ where: { touch1SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch1Opened: true } }),
      prisma.directoryClaimEmail.count({ where: { touch1Clicked: true } }),
      prisma.directoryClaimEmail.count({ where: { touch2SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch2Opened: true } }),
      prisma.directoryClaimEmail.count({ where: { touch2Clicked: true } }),
      prisma.directoryClaimEmail.count({ where: { touch3SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch3Opened: true } }),
      prisma.directoryClaimEmail.count({ where: { touch3Clicked: true } }),
      prisma.directoryClaimEmail.count({ where: { touch4SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch4Opened: true } }),
      prisma.directoryClaimEmail.count({ where: { touch4Clicked: true } }),
    ]);

    const pctStr = (num: number, den: number) =>
      den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '0.0%';

    res.json({
      totalInQueue,
      totalSent,
      totalClaimed,
      totalBounced,
      totalOptedOut,
      touch1: { sent: touch1Sent, opened: touch1Opened, clicked: touch1Clicked, openRate: pctStr(touch1Opened, touch1Sent), clickRate: pctStr(touch1Clicked, touch1Sent) },
      touch2: { sent: touch2Sent, opened: touch2Opened, clicked: touch2Clicked, openRate: pctStr(touch2Opened, touch2Sent), clickRate: pctStr(touch2Clicked, touch2Sent) },
      touch3: { sent: touch3Sent, opened: touch3Opened, clicked: touch3Clicked, openRate: pctStr(touch3Opened, touch3Sent), clickRate: pctStr(touch3Clicked, touch3Sent) },
      touch4: { sent: touch4Sent, opened: touch4Opened, clicked: touch4Clicked, openRate: pctStr(touch4Opened, touch4Sent), clickRate: pctStr(touch4Clicked, touch4Sent) },
      conversionRate: pctStr(totalClaimed, totalSent),
    });
  } catch (error) {
    console.error('Error fetching outreach stats:', error);
    res.status(500).json({ message: 'Failed to fetch outreach stats' });
  }
};

// GET /api/admin/drilldown/:metric — drill-down data for KPI cards
export const getDrilldown = async (req: AuthRequest, res: Response) => {
  try {
    const { metric } = req.params;

    if (metric === 'signups') {
      const users = await prisma.user.findMany({
        where: { NOT: [{ email: { endsWith: '@system.finda.sale' } }, { email: { endsWith: '@example.com' } }] },
        select: { id: true, name: true, email: true, createdAt: true, roles: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return res.json({ users });
    }

    if (metric === 'sales') {
      // FIX (P1 data integrity, 2026-08-08): real/published/ended/recentReal switched from
      // the ORGANIZER-level `isUnmanagedListing` flag to the SALE-level `sourceName`
      // provenance field -- see the identical fix + full rationale on realSalesCount above
      // (~line 46). `claimed` intentionally stays organizer-scoped: it answers a different
      // question ("sale volume belonging to claimed accounts"), not "was this sale built
      // in-app," so it is not part of this data-integrity bug and is left as-is.
      const [realSalesCount, scrapedSalesCount, claimedCount, publishedCount, endedCount, recentReal] = await Promise.all([
        prisma.sale.count({ where: { sourceName: null } }),
        prisma.sale.count({ where: { sourceName: { not: null } } }),
        prisma.sale.count({ where: { organizer: { isUnmanagedListing: false, isClaimed: true } } }),
        prisma.sale.count({ where: { sourceName: null, status: 'PUBLISHED' } }),
        prisma.sale.count({ where: { sourceName: null, status: 'ENDED' } }),
        prisma.sale.findMany({
          where: { sourceName: null },
          select: { id: true, title: true, status: true, createdAt: true, organizer: { select: { businessName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);
      return res.json({ real: realSalesCount, scraped: scrapedSalesCount, claimed: claimedCount, published: publishedCount, ended: endedCount, recentReal });
    }

    if (metric === 'scrapedsales') {
      // FIX (P1 data integrity, 2026-08-08): switched from `organizer.isUnmanagedListing: true`
      // to `sourceName: { not: null }` so this view keeps surfacing a sale's scraper-synced
      // rows even after the organizer claims their profile (isUnmanagedListing flips to false
      // on claim, but the scraped Sale row itself is untouched) -- see realSalesCount above.
      const sales = await prisma.sale.findMany({
        where: { sourceName: { not: null } },
        select: { id: true, title: true, status: true, createdAt: true, organizer: { select: { businessName: true, isClaimed: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return res.json({ sales });
    }

    if (metric === 'real-organizers') {
      const organizers = await prisma.organizer.findMany({
        where: { isUnmanagedListing: false },
        select: {
          id: true,
          businessName: true,
          contactEmail: true,
          isClaimed: true,
          subscriptionTier: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return res.json({ organizers });
    }

    return res.status(400).json({ message: 'Unknown metric. Use: signups, sales, scrapedsales, real-organizers' });
  } catch (error) {
    console.error('Error fetching drilldown:', error);
    res.status(500).json({ message: 'Failed to fetch drilldown data' });
  }
};

// GET /api/admin/outreach-opens — list emails with any touch opened
export const getOutreachOpens = async (req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.directoryClaimEmail.findMany({
      where: {
        OR: [
          { touch1OpenedAt: { not: null } },
          { touch2OpenedAt: { not: null } },
          { touch3OpenedAt: { not: null } },
          { touch4OpenedAt: { not: null } },
        ],
      },
      select: {
        emailAddress: true,
        status: true,
        touch1SentAt: true,
        touch1OpenedAt: true,
        touch2SentAt: true,
        touch2OpenedAt: true,
        touch3SentAt: true,
        touch3OpenedAt: true,
        touch4SentAt: true,
        touch4OpenedAt: true,
        organizer: {
          select: {
            businessName: true,
            website: true,
            address: true,
          },
        },
      },
      orderBy: [
        { touch4OpenedAt: 'desc' },
        { touch3OpenedAt: 'desc' },
        { touch2OpenedAt: 'desc' },
        { touch1OpenedAt: 'desc' },
      ],
    });

    // Flatten: find most recent open per row
    const opens = rows.map((r: any) => {
      const touchOpens = [
        { touch: 1, sentAt: r.touch1SentAt, openedAt: r.touch1OpenedAt },
        { touch: 2, sentAt: r.touch2SentAt, openedAt: r.touch2OpenedAt },
        { touch: 3, sentAt: r.touch3SentAt, openedAt: r.touch3OpenedAt },
        { touch: 4, sentAt: r.touch4SentAt, openedAt: r.touch4OpenedAt },
      ].filter((t) => t.openedAt);

      const latest = touchOpens.sort(
        (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
      )[0];

      return {
        emailAddress: r.emailAddress,
        organizerName: r.organizer?.businessName ?? null,
        website: r.organizer?.website ?? null,
        address: r.organizer?.address ?? null,
        status: r.status,
        touchNumber: latest?.touch ?? null,
        sentAt: latest?.sentAt ?? null,
        openedAt: latest?.openedAt ?? null,
        allOpens: touchOpens,
      };
    });

    res.json({ count: opens.length, opens });
  } catch (error: any) {
    console.error('Error fetching outreach opens:', error);
    res.status(500).json({ message: 'Failed to fetch outreach opens', error: error.message });
  }
};

// POST /api/admin/users/:userId/message
export const sendDirectMessageToUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { subject, body } = req.body;

    if (!subject?.trim() || !body?.trim()) {
      return res.status(400).json({ message: 'Subject and body are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await emailService.emails.send({
      from: 'FindA.Sale <support@finda.sale>',
      to: user.email,
      subject: subject.trim(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <p>Hi ${user.name || 'there'},</p>
          ${body.trim().split('\n').map((line: string) => `<p>${line || '&nbsp;'}</p>`).join('')}
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #666; font-size: 12px;">
            The FindA.Sale Team<br/>
            <a href="https://finda.sale">finda.sale</a>
          </p>
        </div>
      `,
      jobName: 'admin-direct-message',
    });

    res.json({ success: true, message: `Message sent to ${user.email}` });
  } catch (err: any) {
    console.error('[admin] sendDirectMessageToUser error:', err);
    res.status(500).json({ message: 'Failed to send message' });
  }
};
// ─── S1072 Finding #4: Global fraud-signal review (collusion/wash-trade + all FraudSignal rows) ─────
// Admin-only. Distinct from /api/admin/referral-fraud-signals (ReferralFraudSignal model) and
// /api/fraud/sale/:saleId (organizer PRO-tier, sale-scoped view of the same FraudSignal model).
// This is the global, cross-sale admin queue.

// GET /api/admin/fraud-signals — paginated, optional ?reviewOutcome= filter
export const listAllFraudSignals = async (req: AuthRequest, res: Response) => {
  try {
    const { reviewOutcome, page = '1', limit = '50' } = req.query as {
      reviewOutcome?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (reviewOutcome && reviewOutcome !== 'ALL') {
      where.reviewOutcome = reviewOutcome;
    }

    const [signals, total] = await Promise.all([
      prisma.fraudSignal.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          item: { select: { id: true, title: true } },
          sale: { select: { id: true, title: true } },
        },
        orderBy: [{ confidenceScore: 'desc' }, { detectedAt: 'desc' }],
        skip,
        take: limitNum,
      }),
      prisma.fraudSignal.count({ where }),
    ]);

    res.json({
      signals,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[admin] listAllFraudSignals error:', error);
    Sentry.captureException(error);
    res.status(500).json({ message: 'Failed to list fraud signals' });
  }
};

// PATCH /api/admin/fraud-signals/:id — set reviewOutcome + notes
export const reviewFraudSignalAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { reviewOutcome, notes } = req.body as { reviewOutcome?: string; notes?: string };

    if (!reviewOutcome || !['PENDING', 'DISMISSED', 'CONFIRMED'].includes(reviewOutcome)) {
      return res.status(400).json({ message: 'reviewOutcome must be one of PENDING, DISMISSED, CONFIRMED' });
    }

    const existing = await prisma.fraudSignal.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Fraud signal not found' });
    }

    const updated = await prisma.fraudSignal.update({
      where: { id },
      data: {
        reviewOutcome,
        notes: notes ?? existing.notes,
        reviewedByAdminId: req.user.id,
        reviewedAt: new Date(),
      },
    });

    res.json({ signal: updated });
  } catch (error) {
    console.error('[admin] reviewFraudSignalAdmin error:', error);
    Sentry.captureException(error);
    res.status(500).json({ message: 'Failed to update fraud signal' });
  }
};

// GET /api/admin/marketplace-review-backlog — platform-wide, cross-organizer view of the
// Facebook Marketplace extension's removal dead-letter queue (2026-08-06). Root cause this
// closes: extensionController.ts's getPendingRemovals/getSyncHealth compute this exact
// "needsManualReview" / "manualReviewBacklog" set already, but BOTH are organizer-scoped
// (require a logged-in organizer's own userId) -- Patrick's admin dashboard had zero
// visibility into stuck items platform-wide. Confirmed live: 6 SOLD items stuck past
// MAX_REMOVAL_SKIP_ATTEMPTS for one organizer, invisible outside their own extension popup.
//
// Deliberately read-only / no pagination -- this is a monitoring gap, not a broken workflow;
// the backlog is expected to be small (single/low-double-digit items). Reuses the imported
// MAX_REMOVAL_SKIP_ATTEMPTS constant and mirrors getPendingRemovals'/getSyncHealth's exact
// postedByItem/removedByItem/skipCount computation rather than inventing a fifth divergent
// implementation of the same dead-letter logic.
export const getMarketplaceReviewBacklog = async (req: AuthRequest, res: Response) => {
  try {
    // Platform-wide: every SOLD item under any non-deleted sale, regardless of organizer.
    const soldItems = await prisma.item.findMany({
      where: { sale: { deletedAt: null }, status: 'SOLD' },
      select: { id: true, title: true, saleId: true },
    });
    if (!soldItems.length) {
      return res.json({ items: [] });
    }

    const itemIds = soldItems.map((i) => i.id);
    const jobs = await prisma.marketplaceListingJob.findMany({
      where: { itemId: { in: itemIds } },
      select: { itemId: true, action: true, status: true, lastErrorMessage: true, lastAttemptAt: true },
    });

    const postedByItem = new Set<string>();
    const removedByItem = new Set<string>();
    const skipCountByItem = new Map<string, number>();
    const lastSkipReasonByItem = new Map<string, string | null>();
    const lastSkipAtByItem = new Map<string, Date>();
    for (const j of jobs) {
      if (j.action === 'POST' && j.status === 'POSTED') postedByItem.add(j.itemId);
      if (j.action === 'REMOVE' && j.status === 'REMOVED') removedByItem.add(j.itemId);
      if (j.action === 'REMOVE' && j.status === 'SKIPPED') {
        skipCountByItem.set(j.itemId, (skipCountByItem.get(j.itemId) || 0) + 1);
        lastSkipReasonByItem.set(j.itemId, j.lastErrorMessage ?? null);
        const attemptedAt = j.lastAttemptAt;
        if (attemptedAt && (!lastSkipAtByItem.has(j.itemId) || attemptedAt > lastSkipAtByItem.get(j.itemId)!)) {
          lastSkipAtByItem.set(j.itemId, attemptedAt);
        }
      }
    }

    const stillPendingRemoval = soldItems.filter((i) => postedByItem.has(i.id) && !removedByItem.has(i.id));
    const backlogItems = stillPendingRemoval.filter(
      (i) => (skipCountByItem.get(i.id) || 0) >= MAX_REMOVAL_SKIP_ATTEMPTS
    );

    if (!backlogItems.length) {
      return res.json({ items: [] });
    }

    // Join sale title + organizer businessName for display -- fetched once for the (small)
    // backlog set rather than a nested include on the full soldItems query above.
    const saleIds = [...new Set(backlogItems.map((i) => i.saleId).filter((id): id is string => !!id))];
    const sales = saleIds.length
      ? await prisma.sale.findMany({
          where: { id: { in: saleIds } },
          select: { id: true, title: true, organizer: { select: { businessName: true } } },
        })
      : [];
    const saleInfoById = new Map(sales.map((s) => [s.id, { saleTitle: s.title, organizerName: s.organizer?.businessName || '(unknown organizer)' }]));

    const items = backlogItems
      .map((i) => {
        const saleInfo = i.saleId ? saleInfoById.get(i.saleId) : undefined;
        return {
          itemId: i.id,
          itemTitle: i.title,
          saleTitle: saleInfo?.saleTitle || '(deleted sale)',
          organizerName: saleInfo?.organizerName || '(unknown organizer)',
          skipCount: skipCountByItem.get(i.id) || 0,
          lastErrorMessage: lastSkipReasonByItem.get(i.id) || null,
          lastAttemptAt: lastSkipAtByItem.get(i.id)?.toISOString() || null,
        };
      })
      // Most recently stuck first -- surfaces the freshest failures at the top.
      .sort((a, b) => (b.lastAttemptAt || '').localeCompare(a.lastAttemptAt || ''));

    res.json({ items });
  } catch (error) {
    console.error('[admin] getMarketplaceReviewBacklog error:', error);
    Sentry.captureException(error);
    res.status(500).json({ message: 'Failed to load marketplace review backlog' });
  }
};

// GET /api/admin/purchases -- searchable, filterable, paginated purchase list covering BOTH
// authenticated-user purchases AND guest checkouts (userId null). Built 2026-08-27 as part of
// the carding-incident cleanup: there was previously no admin surface to find or refund a guest
// purchase at all -- getUserById above can only ever reach purchases via User.purchases, which
// is structurally empty for every guest checkout (userId is NULL there by design -- POS walk-ins
// and online guest checkout, see schema.prisma Purchase.userId comment).
export const getAdminPurchases = async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query.status as string) || '';
    const saleId = (req.query.saleId as string) || '';
    const organizerId = (req.query.organizerId as string) || '';
    const search = (req.query.search as string) || '';
    const dateFrom = (req.query.dateFrom as string) || '';
    const dateTo = (req.query.dateTo as string) || '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    // Hard cap at 100 -- this is an admin lookup/cleanup tool, not a bulk export endpoint.
    const requestedLimit = parseInt(req.query.limit as string) || 25;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (saleId) where.saleId = saleId;
    if (organizerId) where.sale = { organizerId };
    if (search) {
      where.OR = [
        { buyerEmail: { contains: search, mode: 'insensitive' } },
        { guestName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          source: true,
          guestName: true,
          buyerEmail: true,
          stripePaymentIntentId: true,
          chargeType: true,
          refundedAt: true,
          refundedAmount: true,
          user: { select: { id: true, email: true, name: true } },
          item: { select: { id: true, title: true } },
          sale: { select: { id: true, title: true, organizerId: true, organizer: { select: { businessName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchase.count({ where }),
    ]);

    res.json({ purchases, total, page, limit });
  } catch (error) {
    console.error('Error fetching admin purchases:', error);
    res.status(500).json({ message: 'Failed to fetch purchases' });
  }
};

// POST /api/admin/purchases/bulk-refund -- refund up to 25 purchases in one admin action.
// Built alongside getAdminPurchases above for the same carding-incident cleanup gap (Patrick's
// direct ask: admin needs the ability to find/fix guest purchases en masse). Sequential (NOT
// Promise.all) so one Stripe failure can't leave concurrent writes in a bad interleaved state --
// matches the money-path discipline already established in refundService.ts's own TOCTOU claim.
// Each purchase's own current `amount` is fetched fresh here and passed through as the full
// refund amount -- this is a full-refund cleanup tool, not a partial-refund tool.
// Deliberately capped at 25: this is a cleanup tool scoped to a specific incident's purchases,
// not a mass-refund cannon -- needing more than 25 at once in the future is a signal to revisit
// the cap deliberately, not to raise it silently here.
export const bulkRefundPurchases = async (req: AuthRequest, res: Response) => {
  try {
    const { purchaseIds } = req.body as { purchaseIds?: string[] };

    if (!Array.isArray(purchaseIds) || purchaseIds.length === 0) {
      return res.status(400).json({ message: 'purchaseIds must be a non-empty array' });
    }
    if (purchaseIds.length > 25) {
      return res.status(400).json({ message: 'Cannot refund more than 25 purchases in a single request' });
    }

    const results: Array<{ purchaseId: string; success: boolean; refundedAmount?: number; error?: string }> = [];

    // Sequential loop, intentionally not parallelized -- see file comment above.
    for (const purchaseId of purchaseIds) {
      try {
        const purchase = await prisma.purchase.findUnique({
          where: { id: purchaseId },
          select: { amount: true, itemId: true },
        });
        if (!purchase) {
          results.push({ purchaseId, success: false, error: 'Purchase not found' });
          continue;
        }

        // Carding-incident cleanup tool -- always tags the Stripe refund `reason` as
        // 'fraudulent' so it's actually flagged in Stripe (Radar/reporting), not just
        // reversed with no reason on file. See refundService.ts's `reason` param (2026-08-28).
        const result = await executeVerifiedRefund(purchaseId, purchase.amount, 'admin', 'fraudulent');
        // BUG FIX 2026-08-28 (P0, live-DB-confirmed): executeVerifiedRefund deliberately does NOT
        // reset Item.status itself -- refundService.ts's own comment says that happens in "each
        // caller...right after this function returns", matching stripeController.ts's createRefund
        // (`packages/backend/src/controllers/stripeController.ts`, restores AVAILABLE right after
        // this same call) and disputeController.ts's updateDisputeStatus (identical pattern). This
        // admin bulk-refund caller was the one place that call was missing entirely -- confirmed via
        // direct prod DB query: 9 REFUNDED purchase rows across 4 real items left stuck at
        // Item.status=SOLD. Mirrors the exact same unconditional restore those two siblings already
        // use (no "was this the item's last outstanding sale" guard in either of them either).
        if (purchase.itemId) {
          await prisma.item.update({
            where: { id: purchase.itemId },
            data: { status: 'AVAILABLE' },
          });
        }
        results.push({ purchaseId, success: true, refundedAmount: result.refundedAmount });
      } catch (err) {
        if (err instanceof RefundError) {
          // Expected, per-item failure (already REFUNDED/FAILED, no payment intent, 30-day
          // window, etc.) -- report it and keep processing the rest of the batch.
          results.push({ purchaseId, success: false, error: err.message });
        } else {
          console.error(`[admin bulk-refund] Unexpected error refunding purchase ${purchaseId}:`, err);
          results.push({ purchaseId, success: false, error: err instanceof Error ? err.message : 'Unexpected error processing refund' });
        }
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Error bulk-refunding purchases:', error);
    res.status(500).json({ message: 'Failed to process bulk refund' });
  }
};

/**
 * Admin impersonation ("log in as user") — QA/support tooling, 2026-08-28.
 * Issues a short-lived (15m) accessToken cookie for the target user, identical in
 * shape to a real login's JWT payload (see authController.ts login functions) so
 * downstream code decodes it the same way. Deliberately issues NO refreshToken —
 * the session cannot silently renew itself; it just ends when the 15m token expires.
 * Every use is logged to AdminImpersonationLog. An admin can never impersonate
 * another admin (privilege-escalation guard), and cannot "impersonate" themselves.
 * No password is ever read, stored, or transmitted anywhere in this flow.
 */
export const impersonateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId: targetUserId } = req.params;
    const { reason } = req.body as { reason?: string };
    const adminUserId = req.user!.id;

    if (targetUserId === adminUserId) {
      return res.status(400).json({ message: 'Cannot impersonate yourself' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const targetRoles = targetUser.roles && targetUser.roles.length > 0 ? targetUser.roles : [targetUser.role];
    if (targetRoles.includes('ADMIN') || targetUser.role === 'ADMIN') {
      return res.status(403).json({ message: 'Cannot impersonate an admin account' });
    }

    // Mirror authController's login payload build exactly (organizerProfile +
    // subscriptionLapsed), so AuthContext on the frontend decodes an impersonated
    // session identically to a real one.
    let organizerProfile: Awaited<ReturnType<typeof prisma.organizer.findUnique>> = null;
    let subscriptionLapsed = false;
    if (targetUser.role === 'ORGANIZER' || targetUser.roles?.includes('ORGANIZER')) {
      organizerProfile = await prisma.organizer.findUnique({
        where: { userId: targetUser.id },
      });

      const roleSubscription = await prisma.userRoleSubscription.findFirst({
        where: { userId: targetUser.id, role: 'ORGANIZER' },
      });
      if (roleSubscription) {
        subscriptionLapsed = roleSubscription.tierLapsedAt !== null && roleSubscription.tierResumedAt === null;
      }
    }

    const accessToken = jwt.sign(
      {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
        roles: targetRoles,
        referralCode: targetUser.referralCode,
        tokenVersion: targetUser.tokenVersion,
        emailVerified: targetUser.emailVerified,
        subscriptionTier: organizerProfile?.subscriptionTier ?? 'SIMPLE',
        subscriptionStatus: organizerProfile?.subscriptionStatus ?? null,
        subscriptionLapsed,
        organizerTokenVersion: organizerProfile?.tokenVersion ?? 0,
        onboardingComplete: organizerProfile?.onboardingComplete ?? false,
        createdAt: targetUser.createdAt.toISOString(),
        huntPassActive: targetUser.huntPassActive,
        huntPassExpiry: targetUser.huntPassExpiry,
        guildXp: targetUser.guildXp || 0,
        impersonatedBy: adminUserId, // trace claim — any action taken during this session is attributable
      },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' } // deliberately shorter than real login's 1h — no refreshToken issued either
    );

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    // 2026-08-28: clear the ADMIN's own refreshToken cookie for the duration of the
    // impersonation session. Without this, any 401/403 the impersonated (lower-
    // privilege) user hits -- exactly the kind of permission-boundary check this
    // tool exists to QA -- trips the app's normal refresh interceptor, which still
    // holds the admin's real, valid refreshToken and silently re-mints an admin
    // accessToken, clobbering the impersonation with zero signal. Impersonation
    // was deliberately built with no refreshToken of its own (15m access-token-only,
    // see above); clearing the admin's real one here closes the silent-privilege-
    // escalation path instead of leaving it live in the background. If the 15m
    // window lapses mid-QA, the fix is a fresh "Log in as" click, not a silent
    // fallback to admin.
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    await prisma.adminImpersonationLog.create({
      data: {
        adminUserId,
        targetUserId,
        reason: reason ?? null,
      },
    });

    res.json({
      message: 'Impersonation session started',
      user: { id: targetUser.id, email: targetUser.email, name: targetUser.name },
    });
  } catch (error) {
    console.error('Error starting impersonation session:', error);
    res.status(500).json({ message: 'Failed to start impersonation session' });
  }
};
