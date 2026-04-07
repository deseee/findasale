import { Router } from 'express';
import {
  handleEbayAccountDeletionVerification,
  handleEbayAccountDeletion,
} from '../controllers/ebayController';

const router = Router();

// eBay Marketplace Account Deletion — required for production keyset
// GET: challenge verification handshake
router.get('/account-deletion', handleEbayAccountDeletionVerification);
// POST: deletion notification (ACK only — no eBay data stored)
router.post('/account-deletion', handleEbayAccountDeletion);

export default router;
