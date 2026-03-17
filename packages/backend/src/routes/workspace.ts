import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  createWorkspace,
  getMyWorkspace,
  inviteMember,
  acceptInvite,
  removeMember,
  listMembers,
} from '../controllers/workspaceController';

const router = Router();

// All workspace routes require TEAMS tier (except possibly getMyWorkspace which requires auth)
router.post('/', authenticate, requireTier('TEAMS'), createWorkspace);
router.get('/', authenticate, getMyWorkspace);
router.post('/invite', authenticate, requireTier('TEAMS'), inviteMember);
router.post('/accept', authenticate, acceptInvite);
router.delete('/members/:organizerId', authenticate, requireTier('TEAMS'), removeMember);
router.get('/members', authenticate, listMembers);

export default router;
