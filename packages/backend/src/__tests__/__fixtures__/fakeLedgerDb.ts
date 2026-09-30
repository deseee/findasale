/**
 * In-memory stand-in for the slice of Prisma that the consignor settlement ledger uses
 * (consignorLedgerService.ts and the settlement / consignor controllers).
 *
 * WHY A FAKE INSTEAD OF jest.fn() PER CALL: the ledger's correctness lives in how several
 * queries interact (activeItemKey uniqueness, conditional updateMany, transaction rollback,
 * relation filters like consignor.workspaceId). A hand-rolled mock for each call would only
 * re-assert the implementation. This fake implements those semantics, so the tests assert
 * behavior. It is NOT a general Prisma emulator: it supports exactly the operators the ledger
 * code uses (equality, in, notIn, not, gte, gt, lt, lte, AND, OR, relation filters, none).
 *
 * Unique constraint modeled: ConsignorPayoutItem.activeItemKey (non-null values only), which
 * throws { code: 'P2002' } like Prisma does. $transaction snapshots every table and restores
 * it if the callback throws, and transactions are serialized (a mutex) to model the isolation a
 * real database gives concurrent create-run calls.
 *
 * File location note: this sits in __tests__/__fixtures__ and has no .test.ts suffix, so jest
 * never treats it as a test file.
 */
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;

const TABLES = [
  'organizer',
  'organizerWorkspace',
  'sale',
  'consignor',
  'item',
  'purchase',
  'commissionTier',
  'consignorPayout',
  'consignorPayoutItem',
  'consignorSettlementBatch',
  'consignorPayoutEvent',
  'workspaceSettings',
] as const;
type Table = (typeof TABLES)[number];

export function createFakeDb() {
  const store: Record<Table, Row[]> = Object.fromEntries(TABLES.map((t) => [t, [] as Row[]])) as any;
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}_${String(++counter).padStart(8, '0')}`;
  const nextDate = () => new Date(Date.UTC(2026, 8, 1) + ++counter * 1000);

  // relation resolvers: table -> relation name -> [target table, resolver]
  const relations: Record<string, Record<string, [Table, (row: Row) => Row | Row[] | null]>> = {
    item: { purchases: ['purchase', (r) => store.purchase.filter((p) => p.itemId === r.id)] },
    consignor: {
      items: ['item', (r) => store.item.filter((i) => i.consignorId === r.id)],
      payouts: ['consignorPayout', (r) => store.consignorPayout.filter((p) => p.consignorId === r.id)],
    },
    consignorPayout: {
      consignor: ['consignor', (r) => store.consignor.find((c) => c.id === r.consignorId) ?? null],
      settlementBatch: ['consignorSettlementBatch', (r) => store.consignorSettlementBatch.find((b) => b.id === r.settlementBatchId) ?? null],
      sale: ['sale', (r) => store.sale.find((s) => s.id === r.saleId) ?? null],
      items: ['consignorPayoutItem', (r) => store.consignorPayoutItem.filter((i) => i.payoutId === r.id)],
      events: ['consignorPayoutEvent', (r) => store.consignorPayoutEvent.filter((e) => e.payoutId === r.id)],
    },
    consignorPayoutItem: {
      payout: ['consignorPayout', (r) => store.consignorPayout.find((p) => p.id === r.payoutId) ?? null],
    },
    consignorSettlementBatch: {
      sale: ['sale', (r) => store.sale.find((s) => s.id === r.saleId) ?? null],
      payouts: ['consignorPayout', (r) => store.consignorPayout.filter((p) => p.settlementBatchId === r.id)],
    },
  };

  const isPlainObject = (v: any) => v !== null && typeof v === 'object' && !(v instanceof Date) && typeof v.toFixed !== 'function';
  const numeric = (v: any) => (v !== null && v !== undefined && typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : v);
  const same = (a: any, b: any) => {
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
    return numeric(a) === numeric(b);
  };

  function matchScalar(value: any, cond: any): boolean {
    if (!isPlainObject(cond)) return same(value, cond);
    for (const [op, arg] of Object.entries(cond)) {
      switch (op) {
        case 'in':
          if (!(arg as any[]).some((x) => same(value, x))) return false;
          break;
        case 'notIn':
          if ((arg as any[]).some((x) => same(value, x))) return false;
          break;
        case 'not':
          if (same(value, arg)) return false;
          break;
        case 'equals':
          if (!same(value, arg)) return false;
          break;
        case 'gte':
          if (value === null || value === undefined || !(numeric(value instanceof Date ? value.getTime() : value) >= numeric((arg as any) instanceof Date ? (arg as any).getTime() : arg))) return false;
          break;
        case 'gt':
          if (value === null || value === undefined || !(numeric(value instanceof Date ? value.getTime() : value) > numeric((arg as any) instanceof Date ? (arg as any).getTime() : arg))) return false;
          break;
        case 'lt':
          if (value === null || value === undefined || !(numeric(value instanceof Date ? value.getTime() : value) < numeric((arg as any) instanceof Date ? (arg as any).getTime() : arg))) return false;
          break;
        case 'lte':
          if (value === null || value === undefined || !(numeric(value instanceof Date ? value.getTime() : value) <= numeric((arg as any) instanceof Date ? (arg as any).getTime() : arg))) return false;
          break;
        default:
          throw new Error(`fakeLedgerDb: unsupported scalar operator ${op}`);
      }
    }
    return true;
  }

  function matches(table: Table, row: Row, where?: Row): boolean {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (key === 'AND') {
        if (!(cond as Row[]).every((w) => matches(table, row, w))) return false;
        continue;
      }
      if (key === 'OR') {
        if (!(cond as Row[]).some((w) => matches(table, row, w))) return false;
        continue;
      }
      const rel = relations[table]?.[key];
      if (rel) {
        const [target, resolve] = rel;
        const related = resolve(row);
        if (Array.isArray(related)) {
          const c = cond as Row;
          if ('none' in c) {
            if (related.some((r) => matches(target, r, c.none))) return false;
          } else if ('some' in c) {
            if (!related.some((r) => matches(target, r, c.some))) return false;
          } else {
            throw new Error(`fakeLedgerDb: unsupported to-many filter on ${table}.${key}`);
          }
        } else {
          if (!related) return false;
          const c = (cond as Row).is ?? cond;
          if (!matches(target, related, c)) return false;
        }
        continue;
      }
      if (!matchScalar(row[key], cond)) return false;
    }
    return true;
  }

  function orderRows(rows: Row[], orderBy: any): Row[] {
    if (!orderBy) return rows;
    const specs: Row[] = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        const [field, dir] = Object.entries(spec)[0] as [string, string];
        const av = a[field];
        const bv = b[field];
        const an = av === null || av === undefined;
        const bn = bv === null || bv === undefined;
        if (an && bn) continue;
        if (an) return dir === 'asc' ? 1 : -1;
        if (bn) return dir === 'asc' ? -1 : 1;
        const x = av instanceof Date ? av.getTime() : numeric(av);
        const y = bv instanceof Date ? bv.getTime() : numeric(bv);
        if (x < y) return dir === 'asc' ? -1 : 1;
        if (x > y) return dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  function project(table: Table, row: Row, args?: Row): Row {
    const out: Row = { ...row };
    const spec: Row = { ...(args?.include ?? {}), ...(args?.select ?? {}) };
    for (const [key, val] of Object.entries(spec)) {
      const rel = relations[table]?.[key];
      if (!rel || !val) continue;
      const [target, resolve] = rel;
      const nested: Row = isPlainObject(val) ? (val as Row) : {};
      let related = resolve(row);
      if (Array.isArray(related)) {
        let list = related.filter((r) => matches(target, r, nested.where));
        list = orderRows(list, nested.orderBy);
        if (nested.take) list = list.slice(0, nested.take);
        out[key] = list.map((r) => project(target, r, nested));
      } else {
        out[key] = related ? project(target, related, nested) : null;
      }
    }
    return out;
  }

  function assertUnique(table: Table, candidate: Row, ignoreId?: string) {
    if (table === 'consignorPayoutItem' && candidate.activeItemKey !== null && candidate.activeItemKey !== undefined) {
      const clash = store.consignorPayoutItem.find((r) => r.id !== ignoreId && r.activeItemKey === candidate.activeItemKey);
      if (clash) {
        const err: any = new Error('Unique constraint failed on the fields: (`activeItemKey`)');
        err.code = 'P2002';
        throw err;
      }
    }
  }

  const clean = (data: Row): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(data)) out[k] = v === (Prisma as any).DbNull ? null : v;
    return out;
  };

  const DEFAULTS: Partial<Record<Table, () => Row>> = {
    consignorPayout: () => ({ status: 'PENDING', processor: 'STRIPE', createdAt: nextDate() }),
    consignorSettlementBatch: () => ({ status: 'DRAFT', runNumber: 1, payoutMode: 'ORGANIZER_SETTLES', scopeConsignorIds: [], createdAt: nextDate() }),
    consignorPayoutItem: () => ({ basisSource: 'ITEM_PRICE', varianceFlag: false, createdAt: nextDate() }),
    consignorPayoutEvent: () => ({ createdAt: nextDate() }),
    purchase: () => ({ createdAt: nextDate() }),
    item: () => ({ updatedAt: nextDate() }),
  };

  function model(table: Table, idPrefix: string) {
    return {
      async findMany(args: Row = {}) {
        let rows = store[table].filter((r) => matches(table, r, args.where));
        rows = orderRows(rows, args.orderBy);
        if (args.take) rows = rows.slice(0, args.take);
        return rows.map((r) => project(table, r, args));
      },
      async findFirst(args: Row = {}) {
        const rows = await (this as any).findMany({ ...args, take: 1 });
        return rows[0] ?? null;
      },
      async findUnique(args: Row) {
        const rows = await (this as any).findMany({ ...args, take: 1 });
        return rows[0] ?? null;
      },
      async count(args: Row = {}) {
        return store[table].filter((r) => matches(table, r, args.where)).length;
      },
      async create(args: Row) {
        const row: Row = { id: nextId(idPrefix), ...(DEFAULTS[table]?.() ?? {}), ...clean(args.data) };
        assertUnique(table, row);
        store[table].push(row);
        return project(table, row, args);
      },
      async createMany(args: Row) {
        const rows: Row[] = (args.data as Row[]).map((d) => ({ id: nextId(idPrefix), ...(DEFAULTS[table]?.() ?? {}), ...clean(d) }));
        // atomic: validate everything before inserting anything
        const seen = new Set<string>();
        for (const r of rows) {
          assertUnique(table, r);
          if (table === 'consignorPayoutItem' && r.activeItemKey) {
            if (seen.has(r.activeItemKey)) {
              const err: any = new Error('Unique constraint failed on the fields: (`activeItemKey`)');
              err.code = 'P2002';
              throw err;
            }
            seen.add(r.activeItemKey);
          }
        }
        store[table].push(...rows);
        return { count: rows.length };
      },
      async update(args: Row) {
        const row = store[table].find((r) => matches(table, r, args.where));
        if (!row) throw new Error(`fakeLedgerDb: ${table}.update record not found`);
        const next = { ...row, ...clean(args.data) };
        assertUnique(table, next, row.id);
        Object.assign(row, clean(args.data));
        return project(table, row, args);
      },
      async updateMany(args: Row) {
        const rows = store[table].filter((r) => matches(table, r, args.where));
        for (const r of rows) {
          const next = { ...r, ...clean(args.data) };
          assertUnique(table, next, r.id);
          Object.assign(r, clean(args.data));
        }
        return { count: rows.length };
      },
      async deleteMany(args: Row = {}) {
        const keep = store[table].filter((r) => !matches(table, r, args.where));
        const count = store[table].length - keep.length;
        store[table] = keep;
        return { count };
      },
    };
  }

  let chain: Promise<unknown> = Promise.resolve();

  const db: Row = {
    organizer: model('organizer', 'org'),
    organizerWorkspace: model('organizerWorkspace', 'ws'),
    sale: model('sale', 'sale'),
    consignor: model('consignor', 'con'),
    item: model('item', 'item'),
    purchase: model('purchase', 'pur'),
    commissionTier: model('commissionTier', 'tier'),
    consignorPayout: model('consignorPayout', 'payout'),
    consignorPayoutItem: model('consignorPayoutItem', 'line'),
    consignorSettlementBatch: model('consignorSettlementBatch', 'batch'),
    consignorPayoutEvent: model('consignorPayoutEvent', 'evt'),
    workspaceSettings: model('workspaceSettings', 'wss'),
    async $transaction(cb: (tx: any) => Promise<any>) {
      const run = chain.then(async () => {
        const snapshot: Record<string, Row[]> = {};
        for (const t of TABLES) snapshot[t] = store[t].map((r) => ({ ...r }));
        try {
          return await cb(db);
        } catch (err) {
          for (const t of TABLES) store[t] = snapshot[t];
          throw err;
        }
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };

  // ── test seeding helpers ───────────────────────────────────────────────────────────────
  const D = (v: number | string) => new (require('@prisma/client/runtime/library').Decimal)(v);
  const helpers = {
    store,
    seedWorkspace(opts: { tier?: string; userId?: string; name?: string } = {}) {
      const userId = opts.userId ?? 'user_1';
      const organizerId = nextId('org');
      store.organizer.push({ id: organizerId, userId, subscriptionTier: opts.tier ?? 'TEAMS' });
      const ws = { id: nextId('ws'), ownerId: organizerId, name: opts.name ?? 'Maple Estate Co' };
      store.organizerWorkspace.push(ws);
      return { userId, organizerId, workspaceId: ws.id };
    },
    seedSale(organizerId: string, title = 'Spring Sale') {
      const sale = { id: nextId('sale'), organizerId, title, status: 'PUBLISHED' };
      store.sale.push(sale);
      return sale;
    },
    seedConsignor(workspaceId: string, o: Partial<Row> = {}) {
      const c = {
        id: nextId('con'),
        workspaceId,
        name: 'Alex Consignor',
        email: 'alex@example.com',
        commissionRate: D(50),
        useTieredCommission: false,
        preferredPayoutMethod: null,
        squareOnboarded: false,
        stripeOnboarded: false,
        ...o,
      };
      store.consignor.push(c);
      return c;
    },
    seedItem(consignorId: string | null, o: Partial<Row> = {}) {
      const item = { id: nextId('item'), consignorId, title: 'Lamp', price: 20, status: 'SOLD', saleId: null, priceBeforeMarkdown: null, updatedAt: nextDate(), ...o };
      store.item.push(item);
      return item;
    },
    seedPurchase(itemId: string, o: Partial<Row> = {}) {
      const p = { id: nextId('pur'), itemId, amount: 20, status: 'PAID', refundedAmount: null, createdAt: nextDate(), ...o };
      store.purchase.push(p);
      return p;
    },
    D,
  };

  return Object.assign(db, { __fake: helpers });
}

export type FakeDb = ReturnType<typeof createFakeDb>;
