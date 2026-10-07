/**
 * placeBulkHold caps under concurrency (ADR-136 Addendum B).
 *
 * The three caps (25 active holds per lot; for a shopper, 1 per lot and 5 in all) used to be counted BEFORE the transaction, with no
 * lock, so concurrent requests all passed and each took cards. They are now counted INSIDE the transaction, after two
 * transaction-scoped advisory locks (lot first, then shopper). WHAT THIS PROVES:
 *   - the lock calls come before every count and before sell, lot lock first and shopper lock second; an organizer takes the lot lock only
 *   - the three caps are read from the transaction (tx.bulkLotHold.count) and a refusal there is BULK_HOLD_LIMIT 409 with no sell and no hold row
 *   - an InsufficientStockError thrown by sell inside the transaction still maps to INSUFFICIENT_STOCK 409 and leaves nothing behind
 *   - with a fake that models the advisory lock (a per-key mutex held until the transaction ends, with a yield between the count and the
 *     write), 40 concurrent placements stay within the caps; the same harness WITHOUT the lock exceeds them, so it would catch the old bug
 * What it does not prove: that Postgres takes the lock. scripts/verifyBulkLotConcurrency.ts (S4a to S4d) does that against a real database.
 */
import { MAX_ACTIVE_HOLDS_PER_LOT, MAX_ACTIVE_SHOPPER_HOLDS, placeBulkHold } from '../services/bulkLot/bulkLotHoldService';
import { FakeDb, FakeInsufficientStock, fakeSell } from './__fixtures__/bulkLotFollowupFakes';

const ORG = { kind: 'ORGANIZER' as const, organizerId: 'org1', actorUserId: 'u_org' };
const shopperOf = (userId: string) => ({ kind: 'SHOPPER' as const, userId });

async function fail(fn: () => Promise<unknown>): Promise<any> {
  try {
    await fn();
  } catch (e: any) {
    return e;
  }
  return null;
}

/**
 * A db whose transaction callback gets an instrumented tx. Every lock, count, sell and create is appended to `events`. `counts`
 * overrides what tx.bulkLotHold.count returns for a call (by the shape of its where clause); the outer db is the plain FakeDb, and
 * outerCount records any count made OUTSIDE the transaction (there must be none).
 */
function instrument(base: FakeDb, opts: { counts?: { lot?: number; mine?: number; total?: number }; sellThrows?: Error } = {}) {
  const events: string[] = [];
  const outerCount: string[] = [];
  const realCount = base.bulkLotHold.count.bind(base.bulkLotHold);
  const kindOf = (where: any): 'lot' | 'mine' | 'total' => (where.shopperUserId === undefined ? 'lot' : where.itemId === undefined ? 'total' : 'mine');
  const tx: any = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      events.push(`lock:${String(values[0])}`);
      expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtext(?))');
      return 1;
    },
    bulkLotHold: {
      count: async (args: any) => {
        const k = kindOf(args.where);
        events.push(`count:${k}`);
        const forced = opts.counts?.[k];
        return forced !== undefined ? forced : realCount(args);
      },
      create: async (args: any) => {
        events.push('create');
        return base.bulkLotHold.create(args);
      },
    },
  };
  const db: any = Object.create(base);
  db.bulkLotHold = {
    count: async (args: any) => {
      outerCount.push(JSON.stringify(args.where));
      return realCount(args);
    },
    create: (a: any) => base.bulkLotHold.create(a),
    findUnique: (a: any) => base.bulkLotHold.findUnique(a),
    findMany: (a: any) => base.bulkLotHold.findMany(a),
    updateMany: (a: any) => base.bulkLotHold.updateMany(a),
  };
  db.$transaction = (fn: (t: any) => Promise<unknown>) => base.$transaction(() => fn(tx));
  const realSell = fakeSell(base);
  const deps: any = {
    now: () => new Date(Date.UTC(2026, 9, 6, 12, 0, 0)),
    sell: async (t: any, itemId: string, units: number) => {
      events.push('sell');
      if (opts.sellThrows) throw opts.sellThrows;
      return realSell(t, itemId, units);
    },
  };
  return { db, deps, events, outerCount };
}

describe('placeBulkHold: locks and cap checks inside the transaction', () => {
  it('a shopper takes the lot lock, then the shopper lock, then reads the three counts, then sells, then creates', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events, outerCount } = instrument(base);
    const hold = await placeBulkHold(db, deps, shopperOf('u_s1'), lot.id, { quantity: 200 });
    expect(hold.status).toBe('ACTIVE');
    expect(events).toEqual([
      `lock:bulklot-hold-lot:${lot.id}`,
      'lock:bulklot-hold-shopper:u_s1',
      'count:lot',
      'count:mine',
      'count:total',
      'sell',
      'create',
    ]);
    expect(outerCount).toEqual([]);
  });

  it('an organizer takes only the lot lock and reads only the lot count', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events, outerCount } = instrument(base);
    await placeBulkHold(db, deps, ORG, lot.id, { quantity: 200, customerName: 'Sam' });
    expect(events).toEqual([`lock:bulklot-hold-lot:${lot.id}`, 'count:lot', 'sell', 'create']);
    expect(events.filter((e) => e.startsWith('lock:bulklot-hold-shopper'))).toHaveLength(0);
    expect(outerCount).toEqual([]);
  });

  it('the lock keys use their own namespaces, the lot id and the user id', async () => {
    const base = new FakeDb();
    const a = base.addLot();
    const b = base.addLot();
    const first = instrument(base);
    await placeBulkHold(first.db, first.deps, shopperOf('u_s1'), a.id, { quantity: 10 });
    const second = instrument(base);
    await placeBulkHold(second.db, second.deps, shopperOf('u_s2'), b.id, { quantity: 10 });
    expect(first.events[0]).toBe(`lock:bulklot-hold-lot:${a.id}`);
    expect(first.events[1]).toBe('lock:bulklot-hold-shopper:u_s1');
    expect(second.events[0]).toBe(`lock:bulklot-hold-lot:${b.id}`);
    expect(second.events[1]).toBe('lock:bulklot-hold-shopper:u_s2');
  });

  it('the lot cap comes from the transaction count: refused 409, no sell, no hold row', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events, outerCount } = instrument(base, { counts: { lot: MAX_ACTIVE_HOLDS_PER_LOT } });
    const err = await fail(() => placeBulkHold(db, deps, ORG, lot.id, { quantity: 10 }));
    expect(err.code).toBe('BULK_HOLD_LIMIT');
    expect(err.status).toBe(409);
    expect(err.name).toBe('BulkHoldError');
    expect(events).toEqual([`lock:bulklot-hold-lot:${lot.id}`, 'count:lot']);
    expect(base.bulkLotHold.rows).toHaveLength(0);
    expect(base.stock(lot.id).sold).toBe(0);
    expect(outerCount).toEqual([]);
  });

  it('one more than the lot cap is not refused (the cap is at 25, not 24)', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events } = instrument(base, { counts: { lot: MAX_ACTIVE_HOLDS_PER_LOT - 1 } });
    await placeBulkHold(db, deps, ORG, lot.id, { quantity: 10 });
    expect(events).toContain('create');
  });

  it('the one-hold-per-lot shopper cap comes from the transaction count: refused 409, no sell, no hold row', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events, outerCount } = instrument(base, { counts: { mine: 1 } });
    const err = await fail(() => placeBulkHold(db, deps, shopperOf('u_s1'), lot.id, { quantity: 10 }));
    expect(err.code).toBe('BULK_HOLD_LIMIT');
    expect(err.status).toBe(409);
    expect(events).toEqual([`lock:bulklot-hold-lot:${lot.id}`, 'lock:bulklot-hold-shopper:u_s1', 'count:lot', 'count:mine']);
    expect(base.bulkLotHold.rows).toHaveLength(0);
    expect(base.stock(lot.id).sold).toBe(0);
    expect(outerCount).toEqual([]);
  });

  it('the shopper total cap comes from the transaction count: refused 409, no sell, no hold row', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events, outerCount } = instrument(base, { counts: { total: MAX_ACTIVE_SHOPPER_HOLDS } });
    const err = await fail(() => placeBulkHold(db, deps, shopperOf('u_s1'), lot.id, { quantity: 10 }));
    expect(err.code).toBe('BULK_HOLD_LIMIT');
    expect(err.status).toBe(409);
    expect(events).toEqual([`lock:bulklot-hold-lot:${lot.id}`, 'lock:bulklot-hold-shopper:u_s1', 'count:lot', 'count:mine', 'count:total']);
    expect(base.bulkLotHold.rows).toHaveLength(0);
    expect(base.stock(lot.id).sold).toBe(0);
    expect(outerCount).toEqual([]);
  });

  it('a shopper total of one under the cap is allowed', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events } = instrument(base, { counts: { total: MAX_ACTIVE_SHOPPER_HOLDS - 1 } });
    await placeBulkHold(db, deps, shopperOf('u_s1'), lot.id, { quantity: 10 });
    expect(events).toContain('create');
  });

  it('the shopper caps do not apply to an organizer (a huge shopper count is ignored)', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events } = instrument(base, { counts: { mine: 99, total: 99 } });
    await placeBulkHold(db, deps, ORG, lot.id, { quantity: 10 });
    expect(events).toContain('create');
  });

  it('a refusal rolls the transaction back: cards and rows are exactly as before', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    await placeBulkHold(base as any, { sell: fakeSell(base), now: () => new Date() }, ORG, lot.id, { quantity: 500 });
    const rowsBefore = base.bulkLotHold.rows.length;
    const soldBefore = base.stock(lot.id).sold;
    const { db, deps } = instrument(base, { counts: { lot: MAX_ACTIVE_HOLDS_PER_LOT } });
    expect((await fail(() => placeBulkHold(db, deps, ORG, lot.id, { quantity: 10 })))?.code).toBe('BULK_HOLD_LIMIT');
    expect(base.bulkLotHold.rows).toHaveLength(rowsBefore);
    expect(base.stock(lot.id).sold).toBe(soldBefore);
  });

  it('an InsufficientStockError from sell inside the transaction is still INSUFFICIENT_STOCK 409, with no hold row', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const { db, deps, events } = instrument(base, { sellThrows: new FakeInsufficientStock() });
    const err = await fail(() => placeBulkHold(db, deps, shopperOf('u_s1'), lot.id, { quantity: 10 }));
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(err.status).toBe(409);
    expect(events).toEqual([
      `lock:bulklot-hold-lot:${lot.id}`,
      'lock:bulklot-hold-shopper:u_s1',
      'count:lot',
      'count:mine',
      'count:total',
      'sell',
    ]);
    expect(base.bulkLotHold.rows).toHaveLength(0);
  });

  it('a real over-hold through the guarded increment is INSUFFICIENT_STOCK 409 and changes nothing', async () => {
    const base = new FakeDb();
    const lot = base.addLot({ stockTotal: 1000, stockSold: 400 });
    const { db, deps } = instrument(base);
    const err = await fail(() => placeBulkHold(db, deps, ORG, lot.id, { quantity: 601 }));
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(err.status).toBe(409);
    expect(base.stock(lot.id).sold).toBe(400);
    expect(base.bulkLotHold.rows).toHaveLength(0);
  });

  it('an error other than a hold refusal or a stock shortage passes through unchanged', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    const boom = new Error('connection reset');
    const { db, deps } = instrument(base, { sellThrows: boom });
    expect(await fail(() => placeBulkHold(db, deps, ORG, lot.id, { quantity: 10 }))).toBe(boom);
  });

  it('the plain FakeDb records the lot lock (so every existing hold test now exercises the lock call)', async () => {
    const base = new FakeDb();
    const lot = base.addLot();
    await placeBulkHold(base as any, { sell: fakeSell(base), now: () => new Date() }, shopperOf('u_s1'), lot.id, { quantity: 10 });
    expect(base.rawCalls).toHaveLength(2);
    expect(base.rawCalls[0]).toContain('pg_advisory_xact_lock(hashtext(?))');
    expect(base.rawCalls[0]).toContain(`bulklot-hold-lot:${lot.id}`);
    expect(base.rawCalls[1]).toContain('bulklot-hold-shopper:u_s1');
  });
});

/**
 * A database that models what the advisory lock does: transactions run concurrently (each await yields to the others), a lock key
 * is a mutex held until the transaction ends, and the count is deliberately slow (it yields) so that without a lock every request
 * reads the same count before any of them writes. Rows written are visible to the next count at once (READ COMMITTED, and the lock
 * holder commits before the next one runs). No rollback is modelled: every refusal here happens before the first write.
 */
class LockingDb {
  holds: Array<Record<string, any>> = [];
  stockSold = 0;
  locksTaken: string[] = [];
  private held = new Map<string, Promise<void>>();
  constructor(private useLocks: boolean, readonly stockTotal = 1_000_000) {}

  item = {
    findUnique: async ({ where }: { where: { id: string } }) => ({
      id: where.id, saleId: 'sale1', organizerId: 'org1', price: 8, status: 'AVAILABLE', stockTotal: this.stockTotal, stockSold: this.stockSold,
      bulkLot: { id: `lot_${where.id}`, packSize: null },
    }),
  };

  bulkLotHold = {
    count: async (args: any) => this.count(args),
    create: async (args: any) => this.create(args),
  };

  private async count(args: any): Promise<number> {
    const n = this.holds.filter((h) => h.status === 'ACTIVE' && (args.where.itemId === undefined || h.itemId === args.where.itemId) && (args.where.shopperUserId === undefined || h.shopperUserId === args.where.shopperUserId)).length;
    await new Promise((r) => setImmediate(r)); // the slow read: others run while this count is in flight
    return n;
  }

  private async create(args: any): Promise<Record<string, any>> {
    await new Promise((r) => setImmediate(r));
    const row = { id: `h${this.holds.length + 1}`, ...args.data };
    this.holds.push(row);
    return row;
  }

  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const mine: Array<() => void> = [];
    const tx = {
      bulkLotHold: this.bulkLotHold,
      $executeRaw: async (_s: TemplateStringsArray, key: string) => {
        this.locksTaken.push(key);
        if (!this.useLocks) return 1;
        while (this.held.has(key)) await this.held.get(key);
        let release!: () => void;
        this.held.set(key, new Promise<void>((r) => (release = r)));
        mine.push(() => {
          this.held.delete(key);
          release();
        });
        return 1;
      },
    };
    try {
      return await fn(tx);
    } finally {
      mine.reverse().forEach((r) => r());
    }
  }

  deps() {
    return {
      now: () => new Date(Date.UTC(2026, 9, 6, 12, 0, 0)),
      sell: async (_tx: any, _itemId: string, units: number) => {
        await new Promise((r) => setImmediate(r));
        if (this.stockSold + units > this.stockTotal) throw new FakeInsufficientStock();
        this.stockSold += units;
        return { fullySoldOut: false, remainingStock: this.stockTotal - this.stockSold };
      },
    };
  }
}

const settle = (ps: Array<Promise<unknown>>) => Promise.allSettled(ps);
const codes = (rs: PromiseSettledResult<unknown>[]) => rs.map((r) => (r.status === 'rejected' ? String((r.reason as any).code ?? r.reason) : 'OK'));

describe('placeBulkHold: concurrent placements stay within the caps (lock-modelling fake)', () => {
  it('40 concurrent organizer holds on one lot: exactly 25 win, the other 15 are BULK_HOLD_LIMIT', async () => {
    const db = new LockingDb(true);
    const out = codes(await settle(Array.from({ length: 40 }, () => placeBulkHold(db as any, db.deps() as any, ORG, 'lotA', { quantity: 1 }))));
    expect(out.filter((c) => c === 'OK')).toHaveLength(MAX_ACTIVE_HOLDS_PER_LOT);
    expect(out.filter((c) => c === 'BULK_HOLD_LIMIT')).toHaveLength(40 - MAX_ACTIVE_HOLDS_PER_LOT);
    expect(db.holds).toHaveLength(MAX_ACTIVE_HOLDS_PER_LOT);
    expect(db.stockSold).toBe(MAX_ACTIVE_HOLDS_PER_LOT);
  });

  it('one shopper double-clicking (6 concurrent holds on one lot): exactly 1 wins', async () => {
    const db = new LockingDb(true);
    const out = codes(await settle(Array.from({ length: 6 }, () => placeBulkHold(db as any, db.deps() as any, shopperOf('u_s1'), 'lotA', { quantity: 5 }))));
    expect(out.filter((c) => c === 'OK')).toHaveLength(1);
    expect(out.filter((c) => c === 'BULK_HOLD_LIMIT')).toHaveLength(5);
    expect(db.holds).toHaveLength(1);
    expect(db.stockSold).toBe(5);
  });

  it('one shopper on 12 different lots at once: exactly 5 win (the total cap)', async () => {
    const db = new LockingDb(true);
    const out = codes(await settle(Array.from({ length: 12 }, (_, i) => placeBulkHold(db as any, db.deps() as any, shopperOf('u_s1'), `lot${i}`, { quantity: 1 }))));
    expect(out.filter((c) => c === 'OK')).toHaveLength(MAX_ACTIVE_SHOPPER_HOLDS);
    expect(out.filter((c) => c === 'BULK_HOLD_LIMIT')).toHaveLength(12 - MAX_ACTIVE_SHOPPER_HOLDS);
    expect(db.holds).toHaveLength(MAX_ACTIVE_SHOPPER_HOLDS);
    expect(db.stockSold).toBe(MAX_ACTIVE_SHOPPER_HOLDS);
  });

  it('a mix of shoppers and organizers across lots finishes (no deadlock) and respects every cap', async () => {
    const db = new LockingDb(true);
    const jobs: Array<Promise<unknown>> = [];
    for (let i = 0; i < 8; i++) {
      jobs.push(placeBulkHold(db as any, db.deps() as any, shopperOf('u_a'), `lot${i % 4}`, { quantity: 1 }));
      jobs.push(placeBulkHold(db as any, db.deps() as any, shopperOf('u_b'), `lot${i % 4}`, { quantity: 1 }));
      jobs.push(placeBulkHold(db as any, db.deps() as any, ORG, `lot${i % 4}`, { quantity: 1 }));
    }
    const out = codes(await settle(jobs));
    expect(out.every((c) => c === 'OK' || c === 'BULK_HOLD_LIMIT')).toBe(true);
    for (const u of ['u_a', 'u_b']) {
      expect(db.holds.filter((h) => h.shopperUserId === u).length).toBeLessThanOrEqual(MAX_ACTIVE_SHOPPER_HOLDS);
      for (let i = 0; i < 4; i++) expect(db.holds.filter((h) => h.shopperUserId === u && h.itemId === `lot${i}`).length).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < 4; i++) expect(db.holds.filter((h) => h.itemId === `lot${i}`).length).toBeLessThanOrEqual(MAX_ACTIVE_HOLDS_PER_LOT);
  });

  it('CONTROL: the same harness with the locks turned off exceeds the lot cap (so the tests above would catch the old bug)', async () => {
    const db = new LockingDb(false);
    await settle(Array.from({ length: 40 }, () => placeBulkHold(db as any, db.deps() as any, ORG, 'lotA', { quantity: 1 })));
    expect(db.holds.length).toBeGreaterThan(MAX_ACTIVE_HOLDS_PER_LOT);
  });

  it('CONTROL: with the locks turned off one shopper double-clicking gets more than one hold on a lot', async () => {
    const db = new LockingDb(false);
    await settle(Array.from({ length: 6 }, () => placeBulkHold(db as any, db.deps() as any, shopperOf('u_s1'), 'lotA', { quantity: 5 })));
    expect(db.holds.length).toBeGreaterThan(1);
  });
});
