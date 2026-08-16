import { Router, Response } from 'express';
import { authenticate, requireOrganizer, AuthRequest } from '../middleware/auth';
import {
  connectEbayAccount,
  ebayOAuthCallback,
  checkEbayConnection,
  disconnectEbay,
  getEbayPreview,
  pushSaleToEbay,
  publishItemOffer,
  importInventoryFromEbay,
  handleEbayAccountDeletionVerification,
  handleEbayAccountDeletion,
  handleEbayNotificationVerification,
  handleEbayNotification,
  getUnsoldItems,
  getUnconfirmedWeightListings,
  setEbayShippingOverride,
  syncEndedListingsForOrganizer,
  refreshEbayAccessToken,
  fetchAndStoreEbayPolicies,
  getEbaySetupData,
  saveEbayPolicyMapping,
  getShippingNetPreview,
  getSuggestedPriceForMargin,
  getUnknownShippingClassificationCount,
  checkEbayPolicyLiveness,
} from '../controllers/ebayController';
// Shipping presets (2026-08-16): create a REAL eBay fulfillment policy from inside
// FindA.Sale instead of only ever pointing at one the organizer hand-built on eBay.
// Full security rationale (AUTHZ-ON-EVERY-ENDPOINT, OWNERSHIP/TENANT-ISOLATION,
// NO-MASS-ASSIGNMENT, bounded external writes) is in the controller's file header.
import {
  listShippingPresets,
  estimateShippingPresetRate,
  validateShippingPreset,
  createShippingPreset,
  searchOwnItemsForPreset,
  bindPresetToItem,
  presetCreateLimiter,
  presetReadLimiter,
} from '../controllers/ebayShippingPresetController';
import { syncSoldItemsForOrganizer } from '../jobs/ebaySoldSyncCron';

const router = Router();

// Feature #244 Phase 2: eBay OAuth connection
// OAuth flow
router.get('/connect', authenticate, connectEbayAccount);
router.get('/callback', ebayOAuthCallback); // Public endpoint — eBay redirects here without JWT

// Connection management
router.get('/connection', authenticate, checkEbayConnection);
router.delete('/connection', authenticate, disconnectEbay);

// Feature #244 Phase 2c: eBay Policy Routing — per-organizer policy configuration
router.get('/setup-data', authenticate, getEbaySetupData);
router.post('/policy-mapping', authenticate, saveEbayPolicyMapping);

// (2026-08-16, Patrick-authorised removal) The S-gap-fill "Fill gaps automatically"
// routes (/weight-tier-gaps/preview and /weight-tier-gaps/fill) were removed together
// with the settings-page panel that was their only caller. They provisioned real eBay
// policies into the weight-tier ladder that ADR-102 retired for eBay routing, so every
// policy they created was a permanent object on the organizer's eBay account serving a
// ladder the router no longer consults. Replaced by the shipping-preset routes below,
// which let the organizer create the policy they actually want.

// Shipping presets: create a real eBay fulfillment policy in-app.
// Every route is organizer-authenticated and resolves the organizer from the JWT
// subject; none accepts an organizer or account identifier from the client.
router.get('/shipping-presets', authenticate, requireOrganizer, presetReadLimiter, listShippingPresets);
router.get('/shipping-presets/items', authenticate, requireOrganizer, presetReadLimiter, searchOwnItemsForPreset);
router.post('/shipping-presets/estimate', authenticate, requireOrganizer, presetReadLimiter, estimateShippingPresetRate);
router.post('/shipping-presets/validate', authenticate, requireOrganizer, presetReadLimiter, validateShippingPreset);
// The only route here that writes to eBay. presetCreateLimiter caps it at 10/hour/user;
// the service refuses past 80 live policies and rejects duplicate names before any POST.
router.post('/shipping-presets', authenticate, requireOrganizer, presetCreateLimiter, createShippingPreset);
router.post('/shipping-presets/bind-item', authenticate, requireOrganizer, presetReadLimiter, bindPresetToItem);

// Calculated-shipping: estimated buyer rate + net proceeds preview
router.post('/shipping-preview', authenticate, requireOrganizer, getShippingNetPreview);
router.post('/shipping-preview/suggest-price', authenticate, requireOrganizer, getSuggestedPriceForMargin);

router.post('/sync-policies', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { prisma } = await import('../lib/prisma');
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      include: { ebayConnection: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    if (!organizer.ebayConnection) {
      return res.status(400).json({ message: 'eBay account not connected' });
    }

    // Get fresh access token
    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) {
      return res.status(500).json({ message: 'Failed to refresh eBay access token' });
    }

    // Re-fetch policies
    await fetchAndStoreEbayPolicies(organizer.id, accessToken);

    // Return updated connection
    const updated = await prisma.ebayConnection.findUnique({
      where: { organizerId: organizer.id },
      select: { paymentPolicyId: true, fulfillmentPolicyId: true, returnPolicyId: true, policiesFetchedAt: true },
    });

    res.json({ success: true, ...updated });
  } catch (error: any) {
    console.error('[eBay] sync-policies error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync policies' });
  }
});

// Feature #244 Phase 2: eBay Inventory API Push
// Preview and push endpoints
router.get('/organizer/items/:itemId/ebay-preview', authenticate, getEbayPreview);
router.post('/organizer/sales/:saleId/ebay-push', authenticate, pushSaleToEbay);

// S725: Publish an existing UNPUBLISHED Inventory API offer to LIVE on eBay.
// Used by the in-app "Publish to eBay now" button for items whose ebayOfferId
// exists but ebayListingId is null (stuck draft from S723 era).
router.post('/items/:itemId/publish', authenticate, publishItemOffer);

// Feature #244 Phase 3: Post-sale eBay push — unsold items + shipping overrides
router.get('/organizer/sales/:saleId/unsold-items', authenticate, getUnsoldItems);
router.patch('/organizer/items/:itemId/ebay-shipping', authenticate, setEbayShippingOverride);

// Review queue: this organizer's LIVE eBay listings whose shipping weight was
// never confirmed. Read-only — no eBay API calls, nothing is revised. The
// organizer confirms each item through the existing PUT /api/items/:id save.
router.get('/organizer/unconfirmed-weight-listings', authenticate, requireOrganizer, getUnconfirmedWeightListings);

// eBay Settings page (ebay.tsx) simplification pass, 2026-08-06 UX spec.
// Read-only, organizer-scoped, reuse existing eBay-fetch logic -- see handler
// docblocks in ebayController.ts for full detail + citations.
router.get('/organizer/unknown-classification-count', authenticate, requireOrganizer, getUnknownShippingClassificationCount);
router.get('/organizer/check-policies', authenticate, requireOrganizer, checkEbayPolicyLiveness);

// Feature #244 Phase 2b: eBay Inventory Import
// Import eBay inventory items into FindA.Sale
router.post('/import-inventory', authenticate, importInventoryFromEbay);

// eBay Marketplace Account Deletion — required for production keyset
// GET: challenge verification handshake
router.get('/account-deletion', handleEbayAccountDeletionVerification);
// POST: deletion notification (ACK only — no eBay data stored)
router.post('/account-deletion', handleEbayAccountDeletion);

// eBay Commerce Notification API — real-time sold sync (marketplace.order.paid)
// GET: challenge verification (same SHA256 scheme as account-deletion)
router.get('/notifications', handleEbayNotificationVerification);
// POST: receive order events; marks items SOLD + withdraws eBay listing
router.post('/notifications', handleEbayNotification);


// Feature #244 Phase 3: Manual trigger for eBay sold sync (testing only)
router.get('/sync-sold', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get organizer ID from user
    const { prisma } = await import('../lib/prisma');
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Trigger sync for this organizer
    const result = await syncSoldItemsForOrganizer(organizer.id);
    res.json(result);
  } catch (error) {
    console.error('[eBay Sync] Manual trigger error:', error);
    res.status(500).json({
      message: 'Sync failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Feature #244 Phase 3: Manual trigger for eBay ended listings sync (organizer-initiated)
router.get('/sync-ended-listings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get organizer ID from user
    const { prisma } = await import('../lib/prisma');
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Trigger sync for this organizer
    const result = await syncEndedListingsForOrganizer(organizer.id);
    res.json(result);
  } catch (error) {
    console.error('[eBay EndedSync] Manual trigger error:', error);
    res.status(500).json({
      message: 'Sync failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
