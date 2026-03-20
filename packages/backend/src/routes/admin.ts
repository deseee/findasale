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

export default router;
