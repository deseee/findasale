import { Router } from 'express';
import {
  createBounty,
  getSaleBounties,
  getMyBounties,
  fulfillBounty,
  cancelBounty,
  getLocalBounties,
  submitBountySubmission,
  getMySubmissions,
  approveDeclineSubmission,
  matchItemToBounties,
  completeBountyPurchase,
} from '../controllers/bountyController';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST and GET at root
router.post('/', authenticate, createBounty);                                  // POST   /api/bounties

// Specific GET routes (must come before /:id routes)
router.get('/my', authenticate, getMyBounties);                               // GET    /api/bounties/my
router.get('/local', authenticate, getLocalBounties);                         // GET    /api/bounties/local
router.get('/submissions', authenticate, getMySubmissions);                   // GET    /api/bounties/submissions
router.get('/sale/:saleId', authenticate, getSaleBounties);                   // GET    /api/bounties/sale/:saleId

// Submission routes (must come before generic /:id routes)
router.post('/:id/submissions', authenticate, submitBountySubmission);        // POST   /api/bounties/:id/submissions
router.patch('/submissions/:id', authenticate, approveDeclineSubmission);     // PATCH  /api/bounties/submissions/:id
router.post('/submissions/:id/purchase', authenticate, completeBountyPurchase); // POST   /api/bounties/submissions/:id/purchase

// Generic :id routes (must come last)
router.post('/:id/match', authenticate, matchItemToBounties);                 // POST   /api/bounties/:id/match
router.patch('/:id/fulfill', authenticate, fulfillBounty);                    // PATCH  /api/bounties/:id/fulfill
router.delete('/:id', authenticate, cancelBounty);                            // DELETE /api/bounties/:id

export default router;
