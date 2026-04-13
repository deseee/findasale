import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import * as itemLibraryController from '../controllers/itemLibraryController';

const router = express.Router();

// All library endpoints require authentication + PRO tier
const protect = [authenticate, requireTier('PRO')];

// POST /api/item-library/add — add item to library
router.post('/add', protect, itemLibraryController.addItemToLibrary);

// DELETE /api/item-library/:itemId — remove item from library
router.delete('/:itemId', protect, itemLibraryController.removeItemFromLibrary);

// POST /api/item-library/:itemId/pull — pull item from library to sale
router.post('/:itemId/pull', protect, itemLibraryController.pullItemFromLibrary);

// GET /api/item-library — list library items
router.get('/', protect, itemLibraryController.listLibraryItems);

// GET /api/item-library/:itemId/price-history — get price history
router.get('/:itemId/price-history', protect, itemLibraryController.getItemPriceHistory);

// GET /api/item-library/:itemId/pricing-advice — get pricing suggestion
router.get('/:itemId/pricing-advice', protect, itemLibraryController.getItemPricingAdvice);

export default router;
