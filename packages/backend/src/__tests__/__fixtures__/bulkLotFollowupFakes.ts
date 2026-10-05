/**
 * In-memory fake database for the bulk lot follow-up tests (ADR-136 Addendum B). Implements only what the follow-up services
 * call: item, purchase, bulkLotHold, bulkLotAdjustment, bulkLotRefund, holdInvoice, boothCartBulkLine, itemBulkLot,
 * boothCartTransaction, plus $transaction with real rollback (a throw restores every table), and a faithful stand-in for the
 * guarded stock increment (sellItemUnitsInTransaction): it never lets stockSold pass stockTotal.
 */
export type Row = Record<string, any>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(cond as Row[]).some((w) => matches(row, w))) return false;
      continue;
    }
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      const c = cond as Row;
      if ('in' in c && !(c.in as any[]).includes(v)) return false;
      if ('not' in c && v === c.not) return false;
      if ('gte' in c && !(v >= c.gte)) return false;
      if ('gt' in c && !(v > c.gt)) return false;
      if ('lte' in c && !(v <= c.lte)) return false;
      if ('lt' in c && !(v < c.lt)) return false;
      if ('equals' in c && v !== c.equals) return false;
    } else if (v !== cond && !(cond === null && v === undefined)) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && ('increment' in v || 'decrement' in v)) {
      row[k] = (Number(row[k]) || 0) + (Number((v as Row).increment) || 0) - (Number((v as Row).decrement) || 0);
    } else if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && 'update' in v) {
      // nested relation write, ignored
    } else {
      row[k] = v;
    }
  }
}

class Table {
  rows: Row[] = [];
  constructor(private name: string, private db: FakeDb, private hooks: { decorate?: (row: Row) => Row } = {}) {}
  private out(row: Row): Row {
    const copy = { ...row };
    return this.hooks.decorate ? this.hooks.decorate(copy) : copy;
  }
  async create({ data }: { data: Row }): Promise<Row> {
    const row: Row = { id: data.id ?? `${this.name}_${++this.db.seq}`, createdAt: new Date(this.db.clock + this.db.seq), updatedAt: new Date(), ...data };
    this.rows.push(row);
    return this.out(row);
  }
  async findUnique({ where }: { where: Row }): Promise<Row | null> {
    const r = this.rows.find((x) => matches(x, where));
    return r ? this.out(r) : null;
  }
  async findFirst({ where }: { where?: Row }): Promise<Row | null> {
    const r = this.rows.find((x) => matches(x, where));
    return r ? this.out(r) : null;
  }
  async findMany(args: { where?: Row; orderBy?: Row; take?: number } = {}): Promise<Row[]> {
    let list = this.rows.filter((x) => matches(x, args.where));
    if (args.orderBy) {
      const [[key, dir]] = Object.entries(args.orderBy);
      list = [...list].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    if (args.take) list = list.slice(0, args.take);
    return list.map((r) => this.out(r));
  }
  async count(args: { where?: Row } = {}): Promise<number> {
    return this.rows.filter((x) => matches(x, args.where)).length;
  }
  async update({ where, data }: { where: Row; data: Row }): Promise<Row> {
    const r = this.rows.find((x) => matches(x, where));
    if (!r) throw new Error(`${this.name}.update: not found`);
    applyData(r, data);
    return this.out(r);
  }
  async updateMany({ where, data }: { where?: Row; data: Row }): Promise<{ count: number }> {
    const hit = this.rows.filter((x) => matches(x, where));
    for (const r of hit) applyData(r, data);
    return { count: hit.length };
  }
}

export class FakeDb {
  seq = 0;
  clock = Date.UTC(2026, 9, 5, 12, 0, 0);
  lots = new Set<string>();
  item = new Table('item', this, {
    decorate: (row) => ({ ...row, bulkLot: this.lots.has(row.id) ? { id: `lot_${row.id}` } : null }),
  });
  purchase = new Table('purchase', this);
  bulkLotHold = new Table('hold', this);
  bulkLotAdjustment = new Table('adj', this);
  bulkLotRefund = new Table('ref', this);
  holdInvoice = new Table('inv', this);
  boothCartBulkLine = new Table('line', this);
  boothCartTransaction = new Table('cart', this);
  itemBulkLot = {
    findMany: async (args: { where?: { itemId?: { in?: string[] } } }) => [...this.lots].filter((id) => !args.where?.itemId?.in || args.where.itemId.in.includes(id)).map((itemId) => ({ itemId })),
  };

  private tables(): Table[] {
    return [this.item, this.purchase, this.bulkLotHold, this.bulkLotAdjustment, this.bulkLotRefund, this.holdInvoice, this.boothCartBulkLine, this.boothCartTransaction];
  }

  /** Runs fn against this same database; a throw restores every table (a real rollback). */
  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const snapshot = this.tables().map((t) => t.rows.map((r) => ({ ...r })));
    try {
      return await fn(this);
    } catch (err) {
      this.tables().forEach((t, i) => {
        t.rows = snapshot[i];
      });
      throw err;
    }
  }

  addLot(over: Row = {}): Row {
    const row: Row = { id: `lot${++this.seq}`, organizerId: 'org1', saleId: 'sale1', price: 8, status: 'AVAILABLE', stockTotal: 10000, stockSold: 0, title: 'Commons', ...over };
    this.item.rows.push({ createdAt: new Date(this.clock + this.seq), ...row });
    this.lots.add(row.id);
    return row;
  }

  stock(itemId: string): { total: number; sold: number; status: string; left: number } {
    const r = this.item.rows.find((x) => x.id === itemId)!;
    return { total: r.stockTotal, sold: r.stockSold, status: r.status, left: r.stockTotal - r.stockSold };
  }
}

export class FakeInsufficientStock extends Error {
  constructor() {
    super('insufficient');
    this.name = 'InsufficientStockError';
  }
}

/** Stand-in for sellItemUnitsInTransaction: one guarded step, never passes stockTotal, SOLD when the last card goes. */
export function fakeSell(db: FakeDb) {
  return async (_tx: any, itemId: string, units: number) => {
    const r = db.item.rows.find((x) => x.id === itemId);
    if (!r) throw new Error('item not found');
    if (r.stockSold + units > (r.stockTotal ?? 1)) throw new FakeInsufficientStock();
    r.stockSold += units;
    if (r.stockSold >= r.stockTotal) r.status = 'SOLD';
    return { fullySoldOut: r.stockSold >= r.stockTotal, remainingStock: r.stockTotal - r.stockSold };
  };
}
