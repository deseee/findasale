/**
 * MANUAL provider (ADR-140 section 5.2): the price the shop typed for one card at one finish and language. Source of the
 * number: the shop. Table PriceBookReference, read through the injected db with bookId in every query.
 *
 * For a card in another language than English the English reference of the same card and finish is returned as well, marked
 * language 'en', and the engine prefers the exact language (engine.ts compatRank).
 */
import type { PriceBookTx, ProviderCard } from '../db';
import { chunk } from '../db';
import { lookupKey } from '../cardKey';
import { SOURCE_LABELS } from '../messages';
import type { ReferenceCandidate } from '../types';
import type { ProviderCtx, ReferenceProvider } from './types';

export const manualProvider: ReferenceProvider<PriceBookTx> = {
  kind: 'MANUAL',
  terms: { status: 'CLEARED', reviewedOn: null, reference: 'ADR-140 section 5.2 (the shop types its own numbers)' },
  isActive: () => true,
  async fetch(ctx: ProviderCtx<PriceBookTx>, cards: ProviderCard[]): Promise<Map<string, ReferenceCandidate[]>> {
    const out = new Map<string, ReferenceCandidate[]>();
    if (cards.length === 0) return out;
    const keys = Array.from(new Set(cards.map((c) => c.cardKey)));
    const rows: Array<Awaited<ReturnType<PriceBookTx['priceBookReference']['findMany']>>[number]> = [];
    for (const part of chunk(keys, 500)) {
      rows.push(...(await ctx.db.priceBookReference.findMany({ where: { bookId: ctx.bookId, cardKey: { in: part } } })));
    }
    const byCard = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byCard.get(r.cardKey) ?? [];
      list.push(r);
      byCard.set(r.cardKey, list);
    }
    for (const card of cards) {
      const key = lookupKey(card.cardKey, card.finish, card.language);
      if (out.has(key)) continue;
      const list: ReferenceCandidate[] = [];
      for (const r of byCard.get(card.cardKey) ?? []) {
        if (r.finish !== card.finish) continue;
        if (r.language !== card.language && r.language !== 'en') continue;
        if (!Number.isSafeInteger(r.valueCents) || r.valueCents < 1) continue;
        list.push({
          kind: 'MANUAL',
          valueCents: r.valueCents,
          asOf: r.asOf,
          origin: 'SHOP',
          label: SOURCE_LABELS.MANUAL,
          note: r.note,
          finish: r.finish,
          language: r.language,
        });
      }
      out.set(key, list);
    }
    return out;
  },
};
