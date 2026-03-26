/**
 * typologyController.ts — Feature #46: Treasure Typology Classifier
 *
 * API endpoints for item typology classification.
 * All endpoints require PRO tier.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  classifyItem,
  batchClassify,
  getTypology,
  updateTypology,
} from '../services/typologyService';

/**
 * GET /api/items/:itemId/typology
 * Get typology classification for an item (PRO gated)
 */
export const getItemTypology = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { itemId } = req.params;

    // Verify item exists and belongs to an organizer
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: true } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Get typology
    const typology = await getTypology(itemId);

    if (!typology) {
      return res.status(404).json({
        message: 'Item has not been classified yet',
      });
    }

    res.json({
      status: 'SUCCESS',
      data: {
        itemId: typology.itemId,
        primaryCategory: typology.primaryCategory,
        primaryConfidence: typology.primaryConfidence,
        secondaryCategory: typology.secondaryCategory,
        secondaryConfidence: typology.secondaryConfidence,
        organizer_reviewed: typology.organizer_reviewed,
        organizer_correctedTo: typology.organizer_correctedTo,
        classifiedAt: typology.classifiedAt,
      },
    });
  } catch (error) {
    console.error('[Typology] Error getting typology:', error);
    res.status(500).json({ message: 'Failed to get typology' });
  }
};

/**
 * POST /api/items/:itemId/classify
 * Trigger classification of an item (async, returns immediately)
 */
export const classifyItemEndpoint = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { itemId } = req.params;

    // Verify item exists and belongs to organizer
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: true },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check authorization
    if (item.sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Classify the item
    const typology = await classifyItem(itemId);

    res.status(201).json({
      status: 'CLASSIFIED',
      data: {
        primaryCategory: typology.primaryCategory,
        primaryConfidence: typology.primaryConfidence,
        secondaryCategory: typology.secondaryCategory,
        secondaryConfidence: typology.secondaryConfidence,
      },
    });
  } catch (error: any) {
    console.error('[Typology] Error classifying item:', error);

    // Handle specific error cases
    if (error.message?.includes('no photos')) {
      return res.status(400).json({
        message: 'Item has no photos for classification',
      });
    }

    res.status(500).json({ message: 'Failed to classify item' });
  }
};

/**
 * POST /api/sales/:saleId/classify-all
 * Batch classify all items in a sale without typology (PRO gated)
 */
export const batchClassifySale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { saleId } = req.params;

    // Verify sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Batch classify
    const result = await batchClassify(saleId);

    res.json({
      status: 'BATCH_COMPLETE',
      classified: result.classified,
      failed: result.failed,
    });
  } catch (error) {
    console.error('[Typology] Error in batch classification:', error);
    res.status(500).json({ message: 'Failed to batch classify items' });
  }
};

/**
 * PATCH /api/items/:itemId/typology
 * Update typology with organizer correction
 */
export const updateItemTypology = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { itemId } = req.params;
    const { correctedTo, reason } = req.body;

    if (!correctedTo) {
      return res.status(400).json({ message: 'correctedTo is required' });
    }

    // Verify item exists and belongs to organizer
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: true },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale.organizerId !== req.user.organizerProfile?.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Verify typology exists
    const existingTypology = await getTypology(itemId);
    if (!existingTypology) {
      return res.status(404).json({ message: 'Item has not been classified' });
    }

    // Update typology with correction
    const typology = await updateTypology(itemId, correctedTo, reason);

    res.json({
      status: 'UPDATED',
      data: {
        itemId: typology.itemId,
        primaryCategory: typology.primaryCategory,
        organizer_correctedTo: typology.organizer_correctedTo,
        organizer_reviewed: typology.organizer_reviewed,
      },
    });
  } catch (error: any) {
    console.error('[Typology] Error updating typology:', error);

    if (error.message?.includes('Invalid category')) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to update typology' });
  }
};
