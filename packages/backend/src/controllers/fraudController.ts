import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  getSaleFraudSignals,
  reviewSignal,
} from '../services/fraudDetectionService';
import { prisma } from '../lib/prisma';

/**
 * Feature #17: Fraud Controller
 * Handlers for fraud signal endpoints (organizer view + admin review)
 * Feature #107: Added suspendOrganizer / unsuspendOrganizer for chargeback auto-suspension
 */

export const getSaleFraudSignalsHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { saleId } = req.params;
    const { minScore = 30, status, page = 1, limit = 20 } = req.query;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const organizer = await prisma.organizer.findFirst({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!organizer || organizer.id !== sale.organizerId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const orgData = await prisma.organizer.findUnique({
      where: { id: organizer.id },
      select: { subscriptionTier: true },
    });

    if (!orgData || orgData.subscriptionTier !== 'PRO' && orgData.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ message: 'Fraud dashboard requires PRO tier' });
    }

    const result = await getSaleFraudSignals(
      saleId,
      parseInt(minScore as string) || 30,
      status as 'PENDING' | 'DISMISSED' | 'CONFIRMED' | undefined,
      parseInt(page as string) || 1,
      parseInt(limit as string) || 20
    );

    res.json(result);
  } catch (error) {
    console.error('[fraudController] getSaleFraudSignals error:', error);
    res.status(500).json({ message: 'Failed to fetch fraud signals' });
  }
};

export const reviewSignalHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { signalId } = req.params;
    const { outcome, notes } = req.body;

    if (!['DISMISSED', 'CONFIRMED'].includes(outcome)) {
      return res.status(400).json({ message: 'Invalid outcome. Must be DISMISSED or CONFIRMED' });
    }

    const signal = await prisma.fraudSignal.findUnique({
      where: { id: signalId },
      select: { id: true, saleId: true },
    });

    if (!signal) {
      return res.status(404).json({ message: 'Signal not found' });
    }

    if (req.user.role !== 'ADMIN') {
      const sale = await prisma.sale.findUnique({
        where: { id: signal.saleId },
        select: { organizerId: true },
      });

      const organizer = await prisma.organizer.findFirst({
        where: { userId: req.user.id },
        select: { id: true },
      });

      if (!organizer || organizer.id !== sale?.organizerId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    await reviewSignal(
      signalId,
      outcome as 'DISMISSED' | 'CONFIRMED',
      notes,
      req.user.role === 'ADMIN' ? req.user.id : undefined
    );

    const updated = await prisma.fraudSignal.findUnique({
      where: { id: signalId },
      include: {
        user: { select: { email: true, name: true } },
        item: { select: { title: true } },
      },
    });

    res.json({
      id: updated?.id,
      reviewedAt: updated?.reviewedAt,
      reviewedByAdminId: updated?.reviewedByAdminId,
      reviewOutcome: updated?.reviewOutcome,
      notes: updated?.notes,
    });
  } catch (error) {
    console.error('[fraudController] reviewSignal error:', error);
    res.status(500).json({ message: 'Failed to review signal' });
  }
};

/**
 * POST /api/admin/organizers/:id/suspend
 * Feature #107: Admin-initiated organizer suspension
 */
export const suspendOrganizer = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: 'Suspension reason required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const suspended = await prisma.user.update({
      where: { id: organizer.userId },
      data: { suspendedAt: new Date() },
    });

    await prisma.notification.create({
      data: {
        userId: organizer.userId,
        type: 'system',
        title: 'Account Suspended',
        body: `Your organizer account has been suspended. Reason: ${reason}. Contact support for details.`,
        read: false,
      },
    });

    console.log(`[fraudController] Organizer ${id} suspended: ${reason}`);

    res.json({ message: 'Organizer suspended', user: suspended });
  } catch (error) {
    console.error('suspendOrganizer error:', error);
    res.status(500).json({ message: 'Failed to suspend organizer' });
  }
};

/**
 * POST /api/admin/organizers/:id/unsuspend
 * Feature #107: Lift organizer suspension
 */
export const unsuspendOrganizer = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { id } = req.params;

    const organizer = await prisma.organizer.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const unsuspended = await prisma.user.update({
      where: { id: organizer.userId },
      data: { suspendedAt: null },
    });

    await prisma.notification.create({
      data: {
        userId: organizer.userId,
        type: 'system',
        title: 'Account Restored',
        body: 'Your organizer account has been restored. You can now continue using all features.',
        read: false,
      },
    });

    console.log(`[fraudController] Organizer ${id} unsuspended`);

    res.json({ message: 'Organizer unsuspended', user: unsuspended });
  } catch (error) {
    console.error('unsuspendOrganizer error:', error);
    res.status(500).json({ message: 'Failed to unsuspend organizer' });
  }
};
