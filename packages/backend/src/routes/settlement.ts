import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import {
  getSettlement,
  createSettlement,
  updateSettlement,
  addExpense,
  removeExpense,
  initiateClientPayout,
  getSettlementReceipt,
} from '../controllers/settlementController';

const router = Router();

// All settlement routes require organizer auth
router.get('/:saleId/settlement', authenticate, requireOrganizer, getSettlement);
router.post('/:saleId/settlement', authenticate, requireOrganizer, createSettlement);
router.patch('/:saleId/settlement', authenticate, requireOrganizer, updateSettlement);
router.post('/:saleId/settlement/expenses', authenticate, requireOrganizer, addExpense);
router.delete('/:saleId/settlement/expenses/:expenseId', authenticate, requireOrganizer, removeExpense);
router.post('/:saleId/settlement/payout', authenticate, requireOrganizer, initiateClientPayout);
router.get('/:saleId/settlement/receipt', authenticate, requireOrganizer, getSettlementReceipt);

export default router;
