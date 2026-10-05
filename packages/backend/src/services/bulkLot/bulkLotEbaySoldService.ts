/**
 * Order side of eBay bundles (ADR-136 Addendum C): what the eBay sold sync does with an order line for a bulk lot.
 * Pure of I/O: the stock decrement and the database writes are injected, so tests pass fakes.
 *
 * An eBay order line for a bundle lot says "N bundles". The lot counts cards, so the line takes N x bundleSize cards
 * from the lot through the SAME guarded decrement every other channel uses (sellItemUnits). That is what keeps the
 * register, the storefront and eBay drawing from one pool.
 *
 * Shortfall. The decrement refuses when the cards are not there (the counter sold them first, inside the window
 * between a counter sale and the next eBay revise). Real money has already changed hands on eBay, so the sale is never
 * dropped: the sync takes every card that IS left, records how many it could not supply (bulkShortfall) and tells the
 * organizer, who must ship what they have, restock, or cancel the order on eBay. A cancel gives back only the cards
 * that were actually taken.
 */
import { cardsForBundles } from './bulkLotEbayBundle';
import { formatCardCount } from './bulkLotPricing';

export interface AbsorbDeps {
  /** itemStockService.sellItemUnits: guarded decrement. Throws when the lot cannot supply `units`. */
  sellUnits(itemId: string, units: number): Promise<{ fullySoldOut: boolean; remainingStock: number }>;
  /** Cards left in the lot right now. */
  remainingCards(itemId: string): Promise<number>;
  /** True for the error sellUnits throws when there are not enough cards. */
  isInsufficientStock(err: unknown): boolean;
}

export interface AbsorbResult {
  /** Cards the order line is owed (bundles x bundleSize). */
  cards: number;
  /** Cards actually taken from the lot. */
  taken: number;
  /** Cards the lot could not supply. 0 when the line was filled. */
  shortfall: number;
  fullySoldOut: boolean;
  remainingCards: number;
}

/** Takes the cards for `bundles` bundles. Never throws for a shortfall; rethrows any other error. */
export async function absorbBundleOrderLine(deps: AbsorbDeps, args: { itemId: string; bundleSize: number; bundles: number }): Promise<AbsorbResult> {
  const cards = cardsForBundles(args.bundles, args.bundleSize);
  if (cards === null) throw new Error(`absorbBundleOrderLine: bad bundles (${args.bundles}) or bundle size (${args.bundleSize})`);
  try {
    const r = await deps.sellUnits(args.itemId, cards);
    return { cards, taken: cards, shortfall: 0, fullySoldOut: r.fullySoldOut, remainingCards: r.remainingStock };
  } catch (err) {
    if (!deps.isInsufficientStock(err)) throw err;
  }
  // Short: take what is left. A counter sale can land between the read and the decrement, so retry a few times.
  let remaining = await deps.remainingCards(args.itemId);
  for (let attempt = 0; attempt < 3 && remaining > 0; attempt++) {
    const take = Math.min(remaining, cards);
    try {
      const r = await deps.sellUnits(args.itemId, take);
      return { cards, taken: take, shortfall: cards - take, fullySoldOut: r.fullySoldOut, remainingCards: r.remainingStock };
    } catch (err) {
      if (!deps.isInsufficientStock(err)) throw err;
      remaining = await deps.remainingCards(args.itemId);
    }
  }
  return { cards, taken: 0, shortfall: cards, fullySoldOut: remaining < 1, remainingCards: Math.max(remaining, 0) };
}

export interface ReleaseLine {
  eventId: string;
  itemId: string;
  bulkQuantity: number;
  bulkShortfall: number | null;
}

export interface ReleaseDeps {
  /** Marks the ledger row released, once. Returns false when another run already did. */
  claim(eventId: string): Promise<boolean>;
  releaseCards(itemId: string, cards: number): Promise<void>;
}

/** Cards a cancelled or refunded order line gives back: what was owed minus what the lot could not supply. */
export function cardsToGiveBack(line: Pick<ReleaseLine, 'bulkQuantity' | 'bulkShortfall'>): number {
  return Math.max(line.bulkQuantity - (line.bulkShortfall ?? 0), 0);
}

/** Gives back the cards of cancelled or refunded bundle lines, at most once per line. */
export async function releaseCancelledBundleLines(deps: ReleaseDeps, lines: ReadonlyArray<ReleaseLine>): Promise<{ lines: number; cards: number; itemIds: string[] }> {
  const out = { lines: 0, cards: 0, itemIds: [] as string[] };
  for (const line of lines) {
    const cards = cardsToGiveBack(line);
    const claimed = await deps.claim(line.eventId);
    if (!claimed) continue;
    out.lines++;
    if (cards > 0) {
      await deps.releaseCards(line.itemId, cards);
      out.cards += cards;
      if (!out.itemIds.includes(line.itemId)) out.itemIds.push(line.itemId);
    }
  }
  return out;
}

/** Organizer-facing sentence for a short order line. */
export function shortfallMessage(title: string, ebayOrderId: string, cards: number, shortfall: number): string {
  return `"${title}": eBay order ${ebayOrderId} needs ${formatCardCount(cards)} cards but this lot only had ${formatCardCount(cards - shortfall)} left (cards were sold at your counter first). Ship what you have, restock the lot, or cancel the order on eBay.`;
}
