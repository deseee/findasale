import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getExtensionItems, markItemListed, markItemRemoved, markItemRemovalSkipped, getPendingRemovals, getPendingUpdates, markItemPriceSynced, getPendingSoldChecks, markItemSoldOnFacebook, getSyncHealth, decideMessageAutosendForItem } from '../controllers/extensionController';

// Endpoints for the FindA.Sale Marketplace Autofill browser extension (ADR-084).
// Auth is via Bearer token (the organizer's accessToken, read from the finda.sale
// cookie by the extension background worker). CORS for /api/extension is opened in
// index.ts (Bearer-only, no credentials) so the chrome-extension origin is allowed.
const router = Router();

router.get('/items', authenticate, requireOrganizer, requireTier('PRO'), getExtensionItems);
router.post('/items/:id/listed', authenticate, requireOrganizer, requireTier('PRO'), markItemListed);
router.post('/items/:id/removed', authenticate, requireOrganizer, requireTier('PRO'), markItemRemoved);
router.post('/items/:id/removal-skipped', authenticate, requireOrganizer, requireTier('PRO'), markItemRemovalSkipped);
router.get('/pending-removals', authenticate, requireOrganizer, requireTier('PRO'), getPendingRemovals);
router.get('/pending-updates', authenticate, requireOrganizer, requireTier('PRO'), getPendingUpdates);
router.post('/items/:id/price-synced', authenticate, requireOrganizer, requireTier('PRO'), markItemPriceSynced);
// Reverse-direction cross-channel sync: item sold NATIVELY on Facebook -> cascade into FindA.Sale.
router.get('/pending-sold-checks', authenticate, requireOrganizer, requireTier('PRO'), getPendingSoldChecks);
router.post('/items/:id/sold-on-facebook', authenticate, requireOrganizer, requireTier('PRO'), markItemSoldOnFacebook);
// Organizer-facing Marketplace Sync Health card on marketplace-extension.tsx -- cookie-authenticated
// web request (not Bearer/extension-origin), same auth chain as the 9 routes above.
router.get('/sync-health', authenticate, requireOrganizer, requireTier('PRO'), getSyncHealth);
// Feature #602 (2026-08-05): AI Message-Reply Autosend decision endpoint -- Bearer-
// authenticated, same chain as the other extension endpoints above.
router.post('/items/:id/message-autosend-decision', authenticate, requireOrganizer, requireTier('PRO'), decideMessageAutosendForItem);

export default router;
