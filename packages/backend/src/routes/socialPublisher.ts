/**
 * routes/socialPublisher.ts — admin-only in-house social publisher API (ADR-077 / ADR-077a).
 * Mounted at /api/social-publisher (distinct from /api/social, the Sprint-2 template gen).
 *
 * SECURITY (ADR-077a invariant #3, AUTHZ-ON-EVERY-ENDPOINT): EVERY route below is
 * guarded by BOTH `authenticate` AND `requireAdmin` — with ONE deliberate exception, the
 * GET OAuth callback, whose authorization is enforced by the single-use OAuth `state`
 * (see the NOTE below). There is NO organizer / shopper / anonymous access to any
 * mutating or data-returning route on this surface.
 *
 * NOTE on the OAuth callback: it is the ONE route NOT behind
 * `authenticate + requireAdmin`. The OAuth provider redirects the admin's browser
 * DIRECTLY to this backend origin (api.finda.sale), which does NOT receive the session
 * cookie set on the finda.sale origin — so a cookie-based guard would always fail here
 * and the connect could never complete. Its security instead comes from the OAuth
 * `state`: random, server-generated, single-use, stored in `pendingOAuth` ONLY by
 * `startConnect` (which IS admin-gated). A valid `state` therefore already proves the
 * flow was initiated by an authenticated admin — a deliberate signed-state exemption,
 * not a silent weakening.
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
  confirmPost,
} from '../controllers/socialPublisherController';

const router = Router();

// ── PUBLIC (cookie-optional) route — registered BEFORE the admin guard below. ──────────
// The OAuth provider redirects the admin's browser straight to api.finda.sale, which does
// not carry the finda.sale session cookie, so this route CANNOT require `authenticate`.
// Authorization is enforced by the single-use OAuth `state` inside `oauthCallback`
// (validated against `pendingOAuth`, which only `startConnect` — itself admin-gated —
// populates). All state + PKCE validation lives in the controller and is unchanged.
router.get('/oauth/callback/:platform', oauthCallback);

// Every route BELOW this line: authenticate + requireAdmin. No exceptions.
router.use(authenticate, requireAdmin);

// Accounts
router.get('/accounts', listAccounts);
router.post('/connect', startConnect);
router.post('/disconnect', disconnectAccount);

// Posts / publish queue
router.get('/posts', listPosts);
router.post('/posts', createPost);
router.post('/posts/:id/cancel', cancelPost);
// Second human gate for a STAGED (DRAFT) fan-out post — the ONLY publish-promotion path.
router.post('/posts/:id/confirm', confirmPost);

export default router;
