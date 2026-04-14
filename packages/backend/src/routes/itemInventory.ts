import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import * as itemInventoryController from '../controllers/itemInventoryController';

const router = express.Router();

// All inventory endpoints require authentication + PRO tier
const protect = [authenticate, requireTier('PRO')];

// POST /api/item-inventory/add — add item to inventory
router.post('/add', protect, itemInventoryController.addItemToInventory);

// DELETE /api/item-inventory/:itemId — remove item from inventory
router.delete('/:itemId', protect, itemInventoryController.removeItemFromInventory);

// POST /api/item-inventory/:itemId/pull — pull item from inventory to sale
router.post('/:itemId/pull', protect, itemInventoryController.pullItemFromInventory);

// GET /api/item-inventory — list inventory items
router.get('/', protect, itemInventoryController.listInventoryItems);

// GET /api/item-inventory/:itemId/price-history — get price history
router.get('/:itemId/price-history', protect, itemInventoryController.getItemPriceHistory);

// GET /api/item-inventory/:itemId/pricing-advice — get pricing suggestion
router.get('/:itemId/pricing-advice', protect, itemInventoryController.getItemPricingAdvice);

export default router;
