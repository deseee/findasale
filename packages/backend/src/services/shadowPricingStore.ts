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
import { isAudioFormatMatch } from './pricingEngine/adapters/discogs';

/**
 * True when an item is a record / vinyl / CD / cassette, using the same shared check the audio pricing path uses.
 * Exposed on GET /items/:id/comp-summary as `isAudioFormat` so the client never guesses from category strings.
 * Never throws.
 */
export function isAudioFormatItem(item: { title?: string | null; category?: string | null } | null | undefined): boolean {
  try {
    if (!item) return false;
    return isAudioFormatMatch({ title: item.title ?? '', category: item.category ?? '' }) === true;
  } catch {
    return false;
  }
}

export interface ShadowPricingDto {
  /** The model's own suggestion in dollars, or null when it was not recorded. */
  smartPrice: number | null;
  /** The saved market (pricing engine) estimate in dollars. */
  marketPrice: number;
  marketConfidence: string | null;
  /** Number of comparable listings behind the market estimate. */
  compsFound: number;
  /**
   * True when this item's row came from the shadow scan (non-record item: the model price is the price and the
   * market estimate is reference only). Lets the UI skip the one-click "Use $X" apply panel for such items.
   */
  isShadow: boolean;
}

/**
 * Key under which the model's price survives a manual "Suggest Price" upsert. The orchestrator replaces the whole
 * pricingResultJson with its own result; carryShadowMarker() copies the model price into that new JSON under this key
 * (null when the shadow row had no model price) so the Smart suggestion line does not vanish. The key only ever
 * exists on a row that started life as a shadow row.
 */
export const SHADOW_CARRY_KEY = 'shadowSmartPrice';

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Shadow info found in a saved pricingResultJson, or null when the row is not (or no longer) a shadow row. */
function readShadowMarker(json: unknown): { smartPrice: number | null; pure: boolean } | null {
  if (!isObj(json)) return null;
  if (json.shadowEngine === true) {
    return { smartPrice: typeof json.smartPrice === 'number' && isFinite(json.smartPrice) ? json.smartPrice : null, pure: true };
  }
  if (SHADOW_CARRY_KEY in json) {
    const v = json[SHADOW_CARRY_KEY];
    return { smartPrice: typeof v === 'number' && isFinite(v) ? v : null, pure: false };
  }
  return null;
}

/**
 * Pure helper: given the row's existing pricingResultJson and the JSON a manual lookup is about to write, return the
 * JSON to write. If the existing row was a shadow row (or already carries the marker) the model price is kept under
 * SHADOW_CARRY_KEY; otherwise newJson is returned untouched.
 */
export function carryShadowMarker<T extends object>(existingJson: unknown, newJson: T): T | (T & Record<string, number | null>) {
  const m = readShadowMarker(existingJson);
  if (!m) return newJson;
  return { ...newJson, [SHADOW_CARRY_KEY]: m.smartPrice };
}

/**
 * Read the item's current row and return the JSON to persist for a manual lookup (see carryShadowMarker). Best-effort:
 * any read problem returns newJson unchanged, so a manual lookup is never blocked by this.
 */
export async function withShadowMarker<T extends object>(itemId: string, newJson: T): Promise<T | (T & Record<string, number | null>)> {
  try {
    const existing = await prisma.itemCompLookup.findUnique({ where: { itemId }, select: { pricingResultJson: true } });
    return carryShadowMarker(existing?.pricingResultJson, newJson);
  } catch (err: any) {
    console.warn(`[shadowPricing] marker carry failed (non-fatal) for item ${itemId}:`, err?.message || err);
    return newJson;
  }
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
    isShadow: true,
  };
}

/**
 * Upsert the shadow result onto the item's ItemCompLookup row. smartPrice is the model price that was actually written
 * to / suggested for the item (dollars).
 *
 * When the scan ran (r given) but produced no usable engine price (FLOOR / timeout / exception / non-positive), any
 * shadow data left by an EARLIER run is stale, so it is cleared: a pure shadow row is deleted, and a real comp row that
 * only carries the shadow marker has the marker removed. Rows with no shadow marker (real comp lookups, eBay cache
 * rows) are never touched. r null/undefined means "no scan ran" and does nothing.
 */
export async function persistShadowPricing(
  itemId: string,
  smartPrice: number | null | undefined,
  r: ShadowFields | null | undefined,
): Promise<void> {
  try {
    if (!itemId) return;
    const dto = shadowFromAiResult(r, smartPrice);
    if (!dto) {
      if (r) await clearStaleShadow(itemId);
      return;
    }
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

/** Remove stale shadow data from the item's row (see persistShadowPricing). Never throws; never touches non-shadow rows. */
async function clearStaleShadow(itemId: string): Promise<void> {
  const existing = await prisma.itemCompLookup.findUnique({ where: { itemId }, select: { pricingResultJson: true } });
  const m = readShadowMarker(existing?.pricingResultJson);
  if (!m) return;
  if (m.pure) {
    await prisma.itemCompLookup.deleteMany({ where: { itemId } });
    return;
  }
  const { [SHADOW_CARRY_KEY]: _drop, ...rest } = existing?.pricingResultJson as Record<string, unknown>;
  await prisma.itemCompLookup.update({ where: { itemId }, data: { pricingResultJson: rest as any } });
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
  const marker = readShadowMarker(row.pricingResultJson);
  return {
    smartPrice: marker ? marker.smartPrice : null,
    isShadow: !!marker,
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
