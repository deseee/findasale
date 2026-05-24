import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import { getCreators } from '../controllers/adminAffiliateController';

const router = express.Router();

// All routes require authentication + admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/affiliate/creators — paginated list of users with affiliate activity
router.get('/creators', getCreators);

export default router;
