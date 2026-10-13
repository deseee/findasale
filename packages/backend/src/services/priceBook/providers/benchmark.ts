/**
 * SHOP_BENCHMARK provider (ADR-140 section 5.2): a typical Near Mint value the shop sets for a kind of card (game, rarity
 * class, finish). This is how a line with no history starts. Source of the number: the shop. Table PriceBookBenchmark.
 *
 * A benchmark for finish 'ANY' is returned for every finish; the engine prefers the exact finish (engine.ts compatRank).
 * A card whose rarity class is unknown has no benchmark.
 */
import type { PriceBookTx, ProviderCard } from '../db';
import { lookupKey } from '../cardKey';
import { SOURCE_LABELS } from '../messages';
import type { ReferenceCandidate } from '../types';
import type { ProviderCtx, ReferenceProvider } from './types';

export const benchmarkProvider: ReferenceProvider<PriceBookTx> = {
  kind: 'SHOP_BENCHMARK',
  terms: { status: 'CLEARED', reviewedOn: null, reference: 'ADR-140 section 5.2 (the shop types its own numbers)' },
  isActive: () => true,
  async fetch(ctx: ProviderCtx<PriceBookTx>, cards: ProviderCard[]): Promise<Map<string, ReferenceCandidate[]>> {
    const out = new Map<string, ReferenceCandidate[]>();
    const games = Array.from(new Set(cards.map((c) => c.game)));
    if (games.length === 0) return out;
    const rows = await ctx.db.priceBookBenchmark.findMany({ where: { bookId: ctx.bookId, game: { in: games } } });
    for (const card of cards) {
      const key = lookupKey(card.cardKey, card.finish, card.language);
      if (out.has(key)) continue;
      const rarity = (card.rarityClass ?? '').trim().toUpperCase();
      const list: ReferenceCandidate[] = [];
      if (rarity !== '' && rarity !== 'UNKNOWN') {
        for (const r of rows) {
          if (r.game !== card.game || r.rarityClass !== rarity) continue;
          if (r.finish !== card.finish && r.finish !== 'ANY') continue;
          if (!Number.isSafeInteger(r.valueCents) || r.valueCents < 1) continue;
          list.push({
            kind: 'SHOP_BENCHMARK',
            valueCents: r.valueCents,
            asOf: r.asOf,
            origin: 'SHOP',
            label: SOURCE_LABELS.SHOP_BENCHMARK,
            note: r.note,
            finish: r.finish,
          });
        }
      }
      out.set(key, list);
    }
    return out;
  },
};
