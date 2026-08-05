import { Router } from 'express';
import {
  createSavedSearch,
  getUserSavedSearches,
  deleteSavedSearch,
  updateSavedSearch,
  checkNewMatches,
} from '../controllers/savedSearchController';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/saved-searches — create a new saved search
router.post('/', authenticate, createSavedSearch);

// GET /api/saved-searches — list all saved searches for the user
router.get('/', authenticate, getUserSavedSearches);

// GET /api/saved-searches/check-new — Feature #595: poll for new matches on notify-enabled
// searches (used by the browser extension's periodic alarm to fire desktop notifications).
// Registered before other literal GET paths for clarity; no conflict since it's a distinct path.
router.get('/check-new', authenticate, checkNewMatches);

// PATCH /api/saved-searches/:id — update notifyOnNew toggle or name
router.patch('/:id', authenticate, updateSavedSearch);

// DELETE /api/saved-searches/:id — delete a saved search
router.delete('/:id', authenticate, deleteSavedSearch);

export default router;
