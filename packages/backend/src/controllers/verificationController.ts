import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * Request verification for the authenticated organizer
 * Requires: auth + PRO tier
 * Returns: 200 with status 'PENDING' or 409 if already pending/verified
 */
export const requestVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Organizer profile not found' });
    }

    const organizerId = req.user.organizerProfile.id;

    // Check current verification status
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // If already pending or verified, return 409
    if (organizer.verificationStatus === 'PENDING' || organizer.verificationStatus === 'VERIFIED') {
      return res.status(409).json({
        message: 'Verification already in progress or complete',
        status: organizer.verificationStatus
      });
    }

    // Update status to PENDING, clear notes
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        verificationStatus: 'PENDING',
        verificationNotes: null
      }
    });

    return res.json({
      message: 'Verification request submitted',
      status: 'PENDING'
    });
  } catch (error) {
    console.error('Request verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get verification status for the authenticated organizer
 * Requires: auth
 * Returns: { status, verificationNotes, verifiedAt }
 */
export const getVerificationStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.organizerProfile?.id) {
      return res.status(401).json({ message: 'Organizer profile not found' });
    }

    const organizerId = req.user.organizerProfile.id;

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: {
        verificationStatus: true,
        verificationNotes: true,
        verifiedAt: true
      }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    return res.json({
      status: organizer.verificationStatus,
      verificationNotes: organizer.verificationNotes,
      verifiedAt: organizer.verifiedAt
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin: Approve verification for an organizer
 * Requires: organizerId in params
 * Sets: verificationStatus = 'VERIFIED', verifiedAt = now, clears notes
 */
export const adminApproveVerification = async (req: Request, res: Response) => {
  try {
    const { organizerId } = req.params;

    if (!organizerId) {
      return res.status(400).json({ message: 'organizerId is required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Update to VERIFIED
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationNotes: null
      }
    });

    return res.json({
      message: 'Organizer verified'
    });
  } catch (error) {
    console.error('Admin approve verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Admin: Reject verification for an organizer
 * Requires: organizerId in params, optional reason in body
 * Sets: verificationStatus = 'REJECTED', verificationNotes = reason
 */
export const adminRejectVerification = async (req: Request, res: Response) => {
  try {
    const { organizerId } = req.params;
    const { reason } = req.body;

    if (!organizerId) {
      return res.status(400).json({ message: 'organizerId is required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Update to REJECTED
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        verificationStatus: 'REJECTED',
        verificationNotes: reason || null
      }
    });

    return res.json({
      message: 'Verification rejected'
    });
  } catch (error) {
    console.error('Admin reject verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
