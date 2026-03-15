import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const getReminderForSale = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { saleId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reminder = await prisma.saleReminder.findFirst({
      where: { userId, saleId },
    });

    return res.json({ reminder });
  } catch (error) {
    console.error('Error getting reminder:', error);
    return res.status(500).json({ error: 'Failed to get reminder' });
  }
};

export const createReminder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { saleId, reminderType = 'email' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!saleId) {
      return res.status(400).json({ error: 'saleId is required' });
    }

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Upsert: create or reactivate
    const reminder = await prisma.saleReminder.upsert({
      where: {
        userId_saleId_reminderType: { userId, saleId, reminderType },
      },
      update: { status: 'ACTIVE' },
      create: { userId, saleId, reminderType, status: 'ACTIVE' },
    });

    return res.status(201).json({ reminder });
  } catch (error) {
    console.error('Error creating reminder:', error);
    return res.status(500).json({ error: 'Failed to create reminder' });
  }
};

export const deleteReminder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { reminderId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reminder = await prisma.saleReminder.findUnique({ where: { id: reminderId } });

    if (!reminder || reminder.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.saleReminder.delete({ where: { id: reminderId } });

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return res.status(500).json({ error: 'Failed to delete reminder' });
  }
};
