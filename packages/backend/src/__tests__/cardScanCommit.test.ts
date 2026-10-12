/**
 * Card scan commit bridge (ADR-138 section 2.2; acceptance AT-13 commit half and AT-14 to AT-16). The commit runs
 * the REAL planner (strict) and the REAL chunked commit against the in-memory intake database from the fakes, so
 * these tests prove the scan reaches stock through the same pipeline as a spreadsheet import. No database, no
 * network, no recognizer that costs money.
 */
import { createHash } from 'crypto';
import { ITEM_BYTES_PER_ROW } from '../services/cardIntake/config';
import { genericImporter } from '../services/cardIntake/importers/generic';
import { planRecords } from '../services/cardIntake/planner';
import type { PlannedRow } from '../services/cardIntake/types';
import { iterateRecords } from '../services/cardScan/entryRecords';
import { commitSession } from '../services/cardScan/commitBridge';
import type { CommitInput } from '../services/cardScan/commitBridge';
import { SCAN_API_MESSAGES } from '../services/cardScan/messages';
import { addManualEntry, createSession, getSession, ingestFrame, isScanFailure, patchEntry } from '../services/cardScan/sessionService';
import type { FrameRecognizer, ScanFailure, ScanResult } from '../services/cardScan/sessionService';
import {
  BOLTS,
  MOX,
  ORGANIZER_ID,
  OTHER_ORGANIZER_ID,
  OTHER_SALE_ID,
  READY_STATE,
  SALE_ID,
  makeCatalogResolver,
  makeScanHarness,
  observation,
} from './__fixtures__/cardScanFakes';

type Harness = ReturnType<typeof makeScanHarness>;

function must<T>(result: ScanResult<T>): T {
  if (result.ok === false) throw new Error(`Expected success, got ${result.status} ${result.code}`);
  return result.data;
}

function failureOf<T>(result: ScanResult<T>, status: number, code: string): ScanFailure {
  expect(isScanFailure(result)).toBe(true);
  if (result.ok === true) throw new Error('Expected a failure');
  expect({ status: result.status, code: result.code }).toEqual({ status, code });
  return result;
}

const itemsOf = (h: Harness): any[] => Array.from(h.db.state.items.values());
const batchesOf = (h: Harness): any[] => Array.from(h.db.state.batches.values());
const statusesOf = (h: Harness, sessionId: string): string[] => h.scan.entriesOf(sessionId).map((e: any) => e.status);

async function openSession(h: Harness, over: { label?: string; defaultConditionCode?: string } = {}): Promise<string> {
  return must(await createSession(h.deps, { organizerId: ORGANIZER_ID, saleId: SALE_ID, defaultConditionCode: 'NM', ...over })).session.id;
}

async function add(h: Harness, sessionId: string, clientEntryId: string, over: Record<string, unknown>) {
  const input = { organizerId: ORGANIZER_ID, sessionId, clientEntryId, ...over } as unknown as Parameters<typeof addManualEntry>[1];
  return must(await addManualEntry(h.deps, input)).entry;
}

const commit = (h: Harness, sessionId: string, mode: string | undefined, extra: Partial<CommitInput> = {}) =>
  commitSession(h.deps, { organizerId: ORGANIZER_ID, sessionId, mode, ...extra });

/** Five entries: a Bolt, two more of the same Bolt, a foil Bolt, a typed Pikachu and a graded Mox. */
async function fiveEntries(h: Harness, label = 'Binder one') {
  const sid = await openSession(h, { label });
  const a = await add(h, sid, 'a', { printingId: BOLTS[0].id, quantity: 1, price: 2.5 });
  const b = await add(h, sid, 'b', { printingId: BOLTS[0].id, quantity: 2 });
  const c = await add(h, sid, 'c', { printingId: BOLTS[1].id, finish: 'FOIL' });
  const d = await add(h, sid, 'd', { game: 'POKEMON', cardName: 'Pikachu', setCode: 'base1', collectorNumber: '58', finish: 'HOLO', conditionCode: 'LP', price: 12 });
  const e = await add(h, sid, 'e', { printingId: MOX.id, grader: 'PSA', grade: '9', certNumber: '123456789' });
  return { sid, a, b, c, d, e };
}

/** The dedupKey the spreadsheet path computes for one Lightning Bolt (lea 161, near mint). */
async function csvBoltDedupKey(): Promise<string> {
  const rows: PlannedRow[] = [];
  await planRecords(
    iterateRecords([{ row: 1, tooLong: false, record: { Name: 'Lightning Bolt', 'Set code': 'lea', 'Collector number': '161', Quantity: '1', Condition: 'NM' } }]),
    {
      importer: genericImporter,
      mapping: { name: 'Name', setCode: 'Set code', collectorNumber: 'Collector number', quantity: 'Quantity', condition: 'Condition' },
      defaultGame: 'MTG',
      priceSource: 'NONE',
      defaultCondition: null,
      conditionChoices: new Map(),
      strict: true,
      decisions: new Map(),
      organizerId: ORGANIZER_ID,
      catalog: READY_STATE,
      maxRows: 20000,
    },
    { resolve: makeCatalogResolver().resolve },
    (r) => {
      rows.push(r);
    }
  );
  return rows[0].dedupKey as string;
}

/** Many typed, ready entries (one more than a chunk of 100 rows), inserted directly. */
function bulkEntries(h: Harness, sessionId: string, count: number): void {
  for (let i = 1; i <= count; i += 1) {
    h.scan.seedEntry({ sessionId, seq: i, status: 'READY', acceptAsTyped: true, game: 'MTG', cardName: `Synthetic Card ${i}`, conditionCode: 'NM' });
  }
}

describe('AT-14: entries reach stock through the shared pipeline', () => {
  it('creates and merges items, sums duplicates, matches the spreadsheet dedupKey and records the ledger batch', async () => {
    const h = makeScanHarness();
    const { sid } = await fiveEntries(h);
    const key = await csvBoltDedupKey();
    h.db.addItem({ id: 'foreign', saleId: OTHER_SALE_ID, organizerId: OTHER_ORGANIZER_ID, card: { dedupKey: key }, stockTotal: 9 });

    const data = must(await commit(h, sid, 'ADD'));
    expect(data).toMatchObject({ status: 'COMPLETED', resumed: false, notCommitted: [], failed: [] });
    expect(data.summary).toEqual({ created: 4, merged: 1, skipped: 0, errors: 0, needsPrice: 2 });

    const mine = itemsOf(h).filter((i) => i.saleId === SALE_ID);
    expect(mine).toHaveLength(4);
    expect(mine.every((i) => i.organizerId === ORGANIZER_ID && i.status === 'AVAILABLE')).toBe(true);
    const bolt = mine.find((i) => i.card.catalogPrintingId === BOLTS[0].id);
    expect(bolt).toMatchObject({ stockTotal: 3, price: 2.5 });
    expect(bolt.card).toMatchObject({ cardName: 'Lightning Bolt', conditionCode: 'NM', game: 'MTG' });
    expect(bolt.card.dedupKey).toBe(key);
    expect(mine.find((i) => i.card.catalogPrintingId === BOLTS[1].id).card).toMatchObject({ finish: 'FOIL', conditionCode: 'NM' });
    const pikachu = mine.find((i) => i.card.cardName === 'Pikachu');
    expect(pikachu).toMatchObject({ price: 12, stockTotal: 1 });
    expect(pikachu.card).toMatchObject({ game: 'POKEMON', catalogPrintingId: null, finish: 'HOLO', conditionCode: 'LP', setCode: 'base1' });
    expect(mine.find((i) => i.card.catalogPrintingId === MOX.id).card).toMatchObject({ grader: 'PSA', grade: '9', certNumber: '123456789', conditionCode: null });
    // Another sale's stock is never touched.
    expect(h.db.state.items.get('foreign').stockTotal).toBe(9);

    const batches = batchesOf(h);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      id: data.batchId,
      organizerId: ORGANIZER_ID,
      saleId: SALE_ID,
      mode: 'ADD',
      status: 'COMPLETED',
      fileName: 'Scan: Binder one',
      rowsTotal: 5,
      createdCount: 4,
      mergedCount: 1,
    });
    expect(batches[0].fileSha256).toMatch(/^[0-9a-f]{64}$/);

    expect(statusesOf(h, sid)).toEqual(['COMMITTED', 'COMMITTED', 'COMMITTED', 'COMMITTED', 'COMMITTED']);
    expect(h.scan.entriesOf(sid).every((e: any) => e.committedBatchId === data.batchId)).toBe(true);
    const session = h.scan.sessions.get(sid);
    expect(session).toMatchObject({ status: 'CLOSED', commitMode: null, commitManifestSha256: null });
  });

  it('names the batch from the label and falls back to a plain name', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    await add(h, sid, 'a', { printingId: BOLTS[0].id });
    must(await commit(h, sid, 'ADD'));
    expect(batchesOf(h)[0].fileName).toBe('Scan: cards');
  });

  it('ADD adds to an existing item and REPLACE sets the count but never below what has sold', async () => {
    const h = makeScanHarness();
    const one = async (quantity: number, mode: string) => {
      const sid = await openSession(h);
      await add(h, sid, `q${quantity}${mode}`, { printingId: BOLTS[0].id, quantity });
      return must(await commit(h, sid, mode));
    };
    const first = await one(3, 'ADD');
    expect(first.summary).toMatchObject({ created: 1, merged: 0 });
    const second = await one(2, 'ADD');
    expect(second.summary).toMatchObject({ created: 0, merged: 1 });
    expect(itemsOf(h)).toHaveLength(1);
    expect(itemsOf(h)[0].stockTotal).toBe(5);

    itemsOf(h)[0].stockSold = 2;
    await one(1, 'REPLACE');
    expect(itemsOf(h)).toHaveLength(1);
    expect(itemsOf(h)[0].stockTotal).toBe(2);
    await one(8, 'replace');
    expect(itemsOf(h)[0].stockTotal).toBe(8);
    expect(batchesOf(h).map((b) => b.mode)).toEqual(['ADD', 'ADD', 'REPLACE', 'REPLACE']);
  });

  it('requires the organizer to choose the mode', async () => {
    const h = makeScanHarness();
    const { sid } = await fiveEntries(h);
    failureOf(await commit(h, sid, undefined), 400, 'MODE_REQUIRED');
    failureOf(await commit(h, sid, 'MERGE'), 400, 'MODE_REQUIRED');
    expect(itemsOf(h)).toHaveLength(0);
    expect(batchesOf(h)).toHaveLength(0);
    expect(statusesOf(h, sid)).toEqual(['READY', 'READY', 'READY', 'READY', 'READY']);
  });
});

describe('AT-15: commit twice, interrupted commits, edits while committing', () => {
  it('a second commit of the same selection is ALREADY_APPLIED with the summary and writes nothing', async () => {
    const h = makeScanHarness();
    const { sid } = await fiveEntries(h);
    must(await commit(h, sid, 'ADD'));
    const writes = h.db.state.itemCreates + h.db.state.itemUpdates;

    const again = failureOf(await commit(h, sid, 'ADD', { force: true }), 409, 'ALREADY_APPLIED');
    expect(again.message).toBe(SCAN_API_MESSAGES.ALREADY_APPLIED);
    expect((again.extra?.summary as { created: number }).created).toBe(4);
    expect(h.db.state.itemCreates + h.db.state.itemUpdates).toBe(writes);
    expect(itemsOf(h)).toHaveLength(4);
    expect(batchesOf(h)).toHaveLength(1);
  });

  it('a commit that fails after the first chunk is resumed by calling commit again, with no duplicate items', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    bulkEntries(h, sid, 150);
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      h.db.state.failTransactionNumber = 2;
      const failed = failureOf(await commit(h, sid, 'ADD'), 500, 'SERVER_ERROR');
      expect(failed.message).toBe(SCAN_API_MESSAGES.SERVER_ERROR);
    } finally {
      quiet.mockRestore();
    }
    expect(itemsOf(h)).toHaveLength(100);
    expect(batchesOf(h)[0]).toMatchObject({ status: 'FAILED', committedThroughRow: 100 });
    expect(h.scan.sessions.get(sid)).toMatchObject({ status: 'COMMITTING', commitMode: 'ADD' });
    expect(statusesOf(h, sid).every((s) => s === 'COMMITTING')).toBe(true);
    // The other mode cannot be used to finish it.
    failureOf(await commit(h, sid, 'REPLACE'), 409, 'MODE_MISMATCH');

    const done = must(await commit(h, sid, 'ADD'));
    expect(done).toMatchObject({ status: 'COMPLETED', resumed: true });
    expect(itemsOf(h)).toHaveLength(150);
    expect(new Set(itemsOf(h).map((i) => i.card.cardName)).size).toBe(150);
    expect(batchesOf(h)).toHaveLength(1);
    expect(batchesOf(h)[0]).toMatchObject({ status: 'COMPLETED', createdCount: 150 });
    expect(statusesOf(h, sid).every((s) => s === 'COMMITTED')).toBe(true);
    expect(h.scan.sessions.get(sid)).toMatchObject({ status: 'CLOSED', commitMode: null });
  });

  it('a caller that goes away part way leaves the commit resumable', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    bulkEntries(h, sid, 150);
    const stopped = must(await commit(h, sid, 'ADD', { shouldCancel: () => true }));
    expect(stopped.status).toBe('CANCELLED');
    expect(itemsOf(h)).toHaveLength(100);
    expect(statusesOf(h, sid).every((s) => s === 'COMMITTING')).toBe(true);

    const finished = must(await commit(h, sid, 'ADD'));
    expect(finished).toMatchObject({ status: 'COMPLETED', resumed: true });
    expect(itemsOf(h)).toHaveLength(150);
    expect(statusesOf(h, sid).every((s) => s === 'COMMITTED')).toBe(true);
  });

  it('finishes the entries of a ledger batch that was already complete without writing again', async () => {
    const h = makeScanHarness();
    const { sid } = await fiveEntries(h);
    const first = must(await commit(h, sid, 'ADD'));
    // Simulate a crash after the ledger finished but before the entries were marked.
    for (const row of h.scan.entries.values()) {
      row.status = 'COMMITTING';
      row.committedBatchId = null;
    }
    Object.assign(h.scan.sessions.get(sid), { status: 'COMMITTING', commitMode: 'ADD' });
    const writes = h.db.state.itemCreates + h.db.state.itemUpdates;

    const finished = must(await commit(h, sid, 'ADD'));
    expect(finished).toMatchObject({ batchId: first.batchId, status: 'COMPLETED', resumed: false });
    expect(finished.summary).toMatchObject({ created: 4, merged: 1 });
    expect(h.db.state.itemCreates + h.db.state.itemUpdates).toBe(writes);
    expect(statusesOf(h, sid).every((s) => s === 'COMMITTED')).toBe(true);
    expect(h.scan.sessions.get(sid)).toMatchObject({ status: 'CLOSED' });
  });

  it('refuses edits and new cards while the commit is running (409), then allows them again', async () => {
    const h = makeScanHarness();
    const { sid, a } = await fiveEntries(h);
    const seen: Array<ScanResult<unknown>> = [];
    const data = must(
      await commit(h, sid, 'ADD', {
        emit: async () => {
          seen.push(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: a.id, patch: { quantity: 99 } }));
          seen.push(await addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: 'late', printingId: MOX.id }));
        },
      })
    );
    expect(data.status).toBe('COMPLETED');
    expect(seen.length).toBeGreaterThan(0);
    for (const result of seen) failureOf(result, 409, 'SESSION_COMMITTING');
    expect(h.scan.entriesOf(sid)).toHaveLength(5);
    expect(h.scan.entriesOf(sid)[0].quantity).toBe(1);
    // A committed entry stays untouchable.
    failureOf(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: a.id, patch: { quantity: 5 } }), 409, 'SESSION_NOT_OPEN');
  });

  it('writes what is frozen: a decision that lands while the commit starts is included, not lost', async () => {
    const h = makeScanHarness();
    const { sid, a, d } = await fiveEntries(h);
    const originalUpdateMany = h.db.cardScanSession.updateMany;
    let fired = false;
    h.db.cardScanSession.updateMany = async (args: any) => {
      if (!fired && args?.data?.status === 'COMMITTING') {
        fired = true;
        h.scan.entries.get(a.id).quantity = 7; // a quantity edit that slipped in
        h.scan.entries.get(d.id).acceptAsTyped = false; // and a typed card that is no longer accepted
      }
      return originalUpdateMany(args);
    };
    const data = must(await commit(h, sid, 'ADD'));
    expect(fired).toBe(true);
    expect(data.notCommitted).toEqual([{ entryId: d.id, reason: 'PRINTING' }]);
    const bolt = itemsOf(h).find((i) => i.card.catalogPrintingId === BOLTS[0].id);
    expect(bolt.stockTotal).toBe(9); // 7 + 2
    expect(itemsOf(h).some((i) => i.card.cardName === 'Pikachu')).toBe(false);
    // The dropped entry went back to review instead of staying frozen.
    expect(h.scan.entries.get(d.id).status).toBe('NEEDS_REVIEW');
    expect(h.scan.sessions.get(sid)).toMatchObject({ status: 'OPEN' });
  });
});

describe('AT-16: only ready entries are committed', () => {
  it('commits READY entries, reports the rest with a reason, and never creates a card without a condition', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h, { defaultConditionCode: undefined });
    const seed = (seq: number, over: Record<string, unknown>) => h.scan.seedEntry({ sessionId: sid, seq, ...over });
    const ready = seed(1, { printingId: BOLTS[0].id, conditionCode: 'NM', status: 'READY', resolution: 'EXACT' });
    const needsCondition = seed(2, { printingId: MOX.id, status: 'NEEDS_REVIEW', resolution: 'EXACT' });
    const staleStatus = seed(3, { printingId: BOLTS[0].id, status: 'READY', resolution: 'EXACT' });
    const missingPrinting = seed(4, { printingId: 'SCRYFALL:gone', conditionCode: 'NM' });
    const unidentified = seed(5, { conditionCode: 'NM' });
    const unnamed = seed(6, { acceptAsTyped: true, conditionCode: 'NM' });
    const held = seed(7, { printingId: MOX.id, conditionCode: 'NM', suspectDuplicateOf: ready.id });
    const skipped = seed(8, { printingId: MOX.id, conditionCode: 'NM', status: 'SKIPPED' });
    const needsFinish = seed(9, { printingId: BOLTS[1].id, conditionCode: 'NM' });

    const data = must(await commit(h, sid, 'ADD'));
    expect(data.summary).toMatchObject({ created: 1, errors: 0 });
    expect(data.notCommitted).toEqual([
      { entryId: needsCondition.id, reason: 'CONDITION' },
      { entryId: staleStatus.id, reason: 'CONDITION' },
      { entryId: missingPrinting.id, reason: 'PRINTING_NOT_FOUND' },
      { entryId: unidentified.id, reason: 'PRINTING' },
      { entryId: unnamed.id, reason: 'NAME' },
      { entryId: held.id, reason: 'SUSPECT_REPEAT' },
      { entryId: needsFinish.id, reason: 'FINISH' },
    ]);
    expect(itemsOf(h)).toHaveLength(1);
    expect(itemsOf(h)[0].card).toMatchObject({ catalogPrintingId: BOLTS[0].id, conditionCode: 'NM' });
    expect(statusesOf(h, sid)).toEqual(['COMMITTED', 'NEEDS_REVIEW', 'READY', 'NEEDS_REVIEW', 'NEEDS_REVIEW', 'NEEDS_REVIEW', 'NEEDS_REVIEW', 'SKIPPED', 'NEEDS_REVIEW']);
    // Entries remain, so the session goes back to open for the rest.
    expect(h.scan.sessions.get(sid)).toMatchObject({ status: 'OPEN', commitMode: null });
    expect(skipped.id).toBeDefined();
  });

  it('answers NOTHING_READY when nothing can be added, and changes nothing', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h, { defaultConditionCode: undefined });
    const only = await add(h, sid, 'a', { printingId: BOLTS[0].id });
    const refused = failureOf(await commit(h, sid, 'ADD'), 409, 'NOTHING_READY');
    expect(refused.extra?.notCommitted).toEqual([{ entryId: only.id, reason: 'CONDITION' }]);
    failureOf(await commit(h, await openSession(h), 'ADD'), 409, 'NOTHING_READY');
    expect(statusesOf(h, sid)).toEqual(['NEEDS_REVIEW']);
    expect(h.scan.sessions.get(sid)).toMatchObject({ status: 'OPEN' });
    expect(batchesOf(h)).toHaveLength(0);
    expect(itemsOf(h)).toHaveLength(0);
  });

  it('a session default condition is what makes a card ready, and it is applied only because the organizer chose it', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    await add(h, sid, 'a', { printingId: BOLTS[0].id });
    must(await commit(h, sid, 'ADD'));
    expect(itemsOf(h)[0].card.conditionCode).toBe('NM');
  });

  it('marks a row the planner rejects as ERROR, commits the others, and lets the organizer fix and retry it', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const good = await add(h, sid, 'a', { printingId: BOLTS[0].id });
    const bad = h.scan.seedEntry({ sessionId: sid, seq: 2, status: 'READY', printingId: MOX.id, resolution: 'EXACT', conditionCode: 'NM', price: 20_000_000 });

    const data = must(await commit(h, sid, 'ADD'));
    expect(data.summary).toMatchObject({ created: 1, errors: 1 });
    expect(data.failed).toEqual([{ entryId: bad.id, code: 'BAD_PRICE', message: expect.any(String) }]);
    expect(h.scan.entries.get(good.id).status).toBe('COMMITTED');
    expect(h.scan.entries.get(bad.id)).toMatchObject({ status: 'ERROR', errorCode: 'BAD_PRICE', committedBatchId: null });
    expect(h.scan.sessions.get(sid)).toMatchObject({ status: 'OPEN' });
    expect(itemsOf(h)).toHaveLength(1);

    const fixed = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: bad.id, patch: { price: 5 } })).entry;
    expect(fixed).toMatchObject({ status: 'READY', errorCode: null });
    const retry = must(await commit(h, sid, 'ADD'));
    expect(retry.summary).toMatchObject({ created: 1, errors: 0 });
    expect(itemsOf(h)).toHaveLength(2);
    expect(h.scan.sessions.get(sid)).toMatchObject({ status: 'CLOSED' });
  });
});

describe('AT-13 (commit half): a held repeat is not summed until the organizer counts it', () => {
  it('commits one copy, reports the held repeat, and adds the second copy after countAsAnother', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    let n = 0;
    const scan: FrameRecognizer = async () => ({ ok: true, observation: observation({ cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' }), charged: true });
    const frame = () => {
      n += 1;
      return ingestFrame(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: `c${n}`, imageSha256: createHash('sha256').update(`img${n}`).digest('hex') }, scan);
    };
    const first = must(await frame()).entry;
    h.clock.ms += 1000;
    const repeat = must(await frame());
    expect(repeat.duplicate).toBe('SUSPECT_REPEAT');
    expect(first.status).toBe('READY');

    const one = must(await commit(h, sid, 'ADD'));
    expect(one.summary).toMatchObject({ created: 1 });
    expect(one.notCommitted).toEqual([{ entryId: repeat.entry.id, reason: 'SUSPECT_REPEAT' }]);
    expect(itemsOf(h)).toHaveLength(1);
    expect(itemsOf(h)[0].stockTotal).toBe(1);

    must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: repeat.entry.id, patch: { countAsAnother: true } }));
    const two = must(await commit(h, sid, 'ADD'));
    expect(two.summary).toMatchObject({ created: 0, merged: 1 });
    expect(itemsOf(h)).toHaveLength(1);
    expect(itemsOf(h)[0].stockTotal).toBe(2);
    expect(batchesOf(h)).toHaveLength(2);
  });
});

describe('guards', () => {
  it('hides another organizer\'s session and refuses a discarded one', async () => {
    const h = makeScanHarness();
    const { sid } = await fiveEntries(h);
    failureOf(await commitSession(h.deps, { organizerId: OTHER_ORGANIZER_ID, sessionId: sid, mode: 'ADD' }), 404, 'SESSION_NOT_FOUND');
    failureOf(await commit(h, 'missing', 'ADD'), 404, 'SESSION_NOT_FOUND');
    h.scan.sessions.get(sid).status = 'DISCARDED';
    failureOf(await commit(h, sid, 'ADD'), 409, 'SESSION_NOT_OPEN');
    expect(itemsOf(h)).toHaveLength(0);
    expect(batchesOf(h)).toHaveLength(0);
  });

  it('refuses when the session\'s sale is no longer the caller\'s, before freezing anything', async () => {
    const h = makeScanHarness();
    const { sid } = await fiveEntries(h);
    h.scan.sessions.get(sid).saleId = OTHER_SALE_ID;
    failureOf(await commit(h, sid, 'ADD'), 404, 'SALE_NOT_FOUND');
    expect(statusesOf(h, sid)).toEqual(['READY', 'READY', 'READY', 'READY', 'READY']);
    expect(itemsOf(h)).toHaveLength(0);
  });

  it('stops before freezing when the database is nearly full, using the intake\'s space arithmetic', async () => {
    const limitMb = 100;
    const exactlyFits = limitMb * 1024 * 1024 - ITEM_BYTES_PER_ROW;
    const full = makeScanHarness({ env: { DB_SOFT_LIMIT_MB: String(limitMb) }, dbSizeBytes: exactlyFits + 1 });
    const sid = await openSession(full);
    await add(full, sid, 'a', { printingId: BOLTS[0].id });
    failureOf(await commit(full, sid, 'ADD'), 409, 'DB_SPACE_LOW');
    expect(statusesOf(full, sid)).toEqual(['READY']);
    expect(full.scan.sessions.get(sid)).toMatchObject({ status: 'OPEN' });
    expect(batchesOf(full)).toHaveLength(0);

    const fits = makeScanHarness({ env: { DB_SOFT_LIMIT_MB: String(limitMb) }, dbSizeBytes: exactlyFits });
    const sid2 = await openSession(fits);
    await add(fits, sid2, 'a', { printingId: BOLTS[0].id });
    expect(must(await commit(fits, sid2, 'ADD')).summary.created).toBe(1);

    const unmeasured = makeScanHarness({ env: { DB_SOFT_LIMIT_MB: '1' }, dbSizeBytes: null });
    const sid3 = await openSession(unmeasured);
    await add(unmeasured, sid3, 'a', { printingId: BOLTS[0].id });
    expect(must(await commit(unmeasured, sid3, 'ADD')).summary.created).toBe(1);
  });

  it('shows committed and error counts in the queue after a commit', async () => {
    const h = makeScanHarness();
    const { sid } = await fiveEntries(h);
    must(await commit(h, sid, 'ADD'));
    const view = must(await getSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid }));
    expect(view.counts).toMatchObject({ committed: 5, needsReview: 0, ready: 0, error: 0 });
    expect(view.session.status).toBe('CLOSED');
  });
});
