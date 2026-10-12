import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import {
  importLeads,
  importFromOrganizers,
  getQueue,
  getStats,
  pauseRecruit,
  resumeRecruit,
  suppressLead,
} from '../controllers/adminRecruitController';

const router = express.Router();

// All routes require authentication + admin role (same as routes/admin.ts)
router.use(authenticate, requireAdmin);

router.post('/leads/import', importLeads);
router.post('/leads/from-organizers', importFromOrganizers);
router.post('/leads/:id/suppress', suppressLead);
router.get('/queue', getQueue);
router.get('/stats', getStats);
router.post('/pause', pauseRecruit);
router.post('/resume', resumeRecruit);

export default router;
