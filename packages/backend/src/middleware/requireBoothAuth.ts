/**
 * Vendor Booth Payments — Auth Middleware (2026-07-07)
 * ADR-015 §Contract Defined + ADR-017 Fix #1 (corrected tenancy join).
 *
 * New auth surface: a cart/checkout endpoint under a flea market SaleHub can be
 * accessed either by (a) a TeamMember JWT scoped to the hub-owning Organizer's
 * workspace, or (b) a valid X-Booth-Token header matching a CONFIRMED VendorBooth
 * on that hub. Booth-token sessions get cart-endpoint access ONLY — never
 * settlement, payout, or another booth's data (enforced by the fact this
 * middleware is only ever wired onto cart routes, never settlement routes).
 *
 * Tenancy join (ADR-017 Fix #1, re-verified): SaleHub.organizerId -> Organizer.id
 * -> Organizer.workspace (existing relation, no schema change) -> OrganizerWorkspace.id
 * -> WorkspaceMember.workspaceId -> WorkspaceMember.id === TeamMember.workspaceMemberId.
 * This is a walkable, explicit join performed here — never assumed.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';

export interface BoothAuthRequest extends AuthRequest {
  boothAuth?: {
    type: 'TEAM_MEMBER' | 'BOOTH';
    teamMemberId?: string;
    vendorBoothId?: string;
    hubId: string;
  };
}

/**
 * requireBoothTokenOrTeamMember(hubId param name defaults to 'hubId')
 * Usage: router.post('/hubs/:hubId/cart/...', requireBoothTokenOrTeamMember(), controller)
 *
 * 1. If X-Booth-Token header present: look up VendorBooth by boothToken, confirm
 *    status === 'CONFIRMED' and hubId matches. Grant booth-scoped access.
 * 2. Else, require an authenticated User (authenticate() must run before this
 *    middleware) and resolve TeamMember authorization via the explicit join:
 *    a. Load SaleHub by hubId -> get hub.organizerId.
 *    b. Load that Organizer's workspace via the existing Organizer.workspace relation.
 *       If no OrganizerWorkspace exists for that organizer -> 403 (a SaleHub whose
 *       owning Organizer has no workspace is not a valid TEAMS-tier state).
 *    c. Confirm the caller's WorkspaceMember (by userId OR organizerId, matching the
 *       existing requireWorkspaceMember() convention) belongs to that OrganizerWorkspace,
 *       and load the linked TeamMember row.
 * 3. Neither branch present or valid -> 401.
 */
export const requireBoothTokenOrTeamMember = () => {
  return async (req: BoothAuthRequest, res: Response, next: NextFunction) => {
    try {
      const hubId = req.params.hubId;
      if (!hubId) {
        return res.status(400).json({ message: 'Hub ID is required' });
      }

      // Branch 1: booth-token session
      const boothToken = req.headers['x-booth-token'];
      if (boothToken && typeof boothToken === 'string') {
        const booth = await prisma.vendorBooth.findUnique({
          where: { boothToken },
          select: { id: true, hubId: true, status: true },
        });

        if (!booth || booth.hubId !== hubId) {
          return res.status(401).json({ message: 'Invalid booth token' });
        }
        if (booth.status !== 'CONFIRMED') {
          return res.status(403).json({ message: 'This booth is not confirmed for this hub' });
        }

        req.boothAuth = { type: 'BOOTH', vendorBoothId: booth.id, hubId };
        return next();
      }

      // Branch 2: TeamMember JWT (authenticate() must have already run and set req.user)
      if (!req.user?.id) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const hub = await prisma.saleHub.findUnique({
        where: { id: hubId },
        select: { id: true, organizerId: true },
      });
      if (!hub) {
        return res.status(404).json({ message: 'Hub not found' });
      }

      const organizer = await prisma.organizer.findUnique({
        where: { id: hub.organizerId },
        select: {
          id: true,
          workspace: { select: { id: true } },
        },
      });

      if (!organizer?.workspace?.id) {
        // A SaleHub whose owning Organizer somehow has no workspace is not a valid
        // TEAMS-tier state — reject rather than silently proceeding.
        return res.status(403).json({ message: 'This hub has no associated workspace' });
      }

      const workspaceId = organizer.workspace.id;

      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          acceptedAt: { not: null },
          OR: [
            ...(req.user.organizerProfile?.id ? [{ organizerId: req.user.organizerProfile.id }] : []),
            { userId: req.user.id },
          ],
        },
        include: { teamMember: { select: { id: true } } },
      });

      if (!member || !member.teamMember) {
        return res.status(403).json({ message: 'You are not a team member of this hub\'s workspace' });
      }

      req.boothAuth = { type: 'TEAM_MEMBER', teamMemberId: member.teamMember.id, hubId };
      return next();
    } catch (error) {
      console.error('[requireBoothTokenOrTeamMember] Error:', error);
      return res.status(500).json({ message: 'Failed to verify booth/team access' });
    }
  };
};
