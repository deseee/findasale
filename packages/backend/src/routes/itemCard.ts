/**
 * /api/item-cards (ADR-134 #640, batch B2). NOT mounted yet: batch B9 mounts this router in index.ts.
 * Organizer-only; ownership is enforced inside the controller (another organizer's item is a 404).
 * Intentionally no requireTier: card records are free at every tier (ADR-134 section 11).
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getItemCard, putItemCard, applyItemCardPrinting } from '../controllers/itemCardController';

const router = Router();

router.get('/:itemId', authenticate, getItemCard);
router.put('/:itemId', authenticate, putItemCard);
router.post('/:itemId/apply-printing', authenticate, applyItemCardPrinting);

export default router;
