import { Router } from 'express';
import { createBounty, getSaleBounties, getMyBounties, fulfillBounty, cancelBounty } from '../controllers/bountyController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/', authenticate, createBounty);                      // POST   /api/bounties
router.get('/my', authenticate, getMyBounties);                    // GET    /api/bounties/my
router.get('/sale/:saleId', authenticate, getSaleBounties);        // GET    /api/bounties/sale/:saleId
router.patch('/:id/fulfill', authenticate, fulfillBounty);         // PATCH  /api/bounties/:id/fulfill
router.delete('/:id', authenticate, cancelBounty);                 // DELETE /api/bounties/:id

export default router;
