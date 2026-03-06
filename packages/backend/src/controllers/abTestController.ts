import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// POST /api/ab/variant — get or create assignment for a session/test
export const getVariant = async (req: AuthRequest, res: Response) => {
  try {
    const { testName, sessionId } = req.body;

    if (!testName || typeof testName !== 'string') {
      return res.status(400).json({ message: 'testName is required' });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    // Try to find existing assignment
    let assignment = await prisma.aBTestAssignment.findUnique({
      where: {
        sessionId_testName: {
          sessionId,
          testName,
        },
      },
    });

    // If no assignment exists, create one with random 50/50 split
    if (!assignment) {
      const variant = Math.random() < 0.5 ? 'A' : 'B';
      assignment = await prisma.aBTestAssignment.create({
        data: {
          sessionId,
          testName,
          variant,
        },
      });
    }

    res.json({
      variant: assignment.variant,
      testName: assignment.testName,
    });
  } catch (error) {
    console.error('Error getting A/B variant:', error);
    res.status(500).json({ message: 'Failed to get variant' });
  }
};

// POST /api/ab/event — track an event for a variant
export const trackEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { testName, sessionId, variant, event } = req.body;

    if (!testName || typeof testName !== 'string') {
      return res.status(400).json({ message: 'testName is required' });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    if (!variant || typeof variant !== 'string') {
      return res.status(400).json({ message: 'variant is required' });
    }

    if (!event || typeof event !== 'string') {
      return res.status(400).json({ message: 'event is required' });
    }

    // Create event record
    const eventRecord = await prisma.aBTestEvent.create({
      data: {
        testName,
        sessionId,
        variant,
        event,
      },
    });

    res.status(201).json({
      message: 'Event tracked',
      id: eventRecord.id,
    });
  } catch (error) {
    console.error('Error tracking A/B event:', error);
    res.status(500).json({ message: 'Failed to track event' });
  }
};

interface VariantResults {
  variant: string;
  views: number;
  clicks: number;
  conversions: number;
  conversionRate: number;
}

// GET /api/ab/results/:testName — fetch results for a test (admin only)
export const getResults = async (req: AuthRequest, res: Response) => {
  try {
    const { testName } = req.params;

    if (!testName || typeof testName !== 'string') {
      return res.status(400).json({ message: 'testName is required' });
    }

    // Get all unique variants for this test
    const variants = await prisma.aBTestEvent.findMany({
      where: { testName },
      distinct: ['variant'],
      select: { variant: true },
    });

    // For each variant, count events
    const results: VariantResults[] = await Promise.all(
      variants.map(async (v) => {
        const [views, clicks, conversions] = await Promise.all([
          prisma.aBTestEvent.count({
            where: {
              testName,
              variant: v.variant,
              event: 'view',
            },
          }),
          prisma.aBTestEvent.count({
            where: {
              testName,
              variant: v.variant,
              event: 'click',
            },
          }),
          prisma.aBTestEvent.count({
            where: {
              testName,
              variant: v.variant,
              event: 'conversion',
            },
          }),
        ]);

        const conversionRate = views > 0 ? (conversions / views) * 100 : 0;

        return {
          variant: v.variant,
          views,
          clicks,
          conversions,
          conversionRate: parseFloat(conversionRate.toFixed(2)),
        };
      })
    );

    // Sort by variant name for consistency
    results.sort((a, b) => a.variant.localeCompare(b.variant));

    res.json({ variants: results });
  } catch (error) {
    console.error('Error fetching A/B results:', error);
    res.status(500).json({ message: 'Failed to fetch results' });
  }
};
