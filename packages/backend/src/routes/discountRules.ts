import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
} from '../controllers/discountRuleController';

const router = Router();

// GET /api/discount-rules — public read (for displaying discounts on sale pages)
router.get('/', listDiscountRules);

// All other routes require authentication
router.use(authenticate);

// POST /api/discount-rules
router.post('/', createDiscountRule);

// PUT /api/discount-rules/:id
router.put('/:id', updateDiscountRule);

// DELETE /api/discount-rules/:id
router.delete('/:id', deleteDiscountRule);

export default router;
