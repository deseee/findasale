import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// POST /api/feedback — submit feedback from widget
export const submitFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const { rating, text, page } = req.body;

    // Validate rating
    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Create feedback record
    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user?.id || null,
        rating,
        text: text || null,
        page: page || null,
        userAgent: req.get('user-agent') || null,
      },
    });

    res.status(201).json({
      message: 'Thank you for your feedback!',
      feedback: {
        id: feedback.id,
        rating: feedback.rating,
        createdAt: feedback.createdAt,
      },
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ message: 'Failed to submit feedback' });
  }
};

// GET /api/feedback — list all feedback (admin only)
export const listFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const rating = req.query.rating as string;
    const search = req.query.search as string;

    const where: any = {};

    if (rating) {
      where.rating = parseInt(rating);
    }

    if (search) {
      where.OR = [
        { text: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        select: {
          id: true,
          rating: true,
          text: true,
          page: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.feedback.count({ where }),
    ]);

    res.json({
      feedbacks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing feedback:', error);
    res.status(500).json({ message: 'Failed to fetch feedback' });
  }
};

// GET /api/feedback/stats — feedback summary stats (admin only)
export const getFeedbackStats = async (req: AuthRequest, res: Response) => {
  try {
    const totalFeedback = await prisma.feedback.count();

    const ratingStats = await prisma.feedback.groupBy({
      by: ['rating'],
      _count: true,
      orderBy: { rating: 'asc' },
    });

    const avgRating = await prisma.feedback.aggregate({
      _avg: { rating: true },
    });

    const recentFeedback = await prisma.feedback.findMany({
      select: {
        id: true,
        rating: true,
        text: true,
        page: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({
      totalFeedback,
      averageRating: avgRating._avg.rating ? parseFloat(avgRating._avg.rating.toFixed(2)) : 0,
      ratingBreakdown: Object.fromEntries(
        ratingStats.map(rs => [`${rs.rating}`, rs._count])
      ),
      recentFeedback,
    });
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({ message: 'Failed to fetch feedback stats' });
  }
};
