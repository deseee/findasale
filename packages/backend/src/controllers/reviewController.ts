import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// POST /api/reviews — authenticated shoppers only, one review per sale
export const createReview = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, rating, comment } = req.body;
    const userId = req.user.id;

    if (!saleId || rating === undefined) {
      return res.status(400).json({ message: 'saleId and rating are required.' });
    }
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: 'Rating must be an integer between 1 and 5.' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true, id: true } } },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found.' });

    // Organizers cannot review their own sales
    if (sale.organizer.userId === userId) {
      return res.status(403).json({ message: 'Organizers cannot review their own sales.' });
    }

    // One review per user per sale
    const existing = await prisma.review.findFirst({ where: { userId, saleId } });
    if (existing) {
      return res.status(409).json({ message: 'You have already reviewed this sale.' });
    }

    // #115: Verified Purchase Badge — check if user has purchased from this sale
    const purchase = await prisma.purchase.findFirst({
      where: {
        userId,
        saleId,
        status: { in: ['PAID', 'COMPLETED'] }
      }
    });
    const verifiedPurchase = !!purchase;

    // #116: Review Timing Anomaly Detection
    let timingFlag: string | null = null;
    let moderationStatus = 'APPROVED';
    const reviewerIp = (req as any).ip || '0.0.0.0';

    // Check for rapid submission (within 1 hour of purchase)
    if (purchase && (new Date().getTime() - purchase.createdAt.getTime()) < 3600000) {
      timingFlag = 'RAPID';
      moderationStatus = 'PENDING';
    }

    // Check for bulk reviews from same IP in last 24h
    if (!timingFlag && reviewerIp) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentReviewsFromIp = await prisma.review.count({
        where: {
          reviewerIp: reviewerIp,
          createdAt: { gte: oneDayAgo }
        }
      });
      if (recentReviewsFromIp >= 3) {
        timingFlag = 'BULK';
        moderationStatus = 'PENDING';
      }
    }

    const review = await prisma.review.create({
      data: {
        userId,
        saleId,
        rating: ratingNum,
        comment: comment?.trim() || null,
        verifiedPurchase,
        timingFlag,
        reviewerIp,
        moderationStatus,
      },
      include: { user: { select: { name: true } } },
    });

    // Recalculate organizer avgRating + totalReviews
    const allReviews = await prisma.review.findMany({
      where: { sale: { organizerId: sale.organizer.id } },
      select: { rating: true },
    });
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await prisma.organizer.update({
      where: { id: sale.organizer.id },
      data: {
        avgRating: Math.round(avg * 10) / 10,
        totalReviews: allReviews.length,
      },
    });


    return res.status(201).json(review);
  } catch (error) {
    console.error('Create review error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/reviews/sale/:saleId — public, paginated
export const getSaleReviews = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const limit = Math.min(50, parseInt(String(req.query.limit || '10')));
    const skip = (page - 1) * limit;

    // #116: Filter out PENDING moderation reviews from public view
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: {
          saleId,
          moderationStatus: 'APPROVED' // Only show approved reviews to public
        },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.review.count({
        where: {
          saleId,
          moderationStatus: 'APPROVED'
        }
      }),
    ]);

    return res.json({ reviews, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Get sale reviews error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/reviews/organizer/:organizerId — public, paginated
export const getOrganizerReviews = async (req: Request, res: Response) => {
  try {
    const { organizerId } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const limit = Math.min(50, parseInt(String(req.query.limit || '10')));
    const skip = (page - 1) * limit;

    // #116: Filter out PENDING moderation reviews from public view
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: {
          sale: { organizerId },
          moderationStatus: 'APPROVED' // Only show approved reviews to public
        },
        include: {
          user: { select: { name: true } },
          sale: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.review.count({
        where: {
          sale: { organizerId },
          moderationStatus: 'APPROVED'
        }
      }),
    ]);

    return res.json({ reviews, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Get organizer reviews error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};
