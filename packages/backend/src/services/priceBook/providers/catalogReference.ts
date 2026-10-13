/**
 * CATALOG_REFERENCE provider (ADR-140 sections 5.2 and 14): the existing CardPrice row of a catalog printing.
 *
 * Source of the number: Scryfall, which carries marketplace numbers. Conditions, all enforced here and not only by the switch:
 *   - active only when CARD_CATALOG_PRICE_REFERENCE_ENABLED is not false AND the book opted in (isCatalogReferenceActive);
 *   - a printing whose CardPrinting.source is not SCRYFALL (for example TCGCSV) is refused, even if a price row exists;
 *   - English only, and never for a graded card;
 *   - a finish the printing does not come in is not priced.
 * The number is returned as a Near Mint value for the card's finish; the engine applies the condition multiplier.
 */
import type { CardPriceRow, CardPrintingRow, PriceBookTx, ProviderCard } from '../db';
import { chunk, toCentsOrNull } from '../db';
import { lookupKey } from '../cardKey';
import { SOURCE_LABELS } from '../messages';
import type { ReferenceCandidate } from '../types';
import { CATALOG_REFERENCE_TERMS, isAllowedCatalogOrigin, isCatalogReferenceActive } from './types';
import type { ProviderCtx, ReferenceProvider } from './types';

/**
 * Finish to the CardPrice column. The same mapping as FINISH_PRICE_FIELD in cardPriceSuggestionService.ts (a test pins the
 * two together); this file may not import that service.
 */
export const CATALOG_FINISH_FIELD: Readonly<Record<string, 'usd' | 'usdFoil' | 'usdEtched' | 'usdReverse'>> = {
  NONFOIL: 'usd',
  FOIL: 'usdFoil',
  HOLO: 'usdFoil',
  ETCHED: 'usdEtched',
  REVERSE_HOLO: 'usdReverse',
};

/** The printing id of a card key 'p:<id>', or null for a typed key. */
function printingIdOf(card: ProviderCard): string | null {
  if (card.catalogPrintingId) return card.catalogPrintingId;
  return card.cardKey.startsWith('p:') ? card.cardKey.slice(2) : null;
}

export const catalogReferenceProvider: ReferenceProvider<PriceBookTx> = {
  kind: 'CATALOG_REFERENCE',
  terms: CATALOG_REFERENCE_TERMS,
  isActive: ({ env, book }) => isCatalogReferenceActive(env, book),
  async fetch(ctx: ProviderCtx<PriceBookTx>, cards: ProviderCard[]): Promise<Map<string, ReferenceCandidate[]>> {
    const out = new Map<string, ReferenceCandidate[]>();
    // Defense in depth: the registry already checked, but a direct call must not bypass the switches.
    if (!isCatalogReferenceActive(ctx.env, ctx.book)) return out;

    const wanted = cards.filter((c) => c.language === 'en' && c.graded !== true && printingIdOf(c) !== null && CATALOG_FINISH_FIELD[c.finish] !== undefined);
    if (wanted.length === 0) return out;
    const ids = Array.from(new Set(wanted.map((c) => printingIdOf(c) as string)));

    const printings = new Map<string, CardPrintingRow>();
    const prices = new Map<string, CardPriceRow>();
    for (const part of chunk(ids, 1000)) {
      for (const p of await ctx.db.cardPrinting.findMany({ where: { id: { in: part } } })) {
        if (isAllowedCatalogOrigin(p.source)) printings.set(p.id, p);
      }
    }
    for (const part of chunk(Array.from(printings.keys()), 1000)) {
      for (const row of await ctx.db.cardPrice.findMany({ where: { printingId: { in: part } } })) prices.set(row.printingId, row);
    }

    for (const card of wanted) {
      const key = lookupKey(card.cardKey, card.finish, card.language);
      if (out.has(key)) continue;
      const id = printingIdOf(card) as string;
      const printing = printings.get(id);
      const price = prices.get(id);
      const field = CATALOG_FINISH_FIELD[card.finish];
      const list: ReferenceCandidate[] = [];
      if (printing && price && field) {
        const cents = toCentsOrNull(price[field]);
        if (cents !== null && printingHasFinish(printing, card.finish)) {
          list.push({
            kind: 'CATALOG_REFERENCE',
            valueCents: cents,
            asOf: price.asOf,
            origin: 'SCRYFALL',
            label: SOURCE_LABELS.CATALOG_REFERENCE,
            finish: card.finish,
            language: 'en',
          });
        }
      }
      out.set(key, list);
    }
    return out;
  },
};

/**
 * The printing's finishes use the card vocabulary (NONFOIL, FOIL, ETCHED, ...; scryfallIngest FINISH_MAP). An empty list means
 * the catalog did not say, so the price column decides. HOLO is priced from the foil column, so a foil printing serves it.
 */
function printingHasFinish(printing: CardPrintingRow, finish: string): boolean {
  const list = printing.finishes.map((f) => f.trim().toUpperCase());
  if (list.length === 0) return true;
  if (list.includes(finish)) return true;
  return finish === 'HOLO' && list.includes('FOIL');
}
