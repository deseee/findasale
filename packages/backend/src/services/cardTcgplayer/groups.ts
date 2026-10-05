/**
 * Card stock grouped the way TCGplayer counts it (ADR-137 section 3). Pure: no database, no I/O.
 *
 * TCGplayer lists one quantity per (TCGplayer Id, condition, foil). FindA.Sale may hold several items for the same
 * key (an older sold-out item, a second import), so stock is summed per key. The key is
 * `<TCGplayer Id>|<condition code or empty>|<F or N>`.
 *
 * Only ungraded cards that carry a TCGplayer Id take part. A graded card is not a TCGplayer inventory row (its
 * condition is a grade, not Near Mint to Damaged) and a card with no TCGplayer Id cannot be matched to a row.
 */
import { CARD_CONDITION_LABELS, CARD_GAME_LABELS } from '../../constants/cardVocabulary';

const FOIL_FINISHES = new Set(['FOIL', 'ETCHED', 'HOLO', 'REVERSE_HOLO']);

export function isFoilFinish(finish: string | null | undefined): boolean {
  return !!finish && FOIL_FINISHES.has(String(finish).toUpperCase());
}

export function groupKey(productId: number, conditionCode: string | null | undefined, foil: boolean): string {
  return `${productId}|${conditionCode ?? ''}|${foil ? 'F' : 'N'}`;
}

/** The words TCGplayer's own export uses in its Condition column; foil is written as a trailing "Foil". */
export function conditionWord(conditionCode: string | null | undefined, foil: boolean): string {
  const label = conditionCode ? (CARD_CONDITION_LABELS as Record<string, string>)[conditionCode] ?? '' : '';
  if (!label) return foil ? 'Foil' : '';
  return foil ? `${label} Foil` : label;
}

/** Product Line cell. Every value here is read back by the card intake's game cell parser. */
export const PRODUCT_LINE_WORDS: Record<string, string> = {
  MTG: 'Magic',
  POKEMON: 'Pokemon',
  YUGIOH: 'YuGiOh',
  LORCANA: 'Disney Lorcana',
  ONE_PIECE: 'One Piece Card Game',
  OTHER: '',
};

export function productLineWord(game: string | null | undefined): string {
  if (!game) return '';
  return PRODUCT_LINE_WORDS[game] ?? (CARD_GAME_LABELS as Record<string, string>)[game] ?? '';
}

/** One Item with its card row, as the database returns it (only the fields used here). */
export interface SyncItemRow {
  id: string;
  createdAt: Date | string | number;
  status: string;
  stockTotal: number | null;
  stockSold: number;
  price: number | string | null;
  /** Present (non-null) when the item is a bulk lot (ADR-136 Addendum C). Lots are never part of the TCGplayer round trip. */
  bulkLot?: { itemId?: string } | null;
  card: {
    game: string | null;
    cardName: string | null;
    setName: string | null;
    collectorNumber: string | null;
    rarity: string | null;
    conditionCode: string | null;
    finish: string | null;
    grader: string | null;
    tcgplayerProductId: number | null;
    tcgplayerQty: number | null;
    tcgplayerPendingQty: number | null;
    tcgplayerSyncedAt?: Date | string | null;
  } | null;
}

export interface SyncUnit {
  itemId: string;
  createdAtMs: number;
  status: string;
  stockTotal: number;
  stockSold: number;
  /** Units that can be sold now: only an AVAILABLE item counts, held and sold-out items count as 0. */
  available: number;
  /** Quantity last known on TCGplayer for this item (null = never synced). */
  baseline: number | null;
  /** What the last export would leave on TCGplayer if it was uploaded (null = no export waiting). */
  pending: number | null;
  price: number | null;
}

export interface SyncGroup {
  key: string;
  productId: number;
  conditionCode: string | null;
  foil: boolean;
  game: string | null;
  cardName: string | null;
  setName: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  /** Oldest first, then by id, so every caller picks the same item. */
  units: SyncUnit[];
}

export interface GroupSkips {
  noTcgplayerId: number;
  graded: number;
  notACard: number;
  /** Bulk lots left out (ADR-136 Addendum C). Only present when at least one lot was seen. */
  bulkLots?: number;
}

export function availableUnits(row: Pick<SyncItemRow, 'status' | 'stockTotal' | 'stockSold'>): number {
  if (row.status !== 'AVAILABLE') return 0;
  return Math.max((row.stockTotal ?? 1) - row.stockSold, 0);
}

function toMs(v: Date | string | number): number {
  const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function toPrice(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function buildGroups(rows: readonly SyncItemRow[]): { groups: Map<string, SyncGroup>; skipped: GroupSkips } {
  const groups = new Map<string, SyncGroup>();
  const skipped: GroupSkips = { noTcgplayerId: 0, graded: 0, notACard: 0 };
  for (const row of rows) {
    // A bulk lot is a count of cards priced per 1,000. It can never match a TCGplayer row, whatever else it carries.
    if (row.bulkLot) {
      skipped.bulkLots = (skipped.bulkLots ?? 0) + 1;
      continue;
    }
    const card = row.card;
    if (!card) {
      skipped.notACard += 1;
      continue;
    }
    if (card.grader) {
      skipped.graded += 1;
      continue;
    }
    const productId = card.tcgplayerProductId;
    if (!Number.isInteger(productId) || (productId as number) <= 0) {
      skipped.noTcgplayerId += 1;
      continue;
    }
    const foil = isFoilFinish(card.finish);
    const key = groupKey(productId as number, card.conditionCode, foil);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        productId: productId as number,
        conditionCode: card.conditionCode ?? null,
        foil,
        game: card.game,
        cardName: card.cardName,
        setName: card.setName,
        collectorNumber: card.collectorNumber,
        rarity: card.rarity,
        units: [],
      };
      groups.set(key, g);
    }
    g.units.push({
      itemId: row.id,
      createdAtMs: toMs(row.createdAt),
      status: row.status,
      stockTotal: row.stockTotal ?? 1,
      stockSold: row.stockSold,
      available: availableUnits(row),
      baseline: card.tcgplayerQty,
      pending: card.tcgplayerPendingQty,
      price: toPrice(row.price),
    });
  }
  for (const g of groups.values()) {
    g.units.sort((a, b) => a.createdAtMs - b.createdAtMs || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  }
  return { groups, skipped };
}

export function groupAvailable(g: SyncGroup): number {
  return g.units.reduce((sum, u) => sum + u.available, 0);
}

/** Sum of the stored baselines. `known` is false when no item of the group was ever synced. */
export function groupBaseline(g: SyncGroup): { known: boolean; sum: number } {
  let known = false;
  let sum = 0;
  for (const u of g.units) {
    if (u.baseline !== null) {
      known = true;
      sum += u.baseline;
    }
  }
  return { known, sum };
}

/** A card is "listed on TCGplayer" when TCGplayer is known to hold at least one unit of it. */
export function isListedOnTcgplayer(g: SyncGroup): boolean {
  const b = groupBaseline(g);
  return b.known && b.sum > 0;
}
