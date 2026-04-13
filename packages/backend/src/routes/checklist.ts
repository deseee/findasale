import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getChecklist,
  updateChecklist,
  addChecklistItem,
  deleteChecklistItem,
} from '../controllers/checklistController';

const router = express.Router();

// All checklist routes require authentication
router.use(authenticate);

router.get('/:saleId', getChecklist);                        // GET: fetch checklist for a sale
router.patch('/:saleId', updateChecklist);                   // PATCH: update item completion status
router.post('/:saleId/items', addChecklistItem);             // POST: add custom item
router.delete('/:saleId/items/:itemId', deleteChecklistItem); // DELETE: delete custom item

export default router;
