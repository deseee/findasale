import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  listMarkdownCycles,
  createMarkdownCycle,
  updateMarkdownCycle,
  deleteMarkdownCycle,
} from '../controllers/markdownCycleController';

const router = Router();

// All routes require authentication + PRO tier minimum
router.use(authenticate);
router.use(requireTier('PRO'));

// GET /api/markdown-cycles
router.get('/', listMarkdownCycles);

// POST /api/markdown-cycles
router.post('/', createMarkdownCycle);

// PUT /api/markdown-cycles/:id
router.put('/:id', updateMarkdownCycle);

// DELETE /api/markdown-cycles/:id
router.delete('/:id', deleteMarkdownCycle);

export default router;
