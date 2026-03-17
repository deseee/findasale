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
 */

/**
 * GET /api/fraud/sale/:saleId
 * Organizer views fraud signals for their sale (PRO tier required)
 */
export const getSaleFraudSignalsHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { saleId } = req.params;
    const { minScore = 30, status, page = 1, limit = 20 } = req.query;

    // Verify the user owns this sale (organizer check)
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Get organizer info
    const organizer = await prisma.organizer.findFirst({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!organizer || organizer.id !== sale.organizerId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check PRO tier
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

/**
 * POST /api/fraud/signals/:signalId/review
 * Organizer or admin marks a signal as reviewed
 */
export const reviewSignalHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { signalId } = req.params;
    const { outcome, notes } = req.body;

    // Validate outcome
    if (!['DISMISSED', 'CONFIRMED'].includes(outcome)) {
      return res.status(400).json({ message: 'Invalid outcome. Must be DISMISSED or CONFIRMED' });
    }

    // Get signal
    const signal = await prisma.fraudSignal.findUnique({
      where: { id: signalId },
      select: { id: true, saleId: true },
    });

    if (!signal) {
      return res.status(404).json({ message: 'Signal not found' });
    }

    // Verify access: organizer owns the sale or user is admin
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

    // Update signal
    await reviewSignal(
      signalId,
      outcome as 'DISMISSED' | 'CONFIRMED',
      notes,
      req.user.role === 'ADMIN' ? req.user.id : undefined
    );

    // Fetch and return updated signal
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
