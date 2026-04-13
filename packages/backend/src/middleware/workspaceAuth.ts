/**
 * Workspace Authorization Middleware
 * Enforces workspace membership and permission checks
 * Used after authenticate() to verify workspace access and permissions
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';
import { checkPermission } from '../services/workspacePermissionService';
import { SubscriptionTier } from './requireTier';

/**
 * Extended Request type with workspace member info
 */
export interface WorkspaceAuthRequest extends AuthRequest {
  workspaceMember?: {
    id: string;
    workspaceId: string;
    organizerId?: string | null;
    userId?: string | null;
    role: string;
  };
}

/**
 * Middleware: Require TEAMS tier + workspace membership
 * Attaches req.workspaceMember with role info
 * Usage: app.get('/api/workspace/:workspaceId/...', authenticate, requireWorkspaceMember(), ...)
 */
export const requireWorkspaceMember = () => {
  return async (req: WorkspaceAuthRequest, res: Response, next: NextFunction) => {
    try {
      // Ensure user is authenticated
      if (!req.user?.id) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Check TEAMS tier (only if user is an organizer)
      if (req.user?.organizerProfile?.id) {
        const tier = (req.user?.organizerProfile?.subscriptionTier ?? 'SIMPLE') as SubscriptionTier;
        const TIER_RANK: Record<SubscriptionTier, number> = {
          SIMPLE: 0,
          PRO: 1,
          TEAMS: 2,
        };

        if (TIER_RANK[tier] < TIER_RANK.TEAMS) {
          return res.status(403).json({
            message: 'This feature requires the TEAMS plan or higher.',
            requiredTier: 'TEAMS',
            currentTier: tier,
            upgradeUrl: '/organizer/upgrade',
          });
        }
      }

      // Get workspaceId from route params
      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ message: 'Workspace ID is required' });
      }

      // Find workspace membership record by organizerId OR userId
      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          acceptedAt: { not: null },
          OR: [
            ...(req.user.organizerProfile?.id ? [{ organizerId: req.user.organizerProfile.id }] : []),
            { userId: req.user.id },
          ],
        },
      });

      if (!member) {
        return res.status(403).json({ message: 'You are not a member of this workspace' });
      }

      // Attach member info to request for downstream use
      req.workspaceMember = {
        id: member.id,
        workspaceId: member.workspaceId,
        organizerId: member.organizerId,
        userId: member.userId,
        role: member.role,
      };

      next();
    } catch (error) {
      console.error('[requireWorkspaceMember] Error checking workspace membership:', error);
      return res.status(500).json({ message: 'Failed to verify workspace access' });
    }
  };
};

/**
 * Middleware: Require specific permission for workspace member
 * Must be called AFTER requireWorkspaceMember()
 * Usage: app.post('/api/workspace/:workspaceId/items', authenticate, requireWorkspaceMember(), requirePermission('add_items'), ...)
 */
export const requirePermission = (permission: string) => {
  return async (req: WorkspaceAuthRequest, res: Response, next: NextFunction) => {
    try {
      // Ensure requireWorkspaceMember was called first
      if (!req.workspaceMember) {
        return res.status(400).json({ message: 'Workspace membership check required first' });
      }

      // Check if member has permission
      const hasPermission = await checkPermission(
        req.workspaceMember.workspaceId,
        req.workspaceMember.role as any,
        permission
      );

      if (!hasPermission) {
        return res.status(403).json({
          message: `Permission '${permission}' is required for this action`,
          requiredPermission: permission,
          userRole: req.workspaceMember.role,
        });
      }

      next();
    } catch (error) {
      console.error(`[requirePermission] Error checking permission '${permission}':`, error);
      return res.status(500).json({ message: 'Failed to verify permissions' });
    }
  };
};
