/**
 * SHOP_SOLD_HISTORY provider (ADR-140 section 5.3): the median of the shop's own recent sales of the same card.
 * Source of the number: Purchase rows of this organizer's items. No table of its own; computed on demand, per tenant only.
 *
 * FINDING: what Purchase.amount means (ADR-140 section 5.3 item 6, verified by reading the code that creates Purchase rows)
 *   - controllers/cashPaymentController.ts (createPurchaseRow) and controllers/posPaymentController.ts (manual card path,
 *     payment link path, cart path): one Purchase row per cart line, amount = the line price (dollars) after the share of a
 *     cart-level discount, discount share kept in discountAmountCents. A catalog (non lot) item is sold with
 *     sellItemUnits(itemId, 1): ONE unit per row. The cart line quantity is accepted only for a bulk lot line; a quantity on
 *     a non lot item is refused. So for a single card, amount is the price of one unit, also when the item has stock of
 *     several units (Item.quantity / stockTotal above 1): selling two copies writes two rows.
 *   - controllers/vendorBoothCartController.ts: one row per cart line, amount = the net line price, sellItemUnits(id, 1).
 *   - A lot line (bulk cards) writes ONE row for many cards and sets bulkQuantity (cashPaymentController about line 393,
 *     vendorBoothCartController about line 2336). That is the only row that can cover several units, and it is excluded by
 *     bulkQuantity IS NULL here.
 *   - A miscellaneous line has itemId null and is excluded. A consignor tag line mints its own item and is a one off price.
 *   - ONLINE rows (source ONLINE) are NOT used: the checkout flow was not verified to exclude shipping and fees from amount
 *     (UNVERIFIED), so only source POS is read (SOLD_HISTORY_SOURCES).
 *
 * Unit price = amount plus the cashier discount add back (discountAmountCents and cashierDiscretionAmountCents, both cents):
 * the shelf price before a discount the cashier chose, because that discount is not the card's value. Then the Near Mint
 * equivalent: unit price divided by the sold card's condition multiplier (NM when blank), half up.
 */
import type { ItemCardRow, PriceBookTx, ProviderCard, PurchaseRow } from '../db';
import { chunk } from '../db';
import { lookupKey } from '../cardKey';
import { identityFromItemCard, nearMintEquivalentCents } from '../referenceService';
import { roundHalfUp } from '../rounding';
import type { BookSettings, ReferenceCandidate } from '../types';
import { DAY_MS } from '../vocabulary';
import type { ProviderCtx, ReferenceProvider } from './types';

/** Purchase.source values whose amount is verified to be the unit price of the item. */
export const SOLD_HISTORY_SOURCES: readonly string[] = ['POS'];

export function soldHistoryLabel(n: number): string {
  return `Your last ${n} sales (median)`;
}

/** The sale price of one unit before any cashier discount, in cents. */
export function unitPriceCents(p: Pick<PurchaseRow, 'amount' | 'discountAmountCents' | 'cashierDiscretionAmountCents'>): number | null {
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount < 0) return null;
  const base = Math.round(p.amount * 100);
  const discount = Math.max(0, p.discountAmountCents ?? 0);
  const discretion = Math.max(0, p.cashierDiscretionAmountCents ?? 0);
  return base + discount + discretion;
}

/** Median of whole cents: the middle value, or for an even count the average of the two middle values, half up. */
export function medianCents(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  if (a === undefined || b === undefined) return null;
  return roundHalfUp(a + b, 2);
}

/** A row counts only when it is a paid, real, one unit POS sale of a catalog or typed item that was not refunded. */
export function isUsablePurchase(p: PurchaseRow): boolean {
  if (p.itemId === null || p.itemId === '') return false;
  if (p.status !== 'PAID') return false;
  if (p.isTestTransaction !== false) return false;
  if (p.bulkQuantity !== null && p.bulkQuantity !== undefined) return false;
  if (p.refundedAmount !== null && p.refundedAmount !== undefined && p.refundedAmount !== 0) return false;
  return SOLD_HISTORY_SOURCES.includes(p.source);
}

export interface Sale {
  id: string;
  at: Date;
  nmCents: number;
}

const typedSetCodeVariants = (setCode: string): string[] => Array.from(new Set([setCode, setCode.toLowerCase(), setCode.toUpperCase()]));

function printingIdOf(card: ProviderCard): string | null {
  if (card.catalogPrintingId) return card.catalogPrintingId;
  return card.cardKey.startsWith('p:') ? card.cardKey.slice(2) : null;
}

/** Stock card records that could be one of the wanted cards, read by organizer, printing or typed fields. */
async function candidateItemCards(ctx: ProviderCtx<PriceBookTx>, wanted: ProviderCard[]): Promise<ItemCardRow[]> {
  const found: ItemCardRow[] = [];
  const printingIds = Array.from(new Set(wanted.map(printingIdOf).filter((id): id is string => id !== null)));
  for (const part of chunk(printingIds, 500)) {
    found.push(...(await ctx.db.itemCard.findMany({ where: { organizerId: ctx.organizerId, catalogPrintingId: { in: part } } })));
  }
  const typedGroups = new Map<string, { game: string; setCode: string | null }>();
  for (const c of wanted) {
    if (printingIdOf(c) !== null) continue;
    const setCode = c.setCode && c.setCode.trim() !== '' ? c.setCode.trim() : null;
    typedGroups.set(`${c.game}|${setCode ?? ''}`, { game: c.game, setCode });
  }
  for (const g of typedGroups.values()) {
    const where: Record<string, unknown> = { organizerId: ctx.organizerId, catalogPrintingId: null, game: g.game };
    where.setCode = g.setCode === null ? null : { in: typedSetCodeVariants(g.setCode) };
    found.push(...(await ctx.db.itemCard.findMany({ where })));
  }
  return found;
}

export async function loadSoldSales(ctx: ProviderCtx<PriceBookTx>, cards: ProviderCard[]): Promise<Map<string, Sale[]>> {
  const out = new Map<string, Sale[]>();
  const wanted = new Map<string, ProviderCard>();
  for (const c of cards) {
    if (c.graded === true) continue;
    wanted.set(lookupKey(c.cardKey, c.finish, c.language), c);
  }
  if (wanted.size === 0) return out;

  // 1. Stock records of this organizer that are the same card at the same finish and language.
  const itemKey = new Map<string, { key: string; conditionCode: string | null }>();
  const cardRows = await candidateItemCards(ctx, Array.from(wanted.values()));
  cardRows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of cardRows) {
    if (row.productType !== 'SINGLE' || (row.grader && row.grader.trim() !== '')) continue;
    const finish = (row.finish ?? '').trim().toUpperCase();
    const language = (row.language ?? 'en').trim().toLowerCase() || 'en';
    const key = lookupKey(identityFromItemCard(row).cardKey, finish, language);
    if (!wanted.has(key) || itemKey.has(row.itemId)) continue;
    itemKey.set(row.itemId, { key, conditionCode: row.conditionCode });
  }
  if (itemKey.size === 0) return out;

  // 2. The item itself must belong to this organizer (the record's own organizerId is not trusted alone).
  const owned = new Set<string>();
  for (const part of chunk(Array.from(itemKey.keys()), 500)) {
    for (const it of await ctx.db.item.findMany({ where: { id: { in: part }, organizerId: ctx.organizerId } })) owned.add(it.id);
  }

  // 3. Their paid POS sales inside the window.
  const since = new Date(ctx.now.getTime() - ctx.book.soldHistoryWindowDays * DAY_MS);
  const book: BookSettings = ctx.book;
  for (const part of chunk(Array.from(owned), 200)) {
    const rows = await ctx.db.purchase.findMany({
      where: {
        itemId: { in: part },
        status: 'PAID',
        isTestTransaction: false,
        bulkQuantity: null,
        source: { in: [...SOLD_HISTORY_SOURCES] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
    for (const p of rows) {
      if (!isUsablePurchase(p) || p.itemId === null) continue;
      const info = itemKey.get(p.itemId);
      if (!info || !owned.has(p.itemId)) continue;
      if (p.createdAt.getTime() < since.getTime()) continue;
      const unit = unitPriceCents(p);
      if (unit === null || unit < 1) continue;
      const nm = nearMintEquivalentCents(unit, info.conditionCode, book);
      if (nm === null || nm < 1) continue;
      const list = out.get(info.key) ?? [];
      list.push({ id: p.id, at: p.createdAt, nmCents: nm });
      out.set(info.key, list);
    }
  }
  return out;
}

export const soldHistoryProvider: ReferenceProvider<PriceBookTx> = {
  kind: 'SHOP_SOLD_HISTORY',
  terms: { status: 'CLEARED', reviewedOn: null, reference: 'ADR-140 section 5.3 (own data; the terms clause is pending, section 14)' },
  isActive: () => true,
  async fetch(ctx: ProviderCtx<PriceBookTx>, cards: ProviderCard[]): Promise<Map<string, ReferenceCandidate[]>> {
    const result = new Map<string, ReferenceCandidate[]>();
    const sales = await loadSoldSales(ctx, cards);
    const minSales = Math.max(1, ctx.book.soldHistoryMinSales);
    const maxSales = Math.max(minSales, ctx.book.soldHistoryMaxSales);
    for (const c of cards) {
      const key = lookupKey(c.cardKey, c.finish, c.language);
      if (result.has(key)) continue;
      const list = (sales.get(key) ?? []).slice();
      list.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const used = list.slice(0, maxSales);
      if (c.graded === true || used.length < minSales) {
        result.set(key, []);
        continue;
      }
      const value = medianCents(used.map((s) => s.nmCents));
      const newest = used[0];
      if (value === null || value < 1 || newest === undefined) {
        result.set(key, []);
        continue;
      }
      result.set(key, [
        {
          kind: 'SHOP_SOLD_HISTORY',
          valueCents: value,
          asOf: newest.at,
          origin: 'SHOP',
          label: soldHistoryLabel(used.length),
          sampleCount: used.length,
          finish: c.finish,
          language: c.language,
        },
      ]);
    }
    return result;
  },
};
