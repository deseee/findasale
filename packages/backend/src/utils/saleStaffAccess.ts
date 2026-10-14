/**
 * Who may see an organizer's private sale data (crawler stats, morning briefing room, owner-only
 * views of embargoed items) (2026-10-13, security pass).
 *
 * Allowed: an ADMIN; the organizer who owns the sale; or accepted, not grace-removed members of that
 * organizer's workspace (keyed by their own userId OR by their own Organizer id, both shapes exist on
 * WorkspaceMember). Everyone else, including signed-out visitors and other organizers, is denied.
 *
 * Works with a request user from authenticate (organizerProfile attached), optionalAuthenticate (it is
 * not) or a socket-derived { id, roles } object: the caller's own Organizer is looked up by userId when
 * it was not supplied. Errors deny.
 */
import { prisma } from '../lib/prisma';

export type SaleStaffViewer = {
  id?: string | null;
  role?: string | null;
  roles?: string[] | null;
  organizerProfile?: { id?: string | null } | null;
} | null | undefined;

export function isAdminViewer(user: SaleStaffViewer): boolean {
  return Boolean(user && (user.roles?.includes('ADMIN') || user.role === 'ADMIN'));
}

export async function canAccessOrganizerSales(
  user: SaleStaffViewer,
  organizerId: string | null | undefined
): Promise<boolean> {
  if (!user?.id || !organizerId) return false;
  if (isAdminViewer(user)) return true;
  if (user.organizerProfile?.id && user.organizerProfile.id === organizerId) return true;

  try {
    let ownOrganizerId: string | null = user.organizerProfile?.id ?? null;
    if (!ownOrganizerId) {
      const own = await prisma.organizer.findUnique({ where: { userId: user.id }, select: { id: true } });
      ownOrganizerId = own?.id ?? null;
    }
    if (ownOrganizerId === organizerId) return true;

    const member = await prisma.workspaceMember.findFirst({
      where: {
        acceptedAt: { not: null },
        graceRemovedAt: null,
        workspace: { ownerId: organizerId },
        OR: [{ userId: user.id }, ...(ownOrganizerId ? [{ organizerId: ownOrganizerId }] : [])],
      },
      select: { id: true },
    });
    return Boolean(member);
  } catch (error) {
    console.error('[saleStaffAccess] Error resolving sale staff access (denying):', error);
    return false;
  }
}

/**
 * Is this user the organizer or active staff of that organizer (2026-10-13)? Staff = accepted, not
 * grace-removed member of the organizer's workspace, any role and any permission. This is the staff
 * rule for the sale street address and early-access items (GET /sales/:id, its calendar file and
 * GET /items/:id plus its public sub-resources). Admin is NOT decided here: callers check it themselves.
 */
export async function isOrganizerStaff(
  userId: string | null | undefined,
  organizerId: string | null | undefined
): Promise<boolean> {
  if (!userId || !organizerId) return false;
  return canAccessOrganizerSales({ id: userId }, organizerId);
}
