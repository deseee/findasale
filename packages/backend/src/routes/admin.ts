import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import { prisma } from '../index';
import {
  getStats,
  getUsers,
  updateUserRole,
  suspendUser,
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
const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.patch('/users/:userId/role', updateUserRole);
router.patch('/users/:userId/suspend', suspendUser);
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
router.post('/scraper/runs', triggerScrapeRun);
router.get('/scraper/runs', getScrapeRuns);
router.get('/scraper/sales', getScrapedSales);
router.post('/scraper/takedown', emergencyTakedown);

// Scrape pool analytics dashboard
router.get('/scrape-pool-stats', getScrapePoolStats);

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
    const flagged = [];
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

export default router;
