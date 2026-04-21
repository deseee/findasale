import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
} from '../controllers/discountRuleController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/discount-rules
router.get('/', listDiscountRules);

// POST /api/discount-rules
router.post('/', createDiscountRule);

// PUT /api/discount-rules/:id
router.put('/:id', updateDiscountRule);

// DELETE /api/discount-rules/:id
router.delete('/:id', deleteDiscountRule);

export default router;
