import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listMarkdownCycles,
  createMarkdownCycle,
  updateMarkdownCycle,
  deleteMarkdownCycle,
} from '../controllers/markdownCycleController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/markdown-cycles
router.get('/', listMarkdownCycles);

// POST /api/markdown-cycles
router.post('/', createMarkdownCycle);

// PUT /api/markdown-cycles/:id
router.put('/:id', updateMarkdownCycle);

// DELETE /api/markdown-cycles/:id
router.delete('/:id', deleteMarkdownCycle);

export default router;
