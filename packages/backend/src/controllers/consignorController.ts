import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { ItemRarity } from '@prisma/client';
import { sendConsignorPayout } from '../services/consignorEmailService';
import { calculateConsignorPayout, seedDefaultCommissionTiers } from '../services/commissionCalcService';
import { classifyEbayShipping } from '../utils/ebayShippingClassifier';

// Consignor intake follow-up (2026-09-24): tiny, deliberately-duplicated mirror of
// itemController.ts's local (non-exported) assignRarity() -- same 4-line price-tier
// logic, S261-locked boundaries (>=500 LEGENDARY, >=75 RARE, >=25 UNCOMMON, else COMMON).
// Not imported because that function is private to itemController.ts; extracting it to
// shared/ for one additional caller was judged not worth the refactor risk here, but if
// the rarity boundaries ever change this copy must change too -- flagged in the handoff.
function assignRarityForIntakeItem(price: number | null | undefined): ItemRarity {
  if (!price || price < 25) return ItemRarity.COMMON;
  if (price >= 500) return ItemRarity.LEGENDARY;
  if (price >= 75) return ItemRarity.RARE;
  return ItemRarity.UNCOMMON;
}

/**
 * Helper: Get organizer workspace from authenticated user
 * Returns { organizer, workspace } or null if not found
 */
async function getOrganizerWorkspace(userId: string): Promise<{ organizer: any; workspace: any } | null> {
  const organizer = await prisma.organizer.findUnique({
    where: { userId },
  });
  if (!organizer) return null;

  const workspace = await prisma.organizerWorkspace.findFirst({
    where: { ownerId: organizer.id },
  });
  return workspace ? { organizer, workspace } : null;
}

/**
 * GET /api/consignors
 * List all consignors for the organizer's workspace
 * Requires: authenticate, TEAMS subscription
 */
export const listConsignors = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const consignors = await prisma.consignor.findMany({
      where: { workspaceId: workspace.id },
      include: {
        items: {
          where: { status: 'SOLD' },
          select: { id: true, title: true, price: true },
        },
        payouts: {
          select: { id: true, totalSales: true, commissionAmount: true, paidAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // consignmentUnclaimedItemsJob.ts / "Unclaimed" badge support (2026-09-25): count each
    // consignor's AVAILABLE items whose intake (createdAt) is older than that consignor's own
    // returnPeriodDays -- same definition the daily job uses. Queried separately from the
    // `items` include above (which is deliberately SOLD-only for the existing Items/Sold
    // stats) rather than changing that include's meaning. Workspace-scoped for free: every
    // consignorId here comes from the workspace-filtered `consignors` list above, so this can
    // never pull in another workspace's items.
    const consignorIds = consignors.map((c) => c.id);
    const availableItems = consignorIds.length
      ? await prisma.item.findMany({
          where: { consignorId: { in: consignorIds }, status: 'AVAILABLE' },
          select: { consignorId: true, createdAt: true },
        })
      : [];
    const returnPeriodByConsignor = new Map(consignors.map((c) => [c.id, c.returnPeriodDays]));
    const unclaimedCountByConsignor = new Map<string, number>();
    const nowMs = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    for (const item of availableItems) {
      if (!item.consignorId) continue;
      const days = returnPeriodByConsignor.get(item.consignorId) ?? 90;
      if (nowMs - item.createdAt.getTime() > days * MS_PER_DAY) {
        unclaimedCountByConsignor.set(item.consignorId, (unclaimedCountByConsignor.get(item.consignorId) || 0) + 1);
      }
    }

    // Convert Decimal fields to strings for JSON serialization
    const serialized = consignors.map((c) => ({
      ...c,
      unclaimedCount: unclaimedCountByConsignor.get(c.id) || 0,
      payouts: c.payouts.map((p) => ({
        ...p,
        totalSales: p.totalSales.toString(),
        commissionAmount: p.commissionAmount.toString(),
      })),
    }));

    return res.status(200).json(serialized);
  } catch (error) {
    console.error('[listConsignors] Error:', error);
    return res.status(500).json({ error: 'Failed to list consignors' });
  }
};

/**
 * POST /api/consignors
 * Create a new consignor
 * Body: { name, email?, phone?, commissionRate, notes? }
 * Requires: authenticate, TEAMS subscription
 */
export const createConsignor = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, email, phone, commissionRate, notes, useTieredCommission, unsoldItemDisposition, item } = req.body;

    if (!name || commissionRate === undefined) {
      return res.status(400).json({ error: 'name and commissionRate required' });
    }

    // Consignor Onboarding: unsold-item disposition is optional, but if provided must be a known value
    if (unsoldItemDisposition !== undefined && unsoldItemDisposition !== null && !['RETURN', 'DONATE', 'RELIST'].includes(unsoldItemDisposition)) {
      return res.status(400).json({ error: "unsoldItemDisposition must be 'RETURN', 'DONATE', 'RELIST', or omitted" });
    }

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // Validate commissionRate is 0-100
    const rate = parseFloat(commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: 'commissionRate must be 0-100' });
    }

    // Consignor intake follow-up (2026-09-24): optional single-item intake in the same
    // request, for the "only one item to bring in right now" case -- avoids a separate
    // trip through the full add-item form just to attach the very first item. `item` is
    // { saleId: string (required -- an Item must belong to a Sale), title: string
    // (required), price?, description?, category? }. Validated fully before any write so
    // a bad item payload never leaves a Consignor created with no way to retry atomically.
    let saleForItem: { id: string } | null = null;
    let parsedItemPrice: number | null = null;
    if (item !== undefined && item !== null) {
      if (typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: 'item must be an object with saleId and title' });
      }
      if (!item.saleId || typeof item.saleId !== 'string') {
        return res.status(400).json({ error: 'item.saleId is required when including an item at intake' });
      }
      if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
        return res.status(400).json({ error: 'item.title is required when including an item at intake' });
      }
      if (item.price !== undefined && item.price !== null && item.price !== '') {
        parsedItemPrice = parseFloat(item.price);
        if (isNaN(parsedItemPrice) || parsedItemPrice < 0) {
          return res.status(400).json({ error: 'item.price must be a non-negative number' });
        }
      }
      // Scoped to this organizer -- same ownership check createItem uses for saleId, so a
      // client can never attach the new consignor's first item to another organizer's sale.
      saleForItem = await prisma.sale.findFirst({
        where: { id: item.saleId, organizerId: organizer.id },
        select: { id: true },
      });
      if (!saleForItem) {
        return res.status(404).json({ error: 'Sale not found or not yours.' });
      }
    }

    // ADR-096: opt-in tiered commission. Seed the workspace's default ladder the
    // first time anyone turns this on, so the toggle never silently no-ops.
    if (useTieredCommission === true) {
      await seedDefaultCommissionTiers(workspace.id);
    }

    // Transaction: when an item is included, the Consignor and its first Item are created
    // together or not at all -- never a Consignor left with a half-failed item attach.
    const { consignorId: newConsignorId } = await prisma.$transaction(async (tx) => {
      const createdConsignor = await tx.consignor.create({
        data: {
          workspaceId: workspace.id,
          name,
          email: email || null,
          phone: phone || null,
          commissionRate: new Decimal(rate),
          useTieredCommission: useTieredCommission === true,
          unsoldItemDisposition: unsoldItemDisposition || null,
          notes: notes || null,
        },
      });

      if (saleForItem) {
        await tx.item.create({
          data: {
            saleId: saleForItem.id,
            organizerId: organizer.id,
            title: item.title.trim(),
            description: item.description || '',
            price: parsedItemPrice,
            category: item.category || null,
            status: 'AVAILABLE',
            draftStatus: 'PUBLISHED',
            ebayShippingClassification: classifyEbayShipping(item.category || null, []),
            rarity: assignRarityForIntakeItem(parsedItemPrice),
            // U1: satisfies NOT NULL constraint; scheduleItemEmbedding (itemController.ts)
            // is not called here since this a lightweight intake path -- the item is still
            // fully editable afterward through the normal edit-item flow.
            embedding: [],
            consignorId: createdConsignor.id,
          },
        });
      }

      return { consignorId: createdConsignor.id };
    });

    const consignor = await prisma.consignor.findUnique({
      where: { id: newConsignorId },
      include: {
        items: { select: { id: true, title: true, price: true, status: true, createdAt: true } },
        payouts: { select: { id: true, totalSales: true, commissionAmount: true, paidAt: true } },
      },
    });

    return res.status(201).json(consignor);
  } catch (error) {
    console.error('[createConsignor] Error:', error);
    return res.status(500).json({ error: 'Failed to create consignor' });
  }
};

/**
 * GET /api/consignors/:id
 * Get consignor details including items and payout history
 * Requires: authenticate, TEAMS subscription
 */
export const getConsignor = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        items: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        payouts: {
          select: {
            id: true,
            totalSales: true,
            commissionAmount: true,
            netPayout: true,
            method: true,
            paidAt: true,
            notes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    return res.status(200).json(consignor);
  } catch (error) {
    console.error('[getConsignor] Error:', error);
    return res.status(500).json({ error: 'Failed to get consignor' });
  }
};

/**
 * PUT /api/consignors/:id
 * Update consignor information
 * Body: { name?, email?, phone?, commissionRate?, notes? }
 * Requires: authenticate, TEAMS subscription
 */
export const updateConsignor = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { name, email, phone, commissionRate, notes, useTieredCommission, unsoldItemDisposition } = req.body;

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // Verify consignor exists and belongs to workspace
    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    // Validate commissionRate if provided
    let updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (notes !== undefined) updateData.notes = notes;
    if (unsoldItemDisposition !== undefined) {
      if (unsoldItemDisposition !== null && !['RETURN', 'DONATE', 'RELIST'].includes(unsoldItemDisposition)) {
        return res.status(400).json({ error: "unsoldItemDisposition must be 'RETURN', 'DONATE', 'RELIST', or null" });
      }
      updateData.unsoldItemDisposition = unsoldItemDisposition;
    }

    if (commissionRate !== undefined) {
      const rate = parseFloat(commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'commissionRate must be 0-100' });
      }
      updateData.commissionRate = new Decimal(rate);
    }
    if (useTieredCommission !== undefined) {
      updateData.useTieredCommission = useTieredCommission === true;
      if (useTieredCommission === true) {
        await seedDefaultCommissionTiers(workspace.id);
      }
    }

    const updated = await prisma.consignor.update({
      where: { id },
      data: updateData,
      include: {
        items: { where: { status: 'SOLD' }, select: { id: true, title: true, price: true } },
        payouts: { select: { id: true, totalSales: true, commissionAmount: true, paidAt: true } },
      },
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error('[updateConsignor] Error:', error);
    return res.status(500).json({ error: 'Failed to update consignor' });
  }
};

/**
 * DELETE /api/consignors/:id
 * Delete a consignor (blocks if they have payouts)
 * Requires: authenticate, TEAMS subscription
 */
export const deleteConsignor = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // Verify consignor exists and belongs to workspace
    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    // Check if consignor has payouts
    const payoutCount = await prisma.consignorPayout.count({
      where: { consignorId: id },
    });

    if (payoutCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete consignor with existing payouts',
        payoutCount,
      });
    }

    // Delete the consignor (cascade will handle items)
    await prisma.consignor.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (error) {
    console.error('[deleteConsignor] Error:', error);
    return res.status(500).json({ error: 'Failed to delete consignor' });
  }
};

/**
 * POST /api/consignors/:id/payout
 * Run a payout for a consignor
 * Body: { saleId?, method, notes? }
 * Payout logic:
 *  - Find all SOLD items for this consignor (optionally filtered by saleId)
 *  - Sum item prices → totalSales
 *  - commissionAmount = totalSales * consignor.commissionRate / 100
 *  - netPayout = commissionAmount
 *  - Create ConsignorPayout record
 * Requires: authenticate, TEAMS subscription
 */
export const runPayout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { saleId, method, notes } = req.body;

    if (!method) {
      return res.status(400).json({ error: 'method is required' });
    }

    // Get organizer's workspace
    const result = await getOrganizerWorkspace(req.user.id);

    if (!result) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    const { organizer, workspace } = result;

    // Check TEAMS tier
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    // Verify consignor exists and belongs to workspace
    const consignor = await prisma.consignor.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Consignor not found' });
    }

    // Find all SOLD items for this consignor
    const soldItems = await prisma.item.findMany({
      where: {
        consignorId: id,
        status: 'SOLD',
        ...(saleId && { saleId }), // Optional: filter by sale
      },
      select: { id: true, price: true },
    });

    // ADR-096: shared helper -- flat math if !useTieredCommission (identical to
    // pre-ADR-096 behavior), per-item tiered math if true. Never duplicate this
    // calculation inline; consignorSettlementController.ts uses the same helper.
    const { gross: totalSales, net: netPayout, tierBreakdown } = await calculateConsignorPayout(
      consignor,
      soldItems
    );
    const commissionAmount = netPayout; // kept as a distinct field name for API/back-compat; extensible for future deductions

    // Create payout record
    const payout = await prisma.consignorPayout.create({
      data: {
        consignorId: id,
        saleId: saleId || null,
        totalSales,
        commissionAmount,
        netPayout,
        method: method || null,
        notes: notes || null,
        ...(tierBreakdown ? { tierBreakdown } : {}),
      },
    });

    // Feature #335: Send payout email if consignor has email
    if (consignor.email) {
      sendConsignorPayout({
        consignorName: consignor.name,
        consignorEmail: consignor.email,
        payoutAmount: netPayout.toNumber(),
        saleName: 'your sale',
        organizerName: workspace.name || 'your organizer',
        method: method || undefined,
      }).catch(err => console.warn('[consignor-email] Payout email failed:', err));
    }

    return res.status(201).json(payout);
  } catch (error) {
    console.error('[runPayout] Error:', error);
    return res.status(500).json({ error: 'Failed to run payout' });
  }
};

/**
 * GET /api/consignors/portal/:token
 * PUBLIC endpoint (no auth required)
 * Consignor views their portal with items and payout history
 */
export const getConsignorPortal = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Portal token required' });
    }

    const consignor = await prisma.consignor.findUnique({
      where: { portalToken: token },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        items: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        payouts: {
          select: {
            id: true,
            totalSales: true,
            commissionAmount: true,
            netPayout: true,
            method: true,
            paidAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!consignor) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    return res.status(200).json({
      consignor: {
        name: consignor.name,
        email: consignor.email,
        phone: consignor.phone,
      },
      items: consignor.items,
      payouts: consignor.payouts,
    });
  } catch (error) {
    console.error('[getConsignorPortal] Error:', error);
    return res.status(500).json({ error: 'Failed to retrieve portal' });
  }
};
