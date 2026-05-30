import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import {
  previewConsignorSettlement,
  createConsignorSettlementBatch,
  getConsignorSettlementBatch,
  approveConsignorSettlementBatch,
} from '../controllers/consignorSettlementController';

const router = Router();

// #239 Multi-Consignor Estate Settlement — all routes require organizer auth (TEAMS gate enforced in controller)
router.get('/preview/:saleId', authenticate, requireOrganizer, previewConsignorSettlement);
router.post('/', authenticate, requireOrganizer, createConsignorSettlementBatch);
router.get('/:batchId', authenticate, requireOrganizer, getConsignorSettlementBatch);
router.post('/:batchId/approve', authenticate, requireOrganizer, approveConsignorSettlementBatch);

export default router;
