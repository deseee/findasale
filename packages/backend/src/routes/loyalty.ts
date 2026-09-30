import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMyPassport,
  getMyPassportUnseen,
  markMyPassportSeen,
  getLootLegend,
  getCollectorLeague,
} from '../controllers/loyaltyController';

const router = Router();

router.get('/passport', authenticate, getMyPassport);
router.get('/passport/unseen', authenticate, getMyPassportUnseen);
router.post('/passport/seen', authenticate, markMyPassportSeen);
router.get('/loot-legend', authenticate, getLootLegend);
router.get('/collector-league', authenticate, getCollectorLeague);

export default router;
