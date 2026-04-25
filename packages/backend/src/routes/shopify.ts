import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  connectShopify,
  disconnectShopifyAccount,
  getShopifyConnectionStatus,
  pushItemAction,
} from '../controllers/shopifyController';

const router = Router();

/**
 * Feature #XXX: Shopify Cross-Listing (TEAMS tier)
 */

// Connection management
router.post('/connect', authenticate, connectShopify);
router.delete('/connect', authenticate, disconnectShopifyAccount);
router.get('/status', authenticate, getShopifyConnectionStatus);

// Item push
router.post('/push/:itemId', authenticate, pushItemAction);

export default router;
