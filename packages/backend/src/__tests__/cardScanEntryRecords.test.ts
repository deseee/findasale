/**
 * Scan entries to planner records, the printing resolver and the manifest hash (ADR-138 sections 2.2 and 3.2).
 * The planner itself is the real one (planRecords); the catalog is the in-memory one from cardScanFakes.
 */
import { createHash } from 'crypto';
import { CARD_FINISHES } from '../constants/cardVocabulary';
import { groupRows } from '../services/cardIntake/mergeEngine';
import { parseFinishCell } from '../services/cardIntake/normalizeCells';
import { genericImporter } from '../services/cardIntake/importers/generic';
import { planRecords } from '../services/cardIntake/planner';
import type { PlanOptions } from '../services/cardIntake/planner';
import type { PlannedRow } from '../services/cardIntake/types';
import {
  SCAN_COLUMN_MAPPING,
  SCAN_HEADERS,
  buildPrintingResolver,
  buildStreamedRecords,
  computeManifestHash,
  entryToSourceRecord,
  iterateRecords,
  scanGroupKey,
  selectReadyEntries,
  typedKey,
} from '../services/cardScan/entryRecords';
import type { CommitEntry } from '../services/cardScan/entryRecords';
import type { ScanEntryRow, ScanSessionDefaults } from '../services/cardScan/types';
import { BOLTS, MOX, ORGANIZER_ID, READY_STATE, SESSION_ID, makeCatalogResolver, printingMap, scanEntry } from './__fixtures__/cardScanFakes';

const NO_DEFAULTS: ScanSessionDefaults = { defaultConditionCode: null, defaultFinish: null };

const A = scanEntry({ id: 'a', seq: 1, printingId: BOLTS[0].id, conditionCode: 'NM', quantity: 1, price: 2.5 });
const B = scanEntry({ id: 'b', seq: 2, printingId: BOLTS[0].id, conditionCode: 'NM', quantity: 2 });
const C = scanEntry({ id: 'c', seq: 3, printingId: BOLTS[1].id, conditionCode: 'LP', finish: 'FOIL' });
const D = scanEntry({
  id: 'd',
  seq: 4,
  game: 'POKEMON',
  acceptAsTyped: true,
  cardName: 'Pikachu',
  setCode: 'base1',
  setName: 'Base Set',
  collectorNumber: '58',
  language: 'en',
  finish: 'HOLO',
  conditionCode: 'LP',
  price: 12,
});
const E = scanEntry({ id: 'e', seq: 5, printingId: MOX.id, grader: 'PSA', grade: '9', certNumber: '123456789' });

function select(entries: ScanEntryRow[], defaults: ScanSessionDefaults = NO_DEFAULTS): CommitEntry[] {
  const sel = selectReadyEntries(entries, defaults, printingMap());
  expect(sel.notCommitted).toEqual([]);
  return sel.ready;
}

function planOptions(): PlanOptions {
  return {
    importer: genericImporter,
    mapping: SCAN_COLUMN_MAPPING,
    defaultGame: 'MTG',
    priceSource: 'FILE',
    defaultCondition: null,
    conditionChoices: new Map(),
    strict: true,
    decisions: new Map(),
    organizerId: ORGANIZER_ID,
    catalog: READY_STATE,
    maxRows: 20000,
  };
}

async function plan(items: CommitEntry[]): Promise<PlannedRow[]> {
  const rows: PlannedRow[] = [];
  await planRecords(iterateRecords(buildStreamedRecords(items)), planOptions(), { resolve: buildPrintingResolver(items) }, (r) => {
    rows.push(r);
  });
  return rows;
}

describe('selectReadyEntries', () => {
  it('keeps entries in seq order and reports what is not ready, with a reason', () => {
    const needsFinish = scanEntry({ id: 'nf', seq: 6, printingId: BOLTS[1].id, conditionCode: 'NM' });
    const needsCondition = scanEntry({ id: 'nc', seq: 7, printingId: MOX.id });
    const unidentified = scanEntry({ id: 'un', seq: 8, conditionCode: 'NM' });
    const noName = scanEntry({ id: 'nn', seq: 9, acceptAsTyped: true, conditionCode: 'NM' });
    const held = scanEntry({ id: 'h', seq: 10, printingId: MOX.id, conditionCode: 'NM', suspectDuplicateOf: 'a' });
    const missing = scanEntry({ id: 'm', seq: 11, printingId: 'SCRYFALL:gone', conditionCode: 'NM' });
    const badQty = scanEntry({ id: 'bq', seq: 12, printingId: MOX.id, conditionCode: 'NM', quantity: 0 });
    const sel = selectReadyEntries([E, needsFinish, D, needsCondition, A, unidentified, noName, held, missing, badQty], NO_DEFAULTS, printingMap());
    expect(sel.ready.map((r) => r.entry.id)).toEqual(['a', 'd', 'e']);
    expect(sel.notCommitted).toEqual([
      { entryId: 'nf', reason: 'FINISH' },
      { entryId: 'nc', reason: 'CONDITION' },
      { entryId: 'un', reason: 'PRINTING' },
      { entryId: 'nn', reason: 'NAME' },
      { entryId: 'h', reason: 'SUSPECT_REPEAT' },
      { entryId: 'm', reason: 'PRINTING_NOT_FOUND' },
      { entryId: 'bq', reason: 'INVALID_DETAILS' },
    ]);
  });

  it('leaves skipped and already committed entries out without a report', () => {
    const sel = selectReadyEntries([{ ...A, status: 'SKIPPED' }, { ...B, status: 'COMMITTED' }, C], NO_DEFAULTS, printingMap());
    expect(sel.ready.map((r) => r.entry.id)).toEqual(['c']);
    expect(sel.notCommitted).toEqual([]);
  });

  it('does not trust a stored READY status: an incomplete card is never selected', () => {
    const stale = scanEntry({ id: 's', seq: 1, printingId: MOX.id, status: 'READY' });
    const sel = selectReadyEntries([stale], NO_DEFAULTS, printingMap());
    expect(sel.ready).toEqual([]);
    expect(sel.notCommitted).toEqual([{ entryId: 's', reason: 'CONDITION' }]);
  });

  it('still selects entries already marked COMMITTING so an interrupted commit can resume', () => {
    const sel = selectReadyEntries([{ ...A, status: 'COMMITTING' }], NO_DEFAULTS, printingMap());
    expect(sel.ready.map((r) => r.entry.id)).toEqual(['a']);
  });

  it('applies the session defaults the organizer chose', () => {
    const bare = scanEntry({ id: 'x', seq: 1, printingId: BOLTS[1].id });
    const sel = selectReadyEntries([bare], { defaultConditionCode: 'NM', defaultFinish: 'NONFOIL' }, printingMap());
    expect(sel.ready).toHaveLength(1);
    expect(sel.ready[0].effective).toMatchObject({ conditionCode: 'NM', finish: 'NONFOIL' });
  });
});

describe('entryToSourceRecord', () => {
  const H = SCAN_HEADERS;

  it('uses the chosen printing details, the organizer values and the generic importer header names', () => {
    const [a] = select([A]);
    expect(entryToSourceRecord(a)).toEqual({
      [H.name]: 'Lightning Bolt',
      [H.setCode]: 'lea',
      [H.setName]: 'Limited Edition Alpha',
      [H.collectorNumber]: '161',
      [H.quantity]: '1',
      [H.finish]: '',
      [H.condition]: 'NM',
      [H.language]: '',
      [H.price]: '2.50',
      [H.game]: 'MTG',
      [H.grader]: '',
      [H.grade]: '',
      [H.certNumber]: '',
    });
  });

  it('writes typed details when no printing is chosen', () => {
    const [d] = select([D]);
    expect(entryToSourceRecord(d)).toMatchObject({
      [H.name]: 'Pikachu',
      [H.setCode]: 'base1',
      [H.setName]: 'Base Set',
      [H.collectorNumber]: '58',
      [H.language]: 'en',
      [H.finish]: 'holo',
      [H.condition]: 'LP',
      [H.price]: '12.00',
      [H.game]: 'POKEMON',
    });
  });

  it('writes grading and leaves the condition blank for a graded card', () => {
    const [e] = select([E]);
    expect(entryToSourceRecord(e)).toMatchObject({ [H.condition]: '', [H.grader]: 'PSA', [H.grade]: '9', [H.certNumber]: '123456789' });
  });

  it('writes a finish word the planner parses back to the same vocabulary code', () => {
    for (const finish of CARD_FINISHES) {
      const [item] = select([scanEntry({ id: 'f', seq: 1, game: 'POKEMON', acceptAsTyped: true, cardName: 'Test Card', conditionCode: 'NM', finish })]);
      const cell = entryToSourceRecord(item)[SCAN_HEADERS.finish];
      expect(parseFinishCell(cell, false)).toEqual({ kind: 'value', finish });
    }
  });

  it('never writes a suggestion as the condition', () => {
    const entry = scanEntry({ id: 'sg', seq: 1, printingId: MOX.id, suggestedConditionCode: 'NM', conditionCode: 'HP' });
    const [item] = select([entry]);
    expect(entryToSourceRecord(item)[SCAN_HEADERS.condition]).toBe('HP');
  });

  it('builds planner records numbered by seq, in order', () => {
    const records = buildStreamedRecords(select([C, A, B]));
    expect(records.map((r) => r.row)).toEqual([1, 2, 3]);
    expect(records.every((r) => r.tooLong === false)).toBe(true);
  });

  it('iterates records in memory', async () => {
    const records = buildStreamedRecords(select([A, B]));
    const seen: number[] = [];
    for await (const r of iterateRecords(records)) seen.push(r.row);
    expect(seen).toEqual([1, 2]);
  });
});

describe('buildPrintingResolver', () => {
  it('answers EXACT with the chosen printing for a row that has one and UNMATCHED for every other row', async () => {
    const items = select([A, D]);
    const resolve = buildPrintingResolver(items);
    const out = await resolve([
      { ref: '1', game: 'MTG', name: 'ignored' },
      { ref: '4', game: 'MTG', name: 'Pikachu' },
      { ref: '99', game: 'MTG' },
    ]);
    expect(out[0]).toMatchObject({ ref: '1', status: 'EXACT', truncated: false });
    expect(out[0].candidates.map((c) => c.id)).toEqual([BOLTS[0].id]);
    expect(out[1]).toEqual({ ref: '4', status: 'UNMATCHED', candidates: [], truncated: false });
    expect(out[2].status).toBe('UNMATCHED');
  });
});

describe('records through the real planner (planRecords, strict)', () => {
  it('plans every ready entry without errors and with the single card writer', async () => {
    const rows = await plan(select([A, B, C, D, E]));
    expect(rows.map((r) => r.row)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((r) => r.status)).toEqual(['OK', 'OK', 'OK', 'OK', 'OK']);

    const [a, , c, d, e] = rows;
    expect(a.card).toMatchObject({ catalogPrintingId: BOLTS[0].id, cardName: 'Lightning Bolt', conditionCode: 'NM', finish: 'NONFOIL', game: 'MTG' });
    expect(a.price).toBe(2.5);
    expect(c.card).toMatchObject({ catalogPrintingId: BOLTS[1].id, finish: 'FOIL', conditionCode: 'LP' });
    expect(d.noCatalogMatch).toBe(true);
    expect(d.card).toMatchObject({ catalogPrintingId: null, game: 'POKEMON', cardName: 'Pikachu', finish: 'HOLO', conditionCode: 'LP', setCode: 'base1' });
    expect(e.card).toMatchObject({ catalogPrintingId: MOX.id, grader: 'PSA', grade: '9', certNumber: '123456789', conditionCode: null });
  });

  it('gives two entries of one card the same dedupKey and sums them like duplicate spreadsheet rows', async () => {
    const rows = await plan(select([A, B]));
    expect(rows[0].dedupKey).toBeDefined();
    expect(rows[0].dedupKey).toBe(rows[1].dedupKey);
    const groups = Array.from(groupRows(rows).values());
    expect(groups).toHaveLength(1);
    expect(groups[0].quantity).toBe(3);
    expect(groups[0].price).toBe(2.5);
  });

  it('gives a scanned card the same dedupKey as the spreadsheet path for the same card', async () => {
    const scanned = (await plan(select([A])))[0];
    const fake = makeCatalogResolver();
    const csvRows: PlannedRow[] = [];
    const csvRecords = [{ row: 1, tooLong: false, record: { Name: 'Lightning Bolt', 'Set code': 'lea', 'Collector number': '161', Quantity: '1', Condition: 'NM' } }];
    await planRecords(
      iterateRecords(csvRecords),
      { ...planOptions(), mapping: { name: 'Name', setCode: 'Set code', collectorNumber: 'Collector number', quantity: 'Quantity', condition: 'Condition' }, priceSource: 'NONE' },
      { resolve: fake.resolve },
      (r) => {
        csvRows.push(r);
      }
    );
    expect(csvRows[0].status).toBe('OK');
    expect(csvRows[0].dedupKey).toBe(scanned.dedupKey);
  });

  it('matches scanGroupKey, the key the queue groups by, for every kind of entry', async () => {
    const entries = [A, B, C, D, E];
    const items = select(entries);
    const rows = await plan(items);
    items.forEach((item, i) => {
      const printing = item.printing;
      expect(scanGroupKey(item.entry, printing, NO_DEFAULTS)).toBe(rows[i].dedupKey);
    });
  });

  it('matches scanGroupKey when a session default finish is applied', async () => {
    const defaults = { defaultConditionCode: 'NM', defaultFinish: 'NONFOIL' };
    const bare = scanEntry({ id: 'x', seq: 1, printingId: BOLTS[1].id });
    const items = select([bare], defaults);
    const rows = await plan(items);
    expect(rows[0].card).toMatchObject({ finish: 'NONFOIL', conditionCode: 'NM' });
    expect(scanGroupKey(bare, BOLTS[1], defaults)).toBe(rows[0].dedupKey);
  });

  it('scanGroupKey is null for an entry that cannot be identified yet', () => {
    expect(scanGroupKey(scanEntry({ conditionCode: 'NM' }), null, NO_DEFAULTS)).toBeNull();
  });
});

describe('computeManifestHash', () => {
  function expected(sessionId: string, mode: string, lines: string[]): string {
    return createHash('sha256').update(`card-scan-v1\n${sessionId}\n${mode}\n${lines.map((l) => `${l}\n`).join('')}`).digest('hex');
  }

  it('is the sha256 of the documented text', () => {
    const items = select([A, C, D, E]);
    const lines = [
      `a|1|${BOLTS[0].id}||NM|1|2.50`,
      `c|3|${BOLTS[1].id}|FOIL|LP|1|`,
      `d|4|${typedKey(D)}|HOLO|LP|1|12.00`,
      `e|5|${MOX.id}||G:PSA:9:123456789|1|`,
    ];
    expect(computeManifestHash(SESSION_ID, 'ADD', items)).toBe(expected(SESSION_ID, 'ADD', lines));
    expect(computeManifestHash(SESSION_ID, 'ADD', items)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds the typed key from game, set, number and name in lower case', () => {
    expect(typedKey(D)).toBe('t:pokemon|base1|58|pikachu');
  });

  it('is the same for the same selection in any input order and changes when anything written changes', () => {
    const base = computeManifestHash(SESSION_ID, 'ADD', select([A, B, C]));
    expect(computeManifestHash(SESSION_ID, 'ADD', select([A, B, C]).reverse())).toBe(base);

    const changed = (entries: ScanEntryRow[], defaults: ScanSessionDefaults = NO_DEFAULTS) => computeManifestHash(SESSION_ID, 'ADD', select(entries, defaults));
    expect(changed([A, { ...B, quantity: 3 }, C])).not.toBe(base);
    expect(changed([{ ...A, price: 3 }, B, C])).not.toBe(base);
    expect(changed([{ ...A, price: null }, B, C])).not.toBe(base);
    expect(changed([{ ...A, conditionCode: 'LP' }, B, C])).not.toBe(base);
    expect(changed([A, B, { ...C, finish: 'NONFOIL' }])).not.toBe(base);
    expect(changed([A, { ...B, printingId: BOLTS[1].id, finish: 'FOIL' }, C])).not.toBe(base);
    expect(changed([A, { ...B, id: 'b2' }, C])).not.toBe(base);
    expect(changed([A, B])).not.toBe(base);
  });

  it('changes with the mode and with the session', () => {
    const items = select([A, B]);
    const add = computeManifestHash(SESSION_ID, 'ADD', items);
    expect(computeManifestHash(SESSION_ID, 'REPLACE', items)).not.toBe(add);
    expect(computeManifestHash('other_session', 'ADD', items)).not.toBe(add);
  });

  it('changes when a session default changes what would be written', () => {
    const bare = scanEntry({ id: 'x', seq: 1, printingId: MOX.id });
    const nm = computeManifestHash(SESSION_ID, 'ADD', select([bare], { defaultConditionCode: 'NM', defaultFinish: null }));
    const lp = computeManifestHash(SESSION_ID, 'ADD', select([bare], { defaultConditionCode: 'LP', defaultFinish: null }));
    expect(nm).not.toBe(lp);
  });

  it('does not depend on fields the commit does not write', () => {
    const base = computeManifestHash(SESSION_ID, 'ADD', select([A]));
    const noisy = { ...A, suggestedConditionCode: 'HP', readName: 'Something', attempts: 2, updatedAt: new Date(5) };
    expect(computeManifestHash(SESSION_ID, 'ADD', select([noisy]))).toBe(base);
  });
});
