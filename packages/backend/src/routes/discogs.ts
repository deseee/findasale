import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import {
  connectDiscogsEndpoint,
  getDiscogsConnectionStatus,
  disconnectDiscogs,
  getDiscogsEligibility,
  pushItemToDiscogs,
  removeItemFromDiscogs,
} from '../controllers/discogsMarketplaceController';

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

export default router;
