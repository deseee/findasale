import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { createConnectAccount, createOnboardingLink, getAccountStatus } from '../services/stripeConnectService';
import { getStripe } from '../utils/stripe';

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
    return res.status(204).send();
  } catch (error) {
    console.error('[deleteVendorBooth] Error:', error);
    return res.status(500).json({ error: 'Failed to delete vendor booth' });
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
 */
export const listMyVendorBooths = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const booths = await prisma.vendorBooth.findMany({
      where: { userId: req.user.id, deletedAt: null },
      select: {
        id: true, hubId: true, boothNumber: true, vendorName: true, status: true,
        boothFee: true, revenueSharePercent: true, stripeOnboarded: true,
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
      select: { id: true, userId: true, boothFee: true, revenueSharePercent: true },
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

    // Fee disclosure requirement: itemize per-booth flat 10% platform fee + THIS
    // booth's boothFee + THIS booth's revenueSharePercent — never a blended number,
    // since one vendor can have different terms at different malls.
    return res.status(200).json({
      boothFee: booth.boothFee.toString(),
      revenueSharePercent: booth.revenueSharePercent,
      platformFeePercent: 10, // locked flat 10% platform fee — never a different rate
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
