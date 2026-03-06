import { Router } from 'express';
import {
  createSavedSearch,
  getUserSavedSearches,
  deleteSavedSearch,
  updateSavedSearch,
} from '../controllers/savedSearchController';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/saved-searches — create a new saved search
router.post('/', authenticate, createSavedSearch);

// GET /api/saved-searches — list all saved searches for the user
router.get('/', authenticate, getUserSavedSearches);

// PATCH /api/saved-searches/:id — update notifyOnNew toggle or name
router.patch('/:id', authenticate, updateSavedSearch);

// DELETE /api/saved-searches/:id — delete a saved search
router.delete('/:id', authenticate, deleteSavedSearch);

export default router;
