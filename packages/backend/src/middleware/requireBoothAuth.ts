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
 *    OWNER PATH (added 2026-07-28, P0 fix; id-shape corrected 2026-07-28b). If the
 *    caller owns the Organizer that owns this hub -- matched by Organizer.userId ===
 *    req.user.id, or by req.user.organizerProfile.id === Organizer.id when that profile
 *    is present -- the caller IS the market owner and gets HUB_OWNER access. Both shapes
 *    are accepted because these routes run optionalAuthenticate (which does NOT attach
 *    organizerProfile), not authenticate (which does).
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
          select: { id: true, hubId: true, status: true, deletedAt: true, userId: true },
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

        // S1178 Priority 2 Bug 1 (findasale-hacker fix-and-reverify, 2026-07-29): a
        // CONFIRMED booth can still have userId === null -- the organizer confirms a
        // booth's registration independently of the vendor claiming it (claim sets
        // userId via vendorBoothController.claimVendorBooth). Before this check, ANY
        // printed placard QR for a CONFIRMED-but-unclaimed booth was a full working
        // cashier session for the entire venue (booth-cart checkout is venue-wide, not
        // scoped to this booth's own items) to whoever read/photographed it first --
        // no vendor identity was ever verified. A distinct code (not the generic
        // BOOTH_TOKEN_INVALID) lets the real vendor's claim UI tell them to finish
        // claiming rather than showing an "invalid token" dead end.
        if (!booth.userId) {
          return res.status(403).json({ message: 'This booth has not been claimed yet. The vendor must claim it before it can be used to check out shoppers.', code: 'BOOTH_NOT_CLAIMED' });
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
      // the authorization signal that was missing.
      //
      // FIX 2026-07-28b: the original owner check read ONLY req.user.organizerProfile.id.
      // authenticate() sets that field (auth.ts:166-169 loads the User with
      // `include: { organizer: true }`; auth.ts:209-211 attaches it), but
      // optionalAuthenticate() does NOT -- it loads the bare User row (auth.ts:50) and
      // attaches only `user` and `roles` (auth.ts:52-56). All ten cart routes are wired
      // with optionalAuthenticate (routes/vendorBooth.ts:127-147), so organizerProfile
      // was ALWAYS undefined here and the owner branch could never fire: the market owner
      // fell through to the workspace lookup and got 403 NOT_TEAM_MEMBER on their own hub.
      //
      // The Organizer row is now loaded BEFORE the owner check -- it was already being
      // loaded a few lines below for the workspace join, so this costs no extra query --
      // and the ownership test accepts EITHER id shape:
      //   - Organizer.userId === req.user.id  (works under optionalAuthenticate; this is
      //     the authoritative link, Organizer.userId is @unique in schema.prisma)
      //   - organizerProfile.id === Organizer.id  (works under authenticate())
      // Either match proves the caller owns the Organizer that owns this hub, so neither
      // arm widens access beyond the single legitimate owner.
      //
      // Still evaluated BEFORE the "no workspace" 403 below -- routes/users.ts:443 creates
      // an OrganizerWorkspace during TEAMS onboarding but never a WorkspaceMember, and an
      // owner who has not been through workspaceController.createWorkspace has no
      // workspace at all.
      const organizer = await prisma.organizer.findUnique({
        where: { id: hub.organizerId },
        select: {
          id: true,
          userId: true,
          workspace: { select: { id: true } },
        },
      });

      const callerOrganizerProfileId = req.user.organizerProfile?.id ?? null;
      if (
        organizer &&
        (organizer.userId === req.user.id ||
          (callerOrganizerProfileId !== null && callerOrganizerProfileId === organizer.id))
      ) {
        req.boothAuth = { type: 'HUB_OWNER', organizerId: hub.organizerId, hubId };
        return next();
      }

      if (!organizer?.workspace?.id) {
        // A SaleHub whose owning Organizer somehow has no workspace is not a valid
        // TEAMS-tier state — reject rather than silently proceeding.
        return res.status(403).json({ message: 'This hub has no associated workspace', code: 'NO_WORKSPACE' });
      }

      const workspaceId = organizer.workspace.id;

      // FIX 2026-07-28b (SECOND instance of the same bug class): this OR clause also read
      // req.user.organizerProfile?.id, so on these optionalAuthenticate routes the
      // { organizerId } arm was ALWAYS dropped and only { userId } could ever match.
      // That is not merely dead code. workspaceController.ts:734-738 creates an accepted
      // invitee's WorkspaceMember with `...(organizer ? { organizerId } : { userId })` --
      // EXCLUSIVE, one or the other. A team member who also has an Organizer profile
      // therefore has a WorkspaceMember row whose userId is NULL, which the userId-only
      // arm can never match, so that cashier was 403'd off the register as well.
      // Resolve the caller's Organizer id from req.user.id when the profile is absent --
      // the same lookup shape the cart controller already uses
      // (vendorBoothCartController.ts:1492). This query runs ONLY on the logged-in
      // non-owner path: booth-token sessions returned at branch 1, owners returned at
      // branch 2a, and anonymous callers never get past the req.user?.id check.
      let callerOrganizerId = callerOrganizerProfileId;
      if (!callerOrganizerId) {
        const callerOrganizer = await prisma.organizer.findUnique({
          where: { userId: req.user.id },
          select: { id: true },
        });
        callerOrganizerId = callerOrganizer?.id ?? null;
      }

      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          acceptedAt: { not: null },
          OR: [
            ...(callerOrganizerId ? [{ organizerId: callerOrganizerId }] : []),
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
