/**
 * ADR-140 B3b: undoing a run (AT-24 and AT-25). Within 7 days, each applied row goes back to its old price, but only where the
 * item still has the price the run wrote. A card changed since is left alone and counted.
 */
import { FAKE_NOW, createFakePriceBookDb, makeCtx, seedBook, seedCardItem, seedLock, seedRule } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';
import { lookupKey } from '../services/priceBook/cardKey';
import { isPriceBookError } from '../services/priceBook/db';
import type { ServiceCtx } from '../services/priceBook/db';
import type { PriceBookProvider } from '../services/priceBook/providers/registry';
import type { ReferenceCandidate } from '../services/priceBook/types';
import { APPLY_CHUNK_SIZE, applyRun, cancelRun, getRun, previewRun, undoRun, updateSelection } from '../services/priceBook/runService';
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
const APPLY_AT = 20 * MIN;

function priceOf(db: FakeDb, id: string): unknown {
  return itemRow(db, id).price;
}

/** Previews, applies (20 minutes after the clock start) and returns what the undo tests need. */
async function applied(s: Shop) {
  const preview = await previewRun(s.ctx, BULK, s.deps);
  const runId = preview.run.id;
  const n = preview.run.counts.changes;
  const at = s.later(APPLY_AT);
  let out = await applyRun(at, runId, body(n), s.deps);
  while (out.status === 'APPLYING') out = await applyRun(at, runId, body(n), s.deps);
  return { runId, at, n };
}

function threeCards() {
  const s = shop();
  const ids = [s.add(1, 4, 450), s.add(2, 4, 420), s.add(3, 4, 380)];
  return { s, ids };
}

describe('a clean undo', () => {
  test('puts every old price back, writes history rows and stamps the time', async () => {
    const { s, ids } = threeCards();
    const { runId, at } = await applied(s);
    expect(ids.map((id) => priceOf(s.db, id))).toEqual([4.5, 4.2, 3.8]);
    const undoAt = s.later(APPLY_AT + 2 * DAY);
    const out = await undoRun(undoAt, runId, s.deps);
    expect(out).toMatchObject({ status: 'UNDONE', undone: 3, undoneThisCall: 3, undoSkipped: 0, remaining: 0, message: 'Undid 3 prices.' });
    expect(ids.map((id) => priceOf(s.db, id))).toEqual([4, 4, 4]);
    expect(itemRow(s.db, ids[0] as string).priceUpdatedAt).toEqual(undoAt.now);
    const undoHistory = s.db.tables.itemPriceHistory.filter((h) => String(h.note).startsWith('Price book undo'));
    expect(undoHistory.length).toBe(3);
    expect(undoHistory[0]).toMatchObject({ changedBy: 'organizer', note: `Price book undo of run ${runId}` });
    expect(await getRun(s.ctx, runId)).toMatchObject({ status: 'UNDONE', appliedCount: 3, undoneCount: 3, undoneAt: undoAt.now.toISOString() });
    expect(runItemRow(s.db, runId, ids[0] as string)).toMatchObject({ state: 'UNDONE', undoneAt: undoAt.now });
    expect(at.now.getTime()).toBeLessThan(undoAt.now.getTime());
  });

  test('a card that had no price goes back to no price', async () => {
    const s = shop();
    const a = s.add(1, null, 450);
    const { runId } = await applied(s);
    expect(priceOf(s.db, a)).toBe(4.5);
    const out = await undoRun(s.later(APPLY_AT + MIN), runId, s.deps);
    expect(out.undone).toBe(1);
    expect(priceOf(s.db, a)).toBeNull();
  });

  test('the alert hook gets an UNDO change with the prices in the right order', async () => {
    const { s, ids } = threeCards();
    const { runId } = await applied(s);
    const seen: PriceChange[] = [];
    const deps: RunDeps = { ...s.deps, onPriceChanged: (c) => void seen.push(c) };
    await undoRun(s.later(APPLY_AT + MIN), runId, deps);
    expect(seen.length).toBe(3);
    expect(seen[0]).toEqual({ runId, kind: 'UNDO', itemId: ids[0], organizerId: A, oldPriceCents: 450, newPriceCents: 400, oldPrice: 4.5, newPrice: 4, ebayListed: false });
  });

  test('an eBay card is queued for the marketplace again when it goes back', async () => {
    const s = shop();
    const a = s.add(1, 4, 450, { ebayListingId: 'L1', ebaySyncState: 'SYNCED' });
    const preview = await previewRun(s.ctx, { ...BULK, includeEbayLive: true }, s.deps);
    await applyRun(s.later(APPLY_AT), preview.run.id, body(1), s.deps);
    itemRow(s.db, a).ebaySyncState = 'SYNCED';
    await undoRun(s.later(APPLY_AT + MIN), preview.run.id, s.deps);
    expect(itemRow(s.db, a)).toMatchObject({ price: 4, ebaySyncState: 'PENDING', ebaySyncAttempts: 0 });
  });
});

describe('the guard: only where the price is still what the run wrote', () => {
  async function undoWith(mutate: (s: Shop, ids: string[]) => void) {
    const { s, ids } = threeCards();
    const { runId } = await applied(s);
    mutate(s, ids);
    const out = await undoRun(s.later(APPLY_AT + MIN), runId, s.deps);
    return { s, ids, runId, out };
  }

  test('a price changed by hand after the apply is left alone and counted', async () => {
    const { s, ids, runId, out } = await undoWith((shopp, list) => {
      Object.assign(itemRow(shopp.db, list[0] as string), { price: 9.99, priceUpdatedAt: new Date(FAKE_NOW.getTime() + 25 * MIN) });
    });
    expect(out).toMatchObject({ status: 'UNDONE', undone: 2, undoSkipped: 1, remaining: 0 });
    expect(out.message).toBe('Undid 2 prices. 1 cards were changed by hand since, so we left them alone.');
    expect(priceOf(s.db, ids[0] as string)).toBe(9.99);
    expect(priceOf(s.db, ids[1] as string)).toBe(4);
    expect(runItemRow(s.db, runId, ids[0] as string)).toMatchObject({ state: 'UNDO_SKIPPED', undoneAt: null });
    expect((await getRun(s.ctx, runId)).undoneCount).toBe(2);
  });

  test('a price changed without a new stamp is still left alone', async () => {
    const { s, ids, out } = await undoWith((shopp, list) => {
      itemRow(shopp.db, list[1] as string).price = 5;
    });
    expect(out.undoSkipped).toBe(1);
    expect(priceOf(s.db, ids[1] as string)).toBe(5);
  });

  test('a hand edit that saved the same price again (a newer stamp) is left alone', async () => {
    const { s, ids, out } = await undoWith((shopp, list) => {
      itemRow(shopp.db, list[2] as string).priceUpdatedAt = new Date(FAKE_NOW.getTime() + 30 * MIN);
    });
    expect(out.undoSkipped).toBe(1);
    expect(priceOf(s.db, ids[2] as string)).toBe(3.8);
  });

  test('a markdown after the apply is left alone', async () => {
    const { s, ids, out } = await undoWith((shopp, list) => {
      Object.assign(itemRow(shopp.db, list[0] as string), { markdownApplied: true, price: 3.38, priceUpdatedAt: new Date(FAKE_NOW.getTime() + 5 * DAY) });
    });
    expect(out.undoSkipped).toBe(1);
    expect(priceOf(s.db, ids[0] as string)).toBe(3.38);
  });

  test('a deleted card is left alone', async () => {
    const { out } = await undoWith((shopp, list) => {
      itemRow(shopp.db, list[0] as string).deletedAt = FAKE_NOW;
    });
    expect(out.undoSkipped).toBe(1);
    expect(out.undone).toBe(2);
  });

  test('another organizer\'s item with the same id is never written', async () => {
    const { s, ids, out } = await undoWith((shopp, list) => {
      itemRow(shopp.db, list[0] as string).organizerId = 'orgB';
    });
    expect(out.undoSkipped).toBe(1);
    expect(priceOf(s.db, ids[0] as string)).toBe(4.5);
  });

  test('a pin set after the apply is honored', async () => {
    const { s, ids, out } = await undoWith((shopp, list) => {
      seedLock(shopp.db, shopp.bookId, list[1] as string);
    });
    expect(out).toMatchObject({ undone: 2, undoSkipped: 1 });
    expect(priceOf(s.db, ids[1] as string)).toBe(4.2);
  });

  test('a write that throws leaves the price, counts the row as skipped, and the rest are undone', async () => {
    const { s, ids } = threeCards();
    const { runId } = await applied(s);
    let armed = true;
    s.db.failWhen((table, op) => {
      if (!armed || table !== 'item' || op !== 'updateMany') return null;
      armed = false;
      return new Error('connection lost');
    });
    const out = await undoRun(s.later(APPLY_AT + MIN), runId, s.deps);
    s.db.failWhen(null);
    expect(out).toMatchObject({ status: 'UNDONE', undone: 2, undoSkipped: 1 });
    expect(priceOf(s.db, ids[0] as string)).toBe(4.5);
    expect(runItemRow(s.db, runId, ids[0] as string).state).toBe('UNDO_SKIPPED');
  });

  test('a skipped row is final: undoing again does not retry it', async () => {
    const { s, ids, runId } = await undoWith((shopp, list) => {
      itemRow(shopp.db, list[0] as string).price = 7;
    });
    itemRow(s.db, ids[0] as string).price = 4.5;
    const writes = s.db.writes.length;
    const again = await undoRun(s.later(APPLY_AT + 2 * MIN), runId, s.deps);
    expect(again).toMatchObject({ status: 'UNDONE', undone: 2, undoSkipped: 1, undoneThisCall: 0 });
    expect(s.db.writes.length).toBe(writes);
    expect(priceOf(s.db, ids[0] as string)).toBe(4.5);
  });
});

describe('the window', () => {
  test('7 days from the end of the apply, inclusive', async () => {
    const { s } = threeCards();
    const { runId } = await applied(s);
    const edge = APPLY_AT + 7 * DAY;
    expect((await errorOf(undoRun(s.later(edge + 1), runId, s.deps))).code).toBe('UNDO_EXPIRED');
    expect((await errorOf(undoRun(s.later(edge + 1), runId, s.deps))).status).toBe(409);
    const out = await undoRun(s.later(edge), runId, s.deps);
    expect(out.status).toBe('UNDONE');
  });

  test('the window counts from the apply, not from the preview (7 days and 10 minutes after the preview is still inside)', async () => {
    const { s } = threeCards();
    const { runId } = await applied(s);
    expect((await undoRun(s.later(7 * DAY + 10 * MIN), runId, s.deps)).status).toBe('UNDONE');
  });

  test('CARD_PRICE_BOOK_UNDO_DAYS changes it', async () => {
    const s = shop({ CARD_PRICE_BOOK_UNDO_DAYS: '2' });
    s.add(1, 4, 450);
    const { runId } = await applied(s);
    expect((await errorOf(undoRun(s.later(APPLY_AT + 2 * DAY + 1), runId, s.deps))).code).toBe('UNDO_EXPIRED');
    expect((await undoRun(s.later(APPLY_AT + 2 * DAY), runId, s.deps)).status).toBe('UNDONE');
  });

  test('an expired window writes nothing', async () => {
    const { s } = threeCards();
    const { runId } = await applied(s);
    const writes = s.db.writes.length;
    await errorOf(undoRun(s.later(APPLY_AT + 8 * DAY), runId, s.deps));
    expect(s.db.writes.length).toBe(writes);
  });

  test('a run already part way through an undo can finish after the window', async () => {
    const s = shop();
    const total = APPLY_CHUNK_SIZE + 5;
    for (let n = 1; n <= total; n += 1) s.add(n, 4, 450);
    const { runId } = await applied(s);
    const first = await undoRun(s.later(APPLY_AT + 7 * DAY - MIN), runId, s.deps);
    expect(first).toMatchObject({ status: 'UNDOING', undone: 200, remaining: 5, message: '' });
    const second = await undoRun(s.later(APPLY_AT + 7 * DAY + MIN), runId, s.deps);
    expect(second).toMatchObject({ status: 'UNDONE', undone: total, remaining: 0 });
  });
});

describe('what can be undone', () => {
  test('a preview, a cancelled run and an expired run are not applied runs', async () => {
    const { s } = threeCards();
    const live = await previewRun(s.ctx, BULK, s.deps);
    expect((await errorOf(undoRun(s.ctx, live.run.id, s.deps))).code).toBe('RUN_NOT_APPLIED');
    await cancelRun(s.ctx, live.run.id);
    expect((await errorOf(undoRun(s.ctx, live.run.id, s.deps))).code).toBe('RUN_NOT_APPLIED');
    const old = await previewRun(s.ctx, BULK, s.deps);
    expect((await errorOf(undoRun(s.later(40 * MIN), old.run.id, s.deps))).code).toBe('RUN_NOT_APPLIED');
    expect((await errorOf(undoRun(s.ctx, 'nope', s.deps))).code).toBe('NOT_FOUND');
  });

  test('a partial run can be undone: only the rows it applied, the others are not touched', async () => {
    const { s, ids } = threeCards();
    const preview = await previewRun(s.ctx, BULK, s.deps);
    itemRow(s.db, ids[0] as string).price = 6;
    const done = await applyRun(s.later(APPLY_AT), preview.run.id, body(3), s.deps);
    expect(done.status).toBe('PARTIAL');
    const out = await undoRun(s.later(APPLY_AT + MIN), preview.run.id, s.deps);
    expect(out).toMatchObject({ status: 'UNDONE', undone: 2, undoSkipped: 0 });
    expect(priceOf(s.db, ids[0] as string)).toBe(6);
    expect(priceOf(s.db, ids[1] as string)).toBe(4);
    expect(runItemRow(s.db, preview.run.id, ids[0] as string).state).toBe('CHANGED_SINCE_PREVIEW');
  });

  test('rows the shop did not tick are never touched by an undo', async () => {
    const { s, ids } = threeCards();
    const preview = await previewRun(s.ctx, BULK, s.deps);
    await updateSelection(s.ctx, preview.run.id, { deselectIds: [ids[2] as string] });
    await applyRun(s.later(APPLY_AT), preview.run.id, body(2), s.deps);
    await undoRun(s.later(APPLY_AT + MIN), preview.run.id, s.deps);
    expect(priceOf(s.db, ids[2] as string)).toBe(4);
    expect(runItemRow(s.db, preview.run.id, ids[2] as string).state).toBe('PENDING');
  });

  test('a run that has been undone cannot be applied again', async () => {
    const { s } = threeCards();
    const { runId } = await applied(s);
    await undoRun(s.later(APPLY_AT + MIN), runId, s.deps);
    expect((await errorOf(applyRun(s.later(APPLY_AT + 2 * MIN), runId, body(3), s.deps))).code).toBe('RUN_NOT_PREVIEW');
  });

  test('another organizer cannot undo the run', async () => {
    const { s, ids } = threeCards();
    const { runId } = await applied(s);
    seedBook(s.db, 'orgB', { enabled: true });
    const other = makeCtx(s.db, 'orgB', { env: { CARD_PRICE_BOOK_ENABLED: 'true' }, now: s.later(APPLY_AT + MIN).now });
    expect((await errorOf(undoRun(other, runId, s.deps))).code).toBe('NOT_FOUND');
    expect(priceOf(s.db, ids[0] as string)).toBe(4.5);
  });
});

describe('a second call and chunks', () => {
  test('undoing a run that is already UNDONE answers the same summary and writes nothing', async () => {
    const { s } = threeCards();
    const { runId } = await applied(s);
    const first = await undoRun(s.later(APPLY_AT + MIN), runId, s.deps);
    const writes = s.db.writes.length;
    const again = await undoRun(s.later(APPLY_AT + 2 * MIN), runId, s.deps);
    expect(again).toMatchObject({ status: 'UNDONE', undone: first.undone, undoneThisCall: 0, undoSkipped: 0, message: first.message });
    expect(s.db.writes.length).toBe(writes);
  });

  test('200 rows per call', async () => {
    const s = shop();
    const total = APPLY_CHUNK_SIZE * 2 + 1;
    for (let n = 1; n <= total; n += 1) s.add(n, 4, 450);
    const { runId } = await applied(s);
    const at = s.later(APPLY_AT + MIN);
    expect(await undoRun(at, runId, s.deps)).toMatchObject({ status: 'UNDOING', undone: 200, undoneThisCall: 200, remaining: 201 });
    expect(await undoRun(at, runId, s.deps)).toMatchObject({ status: 'UNDOING', undone: 400, remaining: 1 });
    expect(await undoRun(at, runId, s.deps)).toMatchObject({ status: 'UNDONE', undone: 401, remaining: 0 });
    expect(s.db.tables.item.filter((r) => r.price === 4).length).toBe(total);
  });

  test('two calls at once restore every card exactly once', async () => {
    const s = shop();
    const total = 30;
    for (let n = 1; n <= total; n += 1) s.add(n, 4, 450);
    const { runId } = await applied(s);
    const at = s.later(APPLY_AT + MIN);
    await Promise.allSettled([undoRun(at, runId, s.deps), undoRun(at, runId, s.deps), undoRun(at, runId, s.deps)]);
    const undoRows = s.db.tables.itemPriceHistory.filter((h) => String(h.note).startsWith('Price book undo'));
    expect(undoRows.length).toBe(total);
    expect(new Set(undoRows.map((h) => h.itemId)).size).toBe(total);
    expect(s.db.tables.item.filter((r) => r.price === 4).length).toBe(total);
    expect((await getRun(s.ctx, runId)).status).toBe('UNDONE');
  });
});
