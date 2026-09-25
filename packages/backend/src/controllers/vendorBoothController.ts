import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
// S-STRIPE-SQUARE-ONBOARDING-GUARD (2026-09-09): createConnectAccount no longer
// used in this file -- the genuinely-new-vendor branch now blocks new-Stripe-
// identity creation instead (Stripe platform account closed).
import { createOnboardingLink, getAccountStatus } from '../services/stripeConnectService';
// Square migration (2026-09-07, Wave 1 #2): vendor-booth-operator's Square-side onboarding.
// buildSquareAuthorizeUrl/resolveExistingSquareIdentityForUser mirror the existing Stripe
// reuse-resolution pattern below (see startVendorBoothStripeOnboarding) -- the actual OAuth
// code exchange for a booth is handled by squareConnectController.ts's shared
// handleSquareConnectCallback (Square's OAuth app has one fixed redirect URL for all four
// owner types, so the callback is centralized there rather than duplicated per controller).
import { buildSquareAuthorizeUrl, resolveExistingSquareIdentityForUser } from '../services/squareConnectService';
// Booth-rent auto-pay, Square path (2026-09-14 design,
// claude_docs/feature-notes/booth-rent-autopay-square-design-2026-09-13.md). Same platform
// Square client every other platform-account Square call in this codebase uses (Boost's cash
// rail, squareVendorBoothCartService.ts's own createSquareSharedCardForCart) -- NEVER the
// hub owner's own connected-account client, which the cron (not this controller) resolves.
import { getSquarePlatformClient } from '../utils/square';
import { createSquareSharedCardForBoothFee } from '../services/squareVendorBoothCartService';
// Single source of truth for the platform's cut. The vendor-facing fee disclosure
// below MUST derive from this, using the same hub-owner tier the money path
// (vendorBoothCartController.ts computeLegFeeSplit) feeds it -- a hardcoded
// display percentage drifts from what Stripe actually takes.
import { getInclusivePlatformFeeRate, getInclusiveFeeRangePercent } from '../utils/feeCalculator'; // inclusive-fee migration (2026-09-24, Patrick ruling); getInclusiveFeeRangePercent added 2026-09-25 (Patrick correction) -- booth-cart legs are always charged IN_PERSON (getInclusivePlatformFeeRate stays for that), but the DISCLOSURE to the vendor should show the platform's real fee range, not just the one channel this booth's register happens to use
import { sendVendorBoothInviteEmail } from '../services/vendorBoothInviteEmailService';
// Lifecycle notifications (claim / confirm / reject-cancel / Stripe connected). Every one
// of these is invoked fire-and-forget with a .catch, exactly like the invite trigger at
// createVendorBooth below -- a notification must NEVER fail or roll back the action that
// produced it, and the service itself never throws (it returns { sent, reason }).
import {
  notifyOrganizerBoothClaimed,
  notifyVendorBoothConfirmed,
  notifyVendorBoothDecision,
  notifyOrganizerBoothStripeConnected,
  notifyOrganizerBoothSquareConnected,
  notifyOrganizerBoothAutopayCancelled,
} from '../services/vendorBoothLifecycleNotificationService';
import type { BoothNotifyResult } from '../services/vendorBoothLifecycleNotificationService';


/**
 * Vendor Booth Payments — CRUD + Claim + Stripe Onboarding (2026-07-07)
 * ADR-015 (base VendorBooth model) + ADR-016 (real userId-linked vendor accounts,
 * Stripe Connect onboarding) + ADR-017 (security fixes: claim body contract,
 * field-whitelisted public summary, no-eager-include on vendor dashboard).
 */

/** Resolve the authenticated organizer + their workspace (mirrors consignorController pattern). */
async function getOrganizerWorkspace(userId: string): Promise<{ organizer: any; workspace: any } | null> {
  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) return null;
  const workspace = await prisma.organizerWorkspace.findFirst({ where: { ownerId: organizer.id } });
  return workspace ? { organizer, workspace } : null;
}

// ADR-090 §2.2 (2026-07-20): server-enforced ceiling on revenueSharePercent, at both
// create and update. Mirrored (defense-in-depth) in vendorBoothCartController.ts's
// computeLegFeeSplit, which clamps again at charge time regardless of what's stored.
const REVENUE_SHARE_CAP_PERCENT = 30;

function clampRevenueSharePercent(raw: unknown): number | { error: string } {
  const parsed = parseFloat(raw as string);
  if (Number.isNaN(parsed)) return { error: 'revenueSharePercent must be a number' };
  if (parsed < 0 || parsed > REVENUE_SHARE_CAP_PERCENT) {
    return { error: `revenueSharePercent must be between 0 and ${REVENUE_SHARE_CAP_PERCENT}` };
  }
  return parsed;
}

function serializeBooth(booth: any) {
  return {
    ...booth,
    boothFee: booth.boothFee?.toString?.() ?? booth.boothFee,
  };
}

/**
 * GET /api/organizer/hubs/:hubId/vendor-booths
 * List all vendor booths for a hub (organizer-only, verifies hub ownership).
 */
export const listVendorBooths = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const booths = await prisma.vendorBooth.findMany({
      // isHubOwnerBooth: false -- the synthetic house booth (Fix 2, 2026-08-01) is
      // never editable/visible via the normal booth CRUD UI. See houseBoothService.ts.
      where: { hubId, deletedAt: null, isHubOwnerBooth: false },
      select: {
        id: true, hubId: true, boothNumber: true, vendorName: true, vendorEmail: true,
        vendorPhone: true, boothFee: true, revenueSharePercent: true, status: true,
        stripeOnboarded: true, boothToken: true, userId: true, confirmedAt: true,
        rejectedAt: true, createdAt: true,
        // Observability (S-booth-invite): "did the invite go out?" answered on the page.
        inviteSentAt: true, inviteSentCount: true,
        // Same question, one level down: the lifecycle notification stamps written by
        // services/vendorBoothLifecycleNotificationService.ts. Without these on the wire
        // the page could tell an organizer the invite went out but not whether the vendor
        // was ever told their booth was confirmed. Raw columns only -- the page decides
        // what each null means, exactly as it already does for inviteSentAt.
        claimNotifiedAt: true, confirmNotifiedAt: true,
        decisionNotifiedAt: true, stripeNotifiedAt: true,
        // Square changeover (2026-09-09): squareOnboarded is the "happened" input the page's
        // classifyNotifyState needs for the Square notification row (same role stripeOnboarded
        // plays for the Stripe row), and squareNotifiedAt is that row's own stamp -- added
        // alongside the Stripe pair above, never replacing it, since a booth can carry a
        // legacy Stripe connection and a Square connection independently.
        squareOnboarded: true, squareNotifiedAt: true,
        // Finix sandbox pilot (2026-09-18, ADR-127 SS5.3/SS5.4 step 4) -- added 2026-09-25
        // (Patrick correction): was already on VendorBooth but never selected here, so the
        // hub-owner table could never show it regardless of what the frontend rendered.
        finixOnboarded: true,
        // Register access grant (2026-07-29, Patrick's decision) -- separate from
        // claim/confirm. See VendorBooth.registerAccessGrantedAt in schema.prisma.
        registerAccessGrantedAt: true,
      },
      orderBy: { boothNumber: 'asc' },
    });

    return res.status(200).json(booths.map(serializeBooth));
  } catch (error) {
    console.error('[listVendorBooths] Error:', error);
    return res.status(500).json({ error: 'Failed to list vendor booths' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/vendor-booths
 * Create a new vendor booth (organizer-only). boothToken auto-generated (schema default).
 * Body: { boothNumber, vendorName, vendorEmail?, vendorPhone?, boothFee?, revenueSharePercent?, notes? }
 */
export const createVendorBooth = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;
    const { boothNumber, vendorName, vendorEmail, vendorPhone, boothFee, revenueSharePercent, notes } = req.body;

    if (!boothNumber || !vendorName) {
      return res.status(400).json({ error: 'boothNumber and vendorName are required' });
    }

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const existing = await prisma.vendorBooth.findFirst({ where: { hubId, boothNumber, deletedAt: null } });
    if (existing) {
      return res.status(409).json({ error: 'A booth with this number already exists in this hub' });
    }

    let clampedRevenueSharePercent = 0;
    if (revenueSharePercent !== undefined) {
      const clamped = clampRevenueSharePercent(revenueSharePercent);
      if (typeof clamped === 'object') return res.status(400).json({ error: clamped.error });
      clampedRevenueSharePercent = clamped;
    }

    const booth = await prisma.vendorBooth.create({
      data: {
        hubId,
        boothNumber,
        vendorName,
        vendorEmail: vendorEmail || null,
        vendorPhone: vendorPhone || null,
        boothFee: boothFee !== undefined ? new Decimal(boothFee) : new Decimal(0),
        revenueSharePercent: clampedRevenueSharePercent,
        notes: notes || null,
        status: 'PENDING',
      },
    });

    // Booth invite email. Fire-and-forget with a .catch, exactly like
    // consignorController.ts sendConsignorPayout(...).catch(...) -- a delivery failure
    // must NEVER fail booth creation, so this is deliberately not awaited and the
    // service itself never throws (it returns { sent, reason }).
    if (booth.vendorEmail) {
      sendVendorBoothInviteEmail(booth.id).catch(err =>
        console.warn('[booth-invite] Invite email failed for booth', booth.id, err)
      );
    }

    return res.status(201).json(serializeBooth(booth));
  } catch (error) {
    console.error('[createVendorBooth] Error:', error);
    return res.status(500).json({ error: 'Failed to create vendor booth' });
  }
};

/**
 * GET /api/organizer/hubs/:hubId/vendor-booths/:boothId
 * Organizer-only detail view (includes payouts summary).
 */
export const getVendorBooth = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, boothId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const booth = await prisma.vendorBooth.findFirst({
      // isHubOwnerBooth: false -- the synthetic house booth (Fix 2, 2026-08-01) is
      // system-managed and never visible via the normal booth CRUD UI (matches
      // listVendorBooths/listMyVendorBooths' exclusion and updateVendorBooth/
      // deleteVendorBooth's 403 guard). Without this, the detail endpoint would
      // leak the house booth's boothToken (a bearer secret) and mirrored Stripe
      // account ids through a plain findFirst-with-no-select include. (hacker
      // fix-and-reverify, 2026-08-01)
      where: { id: boothId, hubId, deletedAt: null, isHubOwnerBooth: false },
      include: {
        payouts: {
          select: { id: true, totalSales: true, boothFeeCharged: true, revenueShareOwed: true, netPayout: true, status: true, paidAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!booth) return res.status(404).json({ error: 'Vendor booth not found' });

    return res.status(200).json(serializeBooth(booth));
  } catch (error) {
    console.error('[getVendorBooth] Error:', error);
    return res.status(500).json({ error: 'Failed to get vendor booth' });
  }
};

/**
 * PUT /api/organizer/hubs/:hubId/vendor-booths/:boothId
 * Organizer-only. Body: any subset of { boothNumber, vendorName, vendorEmail, vendorPhone,
 * boothFee, revenueSharePercent, notes, status }.
 * status transitions to CONFIRMED/REJECTED set confirmedAt/rejectedAt.
 */
export const updateVendorBooth = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, boothId } = req.params;
    const { boothNumber, vendorName, vendorEmail, vendorPhone, boothFee, revenueSharePercent, notes, status } = req.body;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const existing = await prisma.vendorBooth.findFirst({ where: { id: boothId, hubId, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Vendor booth not found' });
    // Fix 2 (2026-08-01): the synthetic house booth is system-managed -- never
    // editable/removable via the normal booth CRUD UI. See houseBoothService.ts.
    if (existing.isHubOwnerBooth) {
      return res.status(403).json({ error: 'This booth is system-managed and cannot be edited or removed.' });
    }

    const updateData: any = {};
    if (boothNumber !== undefined) updateData.boothNumber = boothNumber;
    if (vendorName !== undefined) updateData.vendorName = vendorName;
    if (vendorEmail !== undefined) updateData.vendorEmail = vendorEmail;
    if (vendorPhone !== undefined) updateData.vendorPhone = vendorPhone;
    if (notes !== undefined) updateData.notes = notes;
    if (boothFee !== undefined) updateData.boothFee = new Decimal(boothFee);
    if (revenueSharePercent !== undefined) {
      const clamped = clampRevenueSharePercent(revenueSharePercent);
      if (typeof clamped === 'object') return res.status(400).json({ error: clamped.error });
      updateData.revenueSharePercent = clamped;
    }

    if (status !== undefined) {
      const validStatuses = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` });
      }
      updateData.status = status;
      if (status === 'CONFIRMED') updateData.confirmedAt = new Date();
      if (status === 'REJECTED') updateData.rejectedAt = new Date();
    }

    const updated = await prisma.vendorBooth.update({ where: { id: boothId }, data: updateData });

    // Lifecycle notification. Gated on a REAL transition (status actually changed from
    // what was stored), so re-saving an unrelated field, or re-submitting the same status,
    // never re-notifies. The service stamps its own idempotency column on top of this.
    if (status !== undefined && status !== existing.status) {
      if (status === 'CONFIRMED') {
        notifyVendorBoothConfirmed(boothId).catch(err =>
          console.warn('[booth-lifecycle] Confirm notification failed for booth', boothId, err)
        );
      } else if (status === 'REJECTED' || status === 'CANCELLED') {
        notifyVendorBoothDecision(boothId, status).catch(err =>
          console.warn('[booth-lifecycle] Decision notification failed for booth', boothId, err)
        );
      }
    }

    return res.status(200).json(serializeBooth(updated));
  } catch (error) {
    console.error('[updateVendorBooth] Error:', error);
    return res.status(500).json({ error: 'Failed to update vendor booth' });
  }
};

/**
 * DELETE /api/organizer/hubs/:hubId/vendor-booths/:boothId
 * Organizer-only. Soft-delete (deletedAt) — preserves payout/item history.
 */
export const deleteVendorBooth = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, boothId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const existing = await prisma.vendorBooth.findFirst({ where: { id: boothId, hubId, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Vendor booth not found' });
    // Fix 2 (2026-08-01): the synthetic house booth is system-managed -- never
    // editable/removable via the normal booth CRUD UI. See houseBoothService.ts.
    if (existing.isHubOwnerBooth) {
      return res.status(403).json({ error: 'This booth is system-managed and cannot be edited or removed.' });
    }

    await prisma.vendorBooth.update({ where: { id: boothId }, data: { deletedAt: new Date(), status: 'CANCELLED' } });

    // A vendor who claimed this booth (or was emailed an invite to it) must not be left
    // wondering why it stopped working. notifyVendorBoothDecision deliberately does not
    // bail on deletedAt for exactly this call, and skips on its own when the booth was
    // never claimed and never invited.
    if (existing.status !== 'CANCELLED') {
      notifyVendorBoothDecision(boothId, 'CANCELLED').catch(err =>
        console.warn('[booth-lifecycle] Cancel notification failed for booth', boothId, err)
      );
    }

    return res.status(204).send();
  } catch (error) {
    console.error('[deleteVendorBooth] Error:', error);
    return res.status(500).json({ error: 'Failed to delete vendor booth' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/vendor-booths/:boothId/invite
 * Organizer-only. Re-sends the booth claim invite to VendorBooth.vendorEmail.
 * Ownership check is the SAME three-step chain updateVendorBooth uses above:
 * getOrganizerWorkspace(req.user.id) -> saleHub.findFirst({ id: hubId, organizerId })
 * -> vendorBooth.findFirst({ id: boothId, hubId, deletedAt: null }). A user who is not
 * this hub's organizer never gets past the hub lookup (404, same as the siblings).
 * Awaited (unlike the create-time send) so the organizer gets a real answer.
 */
export const resendVendorBoothInvite = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, boothId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const existing = await prisma.vendorBooth.findFirst({ where: { id: boothId, hubId, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Vendor booth not found' });

    if (!existing.vendorEmail) {
      return res.status(400).json({ error: 'This booth has no vendor email. Add one first, then send the invite.' });
    }

    const sendResult = await sendVendorBoothInviteEmail(boothId);
    if (!sendResult.sent) {
      return res.status(409).json({ error: sendResult.reason || 'Invite was not sent' });
    }

    const refreshed = await prisma.vendorBooth.findUnique({
      where: { id: boothId },
      select: { inviteSentAt: true, inviteSentCount: true },
    });

    return res.status(200).json({
      sent: true,
      vendorEmail: existing.vendorEmail,
      inviteSentAt: refreshed?.inviteSentAt ?? null,
      inviteSentCount: refreshed?.inviteSentCount ?? 0,
    });
  } catch (error) {
    console.error('[resendVendorBoothInvite] Error:', error);
    return res.status(500).json({ error: 'Failed to send booth invite' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/vendor-booths/:boothId/notify
 * Organizer-only. Re-runs ONE lifecycle notification that should have gone out and did not.
 * Body: { kind: 'claim' | 'confirm' | 'decision' | 'stripe' | 'square' }
 *
 * Ownership check is the SAME three-step chain resendVendorBoothInvite above uses, copied
 * line for line: getOrganizerWorkspace(req.user.id) -> saleHub.findFirst({ id: hubId,
 * organizerId }) -> vendorBooth.findFirst({ id: boothId, hubId, deletedAt: null }). A user
 * who is not this hub's organizer never gets past the hub lookup (404, same as the
 * siblings). Route-level guards are identical too: authenticate + requireTier('TEAMS').
 *
 * No stamp is ever cleared here. Each notifier checks its own stamp FIRST and refuses when
 * it is already set (vendorBoothLifecycleNotificationService.ts :162, :245, :332, :401), so
 * this endpoint can only ever fill a hole -- it can never produce a duplicate email. That
 * refusal comes back as a 409 with the service's own reason, which is also how the caller
 * learns the send was not applicable (for example a booth that was never claimed and never
 * invited has nobody to tell about a rejection).
 *
 * Awaited (unlike the fire-and-forget triggers on the lifecycle transitions themselves) so
 * the organizer gets a real answer instead of an optimistic one.
 */
export const resendVendorBoothNotification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, boothId } = req.params;
    const { kind } = req.body;

    const validKinds = ['claim', 'confirm', 'decision', 'stripe', 'square'];
    if (!kind || !validKinds.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of ${validKinds.join(', ')}` });
    }

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const existing = await prisma.vendorBooth.findFirst({ where: { id: boothId, hubId, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Vendor booth not found' });

    let sendResult: BoothNotifyResult;
    if (kind === 'claim') {
      sendResult = await notifyOrganizerBoothClaimed(boothId);
    } else if (kind === 'confirm') {
      sendResult = await notifyVendorBoothConfirmed(boothId);
    } else if (kind === 'decision') {
      // The service only recognises these two, and it needs to be told WHICH one so the
      // wording matches. Anything else is not a decision and has no notification.
      if (existing.status !== 'REJECTED' && existing.status !== 'CANCELLED') {
        return res.status(409).json({ error: 'This booth was not rejected or cancelled, so there is no decision to send' });
      }
      sendResult = await notifyVendorBoothDecision(boothId, existing.status);
    } else if (kind === 'stripe') {
      sendResult = await notifyOrganizerBoothStripeConnected(boothId);
    } else {
      sendResult = await notifyOrganizerBoothSquareConnected(boothId);
    }

    if (!sendResult.sent) {
      return res.status(409).json({ error: sendResult.reason || 'Notification was not sent' });
    }

    // Hand back every stamp so the page can patch the row in place, the same way the
    // invite endpoint hands back inviteSentAt / inviteSentCount.
    const refreshed = await prisma.vendorBooth.findUnique({
      where: { id: boothId },
      select: {
        claimNotifiedAt: true, confirmNotifiedAt: true,
        decisionNotifiedAt: true, stripeNotifiedAt: true, squareNotifiedAt: true,
      },
    });

    return res.status(200).json({
      sent: true,
      kind,
      claimNotifiedAt: refreshed?.claimNotifiedAt ?? null,
      confirmNotifiedAt: refreshed?.confirmNotifiedAt ?? null,
      decisionNotifiedAt: refreshed?.decisionNotifiedAt ?? null,
      stripeNotifiedAt: refreshed?.stripeNotifiedAt ?? null,
      squareNotifiedAt: refreshed?.squareNotifiedAt ?? null,
    });
  } catch (error) {
    console.error('[resendVendorBoothNotification] Error:', error);
    return res.status(500).json({ error: 'Failed to send the notification' });
  }
};

/**
 * Register access grant (2026-07-29, Patrick's decision)
 * ---------------------------------------------------------------------------
 * Claiming a CONFIRMED booth (VendorBooth.userId set) is NO LONGER sufficient on its own
 * to open the venue register -- that has to be a SEPARATE, organizer-controlled grant,
 * mirroring staffService.grantRegisterAccess/revokeRegisterAccess for TeamMember rows
 * (staffService.ts:556/610). See the comment on VendorBooth.registerAccessGrantedAt in
 * schema.prisma for the full rationale and requireBoothAuth.ts's booth-token branch for
 * the enforcement (403 REGISTER_ACCESS_NOT_GRANTED when this is null).
 *
 * Ownership check is the SAME three-step chain every sibling organizer-only booth endpoint
 * in this file uses: getOrganizerWorkspace(req.user.id) -> saleHub.findFirst({ id: hubId,
 * organizerId }) -> vendorBooth.findFirst({ id: boothId, hubId, deletedAt: null }). A user
 * who is not this hub's organizer never gets past the hub lookup (404, same as the
 * siblings).
 *
 * Both grant and revoke are idempotent: granting an already-granted booth is a no-op that
 * still returns 200 with the (unchanged) grant timestamp; revoking a never-granted booth
 * likewise no-ops rather than erroring. Neither write touches `status`, `userId`, or any
 * other lifecycle field on the booth -- this is additive and orthogonal to claim/confirm,
 * exactly per Patrick's "separate grant" instruction.
 */

/**
 * POST /api/organizer/hubs/:hubId/vendor-booths/:boothId/register-access
 * Organizer-only. Turn ON register access for one booth. Safe to call twice.
 */
export const grantBoothRegisterAccess = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, boothId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const existing = await prisma.vendorBooth.findFirst({ where: { id: boothId, hubId, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Vendor booth not found' });

    const updated = existing.registerAccessGrantedAt
      ? existing
      : await prisma.vendorBooth.update({
          where: { id: boothId },
          data: { registerAccessGrantedAt: new Date() },
          select: { registerAccessGrantedAt: true },
        });

    return res.status(200).json({ registerAccessGrantedAt: updated.registerAccessGrantedAt });
  } catch (error) {
    console.error('[grantBoothRegisterAccess] Error:', error);
    return res.status(500).json({ error: 'Failed to grant register access' });
  }
};

/**
 * DELETE /api/organizer/hubs/:hubId/vendor-booths/:boothId/register-access
 * Organizer-only. Turn OFF register access for one booth. Safe to call on a booth that
 * never had it. Does NOT touch claim/confirm state -- a revoked vendor can still sell
 * their own items normally through the booth-cart flow another cashier rings up; they
 * simply cannot open the register on their own device via X-Booth-Token afterward.
 */
export const revokeBoothRegisterAccess = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, boothId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const existing = await prisma.vendorBooth.findFirst({ where: { id: boothId, hubId, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Vendor booth not found' });

    if (existing.registerAccessGrantedAt) {
      await prisma.vendorBooth.update({
        where: { id: boothId },
        data: { registerAccessGrantedAt: null },
      });
    }

    return res.status(200).json({ registerAccessGrantedAt: null });
  } catch (error) {
    console.error('[revokeBoothRegisterAccess] Error:', error);
    return res.status(500).json({ error: 'Failed to revoke register access' });
  }
};

/**
 * GET /api/organizer/hubs/:hubId/cashier-discretion
 * ADR cashier-discretionary-discount (2026-09-25): the mall-owner-only per-cashier
 * toggle screen's data -- every CONFIRMED, non-deleted VendorBooth at this hub, every
 * TeamMember reachable through this hub's owning organizer's workspace, and a
 * non-toggleable "you" row for the mall owner (always allowed, never needs a grant row).
 *
 * ACCESS CONTROL (ADR §4, "use recommendation" decision): only the hub-owning
 * organizer's own login can reach this -- the SAME ownership check
 * grantBoothRegisterAccess/revokeBoothRegisterAccess above already use
 * (getOrganizerWorkspace(req.user.id) + hub.organizerId === organizer.id), which is
 * `req.user.id`-derived and therefore rejects a TEAM_MEMBER caller outright, MANAGER-role
 * included -- a team member has no Organizer row of their own to match hub.organizerId
 * against (their WorkspaceMember.organizerId, if set, points at the OWNER's Organizer
 * id, not one they own). This is deliberately NOT requireBoothTokenOrTeamMember() (used
 * by the cart routes), which treats TEAM_MEMBER as a full cashier -- that is exactly the
 * caller this endpoint must reject.
 */
export const listHubCashierDiscretionGrants = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer, workspace } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const [booths, teamMembers, grants] = await Promise.all([
      prisma.vendorBooth.findMany({
        where: { hubId, status: 'CONFIRMED', deletedAt: null },
        select: { id: true, vendorName: true, boothNumber: true, isHubOwnerBooth: true },
        orderBy: { boothNumber: 'asc' },
      }),
      prisma.teamMember.findMany({
        where: { workspaceMember: { workspaceId: workspace.id, acceptedAt: { not: null } } },
        select: {
          id: true,
          role: true,
          workspaceMember: { select: { user: { select: { name: true, email: true } }, organizer: { select: { businessName: true, user: { select: { name: true, email: true } } } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.cashierDiscretionGrant.findMany({ where: { hubId } }),
    ]);

    const boothGrantByBoothId = new Map(grants.filter((g) => g.cashierBoothId).map((g) => [g.cashierBoothId as string, g]));
    const teamGrantByTeamMemberId = new Map(grants.filter((g) => g.cashierTeamMemberId).map((g) => [g.cashierTeamMemberId as string, g]));

    return res.status(200).json({
      hubOwner: { label: 'You (mall owner)', toggleable: false, enabled: true },
      booths: booths.map((b) => ({
        vendorBoothId: b.id,
        vendorName: b.vendorName,
        boothNumber: b.boothNumber,
        isHubOwnerBooth: b.isHubOwnerBooth,
        enabled: boothGrantByBoothId.get(b.id)?.enabled ?? false,
      })),
      teamMembers: teamMembers.map((tm) => ({
        teamMemberId: tm.id,
        role: tm.role,
        name: tm.workspaceMember?.user?.name ?? tm.workspaceMember?.organizer?.user?.name ?? tm.workspaceMember?.user?.email ?? tm.workspaceMember?.organizer?.businessName ?? 'Team member',
        enabled: teamGrantByTeamMemberId.get(tm.id)?.enabled ?? false,
      })),
    });
  } catch (error) {
    console.error('[listHubCashierDiscretionGrants] Error:', error);
    return res.status(500).json({ error: 'Failed to load cashier discretion settings' });
  }
};

/**
 * PUT /api/organizer/hubs/:hubId/cashier-discretion/:type/:id
 * Body: { enabled: boolean }
 * :type = 'TEAM_MEMBER' | 'BOOTH'. Upserts (never creates a duplicate -- the schema's
 * @@unique([hubId, cashierTeamMemberId]) / @@unique([hubId, cashierBoothId]) is the
 * idempotency guard) the CashierDiscretionGrant row for this hub + cashier. Same
 * hub-owning-organizer-only access control as listHubCashierDiscretionGrants above.
 */
export const setHubCashierDiscretionGrant = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, type, id } = req.params;
    const { enabled } = req.body as { enabled?: boolean };

    if (type !== 'TEAM_MEMBER' && type !== 'BOOTH') {
      return res.status(400).json({ error: "type must be 'TEAM_MEMBER' or 'BOOTH'" });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer, workspace } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    if (type === 'BOOTH') {
      const booth = await prisma.vendorBooth.findFirst({ where: { id, hubId, deletedAt: null } });
      if (!booth) return res.status(404).json({ error: 'Vendor booth not found on this hub' });

      const grant = await prisma.cashierDiscretionGrant.upsert({
        where: { hubId_cashierBoothId: { hubId, cashierBoothId: id } },
        create: { hubId, cashierBoothId: id, enabled, setByUserId: req.user.id },
        update: { enabled, setByUserId: req.user.id },
      });
      return res.status(200).json({ vendorBoothId: id, enabled: grant.enabled });
    }

    // type === 'TEAM_MEMBER' -- must belong to THIS hub's owning organizer's workspace,
    // never any team member on the platform (verified via the join, not trusted from id).
    const teamMember = await prisma.teamMember.findFirst({
      where: { id, workspaceMember: { workspaceId: workspace.id, acceptedAt: { not: null } } },
    });
    if (!teamMember) return res.status(404).json({ error: 'Team member not found on this hub\'s workspace' });

    const grant = await prisma.cashierDiscretionGrant.upsert({
      where: { hubId_cashierTeamMemberId: { hubId, cashierTeamMemberId: id } },
      create: { hubId, cashierTeamMemberId: id, enabled, setByUserId: req.user.id },
      update: { enabled, setByUserId: req.user.id },
    });
    return res.status(200).json({ teamMemberId: id, enabled: grant.enabled });
  } catch (error) {
    console.error('[setHubCashierDiscretionGrant] Error:', error);
    return res.status(500).json({ error: 'Failed to update cashier discretion setting' });
  }
};

/**
 * GET /api/vendor-booth/:boothToken
 * PUBLIC endpoint (no auth). Field-whitelisted per ADR-017 — never boothFee,
 * revenueSharePercent, stripeAccountId, stripeOnboarded, or payout data.
 * If userId already set, the frontend should redirect to normal login instead
 * of re-showing the claim flow.
 */
export const getPublicBoothSummary = async (req: Request, res: Response) => {
  try {
    const { boothToken } = req.params;
    if (!boothToken) return res.status(400).json({ error: 'Booth token required' });

    const booth = await prisma.vendorBooth.findUnique({
      where: { boothToken },
      select: { boothNumber: true, vendorName: true, status: true, userId: true, hubId: true },
    });

    if (!booth || booth.status === 'CANCELLED') {
      return res.status(404).json({ error: 'Booth not found' });
    }

    return res.status(200).json({
      boothNumber: booth.boothNumber,
      vendorName: booth.vendorName,
      status: booth.status,
      alreadyClaimed: booth.userId != null,
    });
  } catch (error) {
    console.error('[getPublicBoothSummary] Error:', error);
    return res.status(500).json({ error: 'Failed to retrieve booth summary' });
  }
};

/**
 * POST /api/vendor-booth/:boothToken/claim
 * Authenticated User claims a booth. NO userId in request body — derived
 * exclusively from req.user.id (ADR-017 corrected claim contract).
 * Rejects if the same User already claimed a DIFFERENT booth in the SAME hub
 * (one User = one booth per hub; a User CAN operate booths across different hubs
 * per ADR-016 — NOT capped to one hub at a time).
 * Rejects if booth is not PENDING/CONFIRMED.
 */
export const claimVendorBooth = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { boothToken } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { boothToken } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });

    // ADR-090 §2.3: same-identity self-dealing block (ACTOR≠TARGET-FOR-VALUE
    // invariant). If this booth's hub is owned by an Organizer whose own User
    // account is the SAME User attempting to claim the booth, block outright --
    // that single actor would otherwise control both the "pays revenue share"
    // side (vendor) and the "receives revenue share" side (hub owner) of the
    // ADR-090 split, and could wash-trade against themselves.
    const hub = await prisma.saleHub.findUnique({
      where: { id: booth.hubId },
      select: { organizer: { select: { userId: true } } },
    });
    if (hub?.organizer?.userId === req.user.id) {
      return res.status(403).json({ error: 'You cannot claim a booth in a hub you own' });
    }

    if (!['PENDING', 'CONFIRMED'].includes(booth.status)) {
      return res.status(409).json({ error: `Booth cannot be claimed in status ${booth.status}` });
    }

    if (booth.userId && booth.userId !== req.user.id) {
      return res.status(409).json({ error: 'This booth has already been claimed by another user' });
    }
    if (booth.userId === req.user.id) {
      // Idempotent — already claimed by this same user
      return res.status(200).json(serializeBooth(booth));
    }

    // One User = one booth per hub (not across hubs — a User may operate booths in
    // multiple different hubs simultaneously, per ADR-016).
    const alreadyInHub = await prisma.vendorBooth.findFirst({
      where: { hubId: booth.hubId, userId: req.user.id, deletedAt: null, id: { not: booth.id } },
    });
    if (alreadyInHub) {
      return res.status(409).json({ error: 'You already operate a different booth in this hub' });
    }

    const claimed = await prisma.vendorBooth.update({
      where: { id: booth.id },
      data: { userId: req.user.id },
    });

    // Tell the hub organizer. This is the gap that stranded a real vendor: the claim
    // above sets ONLY userId, so the booth stays PENDING and addBoothCartItems still
    // refuses to sell from it (vendorBoothCartController.ts :396) until the organizer
    // confirms -- and until now nothing anywhere told the organizer to do that.
    // Fire-and-forget with a .catch, same shape as the invite trigger in
    // createVendorBooth above: the claim MUST succeed even with email completely down.
    notifyOrganizerBoothClaimed(claimed.id).catch(err =>
      console.warn('[booth-lifecycle] Claim notification failed for booth', claimed.id, err)
    );

    return res.status(200).json(serializeBooth(claimed));
  } catch (error) {
    console.error('[claimVendorBooth] Error:', error);
    return res.status(500).json({ error: 'Failed to claim vendor booth' });
  }
};

/**
 * GET /api/vendor-booth/my-booths
 * Authenticated User's own booths across ALL hubs. Explicit field selection —
 * NEVER an eager include that could pull sibling booths' data (ADR-017).
 *
 * Ownership: the ONLY filter is `userId: req.user.id`, taken from the verified session
 * and never from the request. There is no id/token/query parameter on this route at all
 * (routes/vendorBooth.ts :71 is `authenticate` + this handler, no params), so there is
 * nothing for a caller to tamper with — a user can only ever receive booths whose
 * VendorBooth.userId is their own User id. Unchanged by the additions below.
 *
 * ADDED 2026-07-28 (vendor re-entry): `boothToken` and `hub { id, name }`. Both are
 * additive — every field this endpoint returned before is still returned, unchanged and
 * in the same shape, so this stays backward compatible. Callers checked before changing
 * it (grep for 'my-booths' across packages/backend/src and packages/frontend): exactly
 * two — pages/vendor-booth/[boothToken].tsx:111, which reads only `.id`, `.boothNumber`
 * and `.vendorName`, and the new components/MyVendorBoothsCard.tsx.
 *
 * Why boothToken is safe HERE and not in getPublicBoothSummary: boothToken is a bearer
 * secret (requireBoothAuth.ts :57-79 accepts it as X-Booth-Token and grants cashier
 * rights), so ADR-017 keeps it out of the PUBLIC, unauthenticated summary. This response
 * is authenticated and filtered to the caller's own rows, and the caller already holds
 * this exact token — it is the link they claimed the booth from. Returning it to its
 * owner grants no access the owner did not already have. The frontend must keep it in
 * hrefs only and never render it as visible text.
 */
export const listMyVendorBooths = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const booths = await prisma.vendorBooth.findMany({
      // isHubOwnerBooth: false -- a hub owner's synthetic house booth (Fix 2, 2026-08-01)
      // must not show up in their OWN "my booths as a vendor elsewhere" list either.
      where: { userId: req.user.id, deletedAt: null, isHubOwnerBooth: false },
      select: {
        id: true, hubId: true, boothNumber: true, vendorName: true, status: true,
        boothFee: true, revenueSharePercent: true, stripeOnboarded: true,
        // Audit sweep fix (2026-09-10): squareOnboarded was missing from this select, so a
        // Square-ready booth's payout status always fell back to the stripeOnboarded=false
        // branch below and displayed "Payouts not set up yet" even after real Square
        // onboarding succeeded. Mirrors the same field already selected by listVendorBooths
        // above (organizer-facing list) -- this is the vendor-facing equivalent.
        squareOnboarded: true,
        // Deep link back to this booth's own page. Owner-scoped by the where clause above.
        boothToken: true,
        // The market's name plus its venue-details fields (2026-09-25,
        // vendor-booth-hub-autofill-adr) so the Create Sale wizard can auto-fill a booth
        // sale's address/lat/lng from the hub's own saved location, and show hoursText as a
        // hint. Still narrow — never the hub owner or its other booths.
        // organizer.hours added (2026-09-25, structured-hours-preference follow-up): the
        // mall's own structured Business Hours (OrganizerHours, per-day-of-week HH:MM) take
        // precedence over hoursText when unambiguous -- see resolveStructuredHours in
        // create-sale.tsx. Only dayOfWeek/openTime/closeTime are selected -- no organizerId,
        // no other organizer fields; still scoped to exactly what the wizard needs to read.
        hub: { select: { id: true, name: true, address: true, city: true, state: true, zip: true, lat: true, lng: true, hoursText: true, organizer: { select: { hours: { select: { dayOfWeek: true, openTime: true, closeTime: true } } } } } },
        payouts: { select: { id: true, totalSales: true, netPayout: true, status: true, paidAt: true } },
        // Register access grant (2026-07-29, Patrick's decision) -- gates the "Open the
        // register" link in MyVendorBoothsCard.tsx. A separate, organizer-controlled state
        // from claim/confirm; see VendorBooth.registerAccessGrantedAt in schema.prisma.
        registerAccessGrantedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(booths.map(serializeBooth));
  } catch (error) {
    console.error('[listMyVendorBooths] Error:', error);
    return res.status(500).json({ error: 'Failed to list your vendor booths' });
  }
};

/**
 * POST /api/vendor-booth/:vendorBoothId/stripe/onboard
 * Auth: booth owner only (req.user.id === VendorBooth.userId).
 */
export const startVendorBoothStripeOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;
    const { returnUrl, refreshUrl } = req.body;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    let accountId = booth.stripeAccountId;

    // ADR-021 (2026-07-08, Patrick-flagged real finding, not a hypothetical):
    // a booth must NEVER force a real business through Stripe onboarding a
    // second time when the claiming user already has a working Stripe Connect
    // account as an Organizer. Resolve-existing-first, create-new only as a
    // last resort. This check runs even if `accountId` is already set on the
    // booth, so a booth stuck pointing at an orphaned/never-onboarded account
    // (e.g. a stale test account) gets corrected the next time onboarding is
    // attempted, instead of forever re-onboarding the wrong account.
    if (!accountId) {
      const organizer = await prisma.organizer.findUnique({ where: { userId: booth.userId! } });
      if (organizer?.stripeConnectId) {
        // Read the REAL current state from Stripe -- never assume/default a
        // reused account's type or onboarded status.
        const liveStatus = await getAccountStatus(organizer.stripeConnectId);
        accountId = organizer.stripeConnectId;
        await prisma.vendorBooth.update({
          where: { id: booth.id },
          data: {
            stripeAccountId: accountId,
            stripeAccountType: liveStatus.accountType || 'express',
            stripeOnboarded: liveStatus.chargesEnabled && liveStatus.payoutsEnabled,
          },
        });
        // Reusing an already-working Connect account means this booth just became
        // payment-ready in one shot, with no return trip through Stripe's hosted flow --
        // so the organizer notification fires here too, not only in the status poll below.
        if (liveStatus.chargesEnabled && liveStatus.payoutsEnabled) {
          notifyOrganizerBoothStripeConnected(booth.id).catch(err =>
            console.warn('[booth-lifecycle] Stripe notification failed for booth', booth.id, err)
          );
        }

        // Already has a real, existing Stripe identity -- no onboarding
        // redirect needed. The frontend should show "linked to your existing
        // account" rather than sending them through Stripe's hosted flow again.
        return res.status(200).json({ linkedExistingAccount: true, chargesEnabled: liveStatus.chargesEnabled, payoutsEnabled: liveStatus.payoutsEnabled });
      }

      // No existing Organizer/Stripe identity found -- genuinely new vendor.
      // S-STRIPE-SQUARE-ONBOARDING-GUARD (2026-09-09): Stripe's platform account is
      // now PERMANENTLY closed. Previously (ADR-020/ADR-021), a genuinely new vendor
      // reaching this point got a brand-new Stripe Standard account created here --
      // that call now hard-fails 100% of the time. Per the Square changeover decision
      // (2026-09-09), no NEW Stripe identity may be created for a booth with no
      // existing one -- block and point the caller at the already-live Square
      // vendor-booth onboarding endpoint instead. The reuse-existing-identity branch
      // above (a claiming user who already has a working Stripe Connect account as an
      // Organizer) is untouched.
      return res.status(409).json({
        error: 'Stripe is no longer available for new vendor booth payment accounts. Please connect with Square instead.',
        code: 'STRIPE_CLOSED_USE_SQUARE',
        squareOnboardingUrl: `/api/vendor-booth/${vendorBoothId}/square/onboard`,
      });
    }

    const defaultReturn = `${process.env.FRONTEND_URL || 'https://finda.sale'}/vendor-booth/${booth.boothToken}?onboarding=complete`;
    const defaultRefresh = `${process.env.FRONTEND_URL || 'https://finda.sale'}/vendor-booth/${booth.boothToken}?onboarding=refresh`;
    const url = await createOnboardingLink(accountId, returnUrl || defaultReturn, refreshUrl || defaultRefresh);

    return res.status(200).json({ onboardingUrl: url });
  } catch (error) {
    console.error('[startVendorBoothStripeOnboarding] Error:', error);
    return res.status(500).json({ error: 'Failed to start Stripe onboarding' });
  }
};

/**
 * GET /api/vendor-booth/:vendorBoothId/stripe/status
 * Auth: booth owner only.
 */
export const getVendorBoothStripeStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    if (!booth.stripeAccountId) {
      return res.status(200).json({ stripeOnboarded: false, payoutsEnabled: false, status: 'NOT_STARTED' });
    }

    const status = await getAccountStatus(booth.stripeAccountId);
    if (status.chargesEnabled !== booth.stripeOnboarded) {
      await prisma.vendorBooth.update({ where: { id: booth.id }, data: { stripeOnboarded: status.chargesEnabled } });

      // Only on the false -> true edge. This endpoint is polled by the vendor booth page
      // on every load, and stripeOnboarded can flap both directions, so the transition
      // check here plus the stripeNotifiedAt stamp in the service are BOTH required to
      // keep this from turning into a repeating alert.
      if (status.chargesEnabled) {
        notifyOrganizerBoothStripeConnected(booth.id).catch(err =>
          console.warn('[booth-lifecycle] Stripe notification failed for booth', booth.id, err)
        );
      }
    }

    // `stripeOnboarded` stays charges_enabled ONLY, unchanged: it is the same value
    // persisted above and the same value the organizer's Vendor Booths table reads, so
    // its meaning must not shift here. `payoutsEnabled` is ADDITIVE (2026-07-29) --
    // getAccountStatus (stripeConnectService.ts :229) has always computed it and this
    // handler was discarding it, which made a half-onboarded account (charges on, payouts
    // still blocked) indistinguishable from a finished one. The vendor booth page needs
    // both to tell "you can be paid" from "you cannot be paid yet".
    return res.status(200).json({
      stripeOnboarded: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      status: status.status,
    });
  } catch (error) {
    console.error('[getVendorBoothStripeStatus] Error:', error);
    return res.status(500).json({ error: 'Failed to get Stripe status' });
  }
};

/**
 * GET /api/vendor-booth/:vendorBoothId/payouts
 * Booth owner only — real auth (req.user.id === VendorBooth.userId), NOT boothToken.
 */
export const getVendorBoothPayouts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({
      where: { id: vendorBoothId },
      select: {
        id: true, userId: true, boothFee: true, revenueSharePercent: true,
        // Same tier input the charge path uses (vendorBoothCartController.ts:561/795).
        hub: { select: { organizer: { select: { subscriptionTier: true } } } },
      },
    });
    if (!booth) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    const payouts = await prisma.vendorBoothPayout.findMany({
      where: { vendorBoothId },
      select: {
        id: true, totalSales: true, boothFeeCharged: true, revenueShareOwed: true,
        netPayout: true, status: true, method: true, paidAt: true, failureReason: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fee disclosure requirement: itemize the platform fee + THIS booth's boothFee +
    // THIS booth's revenueSharePercent — never a blended number, since one vendor can
    // have different terms at different malls. The platform fee is the hub owner's real
    // tier-based rate (getPlatformFeeRate), NOT a hardcoded number: every hub route is
    // requireTier('TEAMS') (routes/vendorBooth.ts), so in practice this is 8%, and it is
    // exactly what computeLegFeeSplit charges at capture time.
    //
    // Response shape note (2026-07-28, approved product decision): the vendor page
    // pages/vendor-booth/[boothToken].tsx renders `totalSales` (true gross for the
    // period) as its headline figure, NOT `netPayout`. netPayout is retained in this
    // payload for back-compat only: it is gross minus booth rent, which is neither what
    // the vendor received (rent is billed separately by vendorBoothFeeBillingCron.ts, and
    // the platform fee + revenue share were already taken at capture) nor what they owe.
    // See vendorBoothSettlementController.ts buildBoothSettlementLines for the full note.
    // Do not re-point the UI at netPayout.
    const feeRange = getInclusiveFeeRangePercent((booth.hub?.organizer?.subscriptionTier as any) ?? null);
    return res.status(200).json({
      boothFee: booth.boothFee.toString(),
      revenueSharePercent: booth.revenueSharePercent,
      // 2026-09-25 (Patrick correction): was a single hardcoded IN_PERSON-only number
      // (e.g. "6%") labeled as flat -- now the real min/max of the platform's fee schedule.
      // platformFeePercent (IN_PERSON, what this booth's register actually charges) is kept
      // for any caller still reading the old single-number shape.
      platformFeePercent: Math.round(
        getInclusivePlatformFeeRate((booth.hub?.organizer?.subscriptionTier as any) ?? null, 'IN_PERSON') * 100
      ),
      platformFeePercentMin: feeRange.min,
      platformFeePercentMax: feeRange.max,
      payouts: payouts.map((p) => ({
        ...p,
        totalSales: p.totalSales.toString(),
        boothFeeCharged: p.boothFeeCharged.toString(),
        revenueShareOwed: p.revenueShareOwed.toString(),
        netPayout: p.netPayout.toString(),
      })),
    });
  } catch (error) {
    console.error('[getVendorBoothPayouts] Error:', error);
    return res.status(500).json({ error: 'Failed to get vendor booth payouts' });
  }
};

/**
 * POST /api/vendor-booth/:vendorBoothId/fee-billing/setup-intent
 * GONE (2026-09-14, booth-rent-autopay-square-design-2026-09-13.md §6.1) -- superseded by
 * the single-step POST .../fee-billing/square-setup below. Stripe's platform account is
 * permanently closed (2026-09-12) and this two-step SetupIntent/confirm pair has no Square
 * equivalent (Square's Web Payments SDK produces a sourceId directly, client-side, with no
 * server-issued secret to round-trip -- see square-setup's own doc comment). Kept registered
 * and returning 410 Gone rather than deleted, in case any stale client still calls it
 * (matches this codebase's general non-destructive-gate convention, e.g. the old booth-cart
 * Stripe routes).
 */
export const startVendorBoothFeeBillingSetup = async (req: AuthRequest, res: Response) => {
  return res.status(410).json({
    error:
      "This endpoint has been replaced. Use POST /vendor-booth/:vendorBoothId/fee-billing/square-setup instead.",
    code: 'BOOTH_BILLING_SETUP_INTENT_GONE',
  });
};

/**
 * POST /api/vendor-booth/:vendorBoothId/fee-billing/confirm
 * GONE (2026-09-14) -- same supersession as startVendorBoothFeeBillingSetup above. Square's
 * single-step square-setup endpoint has no separate confirm step to round-trip.
 */
export const confirmVendorBoothFeeBillingSetup = async (req: AuthRequest, res: Response) => {
  return res.status(410).json({
    error:
      "This endpoint has been replaced. Use POST /vendor-booth/:vendorBoothId/fee-billing/square-setup instead.",
    code: 'BOOTH_BILLING_CONFIRM_GONE',
  });
};

/**
 * POST /api/vendor-booth/:vendorBoothId/fee-billing/square-setup
 * Booth owner only. Body: { sourceId }. Square path (2026-09-14 design) replacing the dead
 * Stripe SetupIntent/confirm pair above with ONE step -- Square's Web Payments SDK produces
 * a sourceId directly, client-side, with no server-issued secret to round-trip (see
 * SquarePaymentRequestForm.tsx's header comment for the same contrast on the checkout side).
 * Creates a Customer + Card in FindA.Sale's OWN platform Square account
 * (createSquareSharedCardForBoothFee, squareVendorBoothCartService.ts) from that sourceId
 * and persists the resulting pair on the booth -- see schema.prisma's VendorBooth comment
 * and vendorBoothFeeBillingCron.ts, which charges against exactly these two fields.
 *
 * Gated on the HUB OWNER's Square readiness first -- never let a vendor set up a card that
 * can never be charged (mirrors ADR-123 §3.2's checkout-time gate philosophy). The card
 * itself lives in FindA.Sale's platform account regardless of the hub owner's own state, but
 * there is no point saving one for a hub that can never receive the money.
 */
export const squareSetupVendorBoothFeeBilling = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;
    const { sourceId } = req.body as { sourceId?: string };
    if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });

    const booth = await prisma.vendorBooth.findUnique({
      where: { id: vendorBoothId },
      include: { hub: { include: { organizer: true } } },
    });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    const hubOwnerOrganizer = booth.hub.organizer;
    if (!hubOwnerOrganizer.squareOnboarded || !hubOwnerOrganizer.squareLocationId) {
      return res.status(400).json({
        error:
          "Your hub organizer hasn't finished connecting Square yet, so booth rent can't be auto-charged. Ask them to finish connecting Square, then try again.",
        code: 'HUB_OWNER_SQUARE_NOT_READY',
      });
    }

    const { platformCustomerId, sharedCardId } = await createSquareSharedCardForBoothFee({
      vendorBoothId: booth.id,
      sourceId,
    });

    await prisma.vendorBooth.update({
      where: { id: booth.id },
      data: {
        vendorSquarePlatformCustomerId: platformCustomerId,
        vendorSquareCardId: sharedCardId,
        vendorSquareBillingCancelledAt: null,
      },
    });

    return res.status(200).json({ configured: true });
  } catch (error) {
    console.error('[squareSetupVendorBoothFeeBilling] Error:', error);
    return res.status(500).json({ error: 'Failed to set up booth fee auto-pay' });
  }
};

/**
 * POST /api/vendor-booth/:vendorBoothId/fee-billing/cancel
 * Booth owner only (§6.1/§8.2). Nulls the vendor's Square shared-card-on-file fields and
 * stamps vendorSquareBillingCancelledAt for support/audit purposes -- does NOT delete the
 * Square-side Customer/Card objects (no live API benefit, and Square's docs don't require
 * cleanup). The booth reverts to PENDING_PAYMENT_METHOD on the next billing cycle, same
 * honest, no-silent-charge-attempt behavior as a booth that never set up auto-pay at all.
 * Notifies the hub owner (only when a card was actually on file -- calling cancel on an
 * already-unconfigured booth is a harmless no-op, not a repeat notification) so they know
 * to expect a manual payment.
 */
export const cancelVendorBoothFeeBillingSetup = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    const wasConfigured = !!booth.vendorSquareCardId;

    await prisma.vendorBooth.update({
      where: { id: booth.id },
      data: {
        vendorSquarePlatformCustomerId: null,
        vendorSquareCardId: null,
        vendorSquareBillingCancelledAt: new Date(),
      },
    });

    if (wasConfigured) {
      notifyOrganizerBoothAutopayCancelled(booth.id).catch(err =>
        console.warn('[cancelVendorBoothFeeBillingSetup] Cancellation notification failed for booth', booth.id, err)
      );
    }

    return res.status(200).json({ configured: false });
  } catch (error) {
    console.error('[cancelVendorBoothFeeBillingSetup] Error:', error);
    return res.status(500).json({ error: 'Failed to cancel booth fee auto-pay' });
  }
};

/**
 * GET /api/vendor-booth/:vendorBoothId/fee-billing/status
 * Booth owner only. Whether a Square shared card is on file for recurring booth-fee
 * billing (Square path, 2026-09-14 design -- swaps the dead Stripe paymentMethods.retrieve
 * call for a Square cards.get). Card display details are best-effort -- a Square retrieve
 * failure here degrades to configured:true with no card details rather than erroring the
 * page, same non-fatal-degrade pattern the Stripe version used.
 *
 * Also reports the hub owner's Square readiness (squareReady/squareLocationId) so the
 * frontend can decide whether to render the square-setup card-entry form at all, or an
 * honest "your hub organizer hasn't finished connecting Square yet" message instead --
 * needed because, unlike Stripe's clientSecret round-trip, initializing Square's Web
 * Payments SDK client-side requires a locationId BEFORE the vendor can tokenize a card,
 * and this status call is already fetched on every page load.
 */
export const getVendorBoothFeeBillingStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({
      where: { id: vendorBoothId },
      include: { hub: { include: { organizer: true } } },
    });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    const hubOwnerOrganizer = booth.hub.organizer;
    const squareReady = !!(hubOwnerOrganizer.squareOnboarded && hubOwnerOrganizer.squareLocationId);
    const squareLocationId = squareReady ? hubOwnerOrganizer.squareLocationId : null;

    if (!booth.vendorSquareCardId) {
      return res.status(200).json({ configured: false, squareReady, squareLocationId });
    }

    try {
      const cardResponse = await getSquarePlatformClient().cards.get({ cardId: booth.vendorSquareCardId });
      const card = (cardResponse as any)?.card;
      return res.status(200).json({
        configured: true,
        brand: card?.cardBrand,
        last4: card?.last4,
        squareReady,
        squareLocationId,
      });
    } catch (retrieveErr) {
      console.warn('[getVendorBoothFeeBillingStatus] Could not retrieve card details (non-fatal):', retrieveErr);
      return res.status(200).json({ configured: true, squareReady, squareLocationId });
    }
  } catch (error) {
    console.error('[getVendorBoothFeeBillingStatus] Error:', error);
    return res.status(500).json({ error: 'Failed to get booth fee billing status' });
  }
};

/**
 * GET /api/vendor-booth/:vendorBoothId/fee-charges
 * Booth owner only. Booth-fee (rent) billing history from vendorBoothFeeBillingCron.ts
 * -- distinct from GET /payouts above (VendorBoothPayout is the largely-vestigial
 * vendor-receives-money model post-ADR-090 Phase 3 rescoping; VendorBoothFeeCharge is
 * the real vendor-owes-money booth-rent history -- see schema.prisma's model comment).
 */
export const getVendorBoothFeeCharges = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId }, select: { id: true, userId: true } });
    if (!booth) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    const charges = await prisma.vendorBoothFeeCharge.findMany({
      where: { vendorBoothId },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        amountCents: true,
        status: true,
        failureReason: true,
        createdAt: true,
      },
      orderBy: { periodStart: 'desc' },
    });

    return res.status(200).json({ charges });
  } catch (error) {
    console.error('[getVendorBoothFeeCharges] Error:', error);
    return res.status(500).json({ error: 'Failed to get booth fee charges' });
  }
};

/**
 * GET /api/organizer/hubs/:hubId/vendor-booths/fee-charges
 * Hub owner only. Booth-fee (rent) billing history across every booth in this hub --
 * lets a hub owner (e.g. Maple Lake Mall) see whether a vendor's (e.g. artifactmi's)
 * rent actually got collected, distinct from the mostly-vestigial settlement/payout
 * system (ADR-090 Phase 3 rescoping -- see vendorBoothSettlementController.ts module
 * header). Registered BEFORE the GET .../vendor-booths/:boothId route in routes/
 * vendorBooth.ts -- same route-shape collision class as the my-booths/:boothToken
 * lesson documented at the top of that file (S1091): "fee-charges" is the same
 * segment shape as ":boothId" and would otherwise be swallowed by getVendorBooth.
 */
export const listHubVendorBoothFeeCharges = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer } = result;

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const charges = await prisma.vendorBoothFeeCharge.findMany({
      where: { hubId },
      include: { vendorBooth: { select: { boothNumber: true, vendorName: true } } },
      orderBy: { periodStart: 'desc' },
    });

    return res.status(200).json({
      charges: charges.map((c) => ({
        id: c.id,
        boothNumber: c.vendorBooth.boothNumber,
        vendorName: c.vendorBooth.vendorName,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        amountCents: c.amountCents,
        status: c.status,
        failureReason: c.failureReason,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('[listHubVendorBoothFeeCharges] Error:', error);
    return res.status(500).json({ error: 'Failed to list hub booth fee charges' });
  }
};


/**
 * POST /api/vendor-booth/:vendorBoothId/square/onboard
 * Auth: booth owner only (req.user.id === VendorBooth.userId).
 *
 * Square-side design for the SAME reuse-resolution problem startVendorBoothStripeOnboarding
 * solves above (ADR-021): never force a real business through onboarding a second time if
 * the claiming user already has a working identity as an Organizer. NOT a silent port of
 * the Stripe logic -- Square's OAuth model has no live cross-account status check available
 * without that Organizer's own persisted access token (see squareConnectService.ts's
 * schema-gap note), so this can only trust the last-known CACHED squareOnboarded flag, not
 * a live re-verify the way the Stripe version does via getAccountStatus(). Also, unlike
 * Stripe, nothing is "created" server-side here before redirecting -- Square's authorize URL
 * IS the entire "create or link an account" step; the booth's squareAccountId is set later,
 * in squareConnectController.ts's shared OAuth callback, once the merchant actually
 * completes consent on Square's side.
 */
export const startVendorBoothSquareOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    if (booth.squareAccountId && booth.squareOnboarded) {
      return res.status(200).json({ alreadyOnboarded: true, squareAccountId: booth.squareAccountId });
    }

    // Reuse-resolution: does the claiming user already have a working Square identity as an
    // Organizer? If so, copy it over directly -- no second OAuth grant needed. Cached-only,
    // see the function-level comment above for why.
    if (!booth.squareAccountId) {
      const existing = await resolveExistingSquareIdentityForUser(booth.userId!);
      if (existing?.squareOnboarded) {
        await prisma.vendorBooth.update({
          where: { id: booth.id },
          data: { squareAccountId: existing.squareMerchantId, squareOnboarded: true },
        });
        // Reusing an already-working Square identity means this booth just became
        // payment-ready in one shot, with no return trip through Square's hosted OAuth
        // flow -- mirrors startVendorBoothStripeOnboarding's identical reuse-branch
        // notification above (:786). booth.squareOnboarded was falsy on the way in
        // (the outer `if (!booth.squareAccountId)` guard above already establishes this
        // branch is reached only when the booth was not already Square-onboarded), so
        // this is always a genuine false->true transition, not a repeat.
        notifyOrganizerBoothSquareConnected(booth.id).catch(err =>
          console.warn('[booth-lifecycle] Square notification failed for booth', booth.id, err)
        );
        return res.status(200).json({ linkedExistingAccount: true, squareOnboarded: true });
      }
    }

    const { url } = buildSquareAuthorizeUrl('VENDOR_BOOTH', booth.id, req.user.id);
    return res.status(200).json({ onboardingUrl: url, alreadyOnboarded: false });
  } catch (error) {
    console.error('[startVendorBoothSquareOnboarding] Error:', error);
    return res.status(500).json({ error: 'Failed to start Square onboarding' });
  }
};

/**
 * GET /api/vendor-booth/:vendorBoothId/square/status
 * Auth: booth owner only. Cached-read only (no live Square API call) -- see
 * startVendorBoothSquareOnboarding's comment on why this dispatch cannot live-verify
 * against Square the way getVendorBoothStripeStatus does against Stripe.
 */
export const getVendorBoothSquareStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    return res.status(200).json({
      squareAccountId: booth.squareAccountId,
      squareOnboarded: booth.squareOnboarded,
      payoutsFlaggedForReview: booth.payoutsFlaggedForReview,
    });
  } catch (error) {
    console.error('[getVendorBoothSquareStatus] Error:', error);
    return res.status(500).json({ error: 'Failed to get booth Square status' });
  }
};
