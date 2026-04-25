/**
 * Pricing Controller — API endpoints for pricing engine
 * Phase 1: POST /api/pricing/estimate
 */

import { Request, Response } from 'express';
import { estimatePrice, PricingRequest, PricingResult } from '../services/pricingEngine';

/**
 * POST /api/pricing/estimate
 * Estimate price for an item based on metadata
 */
export async function estimatePriceController(req: Request, res: Response): Promise<void> {
  try {
    const request: PricingRequest = {
      itemId: req.body.itemId,
      title: req.body.title,
      category: req.body.category,
      condition: req.body.condition,
      conditionGrade: req.body.conditionGrade,
      brand: req.body.brand,
      photoUrls: req.body.photoUrls,
      originalPrice: req.body.originalPrice,
      saleDate: req.body.saleDate ? new Date(req.body.saleDate) : undefined,
    };

    const result: PricingResult = await estimatePrice(request);

    res.json(result);
  } catch (error) {
    console.error('[Pricing] Estimate error:', error);
    res.status(500).json({
      error: 'Failed to estimate price',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/pricing/sources
 * List all pricing sources and their status
 */
export async function listSourcesController(_req: Request, res: Response): Promise<void> {
  try {
    const prisma = require('@findasale/database').default;
    const sources = await prisma.pricingSourceConfig.findMany();

    const response = {
      sources: sources.map((source: any) => ({
        sourceId: source.sourceId,
        sourceName: source.sourceId, // TODO: Use registry for display names
        tier: source.tier,
        enabled: source.enabled,
        costPerCall: source.costPerCall,
        requestsUsedToday: source.apiUsedToday,
        rateLimitPerDay: source.apiQuotaDaily,
      })),
    };

    res.json(response);
  } catch (error) {
    console.error('[Pricing] Sources error:', error);
    res.status(500).json({
      error: 'Failed to list sources',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * PATCH /api/pricing/sources/:sourceId
 * Toggle source on/off or adjust weight
 */
export async function updateSourceController(req: Request, res: Response): Promise<void> {
  try {
    const { sourceId } = req.params;
    const { enabled, weight } = req.body;

    const prisma = require('@findasale/database').default;
    const source = await prisma.pricingSourceConfig.update({
      where: { sourceId },
      data: {
        ...(enabled !== undefined && { enabled }),
        // Weight not yet supported in Phase 1
      },
    });

    res.json({
      sourceId: source.sourceId,
      enabled: source.enabled,
      updated: true,
    });
  } catch (error) {
    console.error('[Pricing] Update source error:', error);
    res.status(500).json({
      error: 'Failed to update source',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
