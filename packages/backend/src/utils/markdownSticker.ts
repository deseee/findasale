/**
 * Markdown sticker helpers (2026-09-29, Patrick): staff who re-tag items on the shelf need to
 * know "which sticker" (10% / 20% / 30% off), not just a dollar price. Keystone rounding
 * (.49/.99) skews the raw price ratio on cheap items (a $3 item at "10% off" lands ~17% off),
 * so the sticker % comes from the markdown step that was actually applied, falling back to the
 * real price ratio only when no step can be resolved.
 */
import { prisma } from '../index';

export interface StickerItemInput {
  price: number | null;
  priceBeforeMarkdown: number | null;
  saleId: string | null;
  markdownStepIndexApplied: number | null;
  markdownTierApplied: number | null;
}

/** saleId ('' = organizer-wide cycle) -> stepOrder -> pctOff */
export type StickerContext = Map<string, Map<number, number>>;

/** Real % off from the prices actually on the item (rounded), or null if not discounted. */
export function actualDiscountPct(price: number | null, before: number | null): number | null {
  if (price == null || before == null || before <= 0 || price >= before) return null;
  return Math.round((1 - price / before) * 100);
}

export async function loadStickerContext(organizerId: string): Promise<StickerContext> {
  const cycles = await prisma.markdownCycle.findMany({
    where: { organizerId, isActive: true },
    select: { saleId: true, steps: { select: { stepOrder: true, pctOff: true } } },
  });
  const ctx: StickerContext = new Map();
  for (const c of cycles) {
    ctx.set(c.saleId ?? '', new Map(c.steps.map((s) => [s.stepOrder, s.pctOff])));
  }
  return ctx;
}

/**
 * The % printed on the sticker: cycle step pctOff when resolvable (sale-scoped cycle first,
 * then organizer-wide), else the free-tier cron's 50/75 by markdownTierApplied, else the real
 * ratio rounded to the nearest 5.
 */
export function resolveStickerPct(item: StickerItemInput, ctx: StickerContext): number | null {
  if (item.markdownStepIndexApplied) {
    const steps = (item.saleId ? ctx.get(item.saleId) : undefined) ?? ctx.get('');
    const pct = steps?.get(item.markdownStepIndexApplied);
    if (pct != null) return pct;
  }
  if (item.markdownTierApplied === 1) return 50;
  if (item.markdownTierApplied === 2) return 75;
  const actual = actualDiscountPct(item.price, item.priceBeforeMarkdown);
  return actual == null ? null : Math.round(actual / 5) * 5;
}
