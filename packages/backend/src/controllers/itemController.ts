import { Request, Response } from 'express';
import { parse } from 'csv-parse';
import { AuthRequest } from '../middleware/auth';
import { Readable } from 'stream';
import { prisma } from '../index';
import axios from 'axios';
import FormData from 'form-data';
import { z } from 'zod';
import { getIO } from '../lib/socket'; // V1: live bidding broadcast
import { fireWebhooks } from '../services/webhookService'; // X1
import { analyzeItemImage, isCloudAIAvailable } from '../services/cloudAIService'; // CB5
import { notifyPriceDropAlerts } from '../services/priceDropService'; // Price drop alerts
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Phase 1B: Rapidfire Mode public item filtering
import { computeHealthScore, HealthResult } from '../utils/listingHealthScore'; // Sprint 1: Listing Health Score

// [Note: The rest of this file remains unchanged — only showing the getDraftItemsBySaleId function modification]
// getDraftItemsBySaleId endpoint modified to include health score calculation

// Used by the review-before-publish page. Requires organizer ownership of the sale.
export const getDraftItemsBySaleId = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { saleId, page = '1', limit = '20' } = req.query;

    if (!saleId) {
      return res.status(400).json({ message: 'saleId is required' });
    }

    // Verify organizer owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId as string },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale || sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale' });
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    const items = await prisma.item.findMany({
      where: {
        saleId: saleId as string,
        draftStatus: { in: ['DRAFT', 'PENDING_REVIEW'] },
      },
      select: {
        id: true,
        saleId: true,
        title: true,
        category: true,
        condition: true,
        conditionGrade: true, // #64
        price: true,
        photoUrls: true,
        draftStatus: true,
        aiErrorLog: true,
        optimisticLockVersion: true,
        // Camera Workflow v2: Add new fields for publishing page
        aiConfidence: true,
        isAiTagged: true,
        backgroundRemoved: true,
        faceDetected: true,
        autoEnhanced: true,
        createdAt: true,
        updatedAt: true,
        // Sprint 1: Listing Health Score + AI tag suggestions
        tags: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    // Sprint 1: Compute health score for each item
    const itemsWithHealth = items.map(item => ({
      ...item,
      healthScore: computeHealthScore({
        photoUrls: item.photoUrls,
        title: item.title,
        description: null, // TODO: Add description to schema if needed
        tags: item.tags,
        price: item.price,
        conditionGrade: item.conditionGrade, // #64
      }),
    }));

    res.json(itemsWithHealth);
  } catch (error) {
    console.error('Error fetching draft items:', error);
    res.status(500).json({ message: 'Server error while fetching draft items' });
  }
};
