/**
 * Feature #XXX: Verified Social Share XP System Controller
 *
 * Endpoints for generating shareable sale links and tracking verified clicks with XP awards.
 * XP is awarded only to authenticated users (2 XP per unique click, capped at 20 XP per link).
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { awardXp, XP_AWARDS } from '../services/xpService';
import crypto from 'crypto';

/**
 * Generate a random 10-character code for share links
 */
function generateShareCode(): string {
  return crypto.randomBytes(5).toString('hex');
}

/**
 * POST /api/sales/:saleId/share-link
 * Generate or retrieve a share link for this sale (any authenticated user)
 */
export const generateShareLink = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId } = req.params;

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Check if link already exists for this user + sale
    let shareLink = await prisma.saleShareLink.findUnique({
      where: {
        saleId_userId: {
          saleId,
          userId: req.user.id,
        },
      },
    });

    // If not, create a new one
    if (!shareLink) {
      let code = generateShareCode();
      let attempts = 0;
      const maxAttempts = 10;

      // Retry if code collision (extremely unlikely but handle it)
      while (attempts < maxAttempts) {
        const existing = await prisma.saleShareLink.findUnique({
          where: { code },
        });

        if (!existing) {
          break;
        }

        code = generateShareCode();
        attempts++;
      }

      if (attempts >= maxAttempts) {
        console.error('[shareLinks] Failed to generate unique code after 10 attempts');
        return res.status(500).json({ message: 'Failed to generate share link' });
      }

      shareLink = await prisma.saleShareLink.create({
        data: {
          saleId,
          userId: req.user.id,
          code,
        },
      });
    }

    // Return link info
    res.status(200).json({
      id: shareLink.id,
      code: shareLink.code,
      url: `https://finda.sale/sales/${saleId}?share=${shareLink.code}`,
      totalClicks: shareLink.totalClicks,
      uniqueClicks: shareLink.uniqueClicks,
      totalXpAwarded: shareLink.totalXpAwarded,
    });
  } catch (error) {
    console.error('[shareLinks] generateShareLink error:', error);
    res.status(500).json({ message: 'Server error while generating share link' });
  }
};

/**
 * GET /api/sales/:saleId/share-link
 * Retrieve existing share link for this sale (any authenticated user)
 */
export const getShareLink = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId } = req.params;

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Fetch the link
    const shareLink = await prisma.saleShareLink.findUnique({
      where: {
        saleId_userId: {
          saleId,
          userId: req.user.id,
        },
      },
    });

    if (!shareLink) {
      return res.status(404).json({ message: 'Share link not found' });
    }

    res.status(200).json({
      id: shareLink.id,
      code: shareLink.code,
      url: `https://finda.sale/sales/${saleId}?share=${shareLink.code}`,
      totalClicks: shareLink.totalClicks,
      uniqueClicks: shareLink.uniqueClicks,
      totalXpAwarded: shareLink.totalXpAwarded,
    });
  } catch (error) {
    console.error('[shareLinks] getShareLink error:', error);
    res.status(500).json({ message: 'Server error while fetching share link' });
  }
};

/**
 * GET /api/share/:code
 * Public endpoint: Record a click on a share link and award XP if applicable
 * Redirects to the sale page after recording the click
 *
 * Auth: optional — reads user ID if authenticated, treats as anonymous otherwise
 */
export const recordShareClick = async (req: Request | AuthRequest, res: Response) => {
  try {
    const { code } = req.params;
    const authReq = req as AuthRequest;
    const clickerId = authReq.user?.id || null;

    // Find the share link by code
    const shareLink = await prisma.saleShareLink.findUnique({
      where: { code },
      select: {
        id: true,
        saleId: true,
        userId: true,
        totalClicks: true,
        uniqueClicks: true,
        totalXpAwarded: true,
      },
    });

    if (!shareLink) {
      return res.status(404).json({ message: 'Share link not found' });
    }

    // Increment total clicks atomically
    await prisma.saleShareLink.update({
      where: { id: shareLink.id },
      data: {
        totalClicks: { increment: 1 },
      },
    });

    // Award XP only if:
    // 1. User is authenticated
    // 2. User is not the link creator (not self-click)
    // 3. XP hasn't already been awarded for this user+link pair
    // 4. Total XP awarded is still < 20
    if (clickerId && clickerId !== shareLink.userId && shareLink.totalXpAwarded < 20) {
      // Check if this clicker already has a record for this link
      const existing = await prisma.saleShareLinkClick.findUnique({
        where: {
          shareLinkId_clickerId: {
            shareLinkId: shareLink.id,
            clickerId,
          },
        },
      });

      // If no existing record, award XP
      if (!existing) {
        // Calculate XP to award (min of 2 and remaining cap)
        const xpToAward = Math.min(2, 20 - shareLink.totalXpAwarded);

        // Create click record with XP
        await prisma.saleShareLinkClick.create({
          data: {
            shareLinkId: shareLink.id,
            clickerId,
            xpAwarded: xpToAward,
          },
        });

        // Award XP to the link creator
        await awardXp(shareLink.userId, 'SHARE', xpToAward, {
          saleId: shareLink.saleId,
          description: `Verified share link click from user ${clickerId}`,
        });

        // Update link counters atomically
        await prisma.saleShareLink.update({
          where: { id: shareLink.id },
          data: {
            uniqueClicks: { increment: 1 },
            totalXpAwarded: { increment: xpToAward },
          },
        });
      }
    }

    // Redirect to sale page
    res.redirect(302, `/sales/${shareLink.saleId}`);
  } catch (error) {
    console.error('[shareLinks] recordShareClick error:', error);
    res.status(500).json({ message: 'Server error while recording share click' });
  }
};
