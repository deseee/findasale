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
    // HUB_OWNER added 2026-07-28 (P0: the market owner could not open their own
    // register). It is deliberately a THIRD type, not a TEAM_MEMBER with a missing
    // id: the owner has no TeamMember row, and every downstream consumer keys off
    // this discriminant to decide what to record as cashier identity.
    type: 'TEAM_MEMBER' | 'BOOTH' | 'HUB_OWNER';
    teamMemberId?: string;
    vendorBoothId?: string;
    // Set on HUB_OWNER sessions only: the Organizer profile id that owns this hub.
    organizerId?: string;
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
 *    middleware). Load SaleHub by hubId -> hub.organizerId, then:
 *
 *    OWNER PATH (added 2026-07-28, P0 fix). If the caller's own Organizer profile id
 *    === hub.organizerId, the caller IS the market owner and gets HUB_OWNER access.
 *    Before this, hub.organizerId was fetched and then never used as an authorization
 *    signal, so the owner was 403'd out of their own register unless they ALSO had an
 *    accepted WorkspaceMember row WITH a linked TeamMember row -- a combination no code
 *    path in this repo can produce: workspaceController.ts:35 creates the owner's
 *    WorkspaceMember with no TeamMember, workspaceController.ts:734 does the same for an
 *    accepted invite, and staffService.ts:134 is the ONLY TeamMember writer, reachable
 *    only from staffController.updateStaffProfile (staffController.ts:86-89), which
 *    requires a TeamMember to already exist.
 *
 *    A HUB_OWNER session carries NO teamMemberId, by design. There is no TeamMember row
 *    to point at, and auto-creating one would write a cashier identity that no admin
 *    asked for. Downstream is already correct for this:
 *      - vendorBoothCartController.ts:315/691/846 write cashierTeamMemberId ONLY when
 *        type === 'TEAM_MEMBER', so a HUB_OWNER cart stores null in both cashier FK
 *        columns (both are nullable: schema.prisma:5641-5644). No bogus FK.
 *      - checkoutGuard.ts:456-459 already adds the hub organizer's User to the
 *        protected-party set from hubId alone, so the owner is still covered by the
 *        self-dealing check with no cashier TeamMember present.
 *      - cashierBoothId stays null, so checkoutGuard.ts:412-423's booth self-dealing
 *        check is unaffected and the owner never looks like a vendor cashier.
 *
 *    TEAM MEMBER PATH (unchanged):
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
        return res.status(400).json({ message: 'Hub ID is required', code: 'HUB_ID_REQUIRED' });
      }

      // Branch 1: booth-token session
      const boothToken = req.headers['x-booth-token'];
      if (boothToken && typeof boothToken === 'string') {
        const booth = await prisma.vendorBooth.findUnique({
          where: { boothToken },
          select: { id: true, hubId: true, status: true, deletedAt: true },
        });

        // A soft-deleted booth (removed from the hub via deleteVendorBooth, which sets
        // deletedAt) is treated exactly like a booth that does not exist -- same 401,
        // same message, so no distinct "was deleted" signal is leaked. Mirrors the
        // deletedAt: null condition claimVendorBooth already enforces
        // (vendorBoothController.ts:307). Without this, a removed booth kept cashier
        // rights for as long as its status row read CONFIRMED.
        if (!booth || booth.deletedAt || booth.hubId !== hubId) {
          return res.status(401).json({ message: 'Invalid booth token', code: 'BOOTH_TOKEN_INVALID' });
        }
        if (booth.status !== 'CONFIRMED') {
          return res.status(403).json({ message: 'This booth is not confirmed for this hub', code: 'BOOTH_NOT_CONFIRMED' });
        }

        req.boothAuth = { type: 'BOOTH', vendorBoothId: booth.id, hubId };
        return next();
      }

      // Branch 2: TeamMember JWT (authenticate() must have already run and set req.user)
      if (!req.user?.id) {
        return res.status(401).json({ message: 'Authentication required', code: 'AUTH_REQUIRED' });
      }

      const hub = await prisma.saleHub.findUnique({
        where: { id: hubId },
        select: { id: true, organizerId: true },
      });
      if (!hub) {
        return res.status(404).json({ message: 'Hub not found', code: 'HUB_NOT_FOUND' });
      }

      // Branch 2a: the hub's OWNER. hub.organizerId was already loaded above; this is
      // the authorization signal that was missing. Organizer.id is the same id space as
      // req.user.organizerProfile.id (auth.ts:210 sets organizerProfile from the User's
      // own Organizer row), so this is a direct id comparison, not an inferred one.
      // Checked BEFORE the workspace lookup so the owner is never blocked by the
      // "no workspace" 403 below -- routes/users.ts:443 creates an OrganizerWorkspace
      // during TEAMS onboarding but never a WorkspaceMember, and an owner who has not
      // been through workspaceController.createWorkspace has no workspace at all.
      if (req.user.organizerProfile?.id && req.user.organizerProfile.id === hub.organizerId) {
        req.boothAuth = { type: 'HUB_OWNER', organizerId: hub.organizerId, hubId };
        return next();
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
        return res.status(403).json({ message: 'This hub has no associated workspace', code: 'NO_WORKSPACE' });
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
        return res.status(403).json({ message: 'You are not a team member of this hub\'s workspace', code: 'NOT_TEAM_MEMBER' });
      }

      req.boothAuth = { type: 'TEAM_MEMBER', teamMemberId: member.teamMember.id, hubId };
      return next();
    } catch (error) {
      console.error('[requireBoothTokenOrTeamMember] Error:', error);
      return res.status(500).json({ message: 'Failed to verify booth/team access', code: 'AUTH_CHECK_FAILED' });
    }
  };
};
