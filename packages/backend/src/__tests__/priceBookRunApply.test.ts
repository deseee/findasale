/**
 * ADR-140 B3b: applying a run (AT-21 to AT-23). Rows are written 200 per call with a compare and swap per card; a card that
 * changed since the preview is counted and left alone; a second call after the end answers 409 ALREADY_APPLIED.
 */
import { FAKE_NOW, createFakePriceBookDb, makeCtx, seedBook, seedCardItem, seedLock, seedRule } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';
import { lookupKey } from '../services/priceBook/cardKey';
import { isPriceBookError } from '../services/priceBook/db';
import type { ServiceCtx } from '../services/priceBook/db';
import type { PriceBookProvider } from '../services/priceBook/providers/registry';
import type { ReferenceCandidate } from '../services/priceBook/types';
import { APPLY_CHUNK_SIZE, applyRun, cancelRun, getRun, listRunItems, previewRun, updateSelection } from '../services/priceBook/runService';
import type { PriceChange, RunDeps } from '../services/priceBook/runService';

const A = 'orgA';
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const ENV = { CARD_PRICE_BOOK_ENABLED: 'true' };

interface Shop {
  db: FakeDb;
  bookId: string;
  ctx: ServiceCtx;
  deps: RunDeps;
  /** Reference value in cents by collector number. A card with no entry has no reference. */
  values: Record<string, number>;
  fetches: { calls: number };
  /** Adds a listed card whose collector number is n. Returns the item id. */
  add(n: number, price: number | null, refCents: number | null, item?: AnyRow, card?: AnyRow): string;
  /** The same context some milliseconds later. */
  later(ms: number): ServiceCtx;
}

function shop(env: Record<string, string | undefined> = {}, bookOverrides: AnyRow = {}): Shop {
  const db = createFakePriceBookDb();
  const book = seedBook(db, A, { enabled: true, ...bookOverrides });
  const bookId = book.id as string;
  seedRule(db, bookId, { name: 'All cards', roundingMode: 'NONE' });
  const values: Record<string, number> = {};
  const fetches = { calls: 0 };
  const provider: PriceBookProvider = {
    kind: 'MANUAL',
    terms: { status: 'CLEARED', reviewedOn: null, reference: 'test' },
    isActive: () => true,
    async fetch(_ctx, cards) {
      fetches.calls += 1;
      const out = new Map<string, ReferenceCandidate[]>();
      for (const c of cards) {
        const cents = values[c.collectorNumber ?? ''];
        if (cents !== undefined) {
          out.set(lookupKey(c.cardKey, c.finish, c.language), [{ kind: 'MANUAL', valueCents: cents, asOf: FAKE_NOW, origin: 'TEST', label: 'Test number' }]);
        }
      }
      return out;
    },
  };
  const ctx = makeCtx(db, A, { env: { ...ENV, ...env } });
  return {
    db,
    bookId,
    ctx,
    values,
    fetches,
    deps: { providers: [provider] },
    add(n, price, refCents, item = {}, card = {}) {
      if (refCents !== null) values[String(n)] = refCents;
      const made = seedCardItem(db, A, { title: `Card ${n}`, price, ...item }, { cardName: `Card ${n}`, collectorNumber: String(n), ...card });
      return made.item.id as string;
    },
    later(ms) {
      return { ...ctx, now: new Date(FAKE_NOW.getTime() + ms) };
    },
  };
}

async function errorOf(p: Promise<unknown>): Promise<{ code: string; status: number; details: unknown }> {
  try {
    await p;
  } catch (e) {
    if (isPriceBookError(e)) return { code: e.code, status: e.status, details: e.details };
    throw e;
  }
  throw new Error('expected an error');
}

function itemRow(db: FakeDb, id: string): AnyRow {
  const row = db.tables.item.find((r) => r.id === id);
  if (!row) throw new Error(`no item ${id}`);
  return row;
}

function runItemRow(db: FakeDb, runId: string, itemId: string): AnyRow {
  const row = db.tables.priceBookRunItem.find((r) => r.runId === runId && r.itemId === itemId);
  if (!row) throw new Error(`no run item ${itemId}`);
  return row;
}

const BULK = { kind: 'BULK' };
const body = (n: number, version = 1) => ({ ifBookVersion: version, expectedCount: n });

/** Previews all cards and returns the run id. */
async function preview(s: Shop): Promise<string> {
  return (await previewRun(s.ctx, BULK, s.deps)).run.id;
}

function priceOf(db: FakeDb, id: string): unknown {
  return itemRow(db, id).price;
}

describe('a clean apply', () => {
  test('writes every ticked price in dollars, stamps the edit time, and writes one history row per card', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const b = s.add(2, 10, 1100);
    const runId = await preview(s);
    const at = s.later(5 * MIN);
    const out = await applyRun(at, runId, body(2), s.deps);
    expect(out).toMatchObject({ status: 'APPLIED', applied: 2, appliedThisCall: 2, remaining: 0, changedSincePreview: 0, lockedSincePreview: 0, failed: 0 });
    expect(out.message).toBe('Applied 2 prices.');
    expect(priceOf(s.db, a)).toBe(4.5);
    expect(priceOf(s.db, b)).toBe(11);
    expect(itemRow(s.db, a).priceUpdatedAt).toEqual(at.now);
    expect(itemRow(s.db, a).lastEditedAt).toEqual(at.now);
    const history = s.db.tables.itemPriceHistory;
    expect(history.length).toBe(2);
    expect(history.find((h) => h.itemId === a)).toMatchObject({ price: 4.5, changedBy: 'organizer', note: `Price book run ${runId}` });
    const run = await getRun(s.ctx, runId);
    expect(run).toMatchObject({ status: 'APPLIED', appliedCount: 2, appliedAt: at.now.toISOString() });
    expect(runItemRow(s.db, runId, a)).toMatchObject({ state: 'APPLIED', appliedAt: at.now });
  });

  test('the row the shop did not tick, a row that needs a look, and every skipped row are not written', async () => {
    const s = shop();
    const ticked = s.add(1, 4, 450);
    const unticked = s.add(2, 4, 450);
    const review = s.add(3, 1, 500);
    const marked = s.add(4, 4, 450, { markdownApplied: true });
    const pinned = s.add(5, 4, 450);
    seedLock(s.db, s.bookId, pinned);
    const runId = await preview(s);
    await updateSelection(s.ctx, runId, { deselectIds: [unticked] });
    const out = await applyRun(s.later(MIN), runId, body(1), s.deps);
    expect(out.status).toBe('APPLIED');
    expect(priceOf(s.db, ticked)).toBe(4.5);
    for (const id of [unticked, marked, pinned]) expect(priceOf(s.db, id)).toBe(4);
    expect(priceOf(s.db, review)).toBe(1);
    expect(runItemRow(s.db, runId, unticked)).toMatchObject({ state: 'PENDING', selected: false });
    expect(s.db.tables.itemPriceHistory.length).toBe(1);
  });

  test('a card the shop ticked from "needs a look" is written too', async () => {
    const s = shop();
    const review = s.add(1, 1, 500);
    const runId = await preview(s);
    await updateSelection(s.ctx, runId, { selectReview: true });
    await applyRun(s.later(MIN), runId, body(1), s.deps);
    expect(priceOf(s.db, review)).toBe(5);
  });

  test('it uses the injected clock, never the system clock', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const runId = await preview(s);
    const at = s.later(20 * MIN);
    await applyRun(at, runId, body(1), s.deps);
    expect(itemRow(s.db, a).priceUpdatedAt).toEqual(at.now);
    expect((await getRun(s.ctx, runId)).appliedAt).toBe(at.now.toISOString());
  });

  test('the side effects of a price edit follow: the rarity badge, the price anchors and the edited fields list', async () => {
    const s = shop();
    const a = s.add(1, 22, 2700);
    const runId = await preview(s);
    await updateSelection(s.ctx, runId, { selectAllChanges: true });
    await applyRun(s.later(MIN), runId, body(1), s.deps);
    expect(itemRow(s.db, a)).toMatchObject({ price: 27, rarity: 'UNCOMMON', priceBeforeMarkdown: 27, originalPrice: 27, userEditedFields: ['price'] });
  });

  test('an eBay card included in the run is queued for the marketplace again', async () => {
    const s = shop();
    const a = s.add(1, 4, 450, { ebayListingId: 'L1', ebaySyncState: 'SYNCED', ebaySyncAttempts: 3 });
    const runId = (await previewRun(s.ctx, { ...BULK, includeEbayLive: true }, s.deps)).run.id;
    const changes: PriceChange[] = [];
    const deps: RunDeps = { ...s.deps, onPriceChanged: (c) => void changes.push(c) };
    await applyRun(s.later(MIN), runId, body(1), deps);
    expect(itemRow(s.db, a)).toMatchObject({ price: 4.5, ebaySyncState: 'PENDING', ebaySyncAttempts: 0 });
    expect(changes).toEqual([{ runId, kind: 'APPLY', itemId: a, organizerId: A, oldPriceCents: 400, newPriceCents: 450, oldPrice: 4, newPrice: 4.5, ebayListed: true }]);
  });

  test('a second preview right after an apply does not call the cards the run priced "recently edited"', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const runId = await preview(s);
    const at = s.later(MIN);
    await applyRun(at, runId, body(1), s.deps);
    s.values['1'] = 475;
    const again = await previewRun(at, BULK, s.deps);
    const row = again.items.find((r) => r.itemId === a);
    expect(row).toMatchObject({ state: 'PENDING', oldPriceCents: 450, newPriceCents: 475 });
  });
});

describe('the compare and swap', () => {
  async function partial(mutate: (s: Shop, id: string) => void) {
    const s = shop();
    const changed = s.add(1, 4, 450);
    const other = s.add(2, 4, 450);
    const runId = await preview(s);
    mutate(s, changed);
    const out = await applyRun(s.later(5 * MIN), runId, body(2), s.deps);
    return { s, changed, other, runId, out };
  }

  test('a price changed by hand after the preview is not overwritten', async () => {
    const { s, changed, other, runId, out } = await partial((shopp, id) => {
      Object.assign(itemRow(shopp.db, id), { price: 6, priceUpdatedAt: new Date(FAKE_NOW.getTime() + MIN) });
    });
    expect(out).toMatchObject({ status: 'PARTIAL', applied: 1, changedSincePreview: 1, failed: 0 });
    expect(out.message).toBe('Applied 1 prices. 1 cards changed after the preview, so we left them alone.');
    expect(priceOf(s.db, changed)).toBe(6);
    expect(priceOf(s.db, other)).toBe(4.5);
    expect(runItemRow(s.db, runId, changed)).toMatchObject({ state: 'CHANGED_SINCE_PREVIEW', appliedAt: null });
    expect(s.db.tables.itemPriceHistory.length).toBe(1);
    expect((await getRun(s.ctx, runId)).status).toBe('PARTIAL');
  });

  test('a price stamp after the preview blocks the write even when the price looks the same', async () => {
    const { s, changed, out } = await partial((shopp, id) => {
      itemRow(shopp.db, id).priceUpdatedAt = new Date(FAKE_NOW.getTime() + MIN);
    });
    expect(out.changedSincePreview).toBe(1);
    expect(priceOf(s.db, changed)).toBe(4);
  });

  test('a price stamp before the preview does not block it', async () => {
    const { s, changed, out } = await partial((shopp, id) => {
      itemRow(shopp.db, id).priceUpdatedAt = new Date(FAKE_NOW.getTime() - 30 * DAY);
    });
    expect(out.status).toBe('APPLIED');
    expect(priceOf(s.db, changed)).toBe(4.5);
  });

  test('a card marked down after the preview is left alone', async () => {
    const { s, changed, out } = await partial((shopp, id) => {
      Object.assign(itemRow(shopp.db, id), { markdownApplied: true, price: 3, priceUpdatedAt: new Date(FAKE_NOW.getTime() + MIN) });
    });
    expect(out.changedSincePreview).toBe(1);
    expect(priceOf(s.db, changed)).toBe(3);
  });

  test('a card marked down after the preview with the same price and no new stamp is still left alone', async () => {
    const { s, changed, out } = await partial((shopp, id) => {
      itemRow(shopp.db, id).markdownApplied = true;
    });
    expect(out.changedSincePreview).toBe(1);
    expect(priceOf(s.db, changed)).toBe(4);
  });

  test('a card listed on eBay after the preview is left alone', async () => {
    const { s, changed, out } = await partial((shopp, id) => {
      itemRow(shopp.db, id).ebayOfferId = 'O1';
    });
    expect(out.changedSincePreview).toBe(1);
    expect(priceOf(s.db, changed)).toBe(4);
  });

  test('a card sold, reserved or deleted after the preview is left alone', async () => {
    for (const change of [{ status: 'SOLD' }, { status: 'RESERVED' }, { deletedAt: FAKE_NOW }]) {
      const { s, changed, out } = await partial((shopp, id) => {
        Object.assign(itemRow(shopp.db, id), change);
      });
      expect(out.changedSincePreview).toBe(1);
      expect(priceOf(s.db, changed)).toBe(4);
    }
  });

  test('the write itself repeats the checks: a change that lands between the read and the write writes nothing', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const runId = await preview(s);
    let armed = true;
    const racing = {
      ...s.ctx,
      now: s.later(MIN).now,
      db: new Proxy(s.db, {
        get(target, prop, receiver) {
          if (prop === '$transaction') {
            return async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) =>
              target.$transaction(async (tx) => {
                const wrapped = new Proxy(tx, {
                  get(t2, p2, r2) {
                    const value = Reflect.get(t2, p2, r2);
                    if (p2 !== 'item') return value;
                    return new Proxy(value as object, {
                      get(t3, p3, r3) {
                        if (p3 === 'updateMany') {
                          return (args: never) => {
                            if (armed) {
                              armed = false;
                              Object.assign(itemRow(s.db, a), { price: 9, priceUpdatedAt: new Date(FAKE_NOW.getTime() + 2 * MIN) });
                            }
                            return (t3 as { updateMany(x: never): Promise<{ count: number }> }).updateMany(args);
                          };
                        }
                        return Reflect.get(t3, p3, r3);
                      },
                    });
                  },
                });
                return fn(wrapped);
              }, options as never);
          }
          return Reflect.get(target, prop, receiver);
        },
      }) as FakeDb,
    } as ServiceCtx;
    const out = await applyRun(racing, runId, body(1), s.deps);
    expect(out.changedSincePreview).toBe(1);
    expect(priceOf(s.db, a)).toBe(9);
    expect(s.db.tables.itemPriceHistory.length).toBe(0);
    expect(runItemRow(s.db, runId, a).state).toBe('CHANGED_SINCE_PREVIEW');
  });

  test('another organizer\'s item with the same id is never written', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const runId = await preview(s);
    itemRow(s.db, a).organizerId = 'orgB';
    const out = await applyRun(s.later(MIN), runId, body(1), s.deps);
    expect(out.changedSincePreview).toBe(1);
    expect(priceOf(s.db, a)).toBe(4);
  });
});

describe('checks before the first write', () => {
  async function ready() {
    const s = shop();
    s.add(1, 4, 450);
    s.add(2, 4, 450);
    const runId = await preview(s);
    return { s, runId };
  }

  function nothingWritten(s: Shop) {
    expect(s.db.writes.filter((w) => w.table === 'item' || w.table === 'itemPriceHistory').length).toBe(0);
  }

  test('BOOK_CHANGED: the client\'s version is old, or the run was made on an older version', async () => {
    const { s, runId } = await ready();
    expect((await errorOf(applyRun(s.later(MIN), runId, body(2, 7), s.deps))).code).toBe('BOOK_CHANGED');
    s.db.tables.priceBook[0]!.version = 2;
    expect((await errorOf(applyRun(s.later(MIN), runId, body(2, 1), s.deps))).code).toBe('BOOK_CHANGED');
    expect((await errorOf(applyRun(s.later(MIN), runId, body(2, 2), s.deps))).code).toBe('BOOK_CHANGED');
    expect((await errorOf(applyRun(s.later(MIN), runId, body(2, 2), s.deps))).status).toBe(409);
    nothingWritten(s);
    expect(s.db.tables.priceBookRun[0]?.status).toBe('PREVIEW');
  });

  test('PREVIEW_EXPIRED after the 30 minutes, and the run is marked EXPIRED', async () => {
    const { s, runId } = await ready();
    const err = await errorOf(applyRun(s.later(31 * MIN), runId, body(2), s.deps));
    expect(err).toMatchObject({ code: 'PREVIEW_EXPIRED', status: 409 });
    expect(s.db.tables.priceBookRun[0]?.status).toBe('EXPIRED');
    nothingWritten(s);
  });

  test('NOTHING_SELECTED when no row is ticked', async () => {
    const { s, runId } = await ready();
    await updateSelection(s.ctx, runId, { selectAllChanges: false });
    const err = await errorOf(applyRun(s.later(MIN), runId, body(0), s.deps));
    expect(err).toMatchObject({ code: 'NOTHING_SELECTED', status: 409 });
    nothingWritten(s);
  });

  test('COUNT_MISMATCH when the number the shop confirmed is not the number ticked', async () => {
    const { s, runId } = await ready();
    expect(await errorOf(applyRun(s.later(MIN), runId, body(3), s.deps))).toMatchObject({ code: 'COUNT_MISMATCH', status: 409 });
    const first = s.db.tables.priceBookRunItem[0]?.itemId as string;
    await updateSelection(s.ctx, runId, { deselectIds: [first] });
    expect((await errorOf(applyRun(s.later(MIN), runId, body(2), s.deps))).code).toBe('COUNT_MISMATCH');
    nothingWritten(s);
    expect((await applyRun(s.later(MIN), runId, body(1), s.deps)).applied).toBe(1);
  });

  test('a cancelled run cannot be applied', async () => {
    const { s, runId } = await ready();
    await cancelRun(s.ctx, runId);
    expect((await errorOf(applyRun(s.later(MIN), runId, body(2), s.deps))).code).toBe('RUN_NOT_PREVIEW');
  });

  test('bad bodies are refused before anything is read', async () => {
    const { s, runId } = await ready();
    const bad: unknown[] = [null, {}, { ifBookVersion: 1 }, { expectedCount: 2 }, { ifBookVersion: '1', expectedCount: 2 }, { ifBookVersion: 0, expectedCount: 2 }, { ifBookVersion: 1, expectedCount: -1 }, { ifBookVersion: 1, expectedCount: 1.5 }, { ifBookVersion: 1, expectedCount: 2, force: true }];
    for (const input of bad) expect((await errorOf(applyRun(s.later(MIN), runId, input, s.deps))).code).toBe('VALIDATION');
    nothingWritten(s);
  });

  test('an unknown run id and another organizer\'s run id are both NOT_FOUND', async () => {
    const { s, runId } = await ready();
    expect((await errorOf(applyRun(s.ctx, 'nope', body(2), s.deps))).code).toBe('NOT_FOUND');
    seedBook(s.db, 'orgB', { enabled: true });
    const other = makeCtx(s.db, 'orgB', { env: { CARD_PRICE_BOOK_ENABLED: 'true' }, now: s.later(MIN).now });
    expect((await errorOf(applyRun(other, runId, body(2), s.deps))).code).toBe('NOT_FOUND');
    nothingWritten(s);
  });
});

describe('pins and failures', () => {
  test('a pin set after the preview is honored at apply and counted', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const b = s.add(2, 4, 450);
    const runId = await preview(s);
    seedLock(s.db, s.bookId, a);
    const out = await applyRun(s.later(MIN), runId, body(2), s.deps);
    expect(out).toMatchObject({ status: 'PARTIAL', applied: 1, lockedSincePreview: 1 });
    expect(out.message).toBe('Applied 1 prices. 1 cards were locked after the preview, so we left them alone.');
    expect(priceOf(s.db, a)).toBe(4);
    expect(priceOf(s.db, b)).toBe(4.5);
    expect(runItemRow(s.db, runId, a)).toMatchObject({ state: 'SKIPPED', skipReason: 'LOCKED_SINCE_PREVIEW', selected: false });
  });

  test('a pin that has expired by apply time does not block', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const runId = await preview(s);
    seedLock(s.db, s.bookId, a, { lockedUntil: new Date(FAKE_NOW.getTime() + 2 * MIN) });
    const out = await applyRun(s.later(5 * MIN), runId, body(1), s.deps);
    expect(out.status).toBe('APPLIED');
    expect(priceOf(s.db, a)).toBe(4.5);
  });

  test('a write that throws rolls back that card, marks the row FAILED, and the others still go through', async () => {
    const s = shop();
    const first = s.add(1, 4, 450);
    const bad = s.add(2, 4, 480);
    const last = s.add(3, 4, 420);
    const runId = await preview(s);
    s.db.failWhen((table, op, data) => (table === 'item' && op === 'updateMany' && (data as { price?: number }).price === 4.8 ? new Error('connection lost') : null));
    const out = await applyRun(s.later(MIN), runId, body(3), s.deps);
    s.db.failWhen(null);
    expect(out).toMatchObject({ failed: 1, applied: 2, status: 'PARTIAL' });
    expect(out.message).toContain('1 prices could not be saved. Try those again.');
    expect(runItemRow(s.db, runId, bad)).toMatchObject({ state: 'FAILED', appliedAt: null });
    expect(priceOf(s.db, bad)).toBe(4);
    expect(s.db.tables.itemPriceHistory.find((h) => h.itemId === bad)).toBeUndefined();
    expect(priceOf(s.db, first)).toBe(4.5);
    expect(priceOf(s.db, last)).toBe(4.2);
  });

  test('an alert that throws never undoes the price', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const runId = await preview(s);
    const deps: RunDeps = { ...s.deps, onPriceChanged: () => { throw new Error('mail down'); } };
    const out = await applyRun(s.later(MIN), runId, body(1), deps);
    expect(out.status).toBe('APPLIED');
    expect(priceOf(s.db, a)).toBe(4.5);
  });

  test('the alert hook is told only about prices that really changed', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const b = s.add(2, 4, 450);
    const runId = await preview(s);
    itemRow(s.db, b).priceUpdatedAt = new Date(FAKE_NOW.getTime() + MIN);
    const seen: string[] = [];
    const deps: RunDeps = { ...s.deps, onPriceChanged: (c) => void seen.push(`${c.kind}:${c.itemId}`) };
    await applyRun(s.later(5 * MIN), runId, body(2), deps);
    expect(seen).toEqual([`APPLY:${a}`]);
  });
});

describe('chunks and a second call', () => {
  test('200 rows per call: a run of 450 takes three calls and the third says APPLIED', async () => {
    const s = shop();
    const total = APPLY_CHUNK_SIZE * 2 + 50;
    for (let n = 1; n <= total; n += 1) s.add(n, 4, 450);
    const runId = await preview(s);
    const at = s.later(MIN);
    const one = await applyRun(at, runId, body(total), s.deps);
    expect(one).toMatchObject({ status: 'APPLYING', applied: 200, appliedThisCall: 200, remaining: 250, message: '' });
    expect((await getRun(s.ctx, runId)).status).toBe('APPLYING');
    const two = await applyRun(at, runId, body(total), s.deps);
    expect(two).toMatchObject({ status: 'APPLYING', applied: 400, appliedThisCall: 200, remaining: 50 });
    const three = await applyRun(at, runId, body(total), s.deps);
    expect(three).toMatchObject({ status: 'APPLIED', applied: 450, appliedThisCall: 50, remaining: 0 });
    expect(s.db.tables.item.filter((r) => r.price === 4.5).length).toBe(total);
    expect(s.db.tables.itemPriceHistory.length).toBe(total);
    expect((await getRun(s.ctx, runId)).appliedCount).toBe(total);
  });

  test('the checks of the first call are not repeated: a continuing call needs no matching count', async () => {
    const s = shop();
    const total = APPLY_CHUNK_SIZE + 1;
    for (let n = 1; n <= total; n += 1) s.add(n, 4, 450);
    const runId = await preview(s);
    await applyRun(s.later(MIN), runId, body(total), s.deps);
    const out = await applyRun(s.later(MIN), runId, body(total), s.deps);
    expect(out.status).toBe('APPLIED');
  });

  test('a second call after the end is 409 ALREADY_APPLIED with the same summary and writes nothing', async () => {
    const s = shop();
    s.add(1, 4, 450);
    s.add(2, 4, 450);
    const runId = await preview(s);
    const at = s.later(MIN);
    const first = await applyRun(at, runId, body(2), s.deps);
    const writes = s.db.writes.length;
    const err = await errorOf(applyRun(at, runId, body(2), s.deps));
    expect(err).toMatchObject({ code: 'ALREADY_APPLIED', status: 409 });
    expect(err.details).toMatchObject({ runId, status: 'APPLIED', applied: first.applied, appliedThisCall: 0, remaining: 0, message: first.message });
    expect(s.db.writes.length).toBe(writes);
  });

  test('the same for a PARTIAL run', async () => {
    const s = shop();
    const a = s.add(1, 4, 450);
    const runId = await preview(s);
    itemRow(s.db, a).price = 6;
    const first = await applyRun(s.later(MIN), runId, body(1), s.deps);
    expect(first.status).toBe('PARTIAL');
    const again = await errorOf(applyRun(s.later(MIN), runId, body(1), s.deps));
    expect(again.code).toBe('ALREADY_APPLIED');
    expect(again.details).toMatchObject({ status: 'PARTIAL', changedSincePreview: 1, applied: 0 });
  });

  test('two calls at once write every card exactly once', async () => {
    const s = shop();
    const total = 30;
    for (let n = 1; n <= total; n += 1) s.add(n, 4, 450);
    const runId = await preview(s);
    const at = s.later(MIN);
    const results = await Promise.allSettled([applyRun(at, runId, body(total), s.deps), applyRun(at, runId, body(total), s.deps), applyRun(at, runId, body(total), s.deps)]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const ids = s.db.tables.itemPriceHistory.map((h) => h.itemId as string);
    expect(ids.length).toBe(total);
    expect(new Set(ids).size).toBe(total);
    expect(s.db.tables.item.filter((r) => r.price === 4.5).length).toBe(total);
    expect(s.db.tables.priceBookRunItem.filter((r) => r.state === 'APPLIED').length).toBe(total);
    expect((await getRun(s.ctx, runId)).status).toBe('APPLIED');
  });

  test('rows can still be listed after the apply, with their end state', async () => {
    const s = shop();
    s.add(1, 4, 450);
    const runId = await preview(s);
    await applyRun(s.later(MIN), runId, body(1), s.deps);
    const page = await listRunItems(s.ctx, runId, { view: 'all' });
    expect(page.items.map((r) => r.state)).toEqual(['APPLIED']);
  });
});
