import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate, requireOrganizer, requireAdmin, AuthRequest } from '../middleware/auth';
import {
  connectDiscogsEndpoint,
  getDiscogsConnectionStatus,
  disconnectDiscogs,
  getDiscogsEligibility,
  pushItemToDiscogs,
  removeItemFromDiscogs,
} from '../controllers/discogsMarketplaceController';
import {
  getDiscogsMatch,
  rerunDiscogsMatch,
  selectDiscogsRelease,
  markNotInDiscogs,
  putRecordIdentity,
  correctDiscogsListing,
  sweepOwnDiscogsMatches,
  adminSweepDiscogsMatches,
} from '../controllers/discogsMatchController';

// Universal Crosslister — Official-API Tier: Discogs Personal Access Token
// connection + listing push/remove. See
// claude_docs/architecture/ADR-discogs-listing-connector-2026-08-24.md and
// discogsListingConnector.ts's file header for build context (no OAuth callback
// route — organizer pastes their own Discogs Personal Access Token).
const router = Router();

// Connect (organizer pastes their own Discogs Personal Access Token; authenticated)
router.post('/connect', authenticate, requireOrganizer, connectDiscogsEndpoint);

// Connection management
router.get('/connection', authenticate, requireOrganizer, getDiscogsConnectionStatus);
router.delete('/connection', authenticate, requireOrganizer, disconnectDiscogs);

// Eligibility pre-check — does this item have a matching Discogs catalog release?
router.get('/items/:id/eligibility', authenticate, requireOrganizer, getDiscogsEligibility);

// Listing push/remove — every route resolves the organizer from the JWT subject; none
// accepts an organizer id from the client (AUTHZ-ON-EVERY-ENDPOINT / OWNERSHIP invariant,
// CLAUDE.md §9 Security-QA Gate — full adversarial pass happens at QA time, not here).
router.post('/items/:id/listing', authenticate, requireOrganizer, pushItemToDiscogs);
router.delete('/items/:id/listing', authenticate, requireOrganizer, removeItemFromDiscogs);

// ADR-132: release matching + organizer confirmation + per-item correction + rematch sweep.
// Every route: authenticate + requireOrganizer (admin sweep: requireAdmin), organizer derived
// from the JWT, item ownership re-checked in the controller AND the connector.
const perUserKey = (req: any) => (req as AuthRequest).user?.id ?? ipKeyGenerator(req.ip ?? '');
const discogsMatchSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many Discogs searches. Wait a minute and try again.', code: 'rate_limited' },
});
// Looser limiter for the read-only match GET (it can trigger a lazy Discogs search).
const discogsMatchReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Wait a minute and try again.', code: 'rate_limited' },
});
const discogsSweepLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sweep runs. Try again in a few minutes.', code: 'rate_limited' },
});

router.get('/items/:id/match', authenticate, requireOrganizer, discogsMatchReadLimiter, getDiscogsMatch);
router.post('/items/:id/match/rerun', authenticate, requireOrganizer, discogsMatchSearchLimiter, rerunDiscogsMatch);
router.post('/items/:id/match/select', authenticate, requireOrganizer, discogsMatchSearchLimiter, selectDiscogsRelease);
router.post('/items/:id/match/not-in-discogs', authenticate, requireOrganizer, markNotInDiscogs);
router.put('/items/:id/record-identity', authenticate, requireOrganizer, discogsMatchSearchLimiter, putRecordIdentity);
router.post('/items/:id/listing/correct', authenticate, requireOrganizer, discogsMatchSearchLimiter, correctDiscogsListing);
router.post('/match/sweep', authenticate, requireOrganizer, discogsSweepLimiter, sweepOwnDiscogsMatches);
router.post('/admin/match/sweep', authenticate, requireAdmin, discogsSweepLimiter, adminSweepDiscogsMatches);

export default router;
