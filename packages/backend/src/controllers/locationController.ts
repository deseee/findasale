import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// #311: Multi-Location Inventory View — location management for TEAMS tier organizers

/**
 * GET /api/locations
 * List all locations for organizer's workspace
 * Requires: TEAMS subscription tier
 */
export const listLocations = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check tier requirement
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ error: 'Unauthorized' });

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { subscriptionTier: true },
    });

    if (!organizer || organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const locations = await prisma.location.findMany({
      where: { workspaceId: workspace.id },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        managerId: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            items: true,
            sales: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(locations);
  } catch (error) {
    console.error('[listLocations] Error:', error);
    res.status(500).json({ error: 'Failed to list locations' });
  }
};

/**
 * POST /api/locations
 * Create a new location
 * Body: { name, address?, phone?, managerId? }
 * Requires: TEAMS subscription tier
 */
export const createLocation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, address, phone, managerId } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Location name is required' });
    }

    // Check tier requirement
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ error: 'Unauthorized' });

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { subscriptionTier: true },
    });

    if (!organizer || organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // If managerId provided, verify it's a workspace member
    if (managerId) {
      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: workspace.id,
          userId: managerId,
        },
      });

      if (!member) {
        return res.status(400).json({ error: 'Manager must be a workspace member' });
      }
    }

    const location = await prisma.location.create({
      data: {
        workspaceId: workspace.id,
        name,
        address: address || null,
        phone: phone || null,
        managerId: managerId || null,
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        managerId: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json(location);
  } catch (error) {
    console.error('[createLocation] Error:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
};

/**
 * PUT /api/locations/:id
 * Update location fields
 * Body: { name?, address?, phone?, managerId? }
 * Requires: TEAMS subscription tier + location must belong to workspace
 */
export const updateLocation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { name, address, phone, managerId } = req.body;

    // Check tier requirement
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ error: 'Unauthorized' });

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { subscriptionTier: true },
    });

    if (!organizer || organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Verify location belongs to workspace
    const location = await prisma.location.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // If managerId provided, verify it's a workspace member
    if (managerId !== undefined && managerId !== null) {
      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: workspace.id,
          userId: managerId,
        },
      });

      if (!member) {
        return res.status(400).json({ error: 'Manager must be a workspace member' });
      }
    }

    const updated = await prisma.location.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address: address || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(managerId !== undefined && { managerId: managerId || null }),
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        managerId: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('[updateLocation] Error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
};

/**
 * DELETE /api/locations/:id
 * Delete a location
 * Requires: TEAMS subscription tier + location must be empty (no items or sales)
 */
export const deleteLocation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Check tier requirement
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ error: 'Unauthorized' });

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { subscriptionTier: true },
    });

    if (!organizer || organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Verify location belongs to workspace
    const location = await prisma.location.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Check if location has items or sales
    const itemCount = await prisma.item.count({
      where: { locationId: id },
    });

    const saleCount = await prisma.sale.count({
      where: { locationId: id },
    });

    if (itemCount > 0 || saleCount > 0) {
      return res.status(409).json({
        error: 'Location has assigned items or sales. Reassign them first.',
      });
    }

    await prisma.location.delete({ where: { id } });

    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    console.error('[deleteLocation] Error:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
};

/**
 * POST /api/locations/:id/transfer
 * Bulk transfer items from one location to another
 * Body: { itemIds: string[], toLocationId: string }
 * Requires: TEAMS subscription tier
 */
export const transferItems = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { itemIds, toLocationId } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds must be a non-empty array' });
    }

    if (!toLocationId || typeof toLocationId !== 'string') {
      return res.status(400).json({ error: 'toLocationId is required' });
    }

    // Check tier requirement
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ error: 'Unauthorized' });

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { subscriptionTier: true },
    });

    if (!organizer || organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Verify source location belongs to workspace
    const sourceLocation = await prisma.location.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!sourceLocation) {
      return res.status(404).json({ error: 'Source location not found' });
    }

    // Verify destination location belongs to same workspace
    const destLocation = await prisma.location.findFirst({
      where: { id: toLocationId, workspaceId: workspace.id },
    });

    if (!destLocation) {
      return res.status(404).json({ error: 'Destination location not found' });
    }

    // Bulk update items
    const result = await prisma.item.updateMany({
      where: {
        id: { in: itemIds },
        locationId: id,
      },
      data: {
        locationId: toLocationId,
      },
    });

    res.json({
      transferred: result.count,
      message: `${result.count} item(s) transferred successfully`,
    });
  } catch (error) {
    console.error('[transferItems] Error:', error);
    res.status(500).json({ error: 'Failed to transfer items' });
  }
};

/**
 * GET /api/locations/:id/inventory
 * Get items at a specific location
 * Requires: TEAMS subscription tier + location must belong to workspace
 */
export const getLocationInventory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { skip = '0', take = '50' } = req.query;

    // Check tier requirement
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ error: 'Unauthorized' });

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { subscriptionTier: true },
    });

    if (!organizer || organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Verify location belongs to workspace
    const location = await prisma.location.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const skipNum = Math.max(0, parseInt(skip as string) || 0);
    const takeNum = Math.max(1, Math.min(100, parseInt(take as string) || 50));

    const items = await prisma.item.findMany({
      where: { locationId: id },
      select: {
        id: true,
        title: true,
        price: true,
        status: true,
        condition: true,
        photoUrls: true,
        saleId: true,
        sale: {
          select: {
            id: true,
            title: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: skipNum,
      take: takeNum,
    });

    const totalCount = await prisma.item.count({
      where: { locationId: id },
    });

    res.json({
      items,
      pagination: {
        skip: skipNum,
        take: takeNum,
        total: totalCount,
      },
    });
  } catch (error) {
    console.error('[getLocationInventory] Error:', error);
    res.status(500).json({ error: 'Failed to get location inventory' });
  }
};
