/**
 * Who may see an organizer's shopper audience (followers, RSVP names) (2026-09-29, data
 * minimization / access control).
 *
 * Allowed: an ADMIN; the organizer who owns the audience; or accepted workspace staff of that
 * organizer's workspace who hold the `broadcast_alerts` permission (the communication permission)
 * while the workspace owner is on TEAMS and the member has not been removed by a downgrade.
 * Everyone else, including signed-out visitors and other organizers, gets the public view.
 *
 * Works behind both authenticate (organizerProfile attached) and optionalAuthenticate (it is not, so
 * the organizer is looked up by userId here). Callers that need a hard gate must still use authenticate.
 */
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { checkPermission } from '../services/workspacePermissionService';
import { WORKSPACE_PERMISSIONS } from './workspacePermissions';
import { organizerHasTier } from './tierAccess';

export type AudienceAccess = { allowed: boolean; via: 'ADMIN' | 'OWNER' | 'STAFF' | null };

const DENIED: AudienceAccess = { allowed: false, via: null };

export async function resolveAudienceAccess(req: AuthRequest, organizerId: string | null | undefined): Promise<AudienceAccess> {
  const user = req.user;
  if (!user?.id || !organizerId) return DENIED;

  if (user.roles?.includes('ADMIN') || user.role === 'ADMIN') return { allowed: true, via: 'ADMIN' };
  if (user.organizerProfile?.id === organizerId) return { allowed: true, via: 'OWNER' };

  try {
    // optionalAuthenticate (unlike authenticate) does not attach organizerProfile, so the sale's own
    // organizer would otherwise be treated as an anonymous visitor. Look the organizer up by userId
    // (Organizer.userId is unique) whenever the middleware did not supply the profile.
    if (!user.organizerProfile) {
      const own = await prisma.organizer.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (own?.id === organizerId) return { allowed: true, via: 'OWNER' };
    }

    const member = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        acceptedAt: { not: null },
        graceRemovedAt: null,
        workspace: { ownerId: organizerId },
      },
      select: {
        workspaceId: true,
        role: true,
        workspace: { select: { owner: { select: { subscriptionTier: true } } } },
      },
    });
    if (!member) return DENIED;
    if (!organizerHasTier(member.workspace?.owner?.subscriptionTier, 'TEAMS')) return DENIED;
    const ok = await checkPermission(member.workspaceId, member.role, WORKSPACE_PERMISSIONS.BROADCAST_ALERTS);
    return ok ? { allowed: true, via: 'STAFF' } : DENIED;
  } catch (error) {
    console.error('[audienceAccess] Error resolving audience access (denying):', error);
    return DENIED;
  }
}
