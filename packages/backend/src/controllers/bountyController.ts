// V3: UGC Missing-listing bounties
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';
import { awardXp } from '../services/xpService';

/**
 * POST /api/bounties
 * Authenticated shoppers submit a missing-listing request.
 *
 * Organizer-style: { saleId, description, offerPrice? }
 * Shopper-first: { itemName, category, maxBudget, radiusMiles }
 */
export const createBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, description, offerPrice, itemName, category, maxBudget, radiusMiles, xpReward, referenceUrl } = req.body;
    const userId = req.user.id;

    // Determine if organizer-style (with saleId) or shopper-first (without saleId)
    const isOrganizerStyle = !!saleId;
    const isShopperFirst = !saleId && itemName && category;

    if (!isOrganizerStyle && !isShopperFirst) {
      return res.status(400).json({
        message: 'Either provide saleId + description (organizer) or itemName + category + maxBudget + radiusMiles (shopper-first).',
      });
    }

    // Organizer-style bounty validation
    if (isOrganizerStyle) {
      if (!description?.trim()) {
        return res.status(400).json({ message: 'description is required for organizer-style bounties.' });
      }

      const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { id: true, status: true } });
      if (!sale) return res.status(404).json({ message: 'Sale not found.' });
      if (sale.status === 'ENDED') {
        return res.status(400).json({ message: 'Cannot submit a bounty for an ended sale.' });
      }

      // One open bounty per user per sale (dedup)
      const existing = await prisma.missingListingBounty.findFirst({
        where: { saleId, userId, status: 'OPEN' },
      });
      if (existing) {
        return res.status(409).json({ message: 'You already have an open bounty for this sale.' });
      }
    }

    // Shopper-first bounty validation
    if (isShopperFirst) {
      if (!itemName?.trim() || !category?.trim()) {
        return res.status(400).json({ message: 'itemName and category are required for shopper-first bounties.' });
      }
      if (maxBudget == null || radiusMiles == null) {
        return res.status(400).json({ message: 'maxBudget and radiusMiles are required for shopper-first bounties.' });
      }
    }

    // Validate xpReward if provided
    const finalXpReward = xpReward != null ? Math.max(50, Number(xpReward)) : 25;

    const bounty = await prisma.missingListingBounty.create({
      data: {
        saleId: saleId || null,
        userId,
        description: description?.trim() || null,
        offerPrice: offerPrice != null ? Number(offerPrice) : null,
        itemName: itemName?.trim() || null,
        category: category?.trim() || null,
        maxBudget: maxBudget != null ? Number(maxBudget) : null,
        radiusMiles: radiusMiles != null ? Number(radiusMiles) : null,
        xpReward: finalXpReward,
        referenceUrl: referenceUrl?.trim() || null,
      },
      include: { user: { select: { name: true } } },
    });

    return res.status(201).json(bounty);
  } catch (error) {
    console.error('createBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/sale/:saleId
 * Organizers view all bounties for their sale.
 */
export const getSaleBounties = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    // Verify organizer owns this sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const bounties = await prisma.missingListingBounty.findMany({
      where: { saleId },
      include: {
        user: { select: { name: true, email: true } },
        item: { select: { id: true, title: true, price: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return res.json(bounties);
  } catch (error) {
    console.error('getSaleBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/my
 * Authenticated buyers view their own bounties.
 */
export const getMyBounties = async (req: AuthRequest, res: Response) => {
  try {
    const bounties = await prisma.missingListingBounty.findMany({
      where: { userId: req.user.id },
      include: {
        sale: { select: { id: true, title: true, address: true } },
        item: { select: { id: true, title: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(bounties);
  } catch (error) {
    console.error('getMyBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * PATCH /api/bounties/:id/fulfill
 * Organizer marks a bounty as fulfilled, optionally linking the listed item.
 * Body: { itemId?: string }
 */
export const fulfillBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;

    const bounty = await prisma.missingListingBounty.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } },
    });
    if (!bounty) return res.status(404).json({ message: 'Bounty not found.' });
    if (!bounty.sale) return res.status(400).json({ message: 'This bounty is not linked to a sale.' });
    if (bounty.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ message: 'Bounty is already closed.' });
    }

    // Optionally verify the item belongs to the same sale
    if (itemId) {
      const item = await prisma.item.findUnique({ where: { id: itemId }, select: { saleId: true } });
      if (!item || !item.saleId || item.saleId !== bounty.saleId) {
        return res.status(400).json({ message: 'Item does not belong to this sale.' });
      }
    }

    const updated = await prisma.missingListingBounty.update({
      where: { id },
      data: { status: 'FULFILLED', itemId: itemId || null },
      include: { item: { select: { id: true, title: true, price: true } } },
    });

    // Notify the shopper that their bounty has been fulfilled
    const itemLink = updated.item ? `/items/${updated.item.id}` : undefined;
    await createNotification(
      bounty.userId,
      'BOUNTY_FULFILLED',
      'Good news!',
      'Good news! An organizer found what you were looking for.',
      itemLink,
      'OPERATIONAL'
    );

    // Award XP to the bounty creator (shopper) for the bounty being fulfilled
    // Only applies to shopper-first bounties (no saleId), which don't pay cash rewards
    if (!bounty.saleId) {
      awardXp(bounty.userId, 'BOUNTY_FULFILLMENT_SHOPPER', XP_AWARDS.BOUNTY_FULFILLMENT_SHOPPER, {
        description: 'Bounty fulfilled'
      }).catch(err => console.error('[bountyController] XP award failed:', err));
    }

    return res.json(updated);
  } catch (error) {
    console.error('fulfillBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * DELETE /api/bounties/:id
 * Shopper cancels their own open bounty.
 */
export const cancelBounty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const bounty = await prisma.missingListingBounty.findUnique({ where: { id } });
    if (!bounty) return res.status(404).json({ message: 'Bounty not found.' });
    if (bounty.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your bounty.' });
    }
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ message: 'Bounty is already closed.' });
    }

    await prisma.missingListingBounty.update({ where: { id }, data: { status: 'CANCELLED' } });
    return res.json({ message: 'Bounty cancelled.' });
  } catch (error) {
    console.error('cancelBounty error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/local
 * Browse local bounties (ORGANIZER auth)
 * For MVP: returns all OPEN bounties not from this organizer's sales, sorted by newest.
 * Distance filtering skipped (sales may not have lat/lng yet).
 */
export const getLocalBounties = async (req: AuthRequest, res: Response) => {
  try {
    // Verify organizer
    if (!req.user?.id) return res.status(401).json({ message: 'Authentication required' });

    const { distance, category, offset, limit, sort } = req.query;
    const offsetNum = Math.max(0, parseInt(offset as string) || 0);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const sortBy = (sort as string) || 'newest_first';

    // Get organizer's sales to exclude bounties from their own sales
    const organizerSales = await prisma.sale.findMany({
      where: { organizer: { userId: req.user.id } },
      select: { id: true },
    });
    const organizerSaleIds = organizerSales.map((s: any) => s.id);

    // Build query for OPEN bounties not from organizer's sales
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'offer_price_desc') {
      orderBy = { offerPrice: 'desc' };
    } else if (sortBy === 'distance_asc') {
      // TODO: implement distance sorting once Sales have consistent lat/lng
      orderBy = { createdAt: 'desc' };
    }

    const bounties = await prisma.missingListingBounty.findMany({
      where: {
        status: 'OPEN',
        saleId: { notIn: organizerSaleIds },
        // TODO: add category filter if needed
      },
      include: {
        user: { select: { id: true, name: true, roles: true } },
        sale: { select: { id: true, title: true, startDate: true, lat: true, lng: true } },
        submissions: { where: { organizerId: req.user.id } },
      },
      orderBy,
      skip: offsetNum,
      take: limitNum,
    });

    // Count total
    const total = await prisma.missingListingBounty.count({
      where: {
        status: 'OPEN',
        saleId: { notIn: organizerSaleIds },
      },
    });

    // Format response
    const formattedBounties = bounties.map((b: any) => ({
      id: b.id,
      description: b.description,
      offerPrice: b.offerPrice,
      user: b.user,
      sale: b.sale,
      distance: null, // TODO: calculate if lat/lng available
      createdAt: b.createdAt,
      submissionCount: b.submissions.length,
      yourSubmission: b.submissions.length > 0 ? b.submissions[0] : null,
    }));

    return res.json({
      bounties: formattedBounties,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error('getLocalBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/bounties/:id/submissions
 * Submit item to bounty (ORGANIZER auth)
 */
export const submitBountySubmission = async (req: AuthRequest, res: Response) => {
  try {
    const { id: bountyId } = req.params;
    const { itemId, message } = req.body;
    const organizerId = req.user?.id;

    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });
    if (!itemId) return res.status(400).json({ message: 'itemId is required.' });

    // Fetch bounty
    const bounty = await prisma.missingListingBounty.findUnique({
      where: { id: bountyId },
      include: { sale: true },
    });
    if (!bounty) return res.status(404).json({ message: 'Bounty not found.' });
    if (bounty.status !== 'OPEN') {
      return res.status(400).json({ message: 'Bounty is not open.' });
    }

    // Fetch item
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: true },
    });
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (item.sale!.organizerId !== organizerId) {
      return res.status(403).json({ message: 'Item does not belong to you.' });
    }
    if (item.status === 'DRAFT') {
      return res.status(400).json({ message: 'Item must be published.' });
    }

    // Check for existing pending submission by this organizer for this bounty
    const existingSubmission = await prisma.bountySubmission.findFirst({
      where: {
        bountyId,
        organizerId,
        status: { in: ['PENDING_REVIEW', 'APPROVED'] },
      },
    });
    if (existingSubmission) {
      return res.status(409).json({ message: 'You already have a pending submission for this bounty.' });
    }

    // Create submission with 3-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    const submission = await prisma.bountySubmission.create({
      data: {
        bountyId,
        organizerId,
        itemId,
        status: 'PENDING_REVIEW',
        shopperMessage: message || null,
        expiresAt,
      },
    });

    // Notify shopper
    await createNotification(
      bounty.userId,
      'BOUNTY_SUBMISSION',
      'New Submission',
      `Someone found an item matching your request!`,
      `/bounties/submissions/${submission.id}`,
      'OPERATIONAL'
    );

    return res.status(201).json(submission);
  } catch (error) {
    console.error('submitBountySubmission error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/submissions
 * Shopper view their submissions (auth required)
 * Returns submissions for bounties owned by the authenticated user
 */
export const getMySubmissions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const { status, sort, limit } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    let orderBy: any = { submittedAt: 'desc' };
    if (sort === 'expiring_soonest') {
      orderBy = { expiresAt: 'asc' };
    }

    const submissions = await prisma.bountySubmission.findMany({
      where: {
        bounty: { userId },
        ...(status ? { status: status as string } : { status: 'PENDING_REVIEW' }),
      },
      include: {
        bounty: { select: { id: true, description: true, offerPrice: true, createdAt: true } },
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            saleId: true,
            photoUrls: true,
          },
        },
        organizer: { select: { id: true, name: true } },
      },
      orderBy,
      take: limitNum,
    });

    // Count unreviewed (PENDING_REVIEW)
    const unreviewed = await prisma.bountySubmission.count({
      where: {
        bounty: { userId },
        status: 'PENDING_REVIEW',
      },
    });

    const total = await prisma.bountySubmission.count({
      where: {
        bounty: { userId },
        ...(status ? { status: status as string } : {}),
      },
    });

    // Format response
    const formattedSubmissions = submissions.map((s: any) => ({
      id: s.id,
      bounty: s.bounty,
      item: s.item,
      organizer: s.organizer,
      message: s.shopperMessage,
      status: s.status,
      submittedAt: s.submittedAt,
      expiresAt: s.expiresAt,
      xpCost: s.bounty.xpReward ? s.bounty.xpReward * 2 : 50,
    }));

    return res.json({
      submissions: formattedSubmissions,
      total,
      unreviewed,
    });
  } catch (error) {
    console.error('getMySubmissions error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * PATCH /api/bounties/submissions/:id
 * Shopper approve/decline submission (auth required, owner of bounty)
 */
export const approveDeclineSubmission = async (req: AuthRequest, res: Response) => {
  try {
    const { id: submissionId } = req.params;
    const { action } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    if (!action || !['APPROVE', 'DECLINE'].includes(action)) {
      return res.status(400).json({ message: 'action must be APPROVE or DECLINE.' });
    }

    // Fetch submission with bounty to verify ownership
    const submission = await prisma.bountySubmission.findUnique({
      where: { id: submissionId },
      include: { bounty: true },
    });
    if (!submission) return res.status(404).json({ message: 'Submission not found.' });
    if (submission.bounty.userId !== userId) {
      return res.status(403).json({ message: 'Not your bounty.' });
    }
    if (!['PENDING_REVIEW', 'APPROVED'].includes(submission.status)) {
      return res.status(400).json({ message: 'Submission cannot be reviewed.' });
    }

    if (action === 'APPROVE') {
      // Mark as approved
      const updated = await prisma.bountySubmission.update({
        where: { id: submissionId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
        },
      });

      return res.json({
        id: updated.id,
        status: updated.status,
        checkoutUrl: null, // TODO: integrate Stripe
      });
    } else {
      // DECLINE: reject but keep bounty open
      const updated = await prisma.bountySubmission.update({
        where: { id: submissionId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
        },
      });

      // Notify organizer
      await createNotification(
        submission.organizerId,
        'BOUNTY_DECLINED',
        'Submission Declined',
        'A shopper declined your submission. Keep looking!',
        `/bounties/submissions`,
        'OPERATIONAL'
      );

      return res.json({
        id: updated.id,
        status: updated.status,
        message: 'Bounty remains open',
      });
    }
  } catch (error) {
    console.error('approveDecllineSubmission error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Haversine distance calculation (miles)
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * POST /api/bounties/match
 * Auto-match item against bounties (ORGANIZER auth)
 * Improved scoring algorithm per spec §1:
 * - Category match: +30 points
 * - Title keyword overlap: +20 points per matching word (cap at 40)
 * - Tag overlap: +10 points per matching tag (cap at 20)
 * - Within 25mi radius: +10 points; outside 25mi: skip entirely
 * - Recency bonus (bounty posted <7 days): +5 points
 * - Confidence threshold: 60 points minimum
 */
export const matchItemToBounties = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.body;
    const organizerId = req.user?.id;

    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });
    if (!itemId) return res.status(400).json({ message: 'itemId is required.' });

    // Fetch item with full details
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { select: { id: true, lat: true, lng: true, organizerId: true } } },
    });
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    if (!item.sale || item.sale.organizerId !== organizerId) {
      return res.status(403).json({ message: 'Item does not belong to you.' });
    }

    const itemLat = item.sale.lat;
    const itemLng = item.sale.lng;

    // Query for OPEN bounties within 90 days, not from organizer's own sales, with non-ended sales
    const candidateBounties = await prisma.missingListingBounty.findMany({
      where: {
        status: 'OPEN',
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        sale: {
          status: { not: 'ENDED' },
          organizer: { userId: { not: organizerId } }, // Exclude organizer's own bounties
        },
      },
      include: {
        user: { select: { id: true, name: true } },
        sale: { select: { id: true, lat: true, lng: true } },
      },
    });

    // Score each bounty
    const scoredMatches = candidateBounties
      .map((bounty: any) => {
        let score = 0;

        // Only include bounties within 25 miles (skip entirely if outside)
        if (itemLat && itemLng && bounty.sale?.lat && bounty.sale?.lng) {
          const distance = haversineDistance(itemLat, itemLng, bounty.sale.lat, bounty.sale.lng);
          if (distance > 25) {
            return null; // Skip bounties outside 25 mile radius
          }
          score += 10; // Within 25mi: +10 points
        }

        // Category match: +30 points (if both have category)
        if (item.category && bounty.category && item.category.toLowerCase() === bounty.category.toLowerCase()) {
          score += 30;
        }

        // Title keyword overlap: +20 points per matching word (cap at 40)
        const itemTitleWords = (item.title || '')
          .toLowerCase()
          .split(/\s+/)
          .filter((w: any) => w.length > 2);
        const bountyDescriptionWords = (bounty.description || '')
          .toLowerCase()
          .split(/\s+/)
          .filter((w: any) => w.length > 2);
        const titleOverlapCount = itemTitleWords.filter((w: any) => bountyDescriptionWords.includes(w)).length;
        score += Math.min(titleOverlapCount * 20, 40);

        // Tag overlap: +10 points per matching tag (cap at 20)
        if (item.tags && item.tags.length > 0 && bounty.category) {
          const itemTagsLower = item.tags.map((t: string) => t.toLowerCase());
          const bountyTagsLower = bounty.category.toLowerCase().split(/\s+/);
          const tagOverlapCount = itemTagsLower.filter((t: string) => bountyTagsLower.some((bt: string) => t.includes(bt))).length;
          score += Math.min(tagOverlapCount * 10, 20);
        }

        // Recency bonus: +5 points if bounty posted <7 days ago
        const daysSinceCreation = (Date.now() - bounty.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 7) {
          score += 5;
        }

        const confidence = score / 100; // Convert to 0–1 scale for display

        return {
          bountyId: bounty.id,
          title: bounty.description,
          reward: bounty.xpReward,
          shopperName: bounty.user.name,
          score,
          confidence: Math.round(confidence * 100) / 100, // Display as percentage (0.0–1.0)
        };
      })
      .filter((m: any) => m !== null && m.score >= 60) // Filter by threshold (60 points)
      .sort((a: any, b: any) => b.score - a.score) // Sort descending by score
      .slice(0, 5); // Top 5

    return res.json({ matches: scoredMatches });
  } catch (error) {
    console.error('matchItemToBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/community
 * Browse community bounties (shopper-created, no saleId)
 * Filter by category and radius
 */
export const getCommunityBounties = async (req: AuthRequest, res: Response) => {
  try {
    const { category, radiusMiles, offset = '0', limit = '20' } = req.query;

    const where: any = { saleId: null, status: 'OPEN' };

    if (category && category !== '') {
      where.category = category as string;
    }

    if (radiusMiles) {
      where.radiusMiles = { lte: Number(radiusMiles) };
    }

    const [bounties, total] = await Promise.all([
      prisma.missingListingBounty.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: Number(offset),
        take: Math.min(100, Number(limit) || 20),
      }),
      prisma.missingListingBounty.count({ where }),
    ]);

    // Map to include all fields including referenceUrl
    const formattedBounties = bounties.map((b: any) => ({
      id: b.id,
      itemName: b.itemName,
      description: b.description,
      category: b.category,
      maxBudget: b.maxBudget,
      radiusMiles: b.radiusMiles,
      xpReward: b.xpReward,
      referenceUrl: b.referenceUrl,
      status: b.status,
      user: b.user,
      createdAt: b.createdAt,
    }));

    return res.json({
      bounties: formattedBounties,
      total,
      limit: Math.min(100, Number(limit) || 20),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('getCommunityBounties error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/bounties/submissions/:id/purchase
 * Complete bounty purchase (auth required, owner of bounty)
 * For MVP: just update statuses and create PointsTransaction records
 * Stripe integration can be wired later
 */
export const completeBountyPurchase = async (req: AuthRequest, res: Response) => {
  try {
    const { id: submissionId } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    // Fetch submission with bounty
    const submission = await prisma.bountySubmission.findUnique({
      where: { id: submissionId },
      include: {
        bounty: true,
        item: true,
        organizer: true,
      },
    });
    if (!submission) return res.status(404).json({ message: 'Submission not found.' });
    if (submission.bounty.userId !== userId) {
      return res.status(403).json({ message: 'Not your bounty.' });
    }
    if (!['PENDING_REVIEW', 'APPROVED'].includes(submission.status)) {
      return res.status(400).json({ message: 'Submission cannot be purchased.' });
    }

    const xpCost = submission.bounty.xpReward ? submission.bounty.xpReward * 2 : 50;
    const organizerXpAward = submission.bounty.xpReward || 25;

    // Award XP to shopper (deduction as negative)
    await awardXp(userId, 'BOUNTY_PURCHASE', -xpCost, {
      description: `Paid for bounty submission: ${submission.bounty.description}`,
    });

    // Award XP to organizer
    await awardXp(submission.organizerId, 'BOUNTY_SUBMISSION_PURCHASED', organizerXpAward, {
      description: `Earned from bounty submission for: ${submission.bounty.description}`,
    });

    // Update submission status
    const updated = await prisma.bountySubmission.update({
      where: { id: submissionId },
      data: {
        status: 'PURCHASED',
        purchasedAt: new Date(),
      },
    });

    // Update bounty status to FULFILLED
    await prisma.missingListingBounty.update({
      where: { id: submission.bountyId },
      data: { status: 'FULFILLED', itemId: submission.itemId },
    });

    // Notify organizer of purchase
    await createNotification(
      submission.organizerId,
      'BOUNTY_PURCHASED',
      'Bounty Purchased!',
      `Your submission was purchased! You earned ${organizerXpAward} XP.`,
      `/bounties/submissions`,
      'OPERATIONAL'
    );

    return res.json({
      orderId: null, // TODO: create Order record
      bountyId: submission.bountyId,
      submissionId: updated.id,
      status: updated.status,
      xpDeducted: xpCost,
      organizerXpAwarded: organizerXpAward,
    });
  } catch (error) {
    console.error('completeBountyPurchase error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/bounties/organizer/submissions
 * Organizer view their bounty submissions (past 30 days)
 * Returns submissions for items that belong to the organizer's sales
 */
export const getOrganizerSubmissions = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.id;
    if (!organizerId) return res.status(401).json({ message: 'Authentication required' });

    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Query submissions where the item belongs to one of the organizer's sales
    const submissions = await prisma.bountySubmission.findMany({
      where: {
        submittedAt: { gte: thirtyDaysAgo },
        item: {
          sale: {
            organizerId,
          },
        },
      },
      include: {
        bounty: {
          select: {
            id: true,
            description: true,
            offerPrice: true,
            xpReward: true,
            createdAt: true,
          },
        },
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            photoUrls: true,
            saleId: true,
          },
        },
        organizer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    // Count total submissions in the same criteria
    const total = await prisma.bountySubmission.count({
      where: {
        submittedAt: { gte: thirtyDaysAgo },
        item: {
          sale: {
            organizerId,
          },
        },
      },
    });

    // Format response to match frontend expectations
    const formattedSubmissions = submissions.map((s: any) => ({
      id: s.id,
      bounty: s.bounty,
      item: s.item,
      organizer: s.organizer,
      message: s.shopperMessage,
      status: s.status,
      submittedAt: s.submittedAt,
      expiresAt: s.expiresAt,
      xpCost: s.bounty.xpReward ? s.bounty.xpReward * 2 : 50,
    }));

    return res.json({
      submissions: formattedSubmissions,
      total,
    });
  } catch (error) {
    console.error('getOrganizerSubmissions error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};
