import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import { prisma } from '../index';
import { Prisma } from '@prisma/client';
import {
  getStats,
  getUsers,
  getUserById,
  updateUserRole,
  suspendUser,
  unsuspendUser,
  deleteUser,
  restoreUser,
  getSales,
  deleteSale,
  getRecentActivity,
  updateOrganizerTier,
  getAIUsage,
  resetAIUsage,
  getCloudinaryUsage,
  resetCloudinaryUsage,
  getBidReviewQueue,
  adminBidAction,
  getAdminItems,
  getFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  runCuratorReviewJob,
  getCuratorStatus,
  runCuratorReviewJobSingle,
  getCuratorEntries,
  updateCuratorEntry,
  getScrapePoolStats,
  getScrapeMetros,
  getOutreachStats,
  getOutreachOpens,
  getDrilldown,
  sendDirectMessageToUser,
} from '../controllers/adminController';
import {
  createInvite,
  listInvites,
  deleteInvite,
} from '../controllers/betaInviteController';
import {
  getOrganizerPerformance,
  getRevenueReport,
} from '../controllers/adminReportsController';
import {
  sendBroadcast,
  getRecipientsPreview,
} from '../controllers/adminBroadcastController';
import {
  listFraudSignals,
  reviewFraudSignal,
} from '../controllers/referralController';
import {
  getScrapeSourcesStatus,
  triggerScrapeRun,
  getScrapeRuns,
  getScrapedSales,
  emergencyTakedown,
} from '../controllers/scraperController';
import { isEmailDomainBlocked } from '../services/suppressionService';
import { sendTestEmailLimiter } from '../middleware/rateLimiter';
const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/users/:userId', getUserById);
router.patch('/users/:userId/role', updateUserRole);
router.patch('/users/:userId/suspend', suspendUser);
router.patch('/users/:userId/unsuspend', unsuspendUser);
router.delete('/users/:userId', deleteUser);
router.post('/users/:userId/message', sendDirectMessageToUser);
router.patch('/users/:userId/restore', restoreUser);
router.get('/sales', getSales);
router.delete('/sales/:saleId', deleteSale);
router.get('/activity', getRecentActivity);
router.patch('/organizers/:organizerId/tier', updateOrganizerTier);

// Beta invite management
router.get('/invites', listInvites);
router.post('/invites', createInvite);
router.delete('/invites/:inviteId', deleteInvite);

// #104 AI Cost Ceiling + Usage Tracking
router.get('/ai-usage', getAIUsage);
router.post('/ai-usage/reset', resetAIUsage);

// #105 Cloudinary Bandwidth Monitoring + Alerts
router.get('/cloudinary-usage', getCloudinaryUsage);
router.post('/cloudinary-usage/reset', resetCloudinaryUsage);

// #94 Admin Bid Review Queue — fraud detection
router.get('/bid-review', getBidReviewQueue);
router.patch('/bids/:bidId/action', adminBidAction);

// Reports endpoints
router.get('/reports/organizers', getOrganizerPerformance);
router.get('/reports/revenue', getRevenueReport);

// Broadcast endpoints
router.post('/broadcast', sendBroadcast);
router.get('/broadcast/preview', getRecipientsPreview);

// Global items search
router.get('/items', getAdminItems);

// Feature flags CRUD
router.get('/feature-flags', getFeatureFlags);
router.post('/feature-flags', createFeatureFlag);
router.patch('/feature-flags/:id', updateFeatureFlag);
router.delete('/feature-flags/:id', deleteFeatureFlag);

// D-XP-004 Phase 5: Referral fraud review endpoints
router.get('/referral-fraud-signals', listFraudSignals);
router.patch('/referral-fraud-signals/:signalId/review', reviewFraudSignal);

// ADR-069 Phase 2: Curator review job — automated Encyclopedia promotion
router.post('/curator/run', runCuratorReviewJob);
router.get('/curator/status', getCuratorStatus);
router.post('/curator/run/:entryId', runCuratorReviewJobSingle);
router.get('/curator/entries', getCuratorEntries);
router.patch('/curator/entries/:entryId', updateCuratorEntry);

// ADR-073 Phase 1: Directory scraper management
router.get('/scraper/sources', getScrapeSourcesStatus);
router.get('/scraper/metros', getScrapeMetros);
router.post('/scraper/runs', triggerScrapeRun);
router.get('/scraper/runs', getScrapeRuns);
router.get('/scraper/sales', getScrapedSales);
router.post('/scraper/takedown', emergencyTakedown);

// Scrape pool analytics dashboard
router.get('/scrape-pool-stats', getScrapePoolStats);

// Outreach funnel stats and KPI drilldowns
router.get('/outreach-stats', getOutreachStats);
router.get('/outreach-opens', getOutreachOpens);
router.get('/drilldown/:metric', getDrilldown);

// Feature #362: GET /api/admin/xp-velocity — XP exploit detection
router.get('/xp-velocity', authenticate, requireAdmin, async (req: any, res: any) => {
  try {
    // Find users with XP gains > 500 in any 1-hour window in the last 7 days
    const sevenDaysAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);

    // Use raw SQL to aggregate XP events by user+hour
    const results = await (prisma as any).$queryRaw`
      SELECT
        u.id as userId,
        u.name as userName,
        u.email,
        MAX(EXTRACT(EPOCH FROM (pt.createdAt - interval '1 hour' * FLOOR(EXTRACT(EPOCH FROM pt.createdAt) / 3600))) / 3600)::int as hour_bucket,
        SUM(pt.amount) FILTER (WHERE pt.createdAt >= NOW() - interval '7 days' AND pt.type = 'AWARD') as hourly_xp,
        SUM(pt.amount) FILTER (WHERE pt.createdAt >= NOW() - interval '7 days' AND pt.type = 'AWARD') as total_xp_7d
      FROM "PointsTransaction" pt
      JOIN "User" u ON u.id = pt.userId
      WHERE pt.type = 'AWARD' AND pt.createdAt >= ${sevenDaysAgo}
      GROUP BY u.id, u.name, u.email, FLOOR(EXTRACT(EPOCH FROM pt.createdAt) / 3600)
      HAVING SUM(pt.amount) > 500
      ORDER BY hourly_xp DESC
      LIMIT 100
    `;

    // Enrich with recent events for each user
    const flagged: any[] = [];
    const processedUsers = new Set();

    for (const result of results) {
      if (processedUsers.has(result.userId)) continue;
      processedUsers.add(result.userId);

      // Get last 5 points transactions for this user
      const recentEvents = await (prisma as any).pointsTransaction.findMany({
        where: {
          userId: result.userId,
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          points: true,
          type: true,
          description: true,
          createdAt: true,
        },
      });

      // Calculate actual max hourly points
      const txsByHour = new Map<number, number>();
      const userEvents = await (prisma as any).pointsTransaction.findMany({
        where: {
          userId: result.userId,
          createdAt: { gte: sevenDaysAgo },
          points: { gt: 0 },
        },
        select: { points: true, createdAt: true },
      });

      for (const evt of userEvents) {
        const hourBucket = Math.floor(evt.createdAt.getTime() / (60 * 60 * 1000));
        txsByHour.set(hourBucket, (txsByHour.get(hourBucket) || 0) + evt.points);
      }

      const maxHourlyXp = Math.max(...Array.from(txsByHour.values()));
      const totalXp7d = userEvents.reduce((sum, evt) => sum + evt.points, 0);

      if (maxHourlyXp > 500) {
        flagged.push({
          userId: result.userId,
          userName: result.userName,
          email: result.email,
          maxHourlyXp,
          totalXpLast7Days: totalXp7d,
          recentEvents: recentEvents.map((evt) => ({
            id: evt.id,
            points: evt.points,
            description: evt.description,
            createdAt: evt.createdAt,
          })),
        });
      }
    }

    res.json({ flagged });
  } catch (error) {
    console.error('Error fetching XP velocity:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Feature #453: Unmet Demand Signals — paginated, grouped by query
router.get('/demand-signals', async (req: any, res: any) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = 50;
    const offset = (page - 1) * limit;
    const city = (req.query.city as string) || null;
    const minCount = Math.max(1, parseInt((req.query.minCount as string) || '2', 10));

    const cityFilter = city ? Prisma.sql`AND city = ${city}` : Prisma.empty;

    const rows: any[] = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        query,
        city,
        COUNT(*)::int AS "searchCount",
        MAX("createdAt") AS "lastSearched"
      FROM "UnmetDemandSignal"
      WHERE 1=1 ${cityFilter}
      GROUP BY query, city
      HAVING COUNT(*) >= ${minCount}
      ORDER BY "searchCount" DESC, "lastSearched" DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalRow: any[] = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total FROM (
        SELECT query, city
        FROM "UnmetDemandSignal"
        WHERE 1=1 ${cityFilter}
        GROUP BY query, city
        HAVING COUNT(*) >= ${minCount}
      ) sub
    `);

    const cities: any[] = await (prisma as any).$queryRaw`
      SELECT DISTINCT city FROM "UnmetDemandSignal" WHERE city IS NOT NULL ORDER BY city
    `;

    res.json({
      signals: rows,
      total: totalRow[0]?.total ?? 0,
      page,
      pages: Math.ceil((totalRow[0]?.total ?? 0) / limit),
      cities: cities.map((c: any) => c.city),
    });
  } catch (error) {
    console.error('Error fetching demand signals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Feature #455: Shopper Notify Me Waitlist
router.get('/waitlist', async (req: any, res: any) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = 50;
    const activeOnly = req.query.activeOnly !== 'false';

    const where: any = {};
    if (activeOnly) where.isActive = true;

    const [entries, total] = await Promise.all([
      (prisma as any).shopperWaitlistEntry.findMany({
        where,
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).shopperWaitlistEntry.count({ where }),
    ]);

    res.json({
      entries,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Feature #458: Directory Confidence Scores — sorted lowest first
router.get('/organizers/confidence', async (req: any, res: any) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = 50;

    const [organizers, total] = await Promise.all([
      (prisma as any).organizer.findMany({
        where: { isUnmanagedListing: false },
        select: {
          id: true,
          businessName: true,
          address: true,
          directoryConfidenceScore: true,
          confidenceLastCalculated: true,
        },
        orderBy: { directoryConfidenceScore: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).organizer.count({ where: { isUnmanagedListing: false } }),
    ]);

    res.json({
      organizers,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching organizer confidence scores:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



// Feature #472: POST /admin/send-test-email — allows automation (e.g. Claude via Chrome MCP)
// to send test emails without manual Gmail interaction.
// Rail defaults to 'resend' (reliable transactional rail). Gmail fallback via rail='gmail'.
router.post('/send-test-email', sendTestEmailLimiter, async (req: any, res: any) => {
  try {
    const { to, subject, body, rail = 'resend' } = req.body as {
      to: string;
      subject: string;
      body: string;
      rail?: 'gmail' | 'resend';
    };

    // --- Input validation ---
    if (!to || typeof to !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: to' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid email address: to' });
    }
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: subject' });
    }
    if (subject.length > 200) {
      return res.status(400).json({ success: false, error: 'subject exceeds 200 character limit' });
    }
    if (!body || typeof body !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: body' });
    }
    if (body.length > 10000) {
      return res.status(400).json({ success: false, error: 'body exceeds 10000 character limit' });
    }
    if (rail !== 'resend' && rail !== 'gmail') {
      return res.status(400).json({ success: false, error: "rail must be 'resend' or 'gmail'" });
    }

    const toAddress = to.trim();

    // Domain block guard — applies to both rails (belt-and-suspenders)
    if (isEmailDomainBlocked(toAddress)) {
      return res.status(400).json({ success: false, error: 'Recipient domain blocked — cannot send to this address' });
    }

    if (rail === 'gmail') {
      // Gmail rail — uses existing emailService (Gmail API via OAuth2, quota-gated)
      const { emailService } = await import('../lib/emailService');
      const fromAddress = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
      const result = await emailService.emails.send({
        from: `FindA.Sale <${fromAddress}>`,
        to: toAddress,
        subject,
        html: body,
        jobName: 'admin-send-test-email',
      });
      const messageId = (result as any)?.data?.id ?? undefined;
      return res.json({ success: true, messageId, rail: 'gmail' });
    }

    // Resend rail (default) — call Resend SDK directly to capture messageId
    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ success: false, error: 'RESEND_API_KEY not configured' });
    }
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = process.env.RESEND_FROM_EMAIL;
    if (!fromAddress) {
      return res.status(503).json({ success: false, error: 'RESEND_FROM_EMAIL not configured' });
    }
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: toAddress,
      subject,
      html: body,
    });
    if (error) {
      console.error('[admin/send-test-email] Resend error:', error);
      return res.status(502).json({ success: false, error: error.message });
    }
    return res.json({ success: true, messageId: data?.id, rail: 'resend' });

  } catch (err: any) {
    console.error('[admin/send-test-email] Unexpected error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
  }
});

export default router;
