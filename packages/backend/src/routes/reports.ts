import { Router } from 'express';
import { getMonthlyReport } from '../controllers/reportsController';

const router = Router();

// GET /api/reports/:year/:month — public, no auth required
router.get('/:year/:month', getMonthlyReport);

export default router;
