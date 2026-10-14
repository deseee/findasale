import express from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import {
  createFlashDeal,
  getActiveFlashDeals,
  deleteFlashDeal,
} from '../controllers/flashDealController';

const router = express.Router();

// Public: get all active flash deals. optionalAuthenticate so a signed-in Hunt Pass / Sage viewer is
// recognised and gets their early-access deals (the controller reads req.user; 2026-10-13).
router.get('/', optionalAuthenticate, getActiveFlashDeals);

// Organizer: create a new flash deal
router.post('/', authenticate, createFlashDeal);

// Organizer: delete a flash deal
router.delete('/:id', authenticate, deleteFlashDeal);

export default router;
