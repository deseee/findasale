import { Router } from 'express';
import { getClearanceItems } from '../controllers/clearanceController';

const router = Router();

// GET /api/clearance — public, no auth required
// Returns AVAILABLE items from ENDED sales for shopper clearance discovery
router.get('/', getClearanceItems);

export default router;
