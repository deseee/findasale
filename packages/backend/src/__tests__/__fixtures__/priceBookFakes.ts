/**
 * In-memory fake of the structural PriceBookDb (services/priceBook/db.ts) for the price book tests (ADR-140 B3 and later).
 *
 * It is general on purpose so later batches (runs, lot runs, price write, routes) reuse it: every model the services touch is
 * here (books, rules, references, benchmarks, bulk rates, locks, runs, run items, items, item cards, bulk lots, price history,
 * purchases, catalog printings and prices), with:
 *   - a where evaluator (equality, null, in, notIn, not, gt, gte, lt, lte, contains, startsWith, has, AND, OR, NOT);
 *   - select projection, orderBy (one or many keys), take and skip;
 *   - the unique constraints of the schema (a violation throws an error with code P2002, like the real client);
 *   - schema defaults on create, updatedAt maintained on update, numeric increment and decrement operators;
 *   - $transaction with rollback on a throw (rows, id counters and the write log are restored);
 *   - a write log (db.writes) so a test can prove what a service did or did not write, and a read log of where clauses.
 * Rows handed to a service are copies, so a service cannot change a table by mutating what it read.
 */
import type { PriceBookDb, PriceBookTx, ServiceCtx, Where } from '../../services/priceBook/db';

export type AnyRow = Record<string, unknown>;

export interface FakeWrite {
  table: string;
  op: 'create' | 'createMany' | 'updateMany' | 'deleteMany';
  where?: Where;
  data?: unknown;
  count: number;
}

export interface FakeRead {
  table: string;
  op: 'findMany' | 'findFirst' | 'count';
  where: Where | undefined;
}

export const TABLE_NAMES = [
  'priceBook',
  'priceBookRule',
  'priceBookReference',
  'priceBookBenchmark',
  'priceBookBulkRate',
  'priceBookLock',
  'priceBookRun',
  'priceBookRunItem',
  'item',
  'itemCard',
  'itemBulkLot',
  'itemBulkLotEbayBundle',
  'itemPriceHistory',
  'purchase',
  'cardPrinting',
  'cardPrice',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

interface TableSpec {
  /** Prefix of generated ids; null when the table has no id column (CardPrice is keyed by printingId). */
  idPrefix: string | null;
  uniques: string[][];
  createdAt: boolean;
  updatedAt: boolean;
  defaults: (now: Date) => AnyRow;
}

const DEFAULT_ORDER = ['MANUAL', 'SHOP_SOLD_HISTORY', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED'];

const SPECS: Record<TableName, TableSpec> = {
  priceBook: {
    idPrefix: 'book',
    uniques: [['organizerId']],
    createdAt: true,
    updatedAt: true,
    defaults: () => ({
      enabled: false,
      version: 1,
      allowCatalogReference: false,
      referenceOrder: [...DEFAULT_ORDER],
      retailPercentBps: 10000,
      defaultFloorCents: 0,
      defaultCeilingCents: null,
      defaultRoundingMode: 'TIERED',
      defaultRoundingDirection: 'NEAREST',
      condNmBps: 10000,
      condLpBps: 9000,
      condMpBps: 8000,
      condHpBps: 6500,
      condDmgBps: 5000,
      nonEnglishBps: 10000,
      movementReviewBps: 2500,
      referenceWarnDays: 90,
      referenceMaxDays: 365,
      soldHistoryMinSales: 2,
      soldHistoryMaxSales: 5,
      soldHistoryWindowDays: 180,
      manualLockDays: 14,
      buyCreditBps: 12000,
    }),
  },
  priceBookRule: {
    idPrefix: 'rule',
    uniques: [],
    createdAt: true,
    updatedAt: true,
    defaults: () => ({
      enabled: true,
      productType: 'SINGLE',
      game: null,
      setCode: null,
      rarityClass: null,
      rarityText: null,
      finish: null,
      language: null,
      variantToken: null,
      refMinCents: null,
      refMaxCents: null,
      sourceKinds: [],
      basis: 'REFERENCE',
      percentBps: 10000,
      addCents: 0,
      fixedCents: null,
      floorCents: null,
      ceilingCents: null,
      minMarginBps: null,
      roundingMode: null,
      roundingDirection: null,
      creditBps: null,
      minOfferCents: null,
    }),
  },
  priceBookReference: {
    idPrefix: 'ref',
    uniques: [['bookId', 'cardKey', 'finish', 'language']],
    createdAt: true,
    updatedAt: true,
    defaults: (now) => ({
      catalogPrintingId: null,
      cardName: null,
      setCode: null,
      setName: null,
      collectorNumber: null,
      language: 'en',
      note: null,
      asOf: now,
      enteredByUserId: null,
    }),
  },
  priceBookBenchmark: {
    idPrefix: 'bench',
    uniques: [['bookId', 'game', 'rarityClass', 'finish']],
    createdAt: false,
    updatedAt: true,
    defaults: (now) => ({ note: null, asOf: now }),
  },
  priceBookBulkRate: {
    idPrefix: 'rate',
    uniques: [['bookId', 'direction', 'game', 'tier', 'finish', 'unit']],
    createdAt: false,
    updatedAt: true,
    defaults: () => ({ finish: 'ANY', creditRateCents: null, benchmarkNote: null, benchmarkRateCents: null, benchmarkAsOf: null }),
  },
  priceBookLock: {
    idPrefix: 'lock',
    uniques: [['bookId', 'itemId']],
    createdAt: true,
    updatedAt: false,
    defaults: () => ({ reason: 'PIN', priceCentsAtLock: null, lockedUntil: null, createdByUserId: null }),
  },
  priceBookRun: {
    idPrefix: 'run',
    uniques: [],
    createdAt: true,
    updatedAt: false,
    defaults: () => ({
      status: 'PREVIEW',
      scopeSaleId: null,
      scopeGame: null,
      scopeSetCode: null,
      scopeRarityClass: null,
      scopeFinish: null,
      onlyUnpriced: false,
      includeMarkedDown: false,
      includeEbayLive: false,
      previewCount: 0,
      changeCount: 0,
      unchangedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      appliedCount: 0,
      undoneCount: 0,
      createdByUserId: null,
      appliedAt: null,
      undoneAt: null,
    }),
  },
  priceBookRunItem: {
    idPrefix: 'runitem',
    uniques: [['runId', 'itemId']],
    createdAt: false,
    updatedAt: false,
    defaults: () => ({
      oldPriceCents: null,
      newPriceCents: null,
      state: 'PENDING',
      selected: true,
      skipReason: null,
      priceSource: null,
      referenceOrigin: null,
      referenceCents: null,
      referenceAsOf: null,
      ruleId: null,
      ruleName: null,
      conditionCode: null,
      finish: null,
      warnings: [],
      reviewReasons: [],
      whyText: null,
      appliedAt: null,
      undoneAt: null,
    }),
  },
  item: {
    idPrefix: 'item',
    uniques: [],
    createdAt: true,
    updatedAt: true,
    defaults: () => ({
      organizerId: null,
      price: null,
      costBasis: null,
      status: 'AVAILABLE',
      listingType: 'FIXED',
      draftStatus: null,
      saleId: null,
      quantity: 1,
      stockTotal: 1,
      priceUpdatedAt: null,
      deletedAt: null,
      markdownApplied: false,
      priceBeforeMarkdown: null,
      originalPrice: null,
      rarity: 'COMMON',
      ebayListingId: null,
      ebayOfferId: null,
      ebaySyncState: null,
      ebaySyncAttempts: 0,
      ebaySyncHeldAt: null,
      ebayHeldFields: [],
      userEditedFields: [],
      lastEditedAt: null,
    }),
  },
  itemCard: {
    idPrefix: 'card',
    uniques: [],
    createdAt: false,
    updatedAt: false,
    defaults: () => ({
      organizerId: null,
      game: 'MTG',
      productType: 'SINGLE',
      cardName: null,
      setCode: null,
      setName: null,
      collectorNumber: null,
      language: 'en',
      finish: 'NONFOIL',
      rarity: null,
      conditionCode: 'NM',
      grader: null,
      catalogPrintingId: null,
    }),
  },
  itemBulkLot: {
    idPrefix: 'lot',
    uniques: [['itemId']],
    createdAt: false,
    updatedAt: false,
    defaults: () => ({ organizerId: null, game: 'MTG', lotKind: 'BULK_COMMON', packSize: null }),
  },
  itemBulkLotEbayBundle: {
    idPrefix: 'bundle',
    uniques: [['itemId']],
    createdAt: false,
    updatedAt: false,
    defaults: () => ({ organizerId: null, enabled: false, bundleSize: 100 }),
  },
  itemPriceHistory: {
    idPrefix: 'hist',
    uniques: [],
    createdAt: true,
    updatedAt: false,
    defaults: () => ({}),
  },
  purchase: {
    idPrefix: 'purchase',
    uniques: [],
    createdAt: true,
    updatedAt: false,
    defaults: () => ({
      itemId: null,
      status: 'PAID',
      source: 'POS',
      isTestTransaction: false,
      bulkQuantity: null,
      refundedAmount: null,
      discountAmountCents: null,
      cashierDiscretionAmountCents: null,
    }),
  },
  cardPrinting: {
    idPrefix: null,
    uniques: [['id']],
    createdAt: false,
    updatedAt: false,
    defaults: () => ({ source: 'SCRYFALL', game: 'MTG', setName: null, collectorNumber: null, language: 'en', rarity: null, finishes: [] }),
  },
  cardPrice: {
    idPrefix: null,
    uniques: [['printingId']],
    createdAt: false,
    updatedAt: false,
    defaults: (now) => ({ usd: null, usdFoil: null, usdEtched: null, usdReverse: null, asOf: now }),
  },
};

// ---------------------------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------------------------

function cloneValue<T>(v: T): T {
  if (v instanceof Date) return new Date(v.getTime()) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => cloneValue(x)) as unknown as T;
  if (v !== null && typeof v === 'object') {
    const out: AnyRow = {};
    for (const [k, x] of Object.entries(v as AnyRow)) out[k] = cloneValue(x);
    return out as unknown as T;
  }
  return v;
}

const cloneRow = (r: AnyRow): AnyRow => cloneValue(r);

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v === undefined) return null;
  return v;
}

function numOf(v: unknown): number | null {
  const n = norm(v);
  if (typeof n === 'number') return n;
  if (typeof n === 'string' && n.trim() !== '' && Number.isFinite(Number(n))) return Number(n);
  return null;
}

function isOperatorObject(v: unknown): v is AnyRow {
  if (v === null || typeof v !== 'object' || v instanceof Date || Array.isArray(v)) return false;
  const keys = Object.keys(v as AnyRow);
  const ops = ['equals', 'in', 'notIn', 'not', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'mode', 'has', 'hasSome', 'isEmpty'];
  return keys.length > 0 && keys.every((k) => ops.includes(k));
}

function equalValues(a: unknown, b: unknown): boolean {
  const x = norm(a);
  const y = norm(b);
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((e, i) => equalValues(e, y[i]));
  return x === y;
}

function fieldMatches(value: unknown, cond: unknown): boolean {
  if (!isOperatorObject(cond)) return equalValues(value, cond);
  const ci = cond.mode === 'insensitive';
  const text = (v: unknown): string => (ci ? String(v ?? '').toLowerCase() : String(v ?? ''));
  for (const [op, arg] of Object.entries(cond)) {
    switch (op) {
      case 'mode':
        break;
      case 'equals':
        if (!equalValues(value, arg)) return false;
        break;
      case 'in':
        if (!Array.isArray(arg) || !arg.some((a) => equalValues(value, a))) return false;
        break;
      case 'notIn':
        if (Array.isArray(arg) && arg.some((a) => equalValues(value, a))) return false;
        break;
      case 'not':
        if (fieldMatches(value, arg)) return false;
        break;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const a = numOf(value);
        const b = numOf(arg);
        if (a === null || b === null) return false;
        if (op === 'gt' && !(a > b)) return false;
        if (op === 'gte' && !(a >= b)) return false;
        if (op === 'lt' && !(a < b)) return false;
        if (op === 'lte' && !(a <= b)) return false;
        break;
      }
      case 'contains':
        if (!text(value).includes(text(arg))) return false;
        break;
      case 'startsWith':
        if (!text(value).startsWith(text(arg))) return false;
        break;
      case 'endsWith':
        if (!text(value).endsWith(text(arg))) return false;
        break;
      case 'has':
        if (!Array.isArray(value) || !value.some((a) => equalValues(a, arg))) return false;
        break;
      case 'isEmpty':
        if ((Array.isArray(value) ? value.length === 0 : true) !== (arg === true)) return false;
        break;
      case 'hasSome':
        if (!Array.isArray(value) || !Array.isArray(arg) || !value.some((a) => arg.some((b) => equalValues(a, b)))) return false;
        break;
      default:
        throw new Error(`fake db: unsupported operator ${op}`);
    }
  }
  return true;
}

export function matchesWhere(row: AnyRow, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'AND') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((w) => matchesWhere(row, w as Where))) return false;
    } else if (key === 'OR') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.some((w) => matchesWhere(row, w as Where))) return false;
    } else if (key === 'NOT') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (list.some((w) => matchesWhere(row, w as Where))) return false;
    } else if (!fieldMatches(row[key], cond)) {
      return false;
    }
  }
  return true;
}

function compareValues(a: unknown, b: unknown): number {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return String(x) < String(y) ? -1 : 1;
}

function uniqueViolation(table: string, fields: string[]): Error {
  const e = new Error(`Unique constraint failed on ${table}(${fields.join(', ')})`);
  (e as Error & { code: string }).code = 'P2002';
  return e;
}

// ---------------------------------------------------------------------------------------------
// The fake
// ---------------------------------------------------------------------------------------------

interface Shared {
  clock: () => Date;
  writes: FakeWrite[];
  reads: FakeRead[];
  counters: Map<string, number>;
  failWhen: ((table: string, op: FakeWrite['op'], data: unknown) => Error | null) | null;
}

class FakeTable {
  rows: AnyRow[] = [];

  constructor(
    readonly name: TableName,
    private readonly shared: Shared,
  ) {}

  private get spec(): TableSpec {
    return SPECS[this.name];
  }

  private nextId(): string {
    const prefix = this.spec.idPrefix ?? this.name;
    const n = (this.shared.counters.get(this.name) ?? 0) + 1;
    this.shared.counters.set(this.name, n);
    return `${prefix}_${n}`;
  }

  /** Builds a full row (defaults, id, timestamps) and checks the unique constraints against the current rows. */
  build(data: AnyRow, ignore?: AnyRow[]): AnyRow {
    const now = this.shared.clock();
    const row: AnyRow = { ...this.spec.defaults(now), ...cloneRow(data) };
    if (this.spec.idPrefix !== null && (row.id === undefined || row.id === null)) row.id = this.nextId();
    if (this.spec.createdAt && row.createdAt === undefined) row.createdAt = new Date(now.getTime());
    if (this.spec.updatedAt && row.updatedAt === undefined) row.updatedAt = new Date(now.getTime());
    for (const fields of this.spec.uniques) {
      const clash = this.rows.find((r) => !(ignore ?? []).includes(r) && fields.every((f) => equalValues(r[f], row[f])));
      if (clash) throw uniqueViolation(this.name, fields);
    }
    return row;
  }

  private log(op: FakeWrite['op'], where: Where | undefined, data: unknown, count: number): void {
    this.shared.writes.push({ table: this.name, op, where: where ? (cloneValue(where) as Where) : undefined, data: cloneValue(data), count });
  }

  private guard(op: FakeWrite['op'], data: unknown): void {
    const fail = this.shared.failWhen?.(this.name, op, data) ?? null;
    if (fail) throw fail;
  }

  async findMany(args: { where?: Where; select?: Record<string, boolean>; orderBy?: unknown; take?: number; skip?: number } = {}): Promise<AnyRow[]> {
    this.shared.reads.push({ table: this.name, op: 'findMany', where: args.where ? (cloneValue(args.where) as Where) : undefined });
    let list = this.rows.filter((r) => matchesWhere(r, args.where));
    const orders = args.orderBy === undefined ? [] : Array.isArray(args.orderBy) ? (args.orderBy as AnyRow[]) : [args.orderBy as AnyRow];
    if (orders.length > 0) {
      list = list.slice().sort((a, b) => {
        for (const o of orders) {
          for (const [field, dir] of Object.entries(o)) {
            const c = compareValues(a[field], b[field]);
            if (c !== 0) return dir === 'desc' ? -c : c;
          }
        }
        return 0;
      });
    }
    const skip = args.skip ?? 0;
    list = list.slice(skip, args.take === undefined ? undefined : skip + args.take);
    return list.map((r) => {
      const copy = cloneRow(r);
      if (!args.select) return copy;
      const out: AnyRow = {};
      for (const [k, on] of Object.entries(args.select)) if (on) out[k] = copy[k];
      return out;
    });
  }

  async findFirst(args: { where?: Where; select?: Record<string, boolean>; orderBy?: unknown } = {}): Promise<AnyRow | null> {
    this.shared.reads.push({ table: this.name, op: 'findFirst', where: args.where ? (cloneValue(args.where) as Where) : undefined });
    const rows = await this.findManyQuiet({ ...args, take: 1 });
    return rows[0] ?? null;
  }

  private async findManyQuiet(args: { where?: Where; select?: Record<string, boolean>; orderBy?: unknown; take?: number }): Promise<AnyRow[]> {
    const before = this.shared.reads.length;
    const rows = await this.findMany(args);
    this.shared.reads.length = before;
    return rows;
  }

  async count(args: { where?: Where } = {}): Promise<number> {
    this.shared.reads.push({ table: this.name, op: 'count', where: args.where ? (cloneValue(args.where) as Where) : undefined });
    return this.rows.filter((r) => matchesWhere(r, args.where)).length;
  }

  async create(args: { data: AnyRow }): Promise<AnyRow> {
    this.guard('create', args.data);
    const row = this.build(args.data);
    this.rows.push(row);
    this.log('create', undefined, args.data, 1);
    return cloneRow(row);
  }

  async createMany(args: { data: AnyRow[]; skipDuplicates?: boolean }): Promise<{ count: number }> {
    this.guard('createMany', args.data);
    const built: AnyRow[] = [];
    const saved = this.rows.length;
    try {
      for (const d of args.data) {
        try {
          const row = this.build(d);
          this.rows.push(row);
          built.push(row);
        } catch (e) {
          if (args.skipDuplicates === true && (e as { code?: string }).code === 'P2002') continue;
          throw e;
        }
      }
    } catch (e) {
      this.rows.length = saved; // all or nothing, like one INSERT statement
      throw e;
    }
    this.log('createMany', undefined, args.data, built.length);
    return { count: built.length };
  }

  async updateMany(args: { where: Where; data: AnyRow }): Promise<{ count: number }> {
    this.guard('updateMany', args.data);
    const targets = this.rows.filter((r) => matchesWhere(r, args.where));
    const now = this.shared.clock();
    const updated: AnyRow[] = [];
    for (const r of targets) {
      const next = cloneRow(r);
      for (const [k, v] of Object.entries(args.data)) {
        if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
          const op = v as AnyRow;
          if ('increment' in op) next[k] = (numOf(next[k]) ?? 0) + (numOf(op.increment) ?? 0);
          else if ('decrement' in op) next[k] = (numOf(next[k]) ?? 0) - (numOf(op.decrement) ?? 0);
          else if ('set' in op) next[k] = cloneValue(op.set);
          else next[k] = cloneValue(v);
        } else {
          next[k] = cloneValue(v);
        }
      }
      if (this.spec.updatedAt && !('updatedAt' in args.data)) next.updatedAt = new Date(now.getTime());
      for (const fields of this.spec.uniques) {
        const clash = this.rows.find((o) => o !== r && fields.every((f) => equalValues(o[f], next[f])));
        if (clash) throw uniqueViolation(this.name, fields);
      }
      updated.push(next);
    }
    targets.forEach((t, i) => {
      const at = this.rows.indexOf(t);
      const next = updated[i];
      if (at >= 0 && next) this.rows[at] = next;
    });
    this.log('updateMany', args.where, args.data, targets.length);
    return { count: targets.length };
  }

  async deleteMany(args: { where: Where }): Promise<{ count: number }> {
    this.guard('deleteMany', undefined);
    const keep = this.rows.filter((r) => !matchesWhere(r, args.where));
    const count = this.rows.length - keep.length;
    this.rows = keep;
    this.log('deleteMany', args.where, undefined, count);
    return { count };
  }
}

export interface FakeOptions {
  /** The clock used for defaults (createdAt, updatedAt, asOf). Default: a fixed instant, never the system clock. */
  clock?: () => Date;
}

export type FakeDb = PriceBookDb & {
  /** Direct access to the stored rows of each table (copies are handed to services; these are the real rows). */
  tables: Record<TableName, AnyRow[]>;
  writes: FakeWrite[];
  reads: FakeRead[];
  /** Inserts a row without logging a write (test setup). Returns a copy of the stored row. */
  insert(table: TableName, row: AnyRow): AnyRow;
  /** Throws the returned error instead of performing a write; return null to let it through. */
  failWhen(fn: ((table: string, op: FakeWrite['op'], data: unknown) => Error | null) | null): void;
  /** Rows of a table as copies, optionally filtered. */
  select(table: TableName, where?: Where): AnyRow[];
  /** Number of write operations logged for a table (all tables when omitted). */
  writeCount(table?: TableName): number;
};

export const FAKE_NOW = new Date('2026-10-12T12:00:00.000Z');

export function createFakePriceBookDb(options: FakeOptions = {}): FakeDb {
  const shared: Shared = { clock: options.clock ?? (() => FAKE_NOW), writes: [], reads: [], counters: new Map(), failWhen: null };
  const tables = {} as Record<TableName, FakeTable>;
  for (const name of TABLE_NAMES) tables[name] = new FakeTable(name, shared);

  const db = {
    ...(tables as unknown as PriceBookTx),
    async $transaction<T>(fn: (tx: PriceBookTx) => Promise<T>): Promise<T> {
      const snapshot = TABLE_NAMES.map((n) => [n, tables[n].rows.map(cloneRow)] as const);
      const counters = new Map(shared.counters);
      const writeMark = shared.writes.length;
      try {
        return await fn(db as unknown as PriceBookTx);
      } catch (e) {
        for (const [n, rows] of snapshot) tables[n].rows = rows;
        shared.counters = counters;
        shared.writes.length = writeMark;
        throw e;
      }
    },
    get tables() {
      const out = {} as Record<TableName, AnyRow[]>;
      for (const n of TABLE_NAMES) out[n] = tables[n].rows;
      return out;
    },
    get writes() {
      return shared.writes;
    },
    get reads() {
      return shared.reads;
    },
    insert(table: TableName, row: AnyRow): AnyRow {
      const t = tables[table];
      const built = t.build(row);
      t.rows.push(built);
      return cloneRow(built);
    },
    failWhen(fn: ((table: string, op: FakeWrite['op'], data: unknown) => Error | null) | null) {
      shared.failWhen = fn;
    },
    select(table: TableName, where?: Where): AnyRow[] {
      return tables[table].rows.filter((r) => matchesWhere(r, where)).map(cloneRow);
    },
    writeCount(table?: TableName): number {
      return table ? shared.writes.filter((w) => w.table === table).length : shared.writes.length;
    },
  };
  return db as unknown as FakeDb;
}

// ---------------------------------------------------------------------------------------------
// Seed helpers (each inserts without logging a write)
// ---------------------------------------------------------------------------------------------

export function seedBook(db: FakeDb, organizerId: string, overrides: AnyRow = {}): AnyRow {
  return db.insert('priceBook', { organizerId, ...overrides });
}

export function seedItem(db: FakeDb, organizerId: string, overrides: AnyRow = {}): AnyRow {
  return db.insert('item', { organizerId, title: 'Item', ...overrides });
}

/** An item plus its card record in one call. cardOverrides win over the defaults. */
export function seedCardItem(db: FakeDb, organizerId: string, itemOverrides: AnyRow = {}, cardOverrides: AnyRow = {}): { item: AnyRow; card: AnyRow } {
  const item = seedItem(db, organizerId, { title: 'Card', ...itemOverrides });
  const card = db.insert('itemCard', { itemId: item.id, organizerId, cardName: 'Test Card', setCode: 'abc', collectorNumber: '1', ...cardOverrides });
  return { item, card };
}

export function seedPurchase(db: FakeDb, itemId: string | null, overrides: AnyRow = {}): AnyRow {
  return db.insert('purchase', { itemId, amount: 1, createdAt: new Date(FAKE_NOW.getTime() - 24 * 60 * 60 * 1000), ...overrides });
}

export function seedPrinting(db: FakeDb, overrides: AnyRow = {}): AnyRow {
  return db.insert('cardPrinting', { id: 'SCRYFALL:p1', name: 'Test Card', setCode: 'abc', ...overrides });
}

export function seedCardPrice(db: FakeDb, printingId: string, overrides: AnyRow = {}): AnyRow {
  return db.insert('cardPrice', { printingId, ...overrides });
}

export function seedReference(db: FakeDb, bookId: string, overrides: AnyRow = {}): AnyRow {
  return db.insert('priceBookReference', { bookId, cardKey: 'p:SCRYFALL:p1', game: 'MTG', finish: 'NONFOIL', valueCents: 100, ...overrides });
}

export function seedBenchmark(db: FakeDb, bookId: string, overrides: AnyRow = {}): AnyRow {
  return db.insert('priceBookBenchmark', { bookId, game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', valueCents: 200, ...overrides });
}

export function seedRule(db: FakeDb, bookId: string, overrides: AnyRow = {}): AnyRow {
  return db.insert('priceBookRule', { bookId, family: 'RETAIL', name: 'Rule', priority: 10, ...overrides });
}

export function seedLock(db: FakeDb, bookId: string, itemId: string, overrides: AnyRow = {}): AnyRow {
  return db.insert('priceBookLock', { bookId, itemId, ...overrides });
}

export function seedBulkRate(db: FakeDb, bookId: string, overrides: AnyRow = {}): AnyRow {
  return db.insert('priceBookBulkRate', { bookId, direction: 'SELL', game: 'MTG', tier: 'COMMON', unit: 'PER_1000', rateCents: 1000, ...overrides });
}

/** A service context for one organizer, with the fixed clock and an empty environment unless overridden. */
export function makeCtx(db: FakeDb, organizerId: string, extra: Partial<ServiceCtx> = {}): ServiceCtx {
  return { db, organizerId, now: FAKE_NOW, env: {}, userId: `user_${organizerId}`, ...extra };
}
