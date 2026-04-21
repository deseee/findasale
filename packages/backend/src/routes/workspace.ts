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
  validateInviteToken,
  acceptMagicLinkInvite,
  getMyWorkspaceMemberships,
  getWorkspaceSaleChat,
  postWorkspaceSaleChat,
  getWorkspaceTasks,
  createWorkspaceTask,
  updateWorkspaceTask,
  deleteWorkspaceTask,
  getTaskTemplates,
} from '../controllers/workspaceController';
import {
  getBriefing,
  updateStatus,
  createPrepTask,
  updatePrepTask,
} from '../controllers/briefingController';

const router = Router();

// Unauthenticated public endpoints (must come before param routes to avoid conflicts)
router.get('/public/:slug', authenticate, getPublicWorkspace);
router.get('/invite/validate/:token', validateInviteToken);

// All workspace routes require TEAMS tier (except possibly getMyWorkspace which requires auth)
router.post('/', authenticate, requireTier('TEAMS'), createWorkspace);
router.get('/', authenticate, getMyWorkspace);
router.post('/invite', authenticate, requireTier('TEAMS'), inviteMember);
router.post('/invite/accept/:token', authenticate, acceptMagicLinkInvite);
router.post('/accept', authenticate, acceptInvite);
router.get('/invitations/pending', authenticate, getPendingInvitations);
router.get('/my-memberships', authenticate, getMyWorkspaceMemberships);
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

// Workspace Sale Chat endpoints
router.get('/:workspaceId/sales/:saleId/chat', authenticate, requireWorkspaceMember(), getWorkspaceSaleChat);
router.post('/:workspaceId/sales/:saleId/chat', authenticate, requireWorkspaceMember(), postWorkspaceSaleChat);

// Workspace Tasks endpoints
router.get('/:workspaceId/tasks', authenticate, requireWorkspaceMember(), getWorkspaceTasks);
router.get('/:workspaceId/tasks/templates', authenticate, requireWorkspaceMember(), getTaskTemplates);
router.post('/:workspaceId/tasks', authenticate, requireWorkspaceMember(), createWorkspaceTask);
router.patch('/:workspaceId/tasks/:taskId', authenticate, requireWorkspaceMember(), updateWorkspaceTask);
router.delete('/:workspaceId/tasks/:taskId', authenticate, requireWorkspaceMember(), deleteWorkspaceTask);

// Morning Briefing endpoints
router.get('/:workspaceId/briefing', authenticate, requireWorkspaceMember(), getBriefing);
router.patch('/:workspaceId/briefing/status', authenticate, requireWorkspaceMember(), updateStatus);
router.post('/:workspaceId/briefing/prep', authenticate, requireWorkspaceMember(), createPrepTask);
router.patch('/:workspaceId/briefing/prep/:taskId', authenticate, requireWorkspaceMember(), updatePrepTask);

export default router;
