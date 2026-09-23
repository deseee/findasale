import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getExtensionItems, markItemListed, markItemRemoved, markItemRemovalSkipped, getPendingRemovals, getPendingUpdates, markItemPriceSynced, getPendingSoldChecks, markItemSoldOnFacebook, markItemAlreadyPostedManually, getSyncHealth, decideMessageAutosendForItem, getPendingRenewals, getAutolistQueue, getPriceSyncQueue, markItemPriceSyncedForPlatform, setItemRemoteListingId, reportVintedSold } from '../controllers/extensionController';

// Endpoints for the FindA.Sale Marketplace Autofill browser extension (ADR-084).
// Auth is via Bearer token (the organizer's accessToken, read from the finda.sale
// cookie by the extension background worker). CORS for /api/extension is opened in
// index.ts (Bearer-only, no credentials) so the chrome-extension origin is allowed.
const router = Router();

router.get('/items', authenticate, requireOrganizer, requireTier('PRO'), getExtensionItems);
router.post('/items/:id/listed', authenticate, requireOrganizer, requireTier('PRO'), markItemListed);
// S-EXT-VINTED-REMOTE-LISTING-ID (2026-09-23): set-once numeric marketplace listing id on the item's
// live POST/POSTED job (Vinted only today) -- see extensionController.ts setItemRemoteListingId.
router.post('/items/:id/remote-listing-id', authenticate, requireOrganizer, requireTier('PRO'), setItemRemoteListingId);
// S-EXT-VINTED-SOLD-DETECT (2026-09-23): batch of the organizer's own Vinted listings that Vinted
// shows as sold -> resolve to their FindA.Sale items and commit the sale (lastSoldVia 'VINTED').
// See extensionController.ts reportVintedSold.
router.post('/vinted-sold', authenticate, requireOrganizer, requireTier('PRO'), reportVintedSold);
router.post('/items/:id/removed', authenticate, requireOrganizer, requireTier('PRO'), markItemRemoved);
router.post('/items/:id/removal-skipped', authenticate, requireOrganizer, requireTier('PRO'), markItemRemovalSkipped);
router.get('/pending-removals', authenticate, requireOrganizer, requireTier('PRO'), getPendingRemovals);
router.get('/pending-updates', authenticate, requireOrganizer, requireTier('PRO'), getPendingUpdates);
router.post('/items/:id/price-synced', authenticate, requireOrganizer, requireTier('PRO'), markItemPriceSynced);
// Reverse-direction cross-channel sync: item sold NATIVELY on Facebook -> cascade into FindA.Sale.
router.get('/pending-sold-checks', authenticate, requireOrganizer, requireTier('PRO'), getPendingSoldChecks);
router.post('/items/:id/sold-on-facebook', authenticate, requireOrganizer, requireTier('PRO'), markItemSoldOnFacebook);
// Manual counterpart to /listed above -- organizer confirms they posted this item to
// Facebook themselves (outside the extension's automated flow). Writes a real
// MarketplaceListingJob POST/POSTED row, same shape as the automated path, so the item
// both stops showing as "available to push" and enters the getPendingSoldChecks candidate
// pool above -- see extensionController.ts markItemAlreadyPostedManually for why a
// separate boolean flag would not be sufficient.
router.post('/items/:id/mark-posted', authenticate, requireOrganizer, requireTier('PRO'), markItemAlreadyPostedManually);
// Organizer-facing Marketplace Sync Health card on marketplace-extension.tsx -- cookie-authenticated
// web request (not Bearer/extension-origin), same auth chain as the 9 routes above.
router.get('/sync-health', authenticate, requireOrganizer, requireTier('PRO'), getSyncHealth);
// Feature #602 (2026-08-05): AI Message-Reply Autosend decision endpoint -- Bearer-
// authenticated, same chain as the other extension endpoints above.
router.post('/items/:id/message-autosend-decision', authenticate, requireOrganizer, requireTier('PRO'), decideMessageAutosendForItem);
// ADR-100 (2026-08-06/07): Marketplace Listing Auto-Renew -- items posted via the extension
// whose per-platform renewDueAt has arrived. Same auth/tier gating as every other route here.
router.get('/pending-renewals', authenticate, requireOrganizer, requireTier('PRO'), getPendingRenewals);
// ADR-DRAFT approve-to-autolist-fanout (Architect Handoff 2026-09-17, section D): content-script
// tier (Craigslist, Facebook, Gumtree AU, Grailed, Poshmark, Mercari) auto-fan-out queue -- computed
// live on every call, no job rows, no claim/lock semantics. Same auth/tier gating as every other
// route in this file.
router.get('/autolist-queue', authenticate, requireOrganizer, requireTier('PRO'), getAutolistQueue);

// ADR-129 (2026-09-19): price-sync detection for the 5 content-script-tier platforms ADR-086's
// pending-updates/price-synced above doesn't cover (Facebook has its own). Same auth/tier gating.
router.get('/price-sync-queue', authenticate, requireOrganizer, requireTier('PRO'), getPriceSyncQueue);
router.post('/items/:id/price-synced-for-platform', authenticate, requireOrganizer, requireTier('PRO'), markItemPriceSyncedForPlatform);

export default router;
