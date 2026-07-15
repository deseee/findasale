/**
 * routes/marketplacePoster.ts — admin-only Marketplace Poster API (ADR-083).
 * Mounted at /api/marketplace-poster.
 *
 * SECURITY (AUTHZ-ON-EVERY-ENDPOINT): every route below is guarded by BOTH
 * `authenticate` AND `requireAdmin`. No organizer / shopper / anonymous access
 * to any route on this surface — this manages FindA.Sale-owned credentials,
 * not organizer data.
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { listAccounts, registerAccount, deactivateAccount, listJobs } from '../controllers/marketplacePosterController';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/accounts', listAccounts);
router.post('/accounts/register', registerAccount);
router.post('/accounts/:id/deactivate', deactivateAccount);

router.get('/jobs', listJobs);

export default router;
