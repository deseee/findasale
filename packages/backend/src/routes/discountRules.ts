import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import {
  listDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
} from '../controllers/discountRuleController';

const router = Router();

// GET /api/discount-rules — public read (saleId path) or authenticated organizer read
// optionalAuthenticate sets req.user if a valid JWT is present, but doesn't block unauthenticated requests
router.get('/', optionalAuthenticate, listDiscountRules);

// Create a separate router for protected routes (POST, PUT, DELETE)
const protectedRouter = Router();
protectedRouter.use(authenticate);

// POST /api/discount-rules
protectedRouter.post('/', createDiscountRule);

// PUT /api/discount-rules/:id
protectedRouter.put('/:id', updateDiscountRule);

// DELETE /api/discount-rules/:id
protectedRouter.delete('/:id', deleteDiscountRule);

// Mount protected routes
router.use(protectedRouter);

export default router;
