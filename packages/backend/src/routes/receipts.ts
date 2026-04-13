import express from 'express';
import { authenticate } from '../middleware/auth';
import { getMyReceipts, getReceipt } from '../controllers/receiptController';

const router = express.Router();

router.get('/my-receipts', authenticate, getMyReceipts);
router.get('/:id', authenticate, getReceipt);

export default router;
