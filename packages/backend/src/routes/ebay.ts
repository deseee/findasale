import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  connectEbayAccount,
  ebayOAuthCallback,
  checkEbayConnection,
  disconnectEbay,
  getEbayPreview,
  pushSaleToEbay,
  importInventoryFromEbay,
  handleEbayAccountDeletionVerification,
  handleEbayAccountDeletion,
  handleEbayNotificationVerification,
  handleEbayNotification,
  getUnsoldItems,
  setEbayShippingOverride,
  syncEndedListingsForOrganizer,
  refreshEbayAccessToken,
  fetchAndStoreEbayPolicies,
  getEbaySetupData,
  saveEbayPolicyMapping,
} from '../controllers/ebayController';
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

// Feature #244 Phase 3: Post-sale eBay push — unsold items + shipping overrides
router.get('/organizer/sales/:saleId/unsold-items', authenticate, getUnsoldItems);
router.patch('/organizer/items/:itemId/ebay-shipping', authenticate, setEbayShippingOverride);

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
