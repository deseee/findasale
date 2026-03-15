import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticateToken } from '../middleware/auth';

export const getReminderForSale = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { saleId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reminder = await prisma.saleReminder.findUnique({
      where: {
        userId_saleId_reminderType: {
          userId,
          saleId,
          reminderType: 'email',
        },
      },
    });

    return res.json({ reminder });
  } catch (error) {
    console.error('Error getting reminder:', error);
    return res.status(500).json({ error: 'Failed to get reminder' });
  }
};

export const createReminder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { saleId, reminderType = 'email' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!saleId) {
      return res.status(400).json({ error: 'saleId is required' });
    }

    // Check if sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Create or reactivate reminder
    const reminder = await prisma.saleReminder.upsert({
      where: {
        userId_saleId_reminderType: {
          userId,
          saleId,
          reminderType,
        },
      },
      update: { status: 'ACTIVE' },
      create: {
        userId,
        saleId,
        reminderType,
        status: 'ACTIVE',
      },
    });

    return res.status(201).json({ reminder });
  } catch (error) {
    console.error('Error creating reminder:', error);
    return res.status(500).json({ error: 'Failed to create reminder' });
  }
};

export const deleteReminder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { reminderId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify ownership before deleting
    const reminder = await prisma.saleReminder.findUnique({
      where: { id: reminderId },
    });

    if (!reminder || reminder.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.saleReminder.delete({
      where: { id: reminderId },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return res.status(500).json({ error: 'Failed to delete reminder' });
  }
};
