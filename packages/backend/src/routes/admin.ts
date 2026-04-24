import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
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

export default router;
