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
} from '../controllers/adminController';
import {
  createInvite,
  listInvites,
  deleteInvite,
} from '../controllers/betaInviteController';

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

export default router;
