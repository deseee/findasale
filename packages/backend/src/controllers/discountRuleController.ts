import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * Feature #310: Color-tagged Discount Rules (TEAMS tier only)
 * Endpoints to manage discount rules tied to item tag colors
 */

// GET /api/discount-rules
export const listDiscountRules = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get organizer's workspace
    const workspace = await prisma.organizerWorkspace.findFirst({
      where: { organizerId: req.user.id },
    });

    if (!workspace) {
      return res.status(403).json({ message: 'Workspace not found' });
    }

    // Tier check: TEAMS only
    if (workspace.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ message: 'TEAMS subscription required' });
    }

    // List all rules for this workspace (no date filtering — return all)
    const rules = await prisma.discountRule.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(rules);
  } catch (error) {
    console.error('Error listing discount rules:', error);
    res.status(500).json({ message: 'Server error while listing discount rules' });
  }
};

// POST /api/discount-rules
export const createDiscountRule = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { tagColor, label, discountPercent, activeFrom, activeTo } = req.body;

    // Validation
    if (!tagColor || typeof tagColor !== 'string') {
      return res.status(400).json({ message: 'tagColor is required (string)' });
    }
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ message: 'label is required (string)' });
    }
    if (discountPercent === undefined || discountPercent === null) {
      return res.status(400).json({ message: 'discountPercent is required (number)' });
    }
    if (typeof discountPercent !== 'number' || discountPercent < 0 || discountPercent > 100) {
      return res.status(400).json({ message: 'discountPercent must be a number between 0 and 100' });
    }

    // Get organizer's workspace
    const workspace = await prisma.organizerWorkspace.findFirst({
      where: { organizerId: req.user.id },
    });

    if (!workspace) {
      return res.status(403).json({ message: 'Workspace not found' });
    }

    // Tier check: TEAMS only
    if (workspace.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ message: 'TEAMS subscription required' });
    }

    // Create rule
    const rule = await prisma.discountRule.create({
      data: {
        workspaceId: workspace.id,
        tagColor,
        label,
        discountPercent,
        activeFrom: activeFrom ? new Date(activeFrom) : null,
        activeTo: activeTo ? new Date(activeTo) : null,
      },
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating discount rule:', error);
    res.status(500).json({ message: 'Server error while creating discount rule' });
  }
};

// PUT /api/discount-rules/:id
export const updateDiscountRule = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const { tagColor, label, discountPercent, activeFrom, activeTo } = req.body;

    // Get organizer's workspace
    const workspace = await prisma.organizerWorkspace.findFirst({
      where: { organizerId: req.user.id },
    });

    if (!workspace) {
      return res.status(403).json({ message: 'Workspace not found' });
    }

    // Tier check: TEAMS only
    if (workspace.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ message: 'TEAMS subscription required' });
    }

    // Verify rule belongs to this workspace
    const existingRule = await prisma.discountRule.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existingRule) {
      return res.status(404).json({ message: 'Discount rule not found' });
    }

    // Build update data (only update fields that are provided)
    const updateData: any = {};
    if (tagColor !== undefined) updateData.tagColor = tagColor;
    if (label !== undefined) updateData.label = label;
    if (discountPercent !== undefined) {
      if (typeof discountPercent !== 'number' || discountPercent < 0 || discountPercent > 100) {
        return res.status(400).json({ message: 'discountPercent must be a number between 0 and 100' });
      }
      updateData.discountPercent = discountPercent;
    }
    if (activeFrom !== undefined) updateData.activeFrom = activeFrom ? new Date(activeFrom) : null;
    if (activeTo !== undefined) updateData.activeTo = activeTo ? new Date(activeTo) : null;

    const updated = await prisma.discountRule.update({
      where: { id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating discount rule:', error);
    res.status(500).json({ message: 'Server error while updating discount rule' });
  }
};

// DELETE /api/discount-rules/:id
export const deleteDiscountRule = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;

    // Get organizer's workspace
    const workspace = await prisma.organizerWorkspace.findFirst({
      where: { organizerId: req.user.id },
    });

    if (!workspace) {
      return res.status(403).json({ message: 'Workspace not found' });
    }

    // Tier check: TEAMS only
    if (workspace.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ message: 'TEAMS subscription required' });
    }

    // Verify rule belongs to this workspace
    const existingRule = await prisma.discountRule.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existingRule) {
      return res.status(404).json({ message: 'Discount rule not found' });
    }

    // Delete rule
    await prisma.discountRule.delete({
      where: { id },
    });

    res.json({ message: 'Discount rule deleted' });
  } catch (error) {
    console.error('Error deleting discount rule:', error);
    res.status(500).json({ message: 'Server error while deleting discount rule' });
  }
};
