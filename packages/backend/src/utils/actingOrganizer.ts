/**
 * Acting organizer resolution (2026-09-29, Patrick decision D6).
 *
 * The Markdown Re-tag list is a free-tier feature for the organizer (owner) and, while the
 * owner is on TEAMS, for staff (workspace team members) who hold the `mark_retagged`
 * permission. This file resolves "which organizer's data is this request acting on, and as
 * whom" so the retag routes can serve both kinds of caller.
 *
 * resolveActingOrganizer(req) NEVER writes a response; it returns a typed success or failure.
 * requireRetagAccess(mode) is the Express middleware that turns a failure into a 403 with a
 * machine-readable code and, on success, attaches `req.actingOrganizer`.
 *
 * Owner branch: the caller has their own Organizer profile (attached by `authenticate` as
 * req.user.organizerProfile). Any tier, including SIMPLE, is allowed.
 *
 * Team-member branch: the query pattern mirrors utils/posAuth.ts resolveOrganizerOrTeamMember
 * (an accepted WorkspaceMember with a linked TeamMember row, keyed by userId ONLY, resolving to
 * the workspace owner's Organizer; most recently accepted membership first), with two extra
 * rules: the membership must not have graceRemovedAt set (that column is written by
 * tierGraceService.finalizeGracePeriod when a downgrade removes staff), and the workspace
 * owner must currently be on TEAMS. posAuth itself is intentionally unchanged.
 */

import { Response, NextFunction, RequestHandler } from 'express';
import { WorkspaceRole } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { checkPermission } from '../services/workspacePermissionService';
import { WORKSPACE_PERMISSIONS } from './workspacePermissions';
import { normalizeTier, organizerHasTier } from './tierAccess';
import type { SubscriptionTier } from './tierAccess';

export type ActingOrganizer = {
  organizerId: string; // Organizer.id being acted on (the owner's, for staff)
  ownerUserId: string; // User.id that owns that Organizer
  subscriptionTier: SubscriptionTier; // the OWNER's tier
  actorKind: 'OWNER' | 'TEAM_MEMBER';
  actingUserId: string; // req.user.id, who is actually making the request
  workspaceId: string | null; // set only for TEAM_MEMBER
  role: WorkspaceRole | null; // set only for TEAM_MEMBER
};

export type ActingOrganizerFailureCode =
  | 'NOT_AUTHENTICATED'
  | 'NOT_ORGANIZER'
  | 'OWNER_NOT_TEAMS'
  | 'STAFF_ACCESS_REVOKED';

export type ActingOrganizerResult =
  | { ok: true; actor: ActingOrganizer }
  | { ok: false; code: ActingOrganizerFailureCode; message: string };

export interface ActingOrganizerRequest extends AuthRequest {
  actingOrganizer?: ActingOrganizer;
}

const MAX_MEMBERSHIPS_CONSIDERED = 10;

export async function resolveActingOrganizer(req: AuthRequest): Promise<ActingOrganizerResult> {
  if (!req.user?.id) {
    return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Authentication required' };
  }
  const actingUserId: string = req.user.id;

  // Owner branch
  const profile = req.user.organizerProfile as
    | { id?: string; userId?: string; subscriptionTier?: string | null }
    | undefined;
  if (profile?.id) {
    return {
      ok: true,
      actor: {
        organizerId: profile.id,
        ownerUserId: profile.userId ?? actingUserId,
        subscriptionTier: normalizeTier(profile.subscriptionTier),
        actorKind: 'OWNER',
        actingUserId,
        workspaceId: null,
        role: null,
      },
    };
  }

  // Team-member branch (same shape as posAuth.resolveOrganizerOrTeamMember's fallback)
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: actingUserId, acceptedAt: { not: null }, teamMember: { isNot: null } },
    select: {
      workspaceId: true,
      role: true,
      graceRemovedAt: true,
      workspace: {
        select: {
          owner: { select: { id: true, userId: true, subscriptionTier: true } },
        },
      },
    },
    orderBy: { acceptedAt: 'desc' },
    take: MAX_MEMBERSHIPS_CONSIDERED,
  });

  const usable = memberships.filter((m) => m.workspace?.owner);
  if (usable.length === 0) {
    return { ok: false, code: 'NOT_ORGANIZER', message: 'Organizer access required' };
  }

  const active = usable.filter((m) => !m.graceRemovedAt);
  if (active.length === 0) {
    return {
      ok: false,
      code: 'STAFF_ACCESS_REVOKED',
      message: 'Your team access was removed when the workspace plan changed.',
    };
  }

  const eligible = active.find((m) => organizerHasTier(m.workspace.owner.subscriptionTier, 'TEAMS'));
  if (!eligible) {
    return {
      ok: false,
      code: 'OWNER_NOT_TEAMS',
      message: 'Staff access to this feature requires the workspace owner to be on the TEAMS plan.',
    };
  }

  const owner = eligible.workspace.owner;
  return {
    ok: true,
    actor: {
      organizerId: owner.id,
      ownerUserId: owner.userId,
      subscriptionTier: normalizeTier(owner.subscriptionTier),
      actorKind: 'TEAM_MEMBER',
      actingUserId,
      workspaceId: eligible.workspaceId,
      role: eligible.role,
    },
  };
}

/**
 * Route guard for the Markdown Re-tag endpoints.
 * - mode 'view' (the two GET lists): an owner always passes; staff need view_inventory or mark_retagged.
 * - mode 'mark' (the two POST mark-retagged routes): an owner always passes; staff need mark_retagged.
 * Failures are 403 with a `code`: NOT_ORGANIZER, OWNER_NOT_TEAMS, STAFF_ACCESS_REVOKED, PERMISSION_DENIED
 * (a missing/invalid login is 401).
 */
export function requireRetagAccess(mode: 'view' | 'mark'): RequestHandler {
  return async (req, res: Response, next: NextFunction) => {
    try {
      const result = await resolveActingOrganizer(req as AuthRequest);
      if (!result.ok) {
        const status = result.code === 'NOT_AUTHENTICATED' ? 401 : 403;
        return res.status(status).json({ message: result.message, code: result.code });
      }

      const actor = result.actor;
      if (actor.actorKind === 'TEAM_MEMBER' && actor.workspaceId && actor.role) {
        let allowed = await checkPermission(actor.workspaceId, actor.role, WORKSPACE_PERMISSIONS.MARK_RETAGGED);
        if (!allowed && mode === 'view') {
          allowed = await checkPermission(actor.workspaceId, actor.role, WORKSPACE_PERMISSIONS.VIEW_INVENTORY);
        }
        if (!allowed) {
          return res.status(403).json({
            message: 'You do not have permission to use the re-tag list.',
            code: 'PERMISSION_DENIED',
          });
        }
      }

      (req as ActingOrganizerRequest).actingOrganizer = actor;
      next();
    } catch (error) {
      console.error('[requireRetagAccess] Error:', error);
      return res.status(500).json({ message: 'Server error checking re-tag access' });
    }
  };
}
