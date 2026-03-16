import express from 'express';
import { authenticate } from '../middleware/auth';
import * as socialProofController from '../controllers/socialProofController';

const router = express.Router();

// GET /api/social-proof/item/:itemId — fetch item social proof
router.get('/item/:itemId', authenticate, socialProofController.getItemSocialProofHandler);

// GET /api/social-proof/sale/:saleId — fetch sale social proof
router.get('/sale/:saleId', authenticate, socialProofController.getSaleSocialProofHandler);

export default router;
