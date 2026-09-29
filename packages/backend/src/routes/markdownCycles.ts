import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  listMarkdownCycles,
  createMarkdownCycle,
  updateMarkdownCycle,
  deleteMarkdownCycle,
} from '../controllers/markdownCycleController';

const router = Router();

// All routes require authentication. Tier rules (2026-09-29, Patrick D1/D3):
// - GET list and DELETE: any tier (authenticate + ownership enforced in the controller), so a
//   downgraded organizer can still see and remove the cycles that are now paused.
// - POST (create) and PUT (change steps / turn on): PRO or TEAMS.
// - PUT with a body that ONLY sets isActive:false: any tier (turning automation off is never paywalled).
router.use(authenticate);

const requireProTier = requireTier('PRO');

// Any tier may switch a cycle OFF; everything else on PUT needs PRO.
const requireProUnlessTurningOff = (req: AuthRequest, res: Response, next: NextFunction) => {
  const body = (req.body ?? {}) as { isActive?: unknown; steps?: unknown };
  const onlyTurningOff =
    body.isActive === false && body.steps === undefined && Object.keys(body).every((k) => k === 'isActive');
  if (onlyTurningOff) return next();
  return requireProTier(req, res, next);
};

// GET /api/markdown-cycles
router.get('/', listMarkdownCycles);

// POST /api/markdown-cycles
router.post('/', requireProTier, createMarkdownCycle);

// PUT /api/markdown-cycles/:id
router.put('/:id', requireProUnlessTurningOff, updateMarkdownCycle);

// DELETE /api/markdown-cycles/:id
router.delete('/:id', deleteMarkdownCycle);

export default router;
