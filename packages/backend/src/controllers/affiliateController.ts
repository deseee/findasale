import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Generate affiliate link for a sale
export const generateAffiliateLink = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.body;
    const userId = req.user.id;

    // Check if user has CREATOR role
    if (req.user.role !== 'CREATOR') {
      return res.status(403).json({ message: 'Access denied. Creator access required.' });
    }

    // Check if sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Create or update affiliate link
    const affiliateLink = await prisma.affiliateLink.upsert({
      where: {
        userId_saleId: {
          userId,
          saleId
        }
      },
      update: {},
      create: {
        userId,
        saleId
      }
    });

    const link = `${process.env.FRONTEND_URL}/affiliate/${affiliateLink.id}`;
    
    res.json({
      message: 'Affiliate link generated successfully',
      link,
      affiliateLinkId: affiliateLink.id
    });
  } catch (error) {
    console.error('Error generating affiliate link:', error);
    res.status(500).json({ message: 'Failed to generate affiliate link' });
  }
};

// Get creator's affiliate links
export const getAffiliateLinks = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Check if user has CREATOR role
    if (req.user.role !== 'CREATOR') {
      return res.status(403).json({ message: 'Access denied. Creator access required.' });
    }

    const affiliateLinks = await prisma.affiliateLink.findMany({
      where: { userId },
      include: {
        sale: {
          select: {
            title: true,
            startDate: true,
            endDate: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });

    res.json(affiliateLinks);
  } catch (error) {
    console.error('Error fetching affiliate links:', error);
    res.status(500).json({ message: 'Failed to fetch affiliate links' });
  }
};

// Track affiliate link click and redirect
export const trackAffiliateClick = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // affiliate link ID
    
    // Find the affiliate link
    const affiliateLink = await prisma.affiliateLink.findUnique({
      where: { id }
    });

    if (!affiliateLink) {
      return res.status(404).json({ message: 'Affiliate link not found' });
    }

    // Increment click count
    await prisma.affiliateLink.update({
      where: { id },
      data: { clicks: { increment: 1 } }
    });

    // Return JSON so the frontend affiliate page can handle the redirect
    res.json({ saleId: affiliateLink.saleId });
  } catch (error) {
    console.error('Error tracking affiliate click:', error);
    res.status(500).json({ message: 'Failed to track affiliate click' });
  }
};

// Get creator stats
export const getCreatorStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Check if user has CREATOR role
    if (req.user.role !== 'CREATOR') {
      return res.status(403).json({ message: 'Access denied. Creator access required.' });
    }

    // Get aggregate totals across all affiliate links
    const totals = await prisma.affiliateLink.aggregate({
      _sum: { clicks: true, conversions: true },
      where: { userId }
    });

    const totalLinks = await prisma.affiliateLink.count({ where: { userId } });

    res.json({
      totalClicks: totals._sum.clicks || 0,
      totalConversions: totals._sum.conversions || 0,
      totalLinks
    });
  } catch (error) {
    console.error('Error fetching creator stats:', error);
    res.status(500).json({ message: 'Failed to fetch creator stats' });
  }
};
