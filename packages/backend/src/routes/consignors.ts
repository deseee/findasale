import { Router } from 'express';
import {
  listConsignors,
  createConsignor,
  getConsignor,
  updateConsignor,
  deleteConsignor,
  runPayout,
  getConsignorPortal,
} from '../controllers/consignorController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public endpoint — NO authentication required
// Must be defined BEFORE the :id routes to avoid Express router conflicts
router.get('/portal/:token', getConsignorPortal);

// All routes below require authentication
router.use(authenticate);

// List consignors for the organizer's workspace
router.get('/', listConsignors);

// Create a new consignor
router.post('/', createConsignor);

// Get consignor details (items + payouts)
router.get('/:id', getConsignor);

// Update consignor information
router.put('/:id', updateConsignor);

// Delete consignor (blocks if payouts exist)
router.delete('/:id', deleteConsignor);

// Run a payout for this consignor
router.post('/:id/payout', runPayout);

export default router;
