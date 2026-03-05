// V3: UGC Missing-listing bounties
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

/**
 * POST /api/bounties
 * Authenticated shoppers submit a missing-listing request for a sale.
 */
export const createBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, description, offerPrice } = req.body;
    const userId = req.user.id;

    if (!saleId || !description?.trim()) {
      return res.status(400).json({ message: 'saleId and description are required.' });
    }

    const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { id: true, status: true } });
    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.status === 'ENDED') {
      return res.status(400).json({ message: 'Cannot submit a bounty for an ended sale.' });
    }

    // One open bounty per user per sale with the same description (dedup)
    const existing = await prisma.missingListingBounty.findFirst({
      where: { saleId, userId, status: 'OPEN' },
    });
    if (existing) {
      return res.status(409).json({ message: 'You already have an open bounty for this sale.' });
    }

    const bounty = await prisma.missingListingBounty.create({
      data: {
        saleId,
        userId,
        description: description.trim(),
        offerPrice: offerPrice != null ? Number(offerPrice) : null,
      },
      include: { user: { select: { name: true } } },
    });

    return res.status(201).json(bounty);
  } catch (error) {
    console.error('createBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/sale/:saleId
 * Organizers view all bounties for their sale.
 */
export const getSaleBounties = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    // Verify organizer owns this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const bounties = await prisma.missingListingBounty.findMany({
      where: { saleId },
      include: {
        user: { select: { name: true, email: true } },
        item: { select: { id: true, title: true, price: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return res.json(bounties);
  } catch (error) {
    console.error('getSaleBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/my
 * Authenticated buyers view their own bounties.
 */
export const getMyBounties = async (req: AuthRequest, res: Response) => {
  try {
    const bounties = await prisma.missingListingBounty.findMany({
      where: { userId: req.user.id },
      include: {
        sale: { select: { id: true, title: true, address: true } },
        item: { select: { id: true, title: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(bounties);
  } catch (error) {
    console.error('getMyBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * PATCH /api/bounties/:id/fulfill
 * Organizer marks a bounty as fulfilled, optionally linking the listed item.
 * Body: { itemId?: string }
 */
export const fulfillBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;

    const bounty = await prisma.missingListingBounty.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } },
    });
    if (!bounty) return res.status(404).json({ message: 'Bounty not found.' });
    if (bounty.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ message: 'Bounty is already closed.' });
    }

    // Optionally verify the item belongs to the same sale
    if (itemId) {
      const item = await prisma.item.findUnique({ where: { id: itemId }, select: { saleId: true } });
      if (!item || item.saleId !== bounty.saleId) {
        return res.status(400).json({ message: 'Item does not belong to this sale.' });
      }
    }

    const updated = await prisma.missingListingBounty.update({
      where: { id },
      data: { status: 'FULFILLED', itemId: itemId || null },
      include: { item: { select: { id: true, title: true, price: true } } },
    });

    return res.json(updated);
  } catch (error) {
    console.error('fulfillBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * DELETE /api/bounties/:id
 * Shopper cancels their own open bounty.
 */
export const cancelBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const bounty = await prisma.missingListingBounty.findUnique({ where: { id } });
    if (!bounty) return res.status(404).json({ message: 'Bounty not found.' });
    if (bounty.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your bounty.' });
    }
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ message: 'Bounty is already closed.' });
    }

    await prisma.missingListingBounty.update({ where: { id }, data: { status: 'CANCELLED' } });
    return res.json({ message: 'Bounty cancelled.' });
  } catch (error) {
    console.error('cancelBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};
