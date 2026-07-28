import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { createConnectAccount, createOnboardingLink, getAccountStatus } from '../services/stripeConnectService';
import { getStripe } from '../utils/stripe';
// Single source of truth for the platform's cut. The vendor-facing fee disclosure
// below MUST derive from this, using the same hub-owner tier the money path
// (vendorBoothCartController.ts computeLegFeeSplit) feeds it -- a hardcoded
// display percentage drifts from what Stripe actually takes.
import { getPlatformFeeRate } from '../utils/feeCalculator';
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
} from '../services/vendorBoothLifecycleNotificationService';
import type { BoothNotifyResult } from '../services/vendorBoothLifecycleNotificationService';

const stripe = () => getStripe();

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
      where: { hubId, deletedAt: null },
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
      where: { id: boothId, hubId, deletedAt: null },
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
 * Body: { kind: 'claim' | 'confirm' | 'decision' | 'stripe' }
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

    const validKinds = ['claim', 'confirm', 'decision', 'stripe'];
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
    } else {
      sendResult = await notifyOrganizerBoothStripeConnected(boothId);
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
        decisionNotifiedAt: true, stripeNotifiedAt: true,
      },
    });

    return res.status(200).json({
      sent: true,
      kind,
      claimNotifiedAt: refreshed?.claimNotifiedAt ?? null,
      confirmNotifiedAt: refreshed?.confirmNotifiedAt ?? null,
      decisionNotifiedAt: refreshed?.decisionNotifiedAt ?? null,
      stripeNotifiedAt: refreshed?.stripeNotifiedAt ?? null,
    });
  } catch (error) {
    console.error('[resendVendorBoothNotification] Error:', error);
    return res.status(500).json({ error: 'Failed to send the notification' });
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
      where: { userId: req.user.id, deletedAt: null },
      select: {
        id: true, hubId: true, boothNumber: true, vendorName: true, status: true,
        boothFee: true, revenueSharePercent: true, stripeOnboarded: true,
        // Deep link back to this booth's own page. Owner-scoped by the where clause above.
        boothToken: true,
        // The market's name. Without it the vendor sees a bare hub id, which means nothing
        // to them. Narrow select — id and name only, never the hub owner or its other booths.
        hub: { select: { id: true, name: true } },
        payouts: { select: { id: true, totalSales: true, netPayout: true, status: true, paidAt: true } },
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
      // ADR-020 (2026-07-07, Patrick-approved): new-from-scratch onboarding
      // creates a Standard account -- each such booth becomes its own
      // Direct-charge merchant of record (Stripe files that booth's own
      // 1099-K, not FindA.Sale). This benefit is scoped to genuinely new
      // vendors only (ADR-021) -- it does not apply when an existing account
      // was reused above, since Stripe does not support converting an
      // existing account's type.
      accountId = await createConnectAccount(
        {
          id: booth.id,
          email: booth.vendorEmail || req.user.email,
          name: booth.vendorName,
          workspaceId: booth.hubId,
        },
        'standard'
      );
      // createConnectAccount is typed for Consignor's update call internally in the
      // original implementation's own persistence — VendorBooth needs its own write here
      // since createConnectAccount only persists to the Consignor table today.
      await prisma.vendorBooth.update({
        where: { id: booth.id },
        data: { stripeAccountId: accountId, stripeAccountType: 'standard' },
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
      return res.status(200).json({ stripeOnboarded: false, status: 'NOT_STARTED' });
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

    return res.status(200).json({ stripeOnboarded: status.chargesEnabled, status: status.status });
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
    return res.status(200).json({
      boothFee: booth.boothFee.toString(),
      revenueSharePercent: booth.revenueSharePercent,
      platformFeePercent: Math.round(
        getPlatformFeeRate((booth.hub?.organizer?.subscriptionTier as any) ?? null) * 100
      ),
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
 * Booth owner only. Creates (or reuses) a platform-account Stripe Customer for this
 * booth and returns a SetupIntent clientSecret so the vendor can save a card for
 * recurring booth-fee billing (ADR-090 Phase 4). This Customer/PaymentMethod pair is
 * intentionally on the PLATFORM's own Stripe account, not the booth's own Connect
 * account (stripeAccountId) -- see schema.prisma's VendorBooth comment and
 * vendorBoothFeeBillingCron.ts, which charges off-session against exactly these two
 * fields. Mirrors createBoothCartQrSetupIntent's platform-Customer pattern
 * (vendorBoothCartController.ts).
 */
export const startVendorBoothFeeBillingSetup = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    let customerId = booth.vendorStripeCustomerId;
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: booth.vendorEmail || req.user.email,
        name: booth.vendorName,
        metadata: { source: 'vendor_booth_fee_billing', vendorBoothId: booth.id, hubId: booth.hubId },
      });
      customerId = customer.id;
      await prisma.vendorBooth.update({ where: { id: booth.id }, data: { vendorStripeCustomerId: customerId } });
    }

    const setupIntent = await stripe().setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { source: 'vendor_booth_fee_billing', vendorBoothId: booth.id, hubId: booth.hubId },
    });

    return res.status(200).json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    console.error('[startVendorBoothFeeBillingSetup] Error:', error);
    return res.status(500).json({ error: 'Failed to start booth fee billing setup' });
  }
};

/**
 * POST /api/vendor-booth/:vendorBoothId/fee-billing/confirm
 * Booth owner only. Body: { setupIntentId }. Never trusts a client-supplied
 * payment_method id directly -- always re-reads the SetupIntent from Stripe and
 * confirms it actually succeeded and belongs to this booth's own Customer before
 * persisting anything.
 */
export const confirmVendorBoothFeeBillingSetup = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;
    const { setupIntentId } = req.body as { setupIntentId?: string };
    if (!setupIntentId) return res.status(400).json({ error: 'setupIntentId is required' });

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    const setupIntent = await stripe().setupIntents.retrieve(setupIntentId);
    if (setupIntent.status !== 'succeeded') {
      return res.status(400).json({ error: `Card setup not complete (status: ${setupIntent.status})` });
    }
    if (setupIntent.customer !== booth.vendorStripeCustomerId) {
      return res.status(403).json({ error: 'SetupIntent does not belong to this booth' });
    }

    const paymentMethodId =
      typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method?.id;
    if (!paymentMethodId) {
      return res.status(400).json({ error: 'No payment method attached to this SetupIntent' });
    }

    await prisma.vendorBooth.update({ where: { id: booth.id }, data: { vendorPaymentMethodId: paymentMethodId } });

    return res.status(200).json({ configured: true });
  } catch (error) {
    console.error('[confirmVendorBoothFeeBillingSetup] Error:', error);
    return res.status(500).json({ error: 'Failed to confirm booth fee billing setup' });
  }
};

/**
 * GET /api/vendor-booth/:vendorBoothId/fee-billing/status
 * Booth owner only. Whether a payment method is on file for recurring booth-fee
 * billing. Card display details are best-effort -- a Stripe retrieve failure here
 * degrades to configured:true with no card details rather than erroring the page.
 */
export const getVendorBoothFeeBillingStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { vendorBoothId } = req.params;

    const booth = await prisma.vendorBooth.findUnique({ where: { id: vendorBoothId } });
    if (!booth || booth.deletedAt) return res.status(404).json({ error: 'Booth not found' });
    if (booth.userId !== req.user.id) return res.status(403).json({ error: 'You do not operate this booth' });

    if (!booth.vendorPaymentMethodId) {
      return res.status(200).json({ configured: false });
    }

    try {
      const pm = await stripe().paymentMethods.retrieve(booth.vendorPaymentMethodId);
      return res.status(200).json({ configured: true, brand: pm.card?.brand, last4: pm.card?.last4 });
    } catch (retrieveErr) {
      console.warn('[getVendorBoothFeeBillingStatus] Could not retrieve card details (non-fatal):', retrieveErr);
      return res.status(200).json({ configured: true });
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
