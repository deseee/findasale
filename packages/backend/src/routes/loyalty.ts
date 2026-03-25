import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMyPassport, getLootLegend, getCollectorLeague } from '../controllers/loyaltyController';

const router = Router();

router.get('/passport', authenticate, getMyPassport);
router.get('/loot-legend', authenticate, getLootLegend);
router.get('/collector-league', authenticate, getCollectorLeague);

export default router;
