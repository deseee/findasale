import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * Feature #XXX: Automatic Markdown Cycles (PRO Tier)
 * Time-based automatic price reductions. Organizers define when prices drop by percentage.
 * Example: 10% off after 5 days, 20% off after 10 days.
 */

// GET /api/markdown-cycles — list all markdown cycles for authenticated organizer
export const listMarkdownCycles = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get organizer record
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile not found' });
    }

    // Tier check: PRO or TEAMS
    const userRoleSubscription = await prisma.userRoleSubscription.findUnique({
      where: { userId_role: { userId: req.user.id, role: 'ORGANIZER' } },
    });

    if (!userRoleSubscription || !['PRO', 'TEAMS'].includes(userRoleSubscription.subscriptionTier)) {
      return res.status(403).json({ message: 'PRO subscription required' });
    }

    // List all markdown cycles for this organizer
    const cycles = await prisma.markdownCycle.findMany({
      where: { organizerId: organizer.id },
      include: { sale: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(cycles);
  } catch (error) {
    console.error('Error listing markdown cycles:', error);
    res.status(500).json({ message: 'Server error while listing markdown cycles' });
  }
};

// POST /api/markdown-cycles — create a new markdown cycle
export const createMarkdownCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId, daysUntilFirst, firstPct, daysUntilSecond, secondPct } = req.body;

    // Validate input
    if (!daysUntilFirst || daysUntilFirst < 0) {
      return res.status(400).json({ message: 'daysUntilFirst must be >= 0' });
    }
    if (!firstPct || firstPct < 0 || firstPct > 100) {
      return res.status(400).json({ message: 'firstPct must be between 0 and 100' });
    }
    if (daysUntilSecond !== undefined && (daysUntilSecond < 0 || daysUntilSecond <= daysUntilFirst)) {
      return res.status(400).json({ message: 'daysUntilSecond must be greater than daysUntilFirst' });
    }
    if (secondPct !== undefined && (secondPct < 0 || secondPct > 100)) {
      return res.status(400).json({ message: 'secondPct must be between 0 and 100' });
    }

    // Get organizer record
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile not found' });
    }

    // Tier check: PRO or TEAMS
    const userRoleSubscription = await prisma.userRoleSubscription.findUnique({
      where: { userId_role: { userId: req.user.id, role: 'ORGANIZER' } },
    });

    if (!userRoleSubscription || !['PRO', 'TEAMS'].includes(userRoleSubscription.subscriptionTier)) {
      return res.status(403).json({ message: 'PRO subscription required' });
    }

    // If saleId is provided, verify organizer owns the sale
    if (saleId) {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        select: { organizerId: true },
      });

      if (!sale) {
        return res.status(404).json({ message: 'Sale not found' });
      }

      if (sale.organizerId !== organizer.id) {
        return res.status(403).json({ message: 'You do not own this sale' });
      }
    }

    // Create markdown cycle
    const cycle = await prisma.markdownCycle.create({
      data: {
        organizerId: organizer.id,
        saleId: saleId || null,
        daysUntilFirst,
        firstPct,
        daysUntilSecond: daysUntilSecond || null,
        secondPct: secondPct || null,
      },
      include: { sale: { select: { id: true, title: true } } },
    });

    res.status(201).json(cycle);
  } catch (error) {
    console.error('Error creating markdown cycle:', error);
    res.status(500).json({ message: 'Server error while creating markdown cycle' });
  }
};

// PUT /api/markdown-cycles/:id — update a markdown cycle
export const updateMarkdownCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const { daysUntilFirst, firstPct, daysUntilSecond, secondPct, isActive } = req.body;

    // Get organizer record
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile not found' });
    }

    // Verify ownership of the cycle
    const cycle = await prisma.markdownCycle.findUnique({
      where: { id },
    });

    if (!cycle) {
      return res.status(404).json({ message: 'Markdown cycle not found' });
    }

    if (cycle.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not own this markdown cycle' });
    }

    // Validate input if provided
    if (daysUntilFirst !== undefined && (daysUntilFirst < 0)) {
      return res.status(400).json({ message: 'daysUntilFirst must be >= 0' });
    }
    if (firstPct !== undefined && (firstPct < 0 || firstPct > 100)) {
      return res.status(400).json({ message: 'firstPct must be between 0 and 100' });
    }
    if (daysUntilSecond !== undefined && (daysUntilSecond < 0 || daysUntilSecond <= (daysUntilFirst ?? cycle.daysUntilFirst))) {
      return res.status(400).json({ message: 'daysUntilSecond must be greater than daysUntilFirst' });
    }
    if (secondPct !== undefined && (secondPct < 0 || secondPct > 100)) {
      return res.status(400).json({ message: 'secondPct must be between 0 and 100' });
    }

    // Update markdown cycle
    const updatedCycle = await prisma.markdownCycle.update({
      where: { id },
      data: {
        ...(daysUntilFirst !== undefined && { daysUntilFirst }),
        ...(firstPct !== undefined && { firstPct }),
        ...(daysUntilSecond !== undefined && { daysUntilSecond }),
        ...(secondPct !== undefined && { secondPct }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { sale: { select: { id: true, title: true } } },
    });

    res.json(updatedCycle);
  } catch (error) {
    console.error('Error updating markdown cycle:', error);
    res.status(500).json({ message: 'Server error while updating markdown cycle' });
  }
};

// DELETE /api/markdown-cycles/:id — delete a markdown cycle
export const deleteMarkdownCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;

    // Get organizer record
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ message: 'Organizer profile not found' });
    }

    // Verify ownership of the cycle
    const cycle = await prisma.markdownCycle.findUnique({
      where: { id },
    });

    if (!cycle) {
      return res.status(404).json({ message: 'Markdown cycle not found' });
    }

    if (cycle.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not own this markdown cycle' });
    }

    // Delete the cycle
    await prisma.markdownCycle.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting markdown cycle:', error);
    res.status(500).json({ message: 'Server error while deleting markdown cycle' });
  }
};
