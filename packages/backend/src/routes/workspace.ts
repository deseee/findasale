import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { requireWorkspaceMember, requirePermission } from '../middleware/workspaceAuth';
import {
  createWorkspace,
  getMyWorkspace,
  inviteMember,
  acceptInvite,
  getPendingInvitations,
  removeMember,
  listMembers,
  getPublicWorkspace,
  getWorkspaceSettings,
  updateWorkspaceSettings,
  applyWorkspaceTemplate,
  getWorkspacePermissions,
  updateWorkspacePermissions,
  getWorkspaceCostCalculator,
  deleteWorkspace,
} from '../controllers/workspaceController';

const router = Router();

// Unauthenticated public endpoint (must come before other routes to avoid param conflicts)
router.get('/public/:slug', getPublicWorkspace);

// All workspace routes require TEAMS tier (except possibly getMyWorkspace which requires auth)
router.post('/', authenticate, requireTier('TEAMS'), createWorkspace);
router.get('/', authenticate, getMyWorkspace);
router.post('/invite', authenticate, requireTier('TEAMS'), inviteMember);
router.post('/accept', authenticate, acceptInvite);
router.get('/invitations/pending', authenticate, getPendingInvitations);
router.delete('/members/:organizerId', authenticate, requireTier('TEAMS'), removeMember);
router.get('/members', authenticate, listMembers);

// Workspace Settings endpoints
router.get('/:workspaceId/settings', authenticate, requireWorkspaceMember(), getWorkspaceSettings);
router.patch('/:workspaceId/settings', authenticate, requireWorkspaceMember(), requirePermission('manage_workspace_settings'), updateWorkspaceSettings);
router.post('/:workspaceId/apply-template', authenticate, requireWorkspaceMember(), requirePermission('edit_permissions'), applyWorkspaceTemplate);
router.get('/:workspaceId/permissions', authenticate, requireWorkspaceMember(), getWorkspacePermissions);
router.patch('/:workspaceId/permissions/:role', authenticate, requireWorkspaceMember(), requirePermission('edit_permissions'), updateWorkspacePermissions);
router.get('/:workspaceId/cost-calculator', authenticate, requireWorkspaceMember(), getWorkspaceCostCalculator);
router.delete('/:workspaceId', authenticate, requireWorkspaceMember(), deleteWorkspace);

export default router;
