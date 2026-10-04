/**
 * In-memory stand-in for the slice of the database that the card record code touches (ItemCard,
 * CardPrinting, Item ownership lookup, Organizer lookup). Used by cardRecordService.test.ts and
 * itemCardRoutes.test.ts so no real database is ever involved. ADR-134 batch B2.
 */
export interface FakeSeed {
  items?: any[];
  organizers?: any[];
  printings?: any[];
}

function project(row: any, select?: Record<string, unknown>): any {
  if (!row) return null;
  const copy: any = { ...row, lockedFields: Array.isArray(row.lockedFields) ? [...row.lockedFields] : row.lockedFields };
  if (!select) return copy;
  const out: any = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = copy[key];
  }
  return out;
}

export function makeFakeCardDb(seed: FakeSeed = {}) {
  const items = new Map<string, any>((seed.items ?? []).map((i) => [i.id, i]));
  const printings = new Map<string, any>((seed.printings ?? []).map((p) => [p.id, p]));
  const organizers: any[] = seed.organizers ?? [];
  const cards = new Map<string, any>(); // keyed by itemId
  let nextId = 1;

  const db: any = {
    cards,
    calls: { cardCreate: 0, cardUpdate: 0 },
    item: {
      findUnique: async ({ where }: any) => (items.has(where.id) ? { ...items.get(where.id) } : null),
    },
    organizer: {
      findFirst: async ({ where }: any) =>
        organizers.find((o) => o.id === where.id && o.userId === where.userId) ?? null,
    },
    itemCard: {
      findUnique: async ({ where, select }: any) => project(cards.get(where.itemId), select),
      create: async ({ data, select }: any) => {
        if (cards.has(data.itemId)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        db.calls.cardCreate += 1;
        const row = { id: `card_${nextId++}`, ...data };
        cards.set(data.itemId, row);
        return project(row, select);
      },
      update: async ({ where, data, select }: any) => {
        const existing = cards.get(where.itemId);
        if (!existing) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
        db.calls.cardUpdate += 1;
        const row = { ...existing, ...data };
        cards.set(where.itemId, row);
        return project(row, select);
      },
    },
    cardPrinting: {
      findUnique: async ({ where }: any) => (printings.has(where.id) ? { ...printings.get(where.id) } : null),
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(db),
  };
  return db;
}

/** A catalog printing row shaped like CardPrinting. */
export function printingRow(over: Record<string, unknown> = {}): any {
  return {
    id: 'SCRYFALL:aaaa-bbbb',
    source: 'SCRYFALL',
    game: 'MTG',
    name: 'Lightning Bolt',
    nameNorm: 'lightning bolt',
    setCode: 'LEA',
    setName: 'Limited Edition Alpha',
    collectorNumber: '161',
    language: 'en',
    rarity: 'common',
    releaseYear: 1993,
    finishes: ['nonfoil'],
    scryfallId: 'aaaa-bbbb',
    tcgplayerProductId: 12345,
    cardmarketId: 678,
    ...over,
  };
}
