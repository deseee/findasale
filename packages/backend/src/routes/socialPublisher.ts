/**
 * routes/socialPublisher.ts — admin-only in-house social publisher API (ADR-077 / ADR-077a).
 * Mounted at /api/social-publisher (distinct from /api/social, the Sprint-2 template gen).
 *
 * SECURITY (ADR-077a invariant #3, AUTHZ-ON-EVERY-ENDPOINT): EVERY route below is
 * guarded by BOTH `authenticate` AND `requireAdmin`. There is NO organizer / shopper /
 * anonymous access to this surface at all.
 *
 * NOTE on the OAuth callback: it is admin-only like everything else. The connected
 * admin's browser is redirected here with the code/state; because it carries the
 * httpOnly session cookie, `authenticate` still applies. (If a future OAuth provider
 * cannot round-trip the cookie, a signed-state exemption would be added deliberately —
 * not silently.)
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  listAccounts,
  startConnect,
  oauthCallback,
  disconnectAccount,
  listPosts,
  createPost,
  cancelPost,
} from '../controllers/socialPublisherController';

const router = Router();

// Every route: authenticate + requireAdmin. No exceptions.
router.use(authenticate, requireAdmin);

// Accounts
router.get('/accounts', listAccounts);
router.post('/connect', startConnect);
router.get('/oauth/callback/:platform', oauthCallback);
router.post('/disconnect', disconnectAccount);

// Posts / publish queue
router.get('/posts', listPosts);
router.post('/posts', createPost);
router.post('/posts/:id/cancel', cancelPost);

export default router;
