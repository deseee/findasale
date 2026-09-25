import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getInclusivePlatformFeeRate, getInclusiveFeeRangePercent } from '../utils/feeCalculator'; // inclusive-fee migration (2026-09-24, Patrick ruling); getInclusiveFeeRangePercent added 2026-09-25 (Patrick correction) -- this settlement preview is currently unread by any frontend page (grepped, confirmed), but keep it consistent with getVendorBoothPayouts's now-corrected shape rather than leaving a second stale single-number version to rot

/**
 * Vendor Booth Payments — Settlement Batches (2026-07-07, re-scoped 2026-07-20 ADR-090 Phase 3)
 *
 * ADR-090 Phase 3 rescoping: post-ADR-020 (Direct-charge-per-leg checkout), a vendor's
 * sale proceeds already land on their OWN connected account at capture time, minus
 * application_fee_amount (platform cut + hub-owner revenue-share cut, ADR-090 Phase 2).
 * The vendor is never "owed" a Transfer from the platform for their sales -- they already
 * have the money. That makes the ORIGINAL purpose of this settlement-batch system (compute
 * and Transfer the vendor's net proceeds) vestigial for the sales/revenue-share portion.
 * This module is therefore re-scoped to a READ-ONLY reconciliation report: it still shows
 * gross sales and the flat boothFee per booth, but revenueShareOwed is always 0 (that's
 * now handled entirely by Phase 2's real-time split, never by this settlement path) and
 * "approving" a batch no longer fires any Stripe Transfer -- there is nothing left to pay
 * the vendor via this mechanism, and paying them again here would be a double-pay. Actual
 * flat booth-fee COLLECTION (charging the vendor, Transferring to the hub owner) is Phase
 * 4's job, via the separate VendorBoothFeeCharge periodic-billing cron -- NOT this batch.
 *
 * payVendorBoothViaTransfer (stripeConnectService.ts) has been retired for the same reason
 * -- see that file's removal comment. Retained here for reference: it doesn't apply once
 * vendors are paid directly at capture time.
 */
const vendorLiveTransfersEnabled = (): boolean =>
  process.env.VENDOR_BOOTH_LIVE_TRANSFERS === 'true';

function serializeBatch(batch: any) {
  return {
    ...batch,
    totalGross: batch.totalGross?.toString?.() ?? batch.totalGross,
    totalPayouts: batch.totalPayouts?.toString?.() ?? batch.totalPayouts,
    payouts: (batch.payouts || []).map((p: any) => ({
      ...p,
      totalSales: p.totalSales?.toString?.() ?? p.totalSales,
      boothFeeCharged: p.boothFeeCharged?.toString?.() ?? p.boothFeeCharged,
      revenueShareOwed: p.revenueShareOwed?.toString?.() ?? p.revenueShareOwed,
      netPayout: p.netPayout?.toString?.() ?? p.netPayout,
    })),
  };
}

/**
 * Internal: group SOLD items for a hub by vendor booth and compute a RECONCILIATION
 * report (ADR-090 Phase 3 -- this no longer drives any money movement, see module
 * header). netPayout = totalSales - boothFeeCharged only. revenueShareOwed is ALWAYS
 * 0 here -- the hub owner's revenue-share cut is taken in real time at charge time
 * (ADR-090 Phase 2, application_fee_amount) and Transferred immediately, never
 * deducted again in this settlement pass. The field is kept (rather than removed)
 * for API/response-shape backward compatibility.
 *
 * CORRECTION (verified this pass, supersedes the prior wording): the back-compat
 * rationale used to cite "the existing frontend settlement preview table." No such
 * consumer exists -- grepping all of packages/ for `settlement/preview` and
 * `settlement/batches` outside src/routes and src/controllers returns zero hits. These
 * endpoints have NO frontend caller today.
 *
 * KNOWN DEFECT, deliberately STILL NOT changed here: `netPayout` below is neither what
 * the vendor received nor what they owe. It subtracts boothFee, which is MONTHLY RENT
 * billed separately by vendorBoothFeeBillingCron.ts (Phase 4), and it does NOT subtract
 * the platform fee or the revenue share that were already taken at capture
 * (vendorBoothCartController.ts computeLegFeeSplit). For a $1,000 booth with $200/mo rent
 * and a 20% revenue share, this reports net $800.00 while the vendor actually received
 * $720 and separately owes $200. These values are PERSISTED onto VendorBoothPayout by
 * createVendorBoothSettlementBatch below. Changing the formula would rewrite stored rows
 * and contradict schema.prisma:5736's documented definition of
 * VendorBoothPayout.netPayout, so the formula stays exactly as-is.
 *
 * RESOLVED at the DISPLAY layer instead (approved product decision, 2026-07-28): the
 * vendor-facing page pages/vendor-booth/[boothToken].tsx no longer renders netPayout. Its
 * "Sales History" section now renders VendorBoothPayout.totalSales, i.e. `gross` below,
 * which is true on its own, alongside the platform-fee and revenue-share percentages so a
 * vendor can follow the arithmetic. netPayout is still computed, still persisted, and
 * still returned by getVendorBoothPayouts for back-compat. Do NOT "fix" the formula here
 * without a fresh decision.
 */
async function buildBoothSettlementLines(hubId: string, includeHouseBooth: boolean = false) {
  const booths = await prisma.vendorBooth.findMany({
    where: {
      hubId,
      deletedAt: null,
      items: { some: { status: 'SOLD' } },
      // Fix 2 (2026-08-01): excluded by default -- the hub owner's own house-booth
      // sales are not a real vendor settlement the way every other booth's are (there
      // is no one else to settle with). Overridable via ?includeHouseBooth=true; Patrick
      // hasn't confirmed this is what he wants long-term, but it doesn't block shipping.
      ...(includeHouseBooth ? {} : { isHubOwnerBooth: false }),
    },
    include: {
      items: { where: { status: 'SOLD' }, select: { id: true, price: true } },
    },
  });

  let totalGross = new Decimal(0);
  let totalNet = new Decimal(0);

  const rows = booths.map((b) => {
    const gross = b.items.reduce((sum, item) => sum.plus(new Decimal(item.price || 0)), new Decimal(0));
    // ADR-090 Phase 3: no longer deducted here -- see function comment.
    const revenueShareOwed = new Decimal(0);
    const boothFeeCharged = new Decimal(b.boothFee);
    const netPayout = gross.minus(boothFeeCharged);
    totalGross = totalGross.plus(gross);
    totalNet = totalNet.plus(netPayout);
    return {
      vendorBoothId: b.id,
      boothNumber: b.boothNumber,
      vendorName: b.vendorName,
      boothFee: boothFeeCharged,
      revenueSharePercent: b.revenueSharePercent,
      stripeOnboarded: b.stripeOnboarded,
      stripeAccountId: b.stripeAccountId,
      itemCount: b.items.length,
      gross,
      boothFeeCharged,
      revenueShareOwed,
      netPayout,
    };
  });

  return { rows, totalGross, totalNet };
}

/**
 * GET /api/organizer/hubs/:hubId/settlement/preview
 * Non-persisted preview: per-booth gross / fee / revenue-share / net split table.
 */
export const previewVendorBoothSettlement = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' });
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const includeHouseBooth = req.query.includeHouseBooth === 'true';
    const lines = await buildBoothSettlementLines(hubId, includeHouseBooth);

    const existingBatch = await prisma.vendorBoothSettlementBatch.findFirst({
      where: { hubId, status: { notIn: ['FAILED'] } },
      select: { id: true, status: true },
    });

    // ADR-090 Phase 3: platformFeePercent is now the organizer's REAL tier-based rate
    // (getPlatformFeeRate) instead of a hardcoded "always 10%" display value -- that was
    // already wrong for TEAMS-tier hubs (8%, per feeCalculator.ts) before this pass, since
    // this settlement UI already required TEAMS. revenueShareOwed is always 0 now (Phase
    // 2 takes it in real time) -- see buildBoothSettlementLines. payoutMethod is
    // informational only: no Stripe Transfer is ever fired from this endpoint anymore
    // (vendors already received their net proceeds directly at capture time).
    const feeRange = getInclusiveFeeRangePercent(organizer.subscriptionTier as any);
    return res.status(200).json({
      hubId,
      liveTransfersEnabled: vendorLiveTransfersEnabled(),
      existingBatch,
      totalGross: lines.totalGross.toFixed(2),
      totalPayouts: lines.totalNet.toFixed(2),
      booths: lines.rows.map((r) => ({
        vendorBoothId: r.vendorBoothId,
        boothNumber: r.boothNumber,
        vendorName: r.vendorName,
        itemCount: r.itemCount,
        gross: r.gross.toFixed(2),
        // 2026-09-25 (Patrick correction): kept for back-compat (IN_PERSON, what booth-cart
        // legs actually charge), plus the honest min/max range alongside it -- see
        // getVendorBoothPayouts in vendorBoothController.ts for the identical fix.
        platformFeePercent: Math.round(getInclusivePlatformFeeRate(organizer.subscriptionTier as any, 'IN_PERSON') * 100),
        platformFeePercentMin: feeRange.min,
        platformFeePercentMax: feeRange.max,
        boothFee: r.boothFeeCharged.toFixed(2),
        revenueSharePercent: r.revenueSharePercent,
        revenueShareOwed: r.revenueShareOwed.toFixed(2),
        net: r.netPayout.toFixed(2),
        stripeOnboarded: r.stripeOnboarded,
        payoutMethod: 'INFORMATIONAL_NO_TRANSFER',
      })),
    });
  } catch (error) {
    console.error('[previewVendorBoothSettlement] Error:', error);
    return res.status(500).json({ error: 'Failed to build settlement preview' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/settlement/batches
 * Create a DRAFT batch with one VendorBoothPayout per booth that has SOLD items.
 * No money moves. Refuses to create a second open (non-FAILED) batch for the same hub.
 */
export const createVendorBoothSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' });
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const hub = await prisma.saleHub.findFirst({ where: { id: hubId, organizerId: organizer.id } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const existing = await prisma.vendorBoothSettlementBatch.findFirst({
      where: { hubId, status: { notIn: ['FAILED'] } },
    });
    if (existing) {
      return res.status(409).json({ error: 'A settlement batch already exists for this hub', batchId: existing.id });
    }

    const includeHouseBooth = req.query.includeHouseBooth === 'true';
    const lines = await buildBoothSettlementLines(hubId, includeHouseBooth);
    if (lines.rows.length === 0) {
      return res.status(400).json({ error: 'No SOLD vendor booth items found for this hub' });
    }

    const batch = await prisma.vendorBoothSettlementBatch.create({
      data: {
        hubId,
        status: 'DRAFT',
        totalGross: lines.totalGross,
        totalPayouts: lines.totalNet,
        payouts: {
          create: lines.rows.map((r) => ({
            vendorBoothId: r.vendorBoothId,
            totalSales: r.gross,
            boothFeeCharged: r.boothFeeCharged,
            revenueShareOwed: r.revenueShareOwed,
            netPayout: r.netPayout,
            method: r.stripeOnboarded ? 'STRIPE_TRANSFER' : null,
            status: r.stripeOnboarded ? 'PENDING' : 'PENDING_STRIPE_ONBOARDING',
          })),
        },
      },
      include: { payouts: true },
    });

    return res.status(201).json(serializeBatch(batch));
  } catch (error) {
    console.error('[createVendorBoothSettlementBatch] Error:', error);
    return res.status(500).json({ error: 'Failed to create settlement batch' });
  }
};

/**
 * GET /api/organizer/hubs/:hubId/settlement/batches/:batchId
 */
export const getVendorBoothSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, batchId } = req.params;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' });

    // ADR-017 corrected ownership join: batch.hub.organizerId === requester's organizer.id,
    // not merely a role check.
    const batch = await prisma.vendorBoothSettlementBatch.findUnique({
      where: { id: batchId },
      include: {
        hub: { select: { organizerId: true } },
        payouts: {
          include: { vendorBooth: { select: { boothNumber: true, vendorName: true, stripeOnboarded: true } } },
        },
      },
    });

    if (!batch || batch.hubId !== hubId || batch.hub.organizerId !== organizer.id) {
      return res.status(404).json({ error: 'Settlement batch not found' });
    }

    return res.status(200).json(serializeBatch(batch));
  } catch (error) {
    console.error('[getVendorBoothSettlementBatch] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch settlement batch' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/settlement/batches/:batchId/approve
 * Transition DRAFT|PARTIAL|PROCESSING -> APPROVED and close out per-booth payout rows.
 *
 * ADR-090 Phase 3: no Stripe Transfer is ever fired here anymore (VENDOR_BOOTH_LIVE_TRANSFERS
 * no longer gates any money movement in this function — see module header comment for the
 * full rationale). Every payout resolves to COMPLETED / NO_TRANSFER_NEEDED.
 */
export const approveVendorBoothSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, batchId } = req.params;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' });
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const batch = await prisma.vendorBoothSettlementBatch.findUnique({
      where: { id: batchId },
      include: {
        hub: { select: { organizerId: true, organizer: { select: { stripeConnectId: true } } } },
        payouts: { include: { vendorBooth: true } },
      },
    });

    // Explicit ownership join — not merely a role check (ADR-017).
    if (!batch || batch.hubId !== hubId || batch.hub.organizerId !== organizer.id) {
      return res.status(404).json({ error: 'Settlement batch not found' });
    }
    if (!['DRAFT', 'APPROVED', 'PARTIAL', 'PROCESSING'].includes(batch.status)) {
      return res.status(409).json({ error: `Batch in status ${batch.status} cannot be approved` });
    }

    // ADR-090 Phase 3 fix (2026-09-10): this batch is now a read-only reconciliation
    // report -- no Stripe Transfer is fired anywhere below (see comment further down) --
    // so a hard block on missing organizerStripeConnectId served no purpose except
    // locking Square-only TEAMS organizers out of approving their own settlement batches.
    // Removed; organizerStripeConnectId is unused past this point.

    await prisma.vendorBoothSettlementBatch.update({
      where: { id: batch.id },
      data: { status: 'PROCESSING', approvedAt: batch.approvedAt ?? new Date() },
    });

    const live = vendorLiveTransfersEnabled(); // kept only for the response payload's liveTransfersEnabled field below
    const anyFailure = false;

    // ADR-090 Phase 3: no Stripe Transfer is fired from this loop anymore. Vendors
    // already received their net sale proceeds directly at capture time (Direct
    // charge, ADR-020), and any hub-owner revenue share was already taken +
    // Transferred in real time (ADR-090 Phase 2, application_fee_amount). This
    // settlement batch is now a read-only reconciliation report -- "approving" it
    // just closes out the payout rows, it does not move money. Flat booth-fee
    // COLLECTION is handled separately by the periodic Vendor Booth Fee Billing
    // cron (Phase 4, vendorBoothFeeBillingCron.ts), not by this batch.
    for (const payout of batch.payouts) {
      if (payout.status === 'COMPLETED') continue;
      await prisma.vendorBoothPayout.update({
        where: { id: payout.id },
        data: {
          status: 'COMPLETED',
          method: 'NO_TRANSFER_NEEDED',
          failureReason: null,
          notes: payout.notes
            ? `${payout.notes} | ADR-090: no transfer -- vendor already paid directly at capture time`
            : 'ADR-090: no transfer needed -- vendor already received net proceeds via direct charge at capture time',
        },
      });
    }

    const finalStatus = anyFailure ? 'PARTIAL' : 'COMPLETED';
    const updated = await prisma.vendorBoothSettlementBatch.update({
      where: { id: batch.id },
      data: { status: finalStatus, approvedAt: batch.approvedAt ?? new Date() },
      include: {
        payouts: { include: { vendorBooth: { select: { boothNumber: true, vendorName: true, stripeOnboarded: true } } } },
      },
    });

    return res.status(200).json({
      ...serializeBatch(updated),
      liveTransfersEnabled: live,
      message: live
        ? anyFailure
          ? 'Settlement processed with some failures. See per-booth status.'
          : 'Settlement processed. Stripe transfers issued.'
        : 'Settlement approved in test mode. Transfers simulated: no money moved (VENDOR_BOOTH_LIVE_TRANSFERS OFF).',
    });
  } catch (error) {
    console.error('[approveVendorBoothSettlementBatch] Error:', error);
    return res.status(500).json({ error: 'Failed to approve settlement batch' });
  }
};

/**
 * POST /api/organizer/hubs/:hubId/settlement/batches/:batchId/retry-pending
 * Re-attempts transfer only for payouts still in PENDING_STRIPE_ONBOARDING or
 * FAILED status within an already-approved batch.
 */
export const retryPendingVendorBoothPayouts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, batchId } = req.params;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' });

    const batch = await prisma.vendorBoothSettlementBatch.findUnique({
      where: { id: batchId },
      include: {
        hub: { select: { organizerId: true, organizer: { select: { stripeConnectId: true } } } },
        payouts: { include: { vendorBooth: true } },
      },
    });

    if (!batch || batch.hubId !== hubId || batch.hub.organizerId !== organizer.id) {
      return res.status(404).json({ error: 'Settlement batch not found' });
    }

    // ADR-090 Phase 3 fix (2026-09-10): legacy-cleanup-only path, no Stripe Transfer is
    // attempted (see comment below) -- removed the same dead Stripe-only block as above,
    // for the same reason (was locking out Square-only TEAMS organizers for no purpose).

    const live = vendorLiveTransfersEnabled(); // kept only for the response payload's liveTransfersEnabled field below
    const anyFailure = false;
    let retried = 0;

    // ADR-090 Phase 3: legacy cleanup only. Payouts can no longer land in
    // PENDING_STRIPE_ONBOARDING or FAILED going forward (approveVendorBoothSettlementBatch
    // marks everything COMPLETED unconditionally now, see that function's comment) -- this
    // loop just closes out any rows left over from BEFORE that change. No Stripe Transfer
    // is attempted; same no-transfer-needed rationale as approve.
    for (const payout of batch.payouts) {
      if (!['PENDING_STRIPE_ONBOARDING', 'FAILED'].includes(payout.status)) continue;
      retried++;
      await prisma.vendorBoothPayout.update({
        where: { id: payout.id },
        data: {
          status: 'COMPLETED',
          method: 'NO_TRANSFER_NEEDED',
          failureReason: null,
          notes: payout.notes
            ? `${payout.notes} | ADR-090: no transfer -- vendor already paid directly at capture time`
            : 'ADR-090: no transfer needed -- vendor already received net proceeds via direct charge at capture time',
        },
      });
    }

    const updated = await prisma.vendorBoothSettlementBatch.update({
      where: { id: batch.id },
      data: { status: anyFailure ? 'PARTIAL' : 'COMPLETED' },
      include: { payouts: { include: { vendorBooth: { select: { boothNumber: true, vendorName: true } } } } },
    });

    return res.status(200).json({ ...serializeBatch(updated), retried, liveTransfersEnabled: live });
  } catch (error) {
    console.error('[retryPendingVendorBoothPayouts] Error:', error);
    return res.status(500).json({ error: 'Failed to retry pending payouts' });
  }
};

/**
 * PATCH /api/organizer/hubs/:hubId/settlement/payouts/:payoutId
 * Record manual payout (method, paidAt) — organizer-only, actor≠target enforced
 * (a booth-token session can never hit this endpoint; this route is only ever
 * wired with organizer-JWT `authenticate`, never requireBoothTokenOrTeamMember).
 */
export const recordManualVendorBoothPayout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId, payoutId } = req.params;
    const { method, paidAt, notes } = req.body;

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' });

    const payout = await prisma.vendorBoothPayout.findUnique({
      where: { id: payoutId },
      include: { settlementBatch: { include: { hub: { select: { organizerId: true, id: true } } } } },
    });

    if (
      !payout ||
      !payout.settlementBatch ||
      payout.settlementBatch.hub.id !== hubId ||
      payout.settlementBatch.hub.organizerId !== organizer.id
    ) {
      return res.status(404).json({ error: 'Payout not found' });
    }

    const updated = await prisma.vendorBoothPayout.update({
      where: { id: payoutId },
      data: {
        method: method || 'MANUAL_CASH_CHECK',
        status: 'MANUAL_CASH_CHECK',
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        notes: notes || payout.notes,
      },
    });

    return res.status(200).json({
      ...updated,
      totalSales: updated.totalSales.toString(),
      boothFeeCharged: updated.boothFeeCharged.toString(),
      revenueShareOwed: updated.revenueShareOwed.toString(),
      netPayout: updated.netPayout.toString(),
    });
  } catch (error) {
    console.error('[recordManualVendorBoothPayout] Error:', error);
    return res.status(500).json({ error: 'Failed to record manual payout' });
  }
};

/**
 * ADR-123 §5 items 6-7 (hub-owner-share settlement, 2026-09-07): the bounded manual-payout
 * fallback path for a SQUARE booth-cart leg whose hub-owner share was never settled via
 * real-time app_fee_allocations -- either a pre-ADR-123 legacy leg, or a rare
 * authorize-time allocation failure (ADR-123 §3.3). Deliberately NOT a recurring cron/sweep
 * -- volume is bounded by construction (the checkout-time readiness gate in
 * vendorBoothCartController.ts's computeLegFeeSplit means a hub owner who never onboards to
 * Square never accrues an unpaid share in the first place).
 *
 * SAFE-DEFAULT DECISION (flagged, not silently assumed -- ADR-123 §8 leaves this to
 * Patrick): who may trigger this is a genuine business-policy call ADR-123 itself declines
 * to make (hub-owner self-service vs admin-only). This dispatch implements the SIMPLER,
 * more conservative default -- ADMIN-ONLY (`requireAdmin`, wired in routes/vendorBooth.ts)
 * -- since this bucket is rare and money-moving, and each instance is worth a real look
 * before Patrick decides whether to loosen it to organizer self-service later (matching
 * recordManualVendorBoothPayout's existing organizer-JWT-scoped precedent).
 *
 * NO-IDOR / NO-MASS-ASSIGNMENT (CLAUDE.md §9 Security-QA Gate): legIds is caller-supplied,
 * but the eligible-leg query below is fully server-derived -- it re-filters by hubId,
 * processor='SQUARE', a real unpaid hubOwnerShareAmount, not already settled, and not
 * already claimed by another manual payout. amountCents is summed from the SERVER's own
 * hubOwnerShareAmount column, never accepted from the request body, so a caller can never
 * inflate/deflate what gets recorded as paid.
 */
export const recordHubOwnerShareManualPayout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;
    const { legIds, method, notes, paidAt } = req.body as {
      legIds?: string[];
      method?: string;
      notes?: string;
      paidAt?: string;
    };

    if (!Array.isArray(legIds) || legIds.length === 0) {
      return res.status(400).json({ error: 'legIds is required and must be a non-empty array' });
    }
    const ALLOWED_METHODS = ['CASH', 'CHECK', 'VENMO', 'ACH', 'OTHER'];
    if (!method || !ALLOWED_METHODS.includes(method)) {
      return res.status(400).json({ error: `method is required and must be one of ${ALLOWED_METHODS.join(', ')}` });
    }

    const hub = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { id: true, organizerId: true } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    // Server-derived eligibility -- see the doc-comment above. Never trusts legIds blindly.
    const legs = await prisma.boothCartLeg.findMany({
      where: {
        id: { in: legIds },
        processor: 'SQUARE',
        hubOwnerShareAmount: { not: null },
        hubOwnerShareSettledAt: null,
        hubOwnerShareManualPayoutId: null,
        vendorBooth: { hubId },
      },
      select: { id: true, hubOwnerShareAmount: true },
    });

    if (legs.length === 0) {
      return res.status(400).json({ error: 'No eligible unsettled Square hub-owner-share legs found for this hub with the given legIds' });
    }
    if (legs.length !== legIds.length) {
      return res.status(400).json({
        error: 'One or more legIds are not eligible for a manual payout right now (already settled, already claimed by another payout, wrong hub, or not an unsettled Square leg with a revenue share owed)',
        eligibleLegIds: legs.map((l) => l.id),
      });
    }

    const amountCents = legs.reduce((sum, l) => sum + Math.round(Number(l.hubOwnerShareAmount) * 100), 0);

    const payout = await prisma.$transaction(async (tx) => {
      const created = await tx.hubOwnerShareManualPayout.create({
        data: {
          hubId,
          organizerId: hub.organizerId,
          amountCents,
          method,
          notes: notes || null,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          createdByUserId: req.user!.id,
        },
      });
      await tx.boothCartLeg.updateMany({
        where: { id: { in: legs.map((l) => l.id) } },
        data: { hubOwnerShareManualPayoutId: created.id },
      });
      return created;
    });

    return res.status(201).json({
      id: payout.id,
      hubId: payout.hubId,
      organizerId: payout.organizerId,
      amountCents: payout.amountCents,
      method: payout.method,
      notes: payout.notes,
      paidAt: payout.paidAt,
      createdByUserId: payout.createdByUserId,
      legIds: legs.map((l) => l.id),
    });
  } catch (error) {
    console.error('[recordHubOwnerShareManualPayout] Error:', error);
    return res.status(500).json({ error: 'Failed to record hub-owner-share manual payout' });
  }
};

/**
 * ADR-123 §5 item 7: read surface listing this hub's currently-unsettled SQUARE
 * hub-owner-share legs -- the exact query documented on BoothCartLeg.hubOwnerShareSettledAt
 * in schema.prisma. No cron populates this -- it is a live query, run on demand.
 */
export const listUnsettledHubOwnerShareLegs = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { hubId } = req.params;

    const hub = await prisma.saleHub.findUnique({ where: { id: hubId }, select: { id: true } });
    if (!hub) return res.status(404).json({ error: 'Hub not found' });

    const legs = await prisma.boothCartLeg.findMany({
      where: {
        processor: 'SQUARE',
        hubOwnerShareAmount: { not: null },
        hubOwnerShareSettledAt: null,
        hubOwnerShareManualPayoutId: null,
        vendorBooth: { hubId },
      },
      select: {
        id: true,
        vendorBoothId: true,
        cartTransactionId: true,
        amountCents: true,
        hubOwnerShareAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalUnsettledCents = legs.reduce((sum, l) => sum + Math.round(Number(l.hubOwnerShareAmount) * 100), 0);

    return res.status(200).json({
      hubId,
      legs: legs.map((l) => ({
        legId: l.id,
        vendorBoothId: l.vendorBoothId,
        cartTransactionId: l.cartTransactionId,
        amountCents: l.amountCents,
        hubOwnerShareCents: Math.round(Number(l.hubOwnerShareAmount) * 100),
        createdAt: l.createdAt,
      })),
      totalUnsettledCents,
    });
  } catch (error) {
    console.error('[listUnsettledHubOwnerShareLegs] Error:', error);
    return res.status(500).json({ error: 'Failed to list unsettled hub-owner-share legs' });
  }
};
