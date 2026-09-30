import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import { getCreators, getCommissions, markCommissionPaid, voidCommission, recordCommissionClawback } from '../controllers/adminAffiliateController';

const router = express.Router();

// All routes require authentication + admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/affiliate/creators — paginated list of users with affiliate activity
router.get('/creators', getCreators);

// Creator Program commission ledger (2026-09-29). Payouts are manual: mark-paid only records that an
// admin paid the creator outside the app, and only for APPROVED commissions.
router.get('/commissions', getCommissions);
router.post('/commissions/:id/mark-paid', markCommissionPaid);
router.post('/commissions/:id/void', voidCommission);
// Records that an admin handled the clawback of an already-paid commission whose purchase was refunded or disputed (note required). Nothing here moves money.
router.post('/commissions/:id/record-clawback', recordCommissionClawback);

export default router;
