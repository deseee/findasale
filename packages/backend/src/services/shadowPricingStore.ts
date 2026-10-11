/**
 * Shadow pricing store (2026-10-11).
 *
 * For non-audio items cloudAIService.finalizePricing() keeps the model's own price but also runs the blended pricing
 * engine in "shadow mode" and records the result on AITagResult.shadowEngine*. This module persists that second price
 * and reads it back for the review queue and the item edit page, so the organizer can see BOTH numbers.
 *
 * Storage (no schema change): the existing ItemCompLookup row keyed by itemId, written with the same semantics the
 * pricing orchestrator uses (source 'multiSource', estimatedPrice in cents, priceConfidence, tierUsed, compsFound,
 * dataFreshness). The model's own price (the "Smart suggestion") is kept in pricingResultJson under a small marker
 * object, because ItemCompLookup has no column for it. fetchedAt / expireAt are deliberately NOT set, so the
 * fetchEbayComps 7-day cache check never mistakes this row for a fresh eBay fetch. Nothing here ever writes
 * Item.price or Item.aiSuggestedPrice.
 *
 * Every function is best-effort and never throws.
 */
import { prisma } from '../lib/prisma';
import type { AITagResult } from './cloudAIService';

export interface ShadowPricingDto {
  /** The model's own suggestion in dollars, or null when it was not recorded. */
  smartPrice: number | null;
  /** The saved market (pricing engine) estimate in dollars. */
  marketPrice: number;
  marketConfidence: string | null;
  /** Number of comparable listings behind the market estimate. */
  compsFound: number;
}

type ShadowFields = Pick<
  AITagResult,
  'shadowEnginePrice' | 'shadowEngineConfidence' | 'shadowEngineTier' | 'shadowEngineCompsFound'
>;

/** Public (API-facing) shape of the two numbers, from a fresh scan result. Null when there is no shadow price. */
export function shadowFromAiResult(
  r: ShadowFields | null | undefined,
  smartPrice: number | null | undefined,
): ShadowPricingDto | null {
  if (!r || typeof r.shadowEnginePrice !== 'number' || !isFinite(r.shadowEnginePrice) || r.shadowEnginePrice <= 0) {
    return null;
  }
  return {
    smartPrice: typeof smartPrice === 'number' && isFinite(smartPrice) ? smartPrice : null,
    marketPrice: r.shadowEnginePrice,
    marketConfidence: r.shadowEngineConfidence ?? null,
    compsFound: typeof r.shadowEngineCompsFound === 'number' ? r.shadowEngineCompsFound : 0,
  };
}

/**
 * Upsert the shadow result onto the item's ItemCompLookup row. No-op when the scan produced no shadow price.
 * smartPrice is the model price that was actually written to / suggested for the item (dollars).
 */
export async function persistShadowPricing(
  itemId: string,
  smartPrice: number | null | undefined,
  r: ShadowFields | null | undefined,
): Promise<void> {
  try {
    const dto = shadowFromAiResult(r, smartPrice);
    if (!dto || !itemId) return;
    const cents = Math.round(dto.marketPrice * 100);
    const data = {
      pricingResultJson: {
        shadowEngine: true,
        smartPrice: dto.smartPrice,
        enginePrice: dto.marketPrice,
        confidence: dto.marketConfidence,
        tier: r?.shadowEngineTier ?? null,
        compsFound: dto.compsFound,
        recordedAt: new Date().toISOString(),
      } as any,
      estimatedPrice: BigInt(cents),
      priceConfidence: dto.marketConfidence,
      tierUsed: typeof r?.shadowEngineTier === 'number' ? r.shadowEngineTier : null,
      source: 'multiSource',
      compsFound: dto.compsFound,
      dataFreshness: new Date(),
    };
    await prisma.itemCompLookup.upsert({
      where: { itemId },
      update: data,
      create: { itemId, ...data },
    });
  } catch (err: any) {
    console.warn(`[shadowPricing] persist failed (non-fatal) for item ${itemId}:`, err?.message || err);
  }
}

interface CompRowLike {
  estimatedPrice?: bigint | number | null;
  priceConfidence?: string | null;
  compsFound?: number | null;
  pricingResultJson?: unknown;
}

/**
 * Turn a saved ItemCompLookup row into the two-number DTO. The market estimate is whatever engine estimate is saved
 * (shadow scan or a later manual lookup); FLOOR / missing / non-positive means no market estimate, so null.
 * The smart (model) price comes only from the shadow marker.
 */
export function shadowDtoFromCompRow(row: CompRowLike | null | undefined): ShadowPricingDto | null {
  if (!row || row.estimatedPrice == null) return null;
  const cents = Number(row.estimatedPrice);
  if (!isFinite(cents) || cents <= 0) return null;
  if (!row.priceConfidence || row.priceConfidence === 'FLOOR') return null;
  let smart: number | null = null;
  const j = row.pricingResultJson as { shadowEngine?: unknown; smartPrice?: unknown } | null | undefined;
  if (j && typeof j === 'object' && j.shadowEngine === true && typeof j.smartPrice === 'number' && isFinite(j.smartPrice)) {
    smart = j.smartPrice;
  }
  return {
    smartPrice: smart,
    marketPrice: Math.round(cents) / 100,
    marketConfidence: row.priceConfidence,
    compsFound: typeof row.compsFound === 'number' ? row.compsFound : 0,
  };
}

/** ONE batched read for a page of items. Returns an empty map on any error. */
export async function loadShadowPricingByItemId(itemIds: string[]): Promise<Map<string, ShadowPricingDto>> {
  const out = new Map<string, ShadowPricingDto>();
  if (itemIds.length === 0) return out;
  try {
    const rows = await prisma.itemCompLookup.findMany({
      where: { itemId: { in: itemIds }, estimatedPrice: { not: null } },
      select: { itemId: true, estimatedPrice: true, priceConfidence: true, compsFound: true, pricingResultJson: true },
    });
    for (const row of rows) {
      const dto = shadowDtoFromCompRow(row);
      if (dto) out.set(row.itemId, dto);
    }
  } catch (err: any) {
    console.warn('[shadowPricing] batched read failed (non-fatal):', err?.message || err);
  }
  return out;
}
