import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import {
  connectReverbEndpoint,
  getReverbConnectionStatus,
  disconnectReverb,
  pushItemToReverb,
  removeItemFromReverb,
} from '../controllers/reverbMarketplaceController';

// Universal Crosslister — Official-API Tier: Reverb Personal Access Token connection +
// listing push/remove. See claude_docs/architecture/ADR-DRAFT-universal-crosslister-buildout-2026-08-12.md
// (ADDENDUM 2026-08-18) and reverbConnector.ts's file header for build context + open items
// (including the 2026-08-18 auth-model correction — no OAuth callback route exists).
const router = Router();

// Connect (organizer pastes their own Reverb Personal Access Token; authenticated, no
// public callback route needed for this auth model)
router.post('/connect', authenticate, requireOrganizer, connectReverbEndpoint);

// Connection management
router.get('/connection', authenticate, requireOrganizer, getReverbConnectionStatus);
router.delete('/connection', authenticate, requireOrganizer, disconnectReverb);

// Listing push/remove — every route resolves the organizer from the JWT subject; none
// accepts an organizer id from the client (AUTHZ-ON-EVERY-ENDPOINT / OWNERSHIP invariant,
// CLAUDE.md §9 Security-QA Gate — full adversarial pass happens at QA time, not here).
router.post('/items/:id/listing', authenticate, requireOrganizer, pushItemToReverb);
router.delete('/items/:id/listing', authenticate, requireOrganizer, removeItemFromReverb);

export default router;
