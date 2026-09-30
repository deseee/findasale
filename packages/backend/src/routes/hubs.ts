import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  discoverHubs,
  getHub,
  createHub,
  updateHub,
  deleteHub,
  reopenHub,
  listMyHubs,
  getMyHub,
  setHubEvent,
} from '../controllers/hubController';

const router = Router();

// Public endpoints
router.get('/api/hubs', discoverHubs);
router.get('/api/hubs/:slug', getHub);

// Authenticated endpoints (organizer)
//
// TIER: Market Hubs are TEAMS. Governing docs:
//   - claude_docs/decisions-log.md, "2026-04-10 (S436) Sale Hubs Repurposed as Flea Market
//     Events Foundation": "Locked decisions: (1) Tier = TEAMS."
//   - claude_docs/strategy/roadmap.md rows #40 and #40a: Tier column TEAMS.
//   - Frontend: organizerNav 'hubs' + pages/organizer/hubs/* TierGate requiredTier="TEAMS",
//     TierComparisonTable "Market Hubs" TEAMS only.
//   - Every vendor-booth / settlement / cashier route in routes/vendorBooth.ts is already TEAMS.
// These hub write routes were PRO, which let a PRO organizer create a hub that the TEAMS-gated
// pages and vendor-booth routes then refused to manage. requireTier answers 403 with the
// standard body { code: 'TIER_REQUIRED', requiredTier, currentTier, upgradeUrl }.
//
// Reads (list mine / get mine) stay open to any organizer: an organizer who created hubs on a
// TEAMS plan and later downgraded must still be able to see them. CLOSING a market (DELETE)
// also stays open at any tier (ownership is still enforced in deleteHub): a closed market
// stops selling and stops vendor booth-fee billing, so a downgraded owner must never be
// trapped with a live market they cannot switch off. Only opening/changing a market is TEAMS.
router.get('/api/organizer/hubs', authenticate, listMyHubs);
router.get('/api/organizer/hubs/:hubId', authenticate, getMyHub);
router.post('/api/organizer/hubs', authenticate, requireTier('TEAMS'), createHub);
router.put('/api/organizer/hubs/:hubId', authenticate, requireTier('TEAMS'), updateHub);
router.delete('/api/organizer/hubs/:hubId', authenticate, deleteHub);
// Inverse of the DELETE above. deleteHub only sets isActive: false, so closing has to
// be undoable -- same auth, same ownership check. Reopening puts a market back on sale,
// so it is a TEAMS action (unlike closing).
router.post('/api/organizer/hubs/:hubId/reopen', authenticate, requireTier('TEAMS'), reopenHub);
router.patch('/api/organizer/hubs/:hubId/event', authenticate, requireTier('TEAMS'), setHubEvent);

export default router;
