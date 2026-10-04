/**
 * Pricing Controller — API endpoints for pricing engine
 * Phase 1: POST /api/pricing/estimate
 */

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { estimatePrice, PricingRequest, PricingResult } from '../services/pricingEngine';
import { prisma } from '../lib/prisma';
import { resolveItemOwnerOrganizer } from '../utils/itemOwner';

const CONDITION_GRADES: ReadonlySet<string> = new Set(['S', 'A', 'B', 'C', 'D']);
const MAX_CONDITION_LENGTH = 100;

/** A trimmed, non-empty string within `max` characters, else undefined (ignored). */
function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : undefined;
}

/** A condition grade letter (S/A/B/C/D, any case), else undefined (ignored). */
function cleanGrade(value: unknown): string | undefined {
  const trimmed = cleanString(value, 5);
  if (trimmed === undefined) return undefined;
  const upper = trimmed.toUpperCase();
  return CONDITION_GRADES.has(upper) ? upper : undefined;
}

/**
 * POST /api/pricing/estimate
 * Estimate price for an item based on metadata
 *
 * Body: { title, category, condition?, conditionGrade?, brand?, photoUrls?, originalPrice?, saleDate?,
 *         itemId?, persist? }
 *  - itemId: when present the caller must own that item (sale items: the sale's organizer; inventory items:
 *    the organizer in item.organizerId). Missing item -> 404, not the owner -> 403 (default deny).
 *  - persist: strict boolean. Omitted or true keeps the historical behavior (the result is cached in
 *    ItemCompLookup when itemId is set). false = ephemeral estimate, nothing is written for the item.
 *  - conditionGrade: S/A/B/C/D (any case) or ignored. It drives the disclosed grade factor for used goods.
 */
export async function estimatePriceController(req: Request, res: Response): Promise<void> {
  try {
    const body: any = req.body ?? {};

    // itemId: absent (undefined, null or empty string) or a string. Anything else is a client error.
    let itemId: string | undefined;
    if (body.itemId !== undefined && body.itemId !== null && body.itemId !== '') {
      if (typeof body.itemId !== 'string') {
        res.status(400).json({ error: 'itemId must be a string' });
        return;
      }
      itemId = body.itemId;
    }

    // persist: strict boolean when sent.
    let persist: boolean | undefined;
    if (body.persist !== undefined) {
      if (typeof body.persist !== 'boolean') {
        res.status(400).json({ error: 'persist must be a boolean' });
        return;
      }
      persist = body.persist;
    }

    // Ownership gate (B3 security): the orchestrator writes ItemCompLookup keyed by itemId, so an itemId the
    // caller does not own must never reach it. resolveItemOwnerOrganizer is default deny.
    if (itemId !== undefined) {
      const userId = (req as AuthRequest).user?.id;
      if (typeof userId !== 'string' || userId.length === 0) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const item = await prisma.item.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          saleId: true,
          organizerId: true,
          sale: {
            select: {
              organizer: {
                select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true },
              },
            },
          },
        },
      });
      if (!item) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      const owner = await resolveItemOwnerOrganizer(item, userId);
      if (!owner) {
        res.status(403).json({ error: 'You do not have access to this item' });
        return;
      }
    }

    const request: PricingRequest = {
      itemId,
      title: body.title,
      category: body.category,
      condition: cleanString(body.condition, MAX_CONDITION_LENGTH),
      conditionGrade: cleanGrade(body.conditionGrade),
      brand: body.brand,
      photoUrls: body.photoUrls,
      originalPrice: body.originalPrice,
      saleDate: body.saleDate ? new Date(body.saleDate) : undefined,
      ...(persist !== undefined ? { persist } : {}),
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
        reasoning = 'Based on limited market data. Treat as a rough estimate.';
      } else {
        reasoning = 'Based on very limited data. Treat as a rough estimate.';
      }
    }

    res.json({ ...result, reasoning });
  } catch (error) {
    console.error('[Pricing] Estimate error:', error);
    res.status(500).json({
      error: 'Failed to estimate price',
      message: 'Server error. Please try again.', // never echo error.message to the client (details are logged above)
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
      message: 'Server error. Please try again.', // never echo error.message to the client (details are logged above)
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
      message: 'Server error. Please try again.', // never echo error.message to the client (details are logged above)
    });
  }
}
