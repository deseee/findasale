/**
 * Pricing Controller — API endpoints for pricing engine
 * Phase 1: POST /api/pricing/estimate
 */

import { Request, Response } from 'express';
import { estimatePrice, PricingRequest, PricingResult } from '../services/pricingEngine';
import { prisma } from '../lib/prisma';

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

    // Deterministic (non-LLM, no §0·SPEND concern) reasoning string for PriceSuggestion.tsx's
    // existing reasoning line. PricingResult has no prose field of its own. FLOOR results omit
    // reasoning entirely — the frontend suppresses the whole card at FLOOR confidence (never
    // shows a bare $0.49 as if it were a real comp-based number).
    let reasoning = '';
    if (result.confidence !== 'FLOOR') {
      if (result.tier === 1) {
        reasoning = `Based on ${result.compsFound} comparable listing${result.compsFound === 1 ? '' : 's'} from live market sources.`;
      } else if (result.tier === 2) {
        reasoning = 'Based on limited market data — treat as a rough estimate.';
      } else {
        reasoning = 'Based on very limited data — treat as a rough estimate.';
      }
    }

    res.json({ ...result, reasoning });
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
    const sources = await prisma.pricingSourceConfig.findMany({
      select: {
        sourceId: true,
        tier: true,
        enabled: true,
        costPerCall: true,
        apiUsedToday: true,
        apiQuotaDaily: true,
      },
    });

    const response = {
      sources: sources.map((source: any) => ({
        sourceId: source.sourceId,
        sourceName: source.sourceId, // NOTE: Use registry for display names
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
