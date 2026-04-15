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
