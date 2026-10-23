import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePublishVerified } from '../lib/publishGate'; // 2026-10-23: verify email to publish
import {
  connectShopify,
  disconnectShopifyAccount,
  getShopifyConnectionStatus,
  pushItemAction,
} from '../controllers/shopifyController';

const router = Router();

/**
 * Feature: Shopify Cross-Listing (TEAMS tier)
 */

// Connection management
router.post('/connect', authenticate, connectShopify);
router.delete('/connect', authenticate, disconnectShopifyAccount);
router.get('/status', authenticate, getShopifyConnectionStatus);

// Item push
router.post('/push/:itemId', authenticate, requirePublishVerified, pushItemAction);

export default router;
