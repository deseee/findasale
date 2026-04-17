import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { awardXp, XP_AWARDS, checkDailyXpCap } from '../services/xpService';

/**
 * Feature #85: Treasure Hunt QR Controller
 * Per-sale organizer-created QR code scavenger hunt system
 */

/**
 * POST /sales/:saleId/treasure-hunt-qr
 * Organizer creates a new clue
 * Auth: organizer must own the sale
 */
export async function createClue(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId } = req.params;
    const { clueText, hintPhoto, category } = req.body;

    if (!clueText) {
      return res.status(400).json({ message: 'clueText is required' });
    }

    // Verify organizer owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Not authorized to manage this sale' });
    }

    // Create the clue
    const clue = await prisma.treasureHuntQRClue.create({
      data: {
        saleId,
        clueText,
        hintPhoto: hintPhoto || null,
        category: category || null,
      },
    });

    // Generate QR URL
    const qrUrl = `https://finda.sale/sales/${saleId}/treasure-hunt-qr/${clue.id}?scan=true`;

    res.status(201).json({
      id: clue.id,
      clueText: clue.clueText,
      hintPhoto: clue.hintPhoto,
      category: clue.category,
      qrUrl,
      createdAt: clue.createdAt,
    });
  } catch (err) {
    console.error('POST /sales/:saleId/treasure-hunt-qr error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * GET /sales/:saleId/treasure-hunt-qr
 * Shopper lists all clues for a sale (public, no auth required)
 * DO NOT return clueText — keep it mysterious!
 */
export async function listClues(req: Request, res: Response) {
  try {
    const { saleId } = req.params;

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const clues = await prisma.treasureHuntQRClue.findMany({
      where: { saleId },
      select: {
        id: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ clues });
  } catch (err) {
    console.error('GET /sales/:saleId/treasure-hunt-qr error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * DELETE /sales/:saleId/treasure-hunt-qr/:clueId
 * Organizer deletes a clue
 * Auth: organizer must own the sale
 */
export async function deleteClue(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId, clueId } = req.params;

    // Verify organizer owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Verify clue belongs to this sale
    const clue = await prisma.treasureHuntQRClue.findUnique({
      where: { id: clueId },
      select: { saleId: true },
    });

    if (!clue) {
      return res.status(404).json({ message: 'Clue not found' });
    }

    if (clue.saleId !== saleId) {
      return res.status(404).json({ message: 'Clue not found in this sale' });
    }

    // Delete the clue (cascades to scans)
    await prisma.treasureHuntQRClue.delete({
      where: { id: clueId },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /sales/:saleId/treasure-hunt-qr/:clueId error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * GET /sales/:saleId/treasure-hunt-qr/:clueId
 * Authenticated shopper views a single clue detail
 */
export async function getClue(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId, clueId } = req.params;

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Get the clue
    const clue = await prisma.treasureHuntQRClue.findUnique({
      where: { id: clueId },
    });

    if (!clue) {
      return res.status(404).json({ message: 'Clue not found' });
    }

    if (clue.saleId !== saleId) {
      return res.status(404).json({ message: 'Clue not found in this sale' });
    }

    res.json({
      id: clue.id,
      clueText: clue.clueText,
      hintPhoto: clue.hintPhoto,
      category: clue.category,
    });
  } catch (err) {
    console.error('GET /sales/:saleId/treasure-hunt-qr/:clueId error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * POST /sales/:saleId/treasure-hunt-qr/:clueId/found
 * Shopper marks a clue as found and earns XP
 * Logic:
 * 1. Check if already scanned (unique userId, clueId)
 * 2. Create scan record
 * 3. Award 25 XP
 * 4. Check for completion: if all clues found + badge enabled, award 50 bonus
 * 5. Return progress info
 */
export async function markClueFound(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId, clueId } = req.params;

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, treasureHuntCompletionBadge: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Verify clue exists and belongs to this sale
    const clue = await prisma.treasureHuntQRClue.findUnique({
      where: { id: clueId },
    });

    if (!clue) {
      return res.status(404).json({ message: 'Clue not found' });
    }

    if (clue.saleId !== saleId) {
      return res.status(404).json({ message: 'Clue not found in this sale' });
    }

    // Check if user already scanned this clue
    const existingScan = await prisma.treasureHuntQRScan.findUnique({
      where: {
        userId_clueId: {
          userId: req.user.id,
          clueId,
        },
      },
    });

    if (existingScan) {
      // Already found, return 200 with alreadyFound flag
      const totalClues = await prisma.treasureHuntQRClue.count({
        where: { saleId },
      });

      const userScans = await prisma.treasureHuntQRScan.count({
        where: {
          userId: req.user.id,
          clue: { saleId },
        },
      });

      return res.json({
        alreadyFound: true,
        xpEarned: 0,
        bonus: 0,
        completed: userScans >= totalClues,
        totalProgress: `${userScans}/${totalClues}`,
      });
    }

    // Create scan record
    await prisma.treasureHuntQRScan.create({
      data: {
        userId: req.user.id,
        clueId,
      },
    });

    // Award XP for the clue (respecting daily cap: 100 XP/day, 150 with Hunt Pass)
    let xpEarned = 0;
    let rankIncreased = false;
    let newRank: string | undefined;
    try {
      const dailyRemaining = await checkDailyXpCap(req.user.id, 'TREASURE_HUNT_SCAN');
      const xpToAward = Math.min(XP_AWARDS.TREASURE_HUNT_SCAN, dailyRemaining);
      if (xpToAward > 0) {
        const xpResult = await awardXp(req.user.id, 'TREASURE_HUNT_SCAN', xpToAward, {
          saleId,
          description: `Treasure Hunt QR Clue found: ${clueId}`,
        });
        xpEarned = xpToAward;
        if (xpResult) {
          rankIncreased = xpResult.rankIncreased;
          newRank = xpResult.newRank;
        }
      }
    } catch (err) {
      console.warn('[treasureHuntQR] Failed to award scan XP:', err);
    }

    // Check for completion
    const totalClues = await prisma.treasureHuntQRClue.count({
      where: { saleId },
    });

    const userScans = await prisma.treasureHuntQRScan.count({
      where: {
        userId: req.user.id,
        clue: { saleId },
      },
    });

    let bonusXp = 0;
    let bonusRankIncreased = false;
    let bonusNewRank: string | undefined;
    const completed = userScans >= totalClues;

    if (completed && sale.treasureHuntCompletionBadge) {
      // Award completion bonus XP (no daily cap for completion bonus — one-time per hunt)
      try {
        bonusXp = XP_AWARDS.TREASURE_HUNT_COMPLETION;
        const bonusResult = await awardXp(req.user.id, 'TREASURE_HUNT_COMPLETION', XP_AWARDS.TREASURE_HUNT_COMPLETION, {
          saleId,
          description: `Treasure Hunt QR completed: ${saleId}`,
        });
        if (bonusResult) {
          bonusRankIncreased = bonusResult.rankIncreased;
          bonusNewRank = bonusResult.newRank;
        }
      } catch (err) {
        console.warn('[treasureHuntQR] Failed to award completion bonus XP:', err);
      }
    }

    // Use completion rank change if it happened, otherwise scan rank change
    const finalRankIncreased = bonusRankIncreased || rankIncreased;
    const finalNewRank = bonusNewRank || newRank;

    res.json({
      xpEarned,
      bonus: bonusXp,
      completed,
      totalProgress: `${userScans}/${totalClues}`,
      rankIncreased: finalRankIncreased,
      newRank: finalNewRank,
    });
  } catch (err) {
    console.error('POST /sales/:saleId/treasure-hunt-qr/:clueId/found error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

/**
 * GET /sales/:saleId/treasure-hunt-qr/progress
 * Get authenticated shopper's progress on this sale's treasure hunt
 */
export async function getProgress(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { saleId } = req.params;

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, treasureHuntCompletionBadge: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Count total clues
    const totalClues = await prisma.treasureHuntQRClue.count({
      where: { saleId },
    });

    // Count user's scans
    const cluesFound = await prisma.treasureHuntQRScan.count({
      where: {
        userId: req.user.id,
        clue: { saleId },
      },
    });

    res.json({
      cluesFound,
      totalClues,
      progress: `${cluesFound}/${totalClues}`,
      completionBonus: sale.treasureHuntCompletionBadge && cluesFound >= totalClues,
    });
  } catch (err) {
    console.error('GET /sales/:saleId/treasure-hunt-qr/progress error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}
