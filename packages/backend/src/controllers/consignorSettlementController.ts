import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { payConsignorViaACH } from '../services/stripeConnectService';
import { sendConsignorPayout } from '../services/consignorEmailService';

/**
 * #239 Multi-Consignor Estate Settlement — Phase 1 (plumbing, Stripe TEST MODE).
 *
 * Distinct from settlementController.ts (single-client SaleSettlement / ClientPayout).
 * This module groups MANY consignors' SOLD items for one sale into a settlement batch.
 *
 * LIVE-TRANSFERS GATE: real money movement only happens when the env flag
 *   STRIPE_CONNECT_LIVE_TRANSFERS === 'true'
 * Defaults OFF. With the flag OFF, approving a batch records the batch + per-consignor
 * payouts and SIMULATES transfers (no funds move). The merchant-of-record / source-of-funds
 * legal decision is blocked pending legal review — the scaffolding here is identical under
 * either legal model; only the gated branch differs.
 */
const liveTransfersEnabled = (): boolean =>
  process.env.STRIPE_CONNECT_LIVE_TRANSFERS === 'true';

/** Resolve the authenticated organizer + their workspace. */
async function getOrganizerWorkspace(
  userId: string
): Promise<{ organizer: any; workspace: any } | null> {
  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) return null;
  const workspace = await prisma.organizerWorkspace.findFirst({
    where: { ownerId: organizer.id },
  });
  return workspace ? { organizer, workspace } : null;
}

/** Serialize Decimal-bearing batch/payout records for JSON. */
function serializeBatch(batch: any) {
  return {
    ...batch,
    totalGross: batch.totalGross?.toString?.() ?? batch.totalGross,
    totalConsignorPayouts:
      batch.totalConsignorPayouts?.toString?.() ?? batch.totalConsignorPayouts,
    payouts: (batch.payouts || []).map((p: any) => ({
      ...p,
      totalSales: p.totalSales?.toString?.() ?? p.totalSales,
      commissionAmount: p.commissionAmount?.toString?.() ?? p.commissionAmount,
      netPayout: p.netPayout?.toString?.() ?? p.netPayout,
    })),
  };
}

/**
 * Internal: group SOLD items for a sale by consignor and compute the money split.
 * consignorCut = gross * commissionRate / 100  (platform fee NOT re-deducted here).
 */
async function buildSettlementLines(saleId: string, workspaceId: string) {
  const consignors = await prisma.consignor.findMany({
    where: {
      workspaceId,
      items: { some: { saleId, status: 'SOLD' } },
    },
    include: {
      items: {
        where: { saleId, status: 'SOLD' },
        select: { id: true, price: true },
      },
    },
  });

  let totalGross = new Decimal(0);
  let totalNet = new Decimal(0);

  const rows = consignors.map((c) => {
    const gross = c.items.reduce(
      (sum, item) => sum.plus(new Decimal(item.price || 0)),
      new Decimal(0)
    );
    const net = gross.times(c.commissionRate).dividedBy(100);
    totalGross = totalGross.plus(gross);
    totalNet = totalNet.plus(net);
    return {
      consignorId: c.id,
      name: c.name,
      email: c.email,
      commissionRate: c.commissionRate,
      stripeOnboarded: c.stripeOnboarded,
      stripeAccountId: c.stripeAccountId,
      itemCount: c.items.length,
      gross,
      net,
    };
  });

  return { rows, totalGross, totalNet };
}

/**
 * GET /api/consignor-settlements/preview/:saleId
 * Non-persisted preview: per-consignor gross / % / net split table.
 */
export const previewConsignorSettlement = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { saleId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer, workspace } = result;
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizerId: organizer.id },
      select: { id: true, title: true, status: true },
    });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const lines = await buildSettlementLines(saleId, workspace.id);

    // Surface any existing batch so the UI can show "already settled" state.
    const existingBatch = await prisma.consignorSettlementBatch.findFirst({
      where: { saleId, status: { notIn: ['FAILED'] } },
      select: { id: true, status: true },
    });

    return res.status(200).json({
      saleId: sale.id,
      saleTitle: sale.title,
      saleStatus: sale.status,
      liveTransfersEnabled: liveTransfersEnabled(),
      existingBatch,
      totalGross: lines.totalGross.toFixed(2),
      totalConsignorPayouts: lines.totalNet.toFixed(2),
      consignors: lines.rows.map((r) => ({
        consignorId: r.consignorId,
        name: r.name,
        email: r.email,
        commissionRate: r.commissionRate.toString(),
        itemCount: r.itemCount,
        gross: r.gross.toFixed(2),
        net: r.net.toFixed(2),
        stripeOnboarded: r.stripeOnboarded,
        payoutMethod: r.stripeOnboarded ? 'ACH' : 'MANUAL_CASH_CHECK',
      })),
    });
  } catch (error) {
    console.error('[previewConsignorSettlement] Error:', error);
    return res.status(500).json({ error: 'Failed to build settlement preview' });
  }
};

/**
 * POST /api/consignor-settlements
 * Body: { saleId }
 * Create a DRAFT batch with one ConsignorPayout per consignor that has SOLD items.
 * No money moves. Refuses to create a second open (non-FAILED) batch for the same sale.
 */
export const createConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { saleId } = req.body;
    if (!saleId) return res.status(400).json({ error: 'saleId is required' });

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer, workspace } = result;
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizerId: organizer.id },
      select: { id: true },
    });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const existing = await prisma.consignorSettlementBatch.findFirst({
      where: { saleId, status: { notIn: ['FAILED'] } },
    });
    if (existing) {
      return res.status(409).json({
        error: 'A settlement batch already exists for this sale',
        batchId: existing.id,
      });
    }

    const lines = await buildSettlementLines(saleId, workspace.id);
    if (lines.rows.length === 0) {
      return res
        .status(400)
        .json({ error: 'No SOLD consignor items found for this sale' });
    }

    const batch = await prisma.consignorSettlementBatch.create({
      data: {
        saleId,
        workspaceId: workspace.id,
        status: 'DRAFT',
        totalGross: lines.totalGross,
        totalConsignorPayouts: lines.totalNet,
        payouts: {
          create: lines.rows.map((r) => ({
            consignorId: r.consignorId,
            saleId,
            totalSales: r.gross,
            commissionAmount: r.net,
            netPayout: r.net,
            // Un-onboarded consignors are flagged for manual payout, never hard-blocking.
            method: r.stripeOnboarded ? 'ACH' : null,
            status: r.stripeOnboarded ? 'PENDING' : 'MANUAL_CASH_CHECK',
          })),
        },
      },
      include: { payouts: true },
    });

    return res.status(201).json(serializeBatch(batch));
  } catch (error) {
    console.error('[createConsignorSettlementBatch] Error:', error);
    return res.status(500).json({ error: 'Failed to create settlement batch' });
  }
};

/**
 * GET /api/consignor-settlements/:batchId
 * Fetch a batch with its payouts (split table data).
 */
export const getConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { batchId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { workspace } = result;

    const batch = await prisma.consignorSettlementBatch.findFirst({
      where: { id: batchId, workspaceId: workspace.id },
      include: {
        payouts: {
          include: {
            consignor: { select: { name: true, email: true, stripeOnboarded: true } },
          },
        },
      },
    });
    if (!batch) return res.status(404).json({ error: 'Settlement batch not found' });

    return res.status(200).json(serializeBatch(batch));
  } catch (error) {
    console.error('[getConsignorSettlementBatch] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch settlement batch' });
  }
};

/**
 * POST /api/consignor-settlements/:batchId/approve
 * Transition DRAFT|PARTIAL|PROCESSING -> APPROVED and process per-consignor payouts.
 *
 * - LIVE flag OFF (default): each ACH payout is SIMULATED (no money moves); batch -> COMPLETED.
 * - LIVE flag ON: loop consignors, call payConsignorViaACH per consignor. Per-consignor
 *   failures isolated (that payout -> FAILED + failureReason); already-COMPLETED payouts
 *   are skipped on re-run; manual CASH/CHECK payouts untouched. Batch ends COMPLETED if all
 *   money-moving payouts succeeded, else PARTIAL.
 */
export const approveConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { batchId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer, workspace } = result;
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const batch = await prisma.consignorSettlementBatch.findFirst({
      where: { id: batchId, workspaceId: workspace.id },
      include: { payouts: { include: { consignor: true } } },
    });
    if (!batch) return res.status(404).json({ error: 'Settlement batch not found' });
    if (!['DRAFT', 'APPROVED', 'PARTIAL', 'PROCESSING'].includes(batch.status)) {
      return res
        .status(409)
        .json({ error: `Batch in status ${batch.status} cannot be approved` });
    }

    await prisma.consignorSettlementBatch.update({
      where: { id: batch.id },
      data: { status: 'PROCESSING', approvedAt: batch.approvedAt ?? new Date() },
    });

    const live = liveTransfersEnabled();
    let anyFailure = false;

    for (const payout of batch.payouts) {
      // Skip already-completed money payouts (re-run safety) and manual payouts.
      if (payout.status === 'COMPLETED') continue;
      if (payout.status === 'MANUAL_CASH_CHECK') continue;

      const consignor = payout.consignor;
      const amountCents = Math.round(Number(payout.netPayout) * 100);

      // Defensive: a payout that lost onboarding becomes a manual flag, not a hard fail.
      if (!consignor.stripeOnboarded || !consignor.stripeAccountId) {
        await prisma.consignorPayout.update({
          where: { id: payout.id },
          data: { status: 'MANUAL_CASH_CHECK', method: null },
        });
        continue;
      }

      if (!live) {
        // TEST MODE: simulate the transfer — record intent, move no money.
        await prisma.consignorPayout.update({
          where: { id: payout.id },
          data: {
            status: 'SIMULATED',
            method: 'ACH',
            notes: payout.notes
              ? `${payout.notes} | simulated (live transfers OFF)`
              : 'Simulated payout — live transfers OFF',
          },
        });
        continue;
      }

      // LIVE MODE: real Stripe transfer, isolated per consignor.
      try {
        const transfer = await payConsignorViaACH(
          consignor.stripeAccountId,
          amountCents,
          `Settlement ${batch.id} payout for ${consignor.name}`,
          organizer.stripeConnectAccountId || undefined
        );
        await prisma.consignorPayout.update({
          where: { id: payout.id },
          data: {
            status: 'COMPLETED',
            method: 'ACH',
            stripeTransferId: transfer.transferId,
            paidAt: new Date(),
            failureReason: null,
          },
        });

        if (consignor.email) {
          sendConsignorPayout({
            consignorName: consignor.name,
            consignorEmail: consignor.email,
            payoutAmount: Number(payout.netPayout),
            saleName: 'your sale',
            organizerName: workspace.name || 'your organizer',
            method: 'ACH',
          }).catch((err) =>
            console.warn('[consignor-settlement-email] Payout email failed:', err)
          );
        }
      } catch (err: any) {
        anyFailure = true;
        await prisma.consignorPayout.update({
          where: { id: payout.id },
          data: {
            status: 'FAILED',
            failureReason: err?.message?.slice(0, 500) || 'Stripe transfer failed',
          },
        });
      }
    }

    const finalStatus = anyFailure ? 'PARTIAL' : 'COMPLETED';
    const updated = await prisma.consignorSettlementBatch.update({
      where: { id: batch.id },
      data: { status: finalStatus, approvedAt: batch.approvedAt ?? new Date() },
      include: {
        payouts: {
          include: {
            consignor: { select: { name: true, email: true, stripeOnboarded: true } },
          },
        },
      },
    });

    return res.status(200).json({
      ...serializeBatch(updated),
      liveTransfersEnabled: live,
      message: live
        ? anyFailure
          ? 'Settlement processed with some failures — see per-consignor status.'
          : 'Settlement processed. ACH transfers issued.'
        : 'Settlement approved in test mode. Transfers simulated — no money moved (live transfers OFF).',
    });
  } catch (error) {
    console.error('[approveConsignorSettlementBatch] Error:', error);
    return res.status(500).json({ error: 'Failed to approve settlement batch' });
  }
};
