/**
 * In-memory stand-ins for the card intake tests (ADR-134 batch B4): a Prisma-shaped database (sale, items with a
 * nested card, the CardIntakeBatch ledger, interactive transactions with rollback) and a catalog resolver.
 * Nothing here touches a real database, the network or a file outside the test's own temp directory.
 */
import type { CatalogState, PrintingDto, ResolveRef, ResolveResult } from '../../services/cardCatalog/cardCatalogLookup';

export interface FakeItem {
  id: string;
  saleId: string | null;
  organizerId: string | null;
  title: string;
  sku: string | null;
  status: string;
  deletedAt: Date | null;
  stockTotal: number | null;
  stockSold: number;
  createdAt: Date;
  price: number | null;
  card: Record<string, any> | null;
  [k: string]: any;
}

function matches(item: FakeItem, where: any): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries<any>(where)) {
    if (key === 'card') {
      const inner = cond?.is;
      if (!item.card) return false;
      for (const [ck, cv] of Object.entries<any>(inner ?? {})) {
        const v = item.card[ck];
        if (cv && typeof cv === 'object' && 'in' in cv) {
          if (!cv.in.includes(v)) return false;
        } else if (v !== cv) return false;
      }
      continue;
    }
    const v = (item as any)[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond && !cond.in.includes(v)) return false;
    } else if (v !== cond) return false;
  }
  return true;
}

function project(item: FakeItem, select?: any): any {
  if (!select) return { ...item };
  const out: any = {};
  for (const k of Object.keys(select)) {
    if (!select[k]) continue;
    if (k === 'card') out.card = item.card ? Object.fromEntries(Object.keys(select.card.select ?? {}).map((ck) => [ck, item.card![ck]])) : null;
    else out[k] = (item as any)[k];
  }
  return out;
}

export interface FakeIntakeSeed {
  sales?: Array<{ id: string; organizerId: string; userId: string }>;
  items?: Array<Partial<FakeItem> & { id: string }>;
}

export function makeFakeIntakeDb(seed: FakeIntakeSeed = {}) {
  const sales = new Map((seed.sales ?? []).map((s) => [s.id, s]));
  const items = new Map<string, FakeItem>();
  const batches = new Map<string, any>();
  let clock = 1_700_000_000_000;
  let nextId = 1;
  const state = {
    items,
    batches,
    transactions: 0,
    locks: [] as string[],
    itemCreates: 0,
    itemUpdates: 0,
    /** When set, the Nth chunk transaction (1-based, counting from now) throws after doing its writes. */
    failTransactionNumber: 0,
    /** Called after each committed transaction (used to simulate a disconnect). */
    afterCommit: null as null | ((n: number) => void),
  };

  const addItem = (partial: Partial<FakeItem> & { id: string }): FakeItem => {
    const item: FakeItem = {
      saleId: null,
      organizerId: null,
      title: 'x',
      sku: null,
      status: 'AVAILABLE',
      deletedAt: null,
      stockTotal: 1,
      stockSold: 0,
      createdAt: new Date(clock++),
      price: null,
      card: null,
      ...partial,
    };
    items.set(item.id, item);
    return item;
  };
  (seed.items ?? []).forEach(addItem);

  const itemApi = (undo: Array<() => void> | null) => ({
    findMany: async (args: any) => {
      let rows = Array.from(items.values()).filter((i) => matches(i, args?.where));
      if (args?.orderBy?.createdAt === 'asc') rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return rows.map((r) => project(r, args?.select));
    },
    create: async (args: any) => {
      const { card, ...rest } = args.data;
      const id = `item_${nextId++}`;
      const item = addItem({ ...rest, id, card: card?.create ? { ...card.create } : null, stockSold: 0 });
      state.itemCreates += 1;
      undo?.push(() => items.delete(id));
      return project(item, args.select);
    },
    update: async (args: any) => {
      const item = items.get(args.where.id);
      if (!item) throw Object.assign(new Error('not found'), { code: 'P2025' });
      const before = { ...item };
      Object.assign(item, args.data);
      state.itemUpdates += 1;
      undo?.push(() => Object.assign(item, before));
      return project(item, args.select);
    },
  });

  const batchKey = (w: any) => {
    const u = w.organizerId_saleId_fileSha256_mode;
    return `${u.organizerId}|${u.saleId}|${u.fileSha256}|${u.mode}`;
  };
  const batchApi = (undo: Array<() => void> | null) => ({
    findUnique: async (args: any) => {
      if (args.where.id) return batches.get(args.where.id) ? { ...batches.get(args.where.id) } : null;
      const found = Array.from(batches.values()).find((b) => `${b.organizerId}|${b.saleId}|${b.fileSha256}|${b.mode}` === batchKey(args.where));
      return found ? { ...found } : null;
    },
    create: async (args: any) => {
      const dupe = Array.from(batches.values()).find((b) => b.organizerId === args.data.organizerId && b.saleId === args.data.saleId && b.fileSha256 === args.data.fileSha256 && b.mode === args.data.mode);
      if (dupe) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      const row = {
        id: `batch_${nextId++}`,
        fileName: null,
        status: 'RUNNING',
        rowsTotal: 0,
        committedThroughRow: 0,
        createdCount: 0,
        mergedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        errorSample: null,
        ...args.data,
      };
      batches.set(row.id, row);
      return { ...row };
    },
    update: async (args: any) => {
      const row = batches.get(args.where.id);
      if (!row) throw new Error('batch not found');
      const before = { ...row };
      Object.assign(row, args.data);
      undo?.push(() => Object.assign(row, before));
      return { ...row };
    },
  });

  const db: any = {
    state,
    addItem,
    sale: {
      findUnique: async ({ where }: any) => {
        const s = sales.get(where.id);
        return s ? { id: s.id, organizerId: s.organizerId, organizer: { userId: s.userId } } : null;
      },
    },
    item: itemApi(null),
    cardIntakeBatch: batchApi(null),
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      state.transactions += 1;
      const undo: Array<() => void> = [];
      const tx = {
        $executeRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
          state.locks.push(String(values[0]));
          return 1;
        },
        item: itemApi(undo),
        cardIntakeBatch: batchApi(undo),
      };
      try {
        const result = await fn(tx);
        if (state.failTransactionNumber && state.transactions === state.failTransactionNumber) {
          throw new Error('simulated database failure');
        }
        state.afterCommit?.(state.transactions);
        return result;
      } catch (err) {
        for (const u of undo.reverse()) u();
        throw err;
      }
    },
  };
  return db;
}

// ---------------------------------------------------------------------------------------------
// Catalog fakes
// ---------------------------------------------------------------------------------------------

export function printing(over: Partial<PrintingDto> = {}): PrintingDto {
  return {
    id: 'SCRYFALL:00000000-0000-4000-8000-000000000001',
    source: 'SCRYFALL',
    game: 'MTG',
    name: 'Lightning Bolt',
    setCode: 'lea',
    setName: 'Limited Edition Alpha',
    collectorNumber: '161',
    language: 'en',
    rarity: 'common',
    releaseYear: 1993,
    finishes: ['NONFOIL'],
    scryfallId: '00000000-0000-4000-8000-000000000001',
    tcgplayerProductId: 1001,
    cardmarketId: null,
    imageSmallUrl: null,
    imageNormalUrl: null,
    price: null,
    ...over,
  };
}

export const READY_STATE: CatalogState = {
  enabled: true,
  catalogReady: true,
  readyGames: ['MTG'],
  dataAsOf: { SCRYFALL: '2026-10-03T21:05:42.559Z', TCGCSV: null },
  sources: [],
};

/**
 * A resolver over a fixed list of printings. Matches by scryfall id, then tcgplayer id, then set code plus
 * collector number (numerator compare), then exact name. One match is EXACT, several AMBIGUOUS, none UNMATCHED.
 */
export function makeResolver(printings: PrintingDto[]) {
  const calls: ResolveRef[][] = [];
  const resolve = async (refs: ResolveRef[]): Promise<ResolveResult[]> => {
    calls.push(refs);
    return refs.map((r) => {
      const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();
      const num = (s: string | null | undefined) => String(s ?? '').split('/')[0].replace(/^0+(?=\d)/, '').toLowerCase();
      let hits = printings.filter((p) => p.game === r.game);
      if (r.scryfallId && hits.some((p) => p.scryfallId === r.scryfallId)) hits = hits.filter((p) => p.scryfallId === r.scryfallId);
      else if (r.tcgplayerProductId && hits.some((p) => p.tcgplayerProductId === r.tcgplayerProductId)) hits = hits.filter((p) => p.tcgplayerProductId === r.tcgplayerProductId);
      else if (r.setCode && r.collectorNumber) hits = hits.filter((p) => norm(p.setCode) === norm(r.setCode) && num(p.collectorNumber) === num(r.collectorNumber));
      else if (r.name) hits = hits.filter((p) => norm(p.name) === norm(r.name) && (!r.setCode || norm(p.setCode) === norm(r.setCode)));
      else hits = [];
      return {
        ref: r.ref,
        status: hits.length === 0 ? 'UNMATCHED' : hits.length === 1 ? 'EXACT' : 'AMBIGUOUS',
        candidates: hits.slice(0, 5),
        truncated: hits.length > 5,
      } as ResolveResult;
    });
  };
  return { resolve, calls };
}
