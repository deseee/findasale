/**
 * In-memory Prisma stand-in for the SMS / subscription tests (2026-09-29). It implements just the models and
 * where-clause operators the SMS code uses, with the real semantics that matter here: `{ not: X }` never
 * matches a NULL column (SQL three-valued logic, same as Postgres), unique (saleId, phone) and
 * (saleId, userId) on SaleSubscriber raise P2002, and $transaction runs the callback against the same store.
 * No network, no database.
 */

export type Row = Record<string, any>;

const isDate = (v: unknown): v is Date => v instanceof Date;
const same = (a: any, b: any): boolean => (isDate(a) && isDate(b) ? a.getTime() === b.getTime() : a === b);
const num = (v: any) => (isDate(v) ? v.getTime() : v);

function cond(val: any, c: any): boolean {
  if (c === null) return val === null || val === undefined;
  if (c === undefined) return true;
  if (isDate(c) || typeof c !== 'object') return same(val, c);
  return Object.entries(c).every(([op, arg]: [string, any]) => {
    switch (op) {
      case 'in':
        return (arg as any[]).some((x) => same(val, x));
      case 'not':
        if (arg === null) return val !== null && val !== undefined;
        return val !== null && val !== undefined && !same(val, arg);
      case 'gte':
        return val !== null && val !== undefined && num(val) >= num(arg);
      case 'gt':
        return val !== null && val !== undefined && num(val) > num(arg);
      case 'lte':
        return val !== null && val !== undefined && num(val) <= num(arg);
      case 'lt':
        return val !== null && val !== undefined && num(val) < num(arg);
      case 'endsWith':
        return typeof val === 'string' && val.endsWith(arg);
      case 'startsWith':
        return typeof val === 'string' && val.startsWith(arg);
      default:
        throw new Error(`fake prisma: unsupported operator ${op}`);
    }
  });
}

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    if (k === 'AND') return (Array.isArray(v) ? v : [v]).every((w: Row) => matches(row, w));
    if (k === 'NOT') return !(Array.isArray(v) ? v : [v]).some((w: Row) => matches(row, w));
    return cond(row[k], v);
  });
}

class Table {
  rows: Row[] = [];
  private seq = 0;
  constructor(private name: string, private uniques: string[][] = []) {}
  reset() {
    this.rows = [];
    this.seq = 0;
  }
  private checkUnique(candidate: Row, ignore?: Row) {
    for (const cols of this.uniques) {
      if (cols.some((c) => candidate[c] === null || candidate[c] === undefined)) continue; // NULLs never collide
      const clash = this.rows.find((r) => r !== ignore && cols.every((c) => same(r[c], candidate[c])));
      if (clash) throw Object.assign(new Error(`Unique constraint failed on ${this.name}(${cols.join(',')})`), { code: 'P2002' });
    }
  }
  insert(data: Row): Row {
    const row: Row = { id: data.id ?? `${this.name}_${++this.seq}`, createdAt: new Date(), ...data };
    this.checkUnique(row);
    this.rows.push(row);
    return row;
  }
  async create({ data }: { data: Row }) {
    return { ...this.insert(data) };
  }
  async findMany({ where, take, orderBy, select }: Row = {}) {
    let out = this.rows.filter((r) => matches(r, where));
    // orderBy: one { field: 'asc' | 'desc' } object or an array of them (nulls sort first ascending, like Postgres NULLS LAST inverted is not needed here).
    const orders: Row[] = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
    if (orders.length) {
      out = [...out].sort((a, b) => {
        for (const o of orders) {
          const [field, dir] = Object.entries(o)[0] as [string, string];
          const av = num(a[field]) ?? -Infinity;
          const bv = num(b[field]) ?? -Infinity;
          if (av !== bv) return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
        }
        return 0;
      });
    }
    if (take) out = out.slice(0, take);
    return out.map((r) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : { ...r }));
  }
  async findFirst(args: Row = {}) {
    return (await this.findMany(args))[0] ?? null;
  }
  async count({ where }: Row = {}) {
    return this.rows.filter((r) => matches(r, where)).length;
  }
  async updateMany({ where, data }: Row) {
    const hit = this.rows.filter((r) => matches(r, where));
    for (const r of hit) Object.assign(r, data, { updatedAt: new Date() });
    return { count: hit.length };
  }
  async deleteMany({ where }: Row = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, where));
    return { count: before - this.rows.length };
  }
  async update({ where, data }: Row) {
    const r = this.rows.find((x) => matches(x, where));
    if (!r) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
    const next = { ...r, ...data };
    this.checkUnique(next, r);
    Object.assign(r, data, { updatedAt: new Date() });
    return { ...r };
  }
  async aggregate({ where, _sum }: Row) {
    const hit = this.rows.filter((r) => matches(r, where));
    const out: Row = { _sum: {} };
    for (const k of Object.keys(_sum ?? {})) out._sum[k] = hit.length ? hit.reduce((s, r) => s + (r[k] ?? 0), 0) : null;
    return out;
  }
}

const compound = (row: Row, where: Row) => {
  // { saleId_userId: { saleId, userId } } -> flat where
  const flat: Row = {};
  for (const [k, v] of Object.entries(where)) {
    if (k.includes('_') && v && typeof v === 'object' && !Array.isArray(v) && !isDate(v) && !(('in' in v) || ('not' in v))) Object.assign(flat, v);
    else flat[k] = v;
  }
  return flat;
};

class SubscriberTable extends Table {
  constructor() {
    super('sub', [['saleId', 'userId'], ['saleId', 'phone']]);
  }
  async findUnique({ where }: Row) {
    const r = this.rows.find((x) => matches(x, compound(x, where)));
    return r ? { ...r } : null;
  }
  async delete({ where }: Row) {
    const idx = this.rows.findIndex((x) => matches(x, compound(x, where)));
    if (idx < 0) throw Object.assign(new Error('Record to delete does not exist'), { code: 'P2025' });
    return this.rows.splice(idx, 1)[0];
  }
  async upsert({ where, update, create }: Row) {
    const flat = compound({}, where);
    const existing = this.rows.find((x) => matches(x, flat));
    if (existing) {
      const next = { ...existing, ...update };
      (this as any).checkUnique(next, existing);
      Object.assign(existing, update, { updatedAt: new Date() });
      return { ...existing };
    }
    return { ...this.insert(create) };
  }
}

class KeyedTable extends Table {
  constructor(name: string, private keyField: string) {
    super(name, [[keyField]]);
  }
  async findUnique({ where }: Row) {
    const r = this.rows.find((x) => matches(x, where));
    return r ? { ...r } : null;
  }
  async upsert({ where, update, create }: Row) {
    const existing = this.rows.find((x) => matches(x, where));
    if (existing) {
      Object.assign(existing, update, { updatedAt: new Date() });
      return { ...existing };
    }
    return { ...this.insert(create) };
  }
}

export function makeFakePrisma() {
  const saleSubscriber = new SubscriberTable();
  const smsOptOut = new KeyedTable('optout', 'phone');
  const smsSendLog = new Table('log');
  const sale = new KeyedTable('sale', 'id');
  const organizer = new KeyedTable('organizer', 'id');
  const user = new KeyedTable('user', 'id');
  const state = { advisoryLockGranted: true, transactionShouldThrow: false, queryRawCalls: 0 };
  const prisma: Row = {
    saleSubscriber,
    smsOptOut,
    smsSendLog,
    sale,
    organizer,
    user,
    $queryRaw: async () => {
      state.queryRawCalls++;
      return [{ locked: state.advisoryLockGranted }];
    },
    $transaction: async (fn: (tx: Row) => Promise<any>) => {
      if (state.transactionShouldThrow) throw new Error('transaction unavailable');
      return fn(prisma);
    },
  };
  const reset = () => {
    for (const t of [saleSubscriber, smsOptOut, smsSendLog, sale, organizer, user]) t.reset();
    state.advisoryLockGranted = true;
    state.transactionShouldThrow = false;
    state.queryRawCalls = 0;
  };
  return { prisma, state, reset };
}
