import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { payVendorBoothViaTransfer } from '../services/stripeConnectService';

/**
 * Vendor Booth Payments — Settlement Batches (2026-07-07)
 * Mirrors consignorSettlementController.ts's shape near-verbatim (intentional
 * duplication per ADR-015 Consequences — not a shared abstraction; revisit only
 * if a third payout-recipient type appears).
 *
 * LIVE-TRANSFERS GATE: automated vendor Stripe Transfers only happen when
 * VENDOR_BOOTH_LIVE_TRANSFERS === 'true'. Defaults OFF — per the 2026-07-07
 * decision log, this is a SEPARATE, independently-toggleable env flag from
 * STRIPE_CONNECT_LIVE_TRANSFERS (Consignor payouts), so vendor-transfer dry-run
 * testing never touches the live Consignor payout switch or vice versa.
 * With the flag OFF, VendorBoothPayout.status resolves to 'SIMULATED'.
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
 * Internal: group SOLD items for a hub by vendor booth and compute the money split.
 * netPayout = totalSales - boothFeeCharged - revenueShareOwed.
 * boothFeeCharged is the booth's flat boothFee (charged once per settlement run,
 * not per item). revenueShareOwed = totalSales * revenueSharePercent / 100.
 */
async function buildBoothSettlementLines(hubId: string) {
  const booths = await prisma.vendorBooth.findMany({
    where: {
      hubId,
      deletedAt: null,
      items: { some: { status: 'SOLD' } },
    },
    include: {
      items: { where: { status: 'SOLD' }, select: { id: true, price: true } },
    },
  });

  let totalGross = new Decimal(0);
  let totalNet = new Decimal(0);

  const rows = booths.map((b) => {
    const gross = b.items.reduce((sum, item) => sum.plus(new Decimal(item.price || 0)), new Decimal(0));
    const revenueShareOwed = gross.times(b.revenueSharePercent).dividedBy(100);
    const boothFeeCharged = new Decimal(b.boothFee);
    const netPayout = gross.minus(boothFeeCharged).minus(revenueShareOwed);
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

    const lines = await buildBoothSettlementLines(hubId);

    const existingBatch = await prisma.vendorBoothSettlementBatch.findFirst({
      where: { hubId, status: { notIn: ['FAILED'] } },
      select: { id: true, status: true },
    });

    return res.status(200).json({
      hubId,
      liveTransfersEnabled: vendorLiveTransfersEnabled(),
      existingBatch,
      totalGross: lines.totalGross.toFixed(2),
      totalPayouts: lines.totalNet.toFixed(2),
      // Fee disclosure requirement: itemize per-booth flat 10% platform fee +
      // THIS booth's boothFee + THIS booth's revenueSharePercent — never a
      // blended number, since one vendor can have different terms at different malls.
      booths: lines.rows.map((r) => ({
        vendorBoothId: r.vendorBoothId,
        boothNumber: r.boothNumber,
        vendorName: r.vendorName,
        itemCount: r.itemCount,
        gross: r.gross.toFixed(2),
        platformFeePercent: 10, // locked flat 10% — never a different rate
        boothFee: r.boothFeeCharged.toFixed(2),
        revenueSharePercent: r.revenueSharePercent,
        revenueShareOwed: r.revenueShareOwed.toFixed(2),
        net: r.netPayout.toFixed(2),
        stripeOnboarded: r.stripeOnboarded,
        payoutMethod: r.stripeOnboarded ? 'STRIPE_TRANSFER' : 'MANUAL_CASH_CHECK',
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

    const lines = await buildBoothSettlementLines(hubId);
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
 * Transition DRAFT|PARTIAL|PROCESSING -> APPROVED and process per-booth payouts.
 *
 * - VENDOR_BOOTH_LIVE_TRANSFERS OFF (default): each payout is SIMULATED (no money
 *   moves); batch -> COMPLETED.
 * - VENDOR_BOOTH_LIVE_TRANSFERS ON: loop booths, call payVendorBoothViaTransfer per
 *   booth (CORRECTED source_transaction logic — retrieves the real charge ID from
 *   the relevant BoothCartTransaction's PaymentIntent before setting
 *   source_transaction; never passes an account ID). Per-booth failures isolated;
 *   already-COMPLETED payouts skipped on re-run; PENDING_STRIPE_ONBOARDING payouts
 *   left untouched (retry-pending handles those once onboarded).
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

    const organizerStripeConnectId = batch.hub.organizer.stripeConnectId;
    if (!organizerStripeConnectId) {
      return res.status(400).json({ error: 'Organizer Stripe account not configured' });
    }

    await prisma.vendorBoothSettlementBatch.update({
      where: { id: batch.id },
      data: { status: 'PROCESSING', approvedAt: batch.approvedAt ?? new Date() },
    });

    const live = vendorLiveTransfersEnabled();
    let anyFailure = false;

    for (const payout of batch.payouts) {
      if (payout.status === 'COMPLETED') continue;

      const booth = payout.vendorBooth;

      // Defensive: a booth that lost onboarding becomes a manual flag, not a hard fail.
      if (!booth.stripeOnboarded || !booth.stripeAccountId) {
        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: { status: 'PENDING_STRIPE_ONBOARDING', method: null },
        });
        continue;
      }

      if (!live) {
        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: {
            status: 'SIMULATED',
            method: 'STRIPE_TRANSFER',
            notes: payout.notes
              ? `${payout.notes} | simulated (VENDOR_BOOTH_LIVE_TRANSFERS OFF)`
              : 'Simulated payout — VENDOR_BOOTH_LIVE_TRANSFERS OFF',
          },
        });
        continue;
      }

      // LIVE MODE: find the BoothCartTransaction(s) whose boothsRepresented includes
      // this vendorBoothId and whose PaymentIntent funded this payout's totalSales.
      const cartTx = await prisma.boothCartTransaction.findFirst({
        where: {
          hubId,
          status: 'COMPLETED',
          boothsRepresented: { has: booth.id },
          stripePaymentIntentId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { stripePaymentIntentId: true },
      });

      if (!cartTx?.stripePaymentIntentId) {
        anyFailure = true;
        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: { status: 'FAILED', failureReason: 'No completed cart transaction found to source the transfer from' },
        });
        continue;
      }

      const amountCents = Math.round(Number(payout.netPayout) * 100);

      try {
        const transfer = await payVendorBoothViaTransfer({
          vendorBoothStripeAccountId: booth.stripeAccountId,
          amountCents,
          description: `Settlement ${batch.id} payout for booth ${booth.boothNumber} (${booth.vendorName})`,
          organizerStripeConnectId,
          cartPaymentIntentId: cartTx.stripePaymentIntentId,
          transferGroup: batch.id,
        });

        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: {
            status: 'COMPLETED',
            method: 'STRIPE_TRANSFER',
            stripeTransferId: transfer.transferId,
            transferredAt: new Date(),
            failureReason: null,
          },
        });
      } catch (err: any) {
        anyFailure = true;
        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: { status: 'FAILED', failureReason: err?.message?.slice(0, 500) || 'Stripe transfer failed' },
        });
      }
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
          ? 'Settlement processed with some failures — see per-booth status.'
          : 'Settlement processed. Stripe transfers issued.'
        : 'Settlement approved in test mode. Transfers simulated — no money moved (VENDOR_BOOTH_LIVE_TRANSFERS OFF).',
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

    const organizerStripeConnectId = batch.hub.organizer.stripeConnectId;
    if (!organizerStripeConnectId) {
      return res.status(400).json({ error: 'Organizer Stripe account not configured' });
    }

    const live = vendorLiveTransfersEnabled();
    let anyFailure = false;
    let retried = 0;

    for (const payout of batch.payouts) {
      if (!['PENDING_STRIPE_ONBOARDING', 'FAILED'].includes(payout.status)) continue;
      const booth = payout.vendorBooth;

      if (!booth.stripeOnboarded || !booth.stripeAccountId) continue; // still not onboarded

      retried++;

      if (!live) {
        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: { status: 'SIMULATED', method: 'STRIPE_TRANSFER', failureReason: null },
        });
        continue;
      }

      const cartTx = await prisma.boothCartTransaction.findFirst({
        where: { hubId, status: 'COMPLETED', boothsRepresented: { has: booth.id }, stripePaymentIntentId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { stripePaymentIntentId: true },
      });

      if (!cartTx?.stripePaymentIntentId) {
        anyFailure = true;
        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: { status: 'FAILED', failureReason: 'No completed cart transaction found to source the transfer from' },
        });
        continue;
      }

      try {
        const transfer = await payVendorBoothViaTransfer({
          vendorBoothStripeAccountId: booth.stripeAccountId,
          amountCents: Math.round(Number(payout.netPayout) * 100),
          description: `Settlement ${batch.id} retry payout for booth ${booth.boothNumber} (${booth.vendorName})`,
          organizerStripeConnectId,
          cartPaymentIntentId: cartTx.stripePaymentIntentId,
          transferGroup: batch.id,
        });

        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: {
            status: 'COMPLETED', method: 'STRIPE_TRANSFER',
            stripeTransferId: transfer.transferId, transferredAt: new Date(), failureReason: null,
          },
        });
      } catch (err: any) {
        anyFailure = true;
        await prisma.vendorBoothPayout.update({
          where: { id: payout.id },
          data: { status: 'FAILED', failureReason: err?.message?.slice(0, 500) || 'Stripe transfer failed' },
        });
      }
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
