import { Router } from 'express';
import {
  getIntakeLink,
  updateIntakeLink,
  rotateIntakeLink,
  getPublicIntakeInfo,
  submitIntakeRequest,
  listIntakeRequests,
  approveIntakeRequest,
  declineIntakeRequest,
} from '../controllers/consignorIntakeController';
import { authenticate } from '../middleware/auth';
import { consignorIntakeSubmitLimiter } from '../middleware/rateLimiter';

const router = Router();

// IMPORTANT: unlike routes/consignors.ts (whose public routes live under the distinct
// `/portal/:token` prefix), this router's public routes are a bare `/:token` at the root --
// the same shape as several routes below (`/link`, `/requests`). Express matches routes in
// REGISTRATION order, not by specificity, so every static route below must be registered
// BEFORE the `/:token` wildcard or it would never be reached (a GET to `/link` would match
// `/:token` first and hit getPublicIntakeInfo instead of getIntakeLink). Auth is therefore
// applied per-route below (not via a single `router.use(authenticate)`), so the public
// wildcard routes can still be registered last without becoming auth-gated.

// Link management (authenticated, TEAMS -- TEAMS check itself lives in each handler,
// matching the rest of consignorController.ts).
router.get('/link', authenticate, getIntakeLink);
router.patch('/link', authenticate, updateIntakeLink);
router.post('/link/rotate', authenticate, rotateIntakeLink);

// Review queue (authenticated, TEAMS)
router.get('/requests', authenticate, listIntakeRequests);
router.post('/requests/:id/approve', authenticate, approveIntakeRequest);
router.post('/requests/:id/decline', authenticate, declineIntakeRequest);

// Public endpoints — NO authentication required. Registered LAST (see note above).
router.get('/:token', getPublicIntakeInfo);
router.post('/:token/submit', consignorIntakeSubmitLimiter, submitIntakeRequest);

export default router;
