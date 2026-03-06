import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// POST /api/disputes — authenticated buyer creates dispute
export const createDispute = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, saleId, itemId, reason, description } = req.body;
    const buyerId = req.user?.id;

    if (!buyerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate required fields
    if (!orderId || !saleId || !itemId || !reason || !description) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate reason enum
    const validReasons = ['condition_mismatch', 'item_missing', 'wrong_item', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ message: 'Invalid reason' });
    }

    // Validate description length
    if (description.length < 50) {
      return res.status(400).json({ message: 'Description must be at least 50 characters' });
    }

    // Get the sale to find seller
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Get the organizer user
    const organizer = await prisma.organizer.findUnique({
      where: { id: sale.organizerId },
      select: { userId: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Create the dispute
    const dispute = await prisma.dispute.create({
      data: {
        orderId,
        buyerId,
        sellerId: organizer.userId,
        saleId,
        itemId,
        reason,
        description,
        status: 'open',
      },
      include: {
        buyer: {
          select: { id: true, name: true, email: true },
        },
        seller: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json({
      message: 'Dispute created successfully',
      dispute,
    });
  } catch (error) {
    console.error('Error creating dispute:', error);
    res.status(500).json({ message: 'Failed to create dispute' });
  }
};

// GET /api/disputes/my — buyer sees their disputes
export const getMyDisputes = async (req: AuthRequest, res: Response) => {
  try {
    const buyerId = req.user?.id;

    if (!buyerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const where: any = { buyerId };
    if (status) {
      where.status = status;
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          buyer: {
            select: { id: true, name: true, email: true },
          },
          seller: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching buyer disputes:', error);
    res.status(500).json({ message: 'Failed to fetch disputes' });
  }
};

// GET /api/disputes/seller — organizer sees disputes against them
export const getSellerDisputes = async (req: AuthRequest, res: Response) => {
  try {
    const sellerId = req.user?.id;

    if (!sellerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const where: any = { sellerId };
    if (status) {
      where.status = status;
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          buyer: {
            select: { id: true, name: true, email: true },
          },
          seller: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching seller disputes:', error);
    res.status(500).json({ message: 'Failed to fetch disputes' });
  }
};

// PATCH /api/disputes/:id/status — admin only
export const updateDisputeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    // Validate status
    const validStatuses = ['open', 'under_review', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Update dispute
    const dispute = await prisma.dispute.update({
      where: { id },
      data: {
        status,
        ...(resolution && { resolution }),
      },
      include: {
        buyer: {
          select: { id: true, name: true, email: true },
        },
        seller: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      message: 'Dispute status updated',
      dispute,
    });
  } catch (error) {
    console.error('Error updating dispute status:', error);
    if ((error as any).code === 'P2025') {
      return res.status(404).json({ message: 'Dispute not found' });
    }
    res.status(500).json({ message: 'Failed to update dispute' });
  }
};

// GET /api/disputes/admin — admin only, all disputes with filters
export const getAdminDisputes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    const status = req.query.status as string | undefined;
    const reason = req.query.reason as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (reason) {
      where.reason = reason;
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          buyer: {
            select: { id: true, name: true, email: true },
          },
          seller: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching admin disputes:', error);
    res.status(500).json({ message: 'Failed to fetch disputes' });
  }
};

// GET /api/disputes/:id — get single dispute by ID
export const getDisputeById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        buyer: {
          select: { id: true, name: true, email: true },
        },
        seller: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!dispute) {
      return res.status(404).json({ message: 'Dispute not found' });
    }

    // Check authorization: user must be admin, buyer, or seller
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isAuthorized =
      user?.role === 'ADMIN' ||
      dispute.buyerId === userId ||
      dispute.sellerId === userId;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(dispute);
  } catch (error) {
    console.error('Error fetching dispute:', error);
    res.status(500).json({ message: 'Failed to fetch dispute' });
  }
};
