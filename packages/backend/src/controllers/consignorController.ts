import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

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

    return res.status(200).json(consignors);
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

    const { name, email, phone, commissionRate, notes } = req.body;

    if (!name || commissionRate === undefined) {
      return res.status(400).json({ error: 'name and commissionRate required' });
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

    const consignor = await prisma.consignor.create({
      data: {
        workspaceId: workspace.id,
        name,
        email: email || null,
        phone: phone || null,
        commissionRate: new Decimal(rate),
        notes: notes || null,
      },
      include: {
        items: { where: { status: 'SOLD' }, select: { id: true, title: true, price: true } },
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
    const { name, email, phone, commissionRate, notes } = req.body;

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

    if (commissionRate !== undefined) {
      const rate = parseFloat(commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'commissionRate must be 0-100' });
      }
      updateData.commissionRate = new Decimal(rate);
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
      select: { price: true },
    });

    // Calculate total sales from item prices
    const totalSales = soldItems.reduce((sum, item) => {
      return sum + (item.price || 0);
    }, 0);

    // Calculate commission and net payout
    const commissionAmount = new Decimal(totalSales)
      .times(consignor.commissionRate)
      .dividedBy(100);
    const netPayout = commissionAmount; // extensible for future deductions

    // Create payout record
    const payout = await prisma.consignorPayout.create({
      data: {
        consignorId: id,
        saleId: saleId || null,
        totalSales: new Decimal(totalSales),
        commissionAmount,
        netPayout,
        method: method || null,
        notes: notes || null,
      },
    });

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
