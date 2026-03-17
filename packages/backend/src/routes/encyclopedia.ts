import { Router } from 'express';
import {
  listEntries,
  getEntryBySlug,
  createEntry,
  voteOnEntry,
  updateEntry,
  getRevisions
} from '../controllers/encyclopediaController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes (no auth required)
router.get('/entries', listEntries);
router.get('/entries/:slug', getEntryBySlug);

// Protected routes (auth required)
router.post('/entries', authenticate, createEntry);
router.post('/entries/:slug/vote', authenticate, voteOnEntry);
router.post('/entries/:entryId/revisions', authenticate, updateEntry);
router.get('/entries/:entryId/revisions', authenticate, getRevisions);

export default router;
