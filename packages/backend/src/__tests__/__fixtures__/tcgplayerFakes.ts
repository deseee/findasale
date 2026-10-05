/**
 * Builders for the TCGplayer round trip tests (ADR-137): item rows as the database returns them, and an in-memory
 * stand-in for the few Prisma calls syncService makes. Nothing here touches a real database, the network or a file.
 */
import type { SyncItemRow } from '../../services/cardTcgplayer/groups';
import type { SyncDb, SyncDeps, SyncTx } from '../../services/cardTcgplayer/syncService';

export interface FakeCardRow {
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
  tcgplayerSyncedAt: Date | null;
  tcgplayerPendingAt: Date | null;
}

export interface FakeItemRow {
  id: string;
  saleId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  status: string;
  stockTotal: number | null;
  stockSold: number;
  price: number | null;
  card: FakeCardRow | null;
}

let counter = 0;

export function fakeItem(
  id: string,
  over: Partial<Omit<FakeItemRow, 'card'>> & { card?: Partial<FakeCardRow> | null } = {}
): FakeItemRow {
  counter += 1;
  const { card, ...rest } = over;
  return {
    id,
    saleId: 'sale-1',
    deletedAt: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)),
    status: 'AVAILABLE',
    stockTotal: 1,
    stockSold: 0,
    price: null,
    card:
      card === null
        ? null
        : {
            game: 'MTG',
            cardName: 'Lightning Bolt',
            setName: 'Alpha',
            collectorNumber: '161',
            rarity: 'common',
            conditionCode: 'NM',
            finish: 'NONFOIL',
            grader: null,
            tcgplayerProductId: 1001,
            tcgplayerQty: null,
            tcgplayerPendingQty: null,
            tcgplayerSyncedAt: null,
            tcgplayerPendingAt: null,
            ...(card ?? {}),
          },
    ...rest,
  };
}

/** A SyncItemRow (the pure modules' input) from a fake row. */
export function toSyncRow(row: FakeItemRow): SyncItemRow {
  return row as unknown as SyncItemRow;
}

function cardMatches(card: FakeCardRow | null, filter: any): boolean {
  if (!filter) return true;
  if ('isNot' in filter && filter.isNot === null) return card !== null;
  if (filter.is) {
    if (!card) return false;
    const want = filter.is.tcgplayerProductId;
    if (want && typeof want === 'object' && 'in' in want) return want.in.includes(card.tcgplayerProductId);
  }
  return true;
}

export class FakeSyncDb implements SyncDb {
  items: FakeItemRow[];
  /** Number of $transaction calls, to assert batching. */
  transactions = 0;
  writes = 0;

  constructor(items: FakeItemRow[] = []) {
    this.items = items;
  }

  snapshot(): string {
    return JSON.stringify(this.items);
  }

  find(id: string): FakeItemRow {
    const hit = this.items.find((i) => i.id === id);
    if (!hit) throw new Error(`no fake item ${id}`);
    return hit;
  }

  card(id: string): FakeCardRow {
    const c = this.find(id).card;
    if (!c) throw new Error(`no fake card ${id}`);
    return c;
  }

  item = {
    findMany: async (args: any): Promise<any[]> => {
      const w = args.where ?? {};
      let rows = this.items.filter((i) => {
        if ('saleId' in w && i.saleId !== w.saleId) return false;
        if ('deletedAt' in w && w.deletedAt === null && i.deletedAt !== null) return false;
        if (w.id && w.id.in && !w.id.in.includes(i.id)) return false;
        if ('card' in w && !cardMatches(i.card, w.card)) return false;
        return true;
      });
      rows = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (args.cursor) {
        const at = rows.findIndex((r) => r.id === args.cursor.id);
        rows = rows.slice(at + (args.skip ?? 0));
      }
      if (typeof args.take === 'number') rows = rows.slice(0, args.take);
      return rows.map((r) => JSON.parse(JSON.stringify(r), (k, v) => (k === 'createdAt' || k === 'tcgplayerSyncedAt' || k === 'tcgplayerPendingAt' || k === 'deletedAt') && typeof v === 'string' ? new Date(v) : v));
    },
  };

  itemCard = {
    findMany: async (args: any): Promise<any[]> => {
      const w = args.where ?? {};
      let rows = this.items.filter((i) => {
        if (!i.card) return false;
        if (w.tcgplayerPendingQty && 'not' in w.tcgplayerPendingQty && i.card.tcgplayerPendingQty === null) return false;
        const scope = w.item?.is;
        if (scope && 'saleId' in scope && i.saleId !== scope.saleId) return false;
        if (scope && scope.deletedAt === null && i.deletedAt !== null) return false;
        return true;
      });
      if (typeof args.take === 'number') rows = rows.slice(0, args.take);
      return rows.map((r) => ({ itemId: r.id, tcgplayerPendingQty: r.card!.tcgplayerPendingQty }));
    },
    update: async (args: any): Promise<any> => {
      this.writes += 1;
      const row = this.find(args.where.itemId);
      Object.assign(row.card as object, args.data);
      return row.card;
    },
    updateMany: async (args: any): Promise<{ count: number }> => {
      const w = args.where ?? {};
      let count = 0;
      for (const i of this.items) {
        if (!i.card) continue;
        if (w.itemId?.in && !w.itemId.in.includes(i.id)) continue;
        if (w.tcgplayerPendingQty && 'not' in w.tcgplayerPendingQty && i.card.tcgplayerPendingQty === null) continue;
        const scope = w.item?.is;
        if (scope && 'saleId' in scope && i.saleId !== scope.saleId) continue;
        Object.assign(i.card, args.data);
        count += 1;
      }
      this.writes += 1;
      return { count };
    },
  };

  async $transaction<T>(fn: (tx: SyncTx) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const before = this.snapshot();
    try {
      return await fn(this);
    } catch (err) {
      // roll back like a real transaction
      this.items = JSON.parse(before, (k, v) => (k === 'createdAt' || k === 'tcgplayerSyncedAt' || k === 'tcgplayerPendingAt' || k === 'deletedAt') && typeof v === 'string' ? new Date(v) : v);
      throw err;
    }
  }
}

export class FakeInsufficientStock extends Error {
  constructor() {
    super('insufficient');
    this.name = 'InsufficientStockError';
  }
}

/** Same semantics as itemStockService.sellItemUnits, on the fake store. */
export function fakeDeps(db: FakeSyncDb, sold: Array<{ itemId: string; fullySoldOut: boolean; remainingStock: number }> = []): SyncDeps {
  return {
    sellUnits: async (itemId, units) => {
      const item = db.find(itemId);
      const total = item.stockTotal ?? 1;
      if (item.stockSold + units > total) throw new FakeInsufficientStock();
      item.stockSold += units;
      const fullySoldOut = item.stockSold >= total;
      if (fullySoldOut) item.status = 'SOLD';
      return { fullySoldOut, remainingStock: Math.max(total - item.stockSold, 0) };
    },
    raiseUnits: async (itemId, units) => {
      const item = db.find(itemId);
      if (item.status !== 'AVAILABLE') return false;
      item.stockTotal = (item.stockTotal ?? 1) + units;
      return true;
    },
    onSold: (r) => {
      sold.push(r);
    },
    now: () => new Date('2026-10-05T12:00:00.000Z'),
  };
}
