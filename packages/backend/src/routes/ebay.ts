import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  connectEbayAccount,
  ebayOAuthCallback,
  checkEbayConnection,
  disconnectEbay,
  getEbayPreview,
  pushSaleToEbay,
  handleEbayAccountDeletionVerification,
  handleEbayAccountDeletion,
} from '../controllers/ebayController';

const router = Router();

// Feature #244 Phase 2: eBay OAuth connection
// OAuth flow
router.get('/connect', authenticate, connectEbayAccount);
router.get('/callback', authenticate, ebayOAuthCallback);

// Connection management
router.get('/connection', authenticate, checkEbayConnection);
router.delete('/connection', authenticate, disconnectEbay);

// Feature #244 Phase 2: eBay Inventory API Push
// Preview and push endpoints
router.get('/organizer/items/:itemId/ebay-preview', authenticate, getEbayPreview);
router.post('/organizer/sales/:saleId/ebay-push', authenticate, pushSaleToEbay);

// eBay Marketplace Account Deletion — required for production keyset
// GET: challenge verification handshake
router.get('/account-deletion', handleEbayAccountDeletionVerification);
// POST: deletion notification (ACK only — no eBay data stored)
router.post('/account-deletion', handleEbayAccountDeletion);

export default router;
