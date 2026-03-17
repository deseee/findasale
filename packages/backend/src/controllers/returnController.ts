import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { requestReturn, resolveReturn } from '../services/returnService';

export const requestReturnHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { purchaseId, reason } = req.body;

    if (!purchaseId || !reason) {
      return res.status(400).json({ message: 'purchaseId and reason are required' });
    }

    const result = await requestReturn(purchaseId, reason, req.user.id);

    if (!result) {
      return res.status(400).json({
        message: 'Cannot create return request — purchase not found, return window closed, or request already exists',
      });
    }

    res.status(201).json({ returnRequest: result });
  } catch (error) {
    console.error('requestReturn error:', error);
    res.status(500).json({ message: 'Failed to create return request' });
  }
};

export const resolveReturnHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!id || !status) {
      return res.status(400).json({ message: 'id and status are required' });
    }

    if (!['APPROVED', 'DENIED'].includes(status)) {
      return res.status(400).json({ message: 'status must be APPROVED or DENIED' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const success = await resolveReturn(parseInt(id), status, organizer.id);

    if (!success) {
      return res.status(400).json({
        message: 'Cannot resolve return request — not found or unauthorized',
      });
    }

    res.json({ message: `Return request ${status.toLowerCase()}` });
  } catch (error) {
    console.error('resolveReturn error:', error);
    res.status(500).json({ message: 'Failed to resolve return request' });
  }
};

export const getReturnRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get return requests for user's purchases
    const returnRequests = await prisma.returnRequest.findMany({
      where: {
        purchase: {
          userId: req.user.id,
        },
      },
      include: {
        purchase: {
          select: {
            id: true,
            amount: true,
            createdAt: true,
            item: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    res.json({ returnRequests });
  } catch (error) {
    console.error('getReturnRequests error:', error);
    res.status(500).json({ message: 'Failed to fetch return requests' });
  }
};
