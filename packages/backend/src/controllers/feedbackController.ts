import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// Helper: Detect device type from User-Agent
function detectDeviceType(userAgent: string | undefined): string {
  if (!userAgent) return 'unknown';
  const mobilePattern = /mobile|android|iphone|ipod|windows phone/i;
  return mobilePattern.test(userAgent) ? 'mobile' : 'desktop';
}

// Helper: Get user's organizer tier
async function getUserTierAtTime(userId: string): Promise<string | null> {
  try {
    const roleSubscription = await prisma.userRoleSubscription.findFirst({
      where: {
        userId,
        role: 'ORGANIZER',
      },
      select: {
        subscriptionTier: true,
      },
    });
    return roleSubscription?.subscriptionTier || null;
  } catch (error) {
    console.error('Error fetching user tier:', error);
    return null;
  }
}

// POST /api/feedback — submit feedback from widget or surveys
export const submitFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const { rating, text, page, surveyType, dontAskAgain } = req.body;

    // Validate rating (optional for surveys, required for static form)
    if (rating && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Detect device type and tier
    const deviceType = detectDeviceType(req.get('user-agent'));
    const userTierAtTime = await getUserTierAtTime(req.user?.id || '');

    // Create feedback record
    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user?.id || null,
        rating: rating || null,
        text: text || null,
        page: page || null,
        userAgent: req.get('user-agent') || null,
        surveyType: surveyType || null,
        deviceType,
        userTierAtTime,
      },
    });

    // If dontAskAgain is true, create suppression record
    if (dontAskAgain && surveyType && req.user?.id) {
      await prisma.feedbackSuppression.upsert({
        where: {
          userId_surveyType: {
            userId: req.user.id,
            surveyType,
          },
        },
        update: {},
        create: {
          userId: req.user.id,
          surveyType,
        },
      });

      // Update lastSurveyShownAt
      await prisma.user.update({
        where: { id: req.user.id },
        data: { lastSurveyShownAt: new Date() },
      });
    }

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

// POST /api/feedback/suppression — create suppression record
export const createSuppression = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { surveyType } = req.body;

    if (!surveyType || typeof surveyType !== 'string') {
      return res.status(400).json({ message: 'surveyType is required' });
    }

    const suppression = await prisma.feedbackSuppression.upsert({
      where: {
        userId_surveyType: {
          userId: req.user.id,
          surveyType,
        },
      },
      update: {},
      create: {
        userId: req.user.id,
        surveyType,
      },
    });

    // Update lastSurveyShownAt
    await prisma.user.update({
      where: { id: req.user.id },
      data: { lastSurveyShownAt: new Date() },
    });

    res.status(201).json({
      message: 'Survey suppressed',
      suppression: {
        id: suppression.id,
        userId: suppression.userId,
        surveyType: suppression.surveyType,
        suppressedAt: suppression.suppressedAt,
      },
    });
  } catch (error) {
    console.error('Error creating suppression:', error);
    res.status(500).json({ message: 'Failed to create suppression' });
  }
};

// GET /api/feedback/suppression — list user's suppressions
export const listSuppressions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const suppressions = await prisma.feedbackSuppression.findMany({
      where: { userId: req.user.id },
      select: {
        surveyType: true,
        suppressedAt: true,
      },
      orderBy: { suppressedAt: 'desc' },
    });

    res.json(suppressions);
  } catch (error) {
    console.error('Error fetching suppressions:', error);
    res.status(500).json({ message: 'Failed to fetch suppressions' });
  }
};
