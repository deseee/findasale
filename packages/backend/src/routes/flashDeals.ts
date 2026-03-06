import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  createFlashDeal,
  getActiveFlashDeals,
  deleteFlashDeal,
} from '../controllers/flashDealController';

const router = express.Router();

// Public: get all active flash deals
router.get('/', getActiveFlashDeals);

// Organizer: create a new flash deal
router.post('/', authenticate, createFlashDeal);

// Organizer: delete a flash deal
router.delete('/:id', authenticate, deleteFlashDeal);

export default router;
