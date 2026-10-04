/**
 * cardIntake (ADR-134 batch B8): pure logic behind the card intake screens.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLANK_CHOICE,
  DEFAULT_OPTIONS,
  applyFinishToGroup,
  applySameSet,
  applySkipToGroup,
  buildConfirmFields,
  buildErrorsCsv,
  buildForm,
  buildPreviewFields,
  candidateFinishes,
  candidateTitle,
  canConfirm,
  checkChosenFile,
  chooseCandidate,
  chooseFinish,
  conditionKey,
  conditionMappingJson,
  confirmBlockers,
  decisionsJson,
  defaultPriceSource,
  earlierBatchFor,
  failureFromError,
  failureFromResponse,
  finishOptionsForRow,
  finishRequired,
  groupCounts,
  hiddenReviewCount,
  importableRowCount,
  noCatalogSampleIsPartial,
  noCatalogTotal,
  REVIEW_ROWS_SHOWN_CAP,
  initialConditionChoices,
  jsonObject,
  modeExampleText,
  needsColumnChooser,
  parseHeaderLine,
  parseSavedChoices,
  pendingConditionLines,
  pendingRowCount,
  readFormats,
  readPreview,
  restoreChoices,
  rowState,
  savedChoicesKey,
  serializeSavedChoices,
  setConditionChoice,
  setSkip,
  applyAllSuggestions,
  type Candidate,
  type ConditionLine,
  type DecisionMap,
  type PreviewData,
  type ReviewRow,
} from '../cardIntake';
import { INTAKE_COPY } from '../cardIntakeCopy';

const SHA = 'a'.repeat(64);

function cand(id: string, set: string, finishes: string[] = ['nonfoil'], extra: Partial<Candidate> = {}): Candidate {
  return { printingId: id, name: 'Lightning Bolt', setCode: set, setName: 'Set ' + set.toUpperCase(), collectorNumber: '141', finishes, releaseYear: 2019, imageSmallUrl: null, ...extra };
}
function reviewRow(row: number, reason: ReviewRow['reason'], candidates: Candidate[] = [], extra: Partial<ReviewRow> = {}): ReviewRow {
  return { row, reason, message: 'm', name: 'Card ' + row, setCode: null, collectorNumber: null, noCatalogMatch: reason === 'NO_CATALOG_MATCH', candidates, candidatesTruncated: false, ...extra };
}
function line(src: string, conf: 'EXACT' | 'REVIEW', proposed: string | null = null, rows = 3): ConditionLine {
  return { sourceValue: src, rowCount: rows, proposed, proposedLabel: proposed, confidence: conf };
}
function previewBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    success: true,
    data: {
      fileSha256: SHA,
      fileName: 'cards.csv',
      detectedFormat: 'manabox',
      formatLabel: 'ManaBox',
      headers: ['Name', 'Quantity'],
      columnMapping: { name: 'Name', quantity: 'Quantity' },
      columnsPresent: { quantity: true, price: false, condition: true, finish: false, language: false, sku: false },
      catalog: { catalogReady: true, readyGames: ['MTG'], dataAsOf: null },
      limits: { maxRows: 20000, maxFileMb: 50 },
      rowsTotal: 10,
      summary: { exact: 6, ambiguous: 2, unmatched: 1, errors: 1, skipped: 0, finishAmbiguous: 0, noCatalogMatch: 1, willCreate: 7, willMerge: 1, needsPrice: 8, review: { AMBIGUOUS_PRINTING: 2, NO_CATALOG_MATCH: 1, FINISH_AMBIGUOUS: 0 }, errorsByCode: { MISSING_NAME: 1 } },
      sample: [],
      conditionMapping: [
        { sourceValue: 'near_mint', rowCount: 5, proposed: 'NM', proposedLabel: 'Near Mint', confidence: 'EXACT' },
        { sourceValue: 'excellent', rowCount: 3, proposed: 'LP', proposedLabel: 'Lightly Played', confidence: 'REVIEW' },
      ],
      reviewRows: [],
      reviewTruncated: false,
      errorRows: [],
      firstMerge: null,
      existingBatches: { ADD: null, REPLACE: null },
      ...over,
    },
  };
}
function preview(over: Record<string, unknown> = {}): PreviewData {
  const p = readPreview(previewBody(over));
  assert.ok(p);
  return p as PreviewData;
}
const COLS = { finish: false };

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

test('readFormats reads importers, fields and limits, and rejects an empty body', () => {
  const f = readFormats({ success: true, data: { importers: [{ id: 'manabox', label: 'ManaBox', hint: 'ManaBox: export it.' }, { id: 'generic', label: 'Other', hint: 'Any other CSV.' }], fields: [{ value: 'name', label: 'Card name' }], limits: { maxRows: 20000, maxFileMb: 50 } } });
  assert.ok(f);
  assert.equal(f?.importers.length, 2);
  assert.equal(f?.importers[0].hint, 'ManaBox: export it.');
  assert.equal(f?.fields[0].label, 'Card name');
  assert.equal(f?.limits.maxFileMb, 50);
  assert.equal(readFormats({ success: true, data: { importers: [] } }), null);
  assert.equal(readFormats('nope'), null);
  assert.equal(readFormats(null), null);
});

test('readPreview reads a preview and survives missing optional parts', () => {
  const p = preview();
  assert.equal(p.fileSha256, SHA);
  assert.equal(p.rowsTotal, 10);
  assert.equal(p.conditionMapping.length, 2);
  assert.equal(p.summary.review.AMBIGUOUS_PRINTING, 2);
  assert.deepEqual(p.existingBatches, { ADD: null, REPLACE: null });
  const bare = readPreview({ success: true, data: { fileSha256: SHA, rowsTotal: 0 } });
  assert.ok(bare);
  assert.equal(bare?.rowsTotal, 0);
  assert.deepEqual(bare?.reviewRows, []);
  assert.equal(readPreview({ success: true, data: { rowsTotal: 3 } }), null);
  assert.equal(readPreview({ success: true, data: { fileSha256: 'short', rowsTotal: 3 } }), null);
  assert.equal(readPreview(undefined), null);
});

test('readPreview keeps at most five candidates per row and drops malformed rows', () => {
  const many = Array.from({ length: 8 }, (_v, i) => ({ printingId: 'p' + i, name: 'n', setCode: 's' + i, finishes: ['foil'] }));
  const p = preview({ reviewRows: [{ row: 4, reason: 'AMBIGUOUS_PRINTING', candidates: many }, { row: 'x', reason: 'AMBIGUOUS_PRINTING' }, { row: 5, reason: 'WHATEVER' }, { row: 6, reason: 'NO_CATALOG_MATCH', candidates: [{ printingId: '' }] }] });
  assert.equal(p.reviewRows.length, 2);
  assert.equal(p.reviewRows[0].candidates.length, 5);
  assert.equal(p.reviewRows[1].candidates.length, 0);
});

test('price toggle defaults to FILE only when the file has a price column (orchestrator decision 1)', () => {
  assert.equal(defaultPriceSource({ columnsPresent: { quantity: true, price: true, condition: true, finish: true, language: true, sku: true } }), 'FILE');
  assert.equal(defaultPriceSource({ columnsPresent: { quantity: true, price: false, condition: true, finish: true, language: true, sku: true } }), 'NONE');
});

// ---------------------------------------------------------------------------
// File checks and headers
// ---------------------------------------------------------------------------

test('checkChosenFile refuses wrong type, empty and oversize files with plain wording', () => {
  assert.equal(checkChosenFile({ name: 'cards.csv', size: 1000 }, 50), null);
  assert.equal(checkChosenFile({ name: 'CARDS.TSV', size: 1000 }, 50), null);
  assert.equal(checkChosenFile({ name: 'cards.txt', size: 1000 }, 50), null);
  assert.equal(checkChosenFile({ name: 'cards.xlsx', size: 1000 }, 50), INTAKE_COPY.fileWrongType);
  assert.equal(checkChosenFile({ name: 'cards', size: 1000 }, 50), INTAKE_COPY.fileWrongType);
  assert.equal(checkChosenFile({ name: 'cards.csv', size: 0 }, 50), INTAKE_COPY.fileEmpty);
  assert.equal(checkChosenFile({ name: 'cards.csv', size: 50 * 1024 * 1024 + 1 }, 50), INTAKE_COPY.fileTooBig(50));
  assert.equal(checkChosenFile({ name: 'cards.csv', size: 50 * 1024 * 1024 }, 50), null);
});

test('parseHeaderLine handles BOM, quotes, semicolons, tabs and repeated names', () => {
  assert.deepEqual(parseHeaderLine('﻿Name,Set code, Quantity\nBolt,m10,4'), ['Name', 'Set code', 'Quantity']);
  assert.deepEqual(parseHeaderLine('"Name","Set, code","Say ""hi"""\r\nx'), ['Name', 'Set, code', 'Say "hi"']);
  assert.deepEqual(parseHeaderLine('Name;Qty;Price\nA;1;2'), ['Name', 'Qty', 'Price']);
  assert.deepEqual(parseHeaderLine('Name\tQty\nA\t1'), ['Name', 'Qty']);
  assert.deepEqual(parseHeaderLine('Name,Name,,Qty'), ['Name', 'Qty']);
  assert.deepEqual(parseHeaderLine(''), []);
});

// ---------------------------------------------------------------------------
// Request fields
// ---------------------------------------------------------------------------

test('preview fields carry only what the seller set', () => {
  assert.deepEqual(buildPreviewFields(DEFAULT_OPTIONS, 'FILE'), [['priceSource', 'FILE']]);
  const f = buildPreviewFields({ format: 'generic', game: 'MTG', defaultCondition: 'NM', columnMapping: { name: 'Card', price: '' } }, 'NONE');
  assert.deepEqual(f, [
    ['priceSource', 'NONE'],
    ['format', 'generic'],
    ['game', 'MTG'],
    ['defaultCondition', 'NM'],
    ['columnMapping', '{"name":"Card","price":""}'],
  ]);
});

test('confirm fields send mode, the preview hash, both mappings and force only when asked', () => {
  const base = { mode: 'ADD' as const, fileSha256: SHA, priceSource: 'FILE' as const, conditionMapping: '{"a":"NM"}', decisions: '{"4":{"skip":true}}', force: false };
  const f = buildConfirmFields(DEFAULT_OPTIONS, base);
  const names = f.map((x) => x[0]);
  assert.deepEqual(names, ['priceSource', 'mode', 'fileSha256', 'conditionMapping', 'decisions']);
  assert.equal(f.find((x) => x[0] === 'mode')?.[1], 'ADD');
  assert.equal(f.find((x) => x[0] === 'fileSha256')?.[1], SHA);
  const forced = buildConfirmFields(DEFAULT_OPTIONS, { ...base, mode: 'REPLACE', force: true });
  assert.deepEqual(forced[forced.length - 1], ['force', 'true']);
  assert.equal(forced.find((x) => x[0] === 'mode')?.[1], 'REPLACE');
});

test('buildForm puts the text fields first and the file last under the name "file"', () => {
  const form = buildForm([['mode', 'ADD'], ['priceSource', 'NONE']], new Blob(['Name\nBolt\n']), 'cards.csv');
  const keys: string[] = [];
  form.forEach((_v, k) => keys.push(k));
  assert.deepEqual(keys, ['mode', 'priceSource', 'file']);
  const file = form.get('file') as File;
  assert.equal(file.name, 'cards.csv');
});

test('jsonObject is safe for any key text', () => {
  const text = jsonObject([['__proto__', 'NM'], ['near mint', null]]);
  const parsed = JSON.parse(text);
  assert.equal(Object.keys(parsed).length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), true);
  assert.equal(parsed['near mint'], null);
});

// ---------------------------------------------------------------------------
// Step A: conditions
// ---------------------------------------------------------------------------

test('EXACT condition lines start chosen and REVIEW lines start unchosen', () => {
  const lines = [line('Near Mint', 'EXACT', 'NM'), line('excellent', 'REVIEW', 'LP'), line('weird', 'REVIEW', null)];
  const choices = initialConditionChoices(lines);
  assert.deepEqual(Object.keys(choices), ['near mint']);
  assert.deepEqual(pendingConditionLines(lines, choices).map((l) => l.sourceValue), ['excellent', 'weird']);
});

test('a REVIEW line is cleared by a code or by "leave blank", never by default', () => {
  const lines = [line('excellent', 'REVIEW', 'LP'), line('weird', 'REVIEW', null)];
  let c = initialConditionChoices(lines);
  c = setConditionChoice(c, lines[0], 'LP');
  assert.equal(pendingConditionLines(lines, c).length, 1);
  c = setConditionChoice(c, lines[1], BLANK_CHOICE);
  assert.equal(pendingConditionLines(lines, c).length, 0);
  c = setConditionChoice(c, lines[1], '');
  assert.equal(pendingConditionLines(lines, c).length, 1);
});

test('"use every suggestion" fills only REVIEW lines that have a proposal and never overrides a choice', () => {
  const lines = [line('excellent', 'REVIEW', 'LP'), line('good', 'REVIEW', 'MP'), line('weird', 'REVIEW', null)];
  let c = initialConditionChoices(lines);
  c = setConditionChoice(c, lines[1], 'HP');
  const all = applyAllSuggestions(lines, c);
  assert.equal(all[conditionKey('excellent')], 'LP');
  assert.equal(all[conditionKey('good')], 'HP');
  assert.deepEqual(pendingConditionLines(lines, all).map((l) => l.sourceValue), ['weird']);
});

test('conditionMapping JSON sends every chosen line, null for "leave blank", nothing for unchosen lines', () => {
  const lines = [line('Near Mint', 'EXACT', 'NM'), line('excellent', 'REVIEW', 'LP'), line('weird', 'REVIEW', null), line('odd', 'REVIEW', null)];
  let c = initialConditionChoices(lines);
  c = setConditionChoice(c, lines[1], 'MP');
  c = setConditionChoice(c, lines[2], BLANK_CHOICE);
  const json = JSON.parse(conditionMappingJson(lines, c));
  assert.deepEqual(json, { 'Near Mint': 'NM', excellent: 'MP', weird: null });
});

// ---------------------------------------------------------------------------
// Step B: rows and decisions
// ---------------------------------------------------------------------------

test('catalog finish words map to the vocabulary and repeats collapse', () => {
  assert.deepEqual(candidateFinishes({ finishes: ['nonfoil', 'foil', 'etched', 'normal', 'weird'] }), ['NONFOIL', 'FOIL', 'ETCHED']);
});

test('an ambiguous row needs a printing; a multi-finish printing also needs a finish unless the file has a finish column', () => {
  const r = reviewRow(4, 'AMBIGUOUS_PRINTING', [cand('p1', 'm10', ['nonfoil', 'foil']), cand('p2', 'm11', ['nonfoil'])]);
  assert.equal(rowState(r, undefined, COLS), 'PENDING');
  const picked1 = chooseCandidate({}, r, 'p1');
  assert.equal(rowState(r, picked1[4], COLS), 'PENDING');
  assert.equal(rowState(r, picked1[4], { finish: true }), 'DECIDED');
  assert.equal(finishRequired(r, picked1[4], COLS), true);
  assert.deepEqual(finishOptionsForRow(r, picked1[4]), ['NONFOIL', 'FOIL']);
  const withFinish = chooseFinish(picked1, r, 'FOIL');
  assert.equal(rowState(r, withFinish[4], COLS), 'DECIDED');
  const picked2 = chooseCandidate({}, r, 'p2');
  assert.equal(rowState(r, picked2[4], COLS), 'DECIDED');
  assert.equal(finishRequired(r, picked2[4], COLS), false);
});

test('choosing a different printing drops a finish that printing does not offer', () => {
  const r = reviewRow(4, 'AMBIGUOUS_PRINTING', [cand('p1', 'm10', ['nonfoil', 'foil']), cand('p2', 'm11', ['nonfoil'])]);
  let m: DecisionMap = chooseCandidate({}, r, 'p1');
  m = chooseFinish(m, r, 'FOIL');
  assert.equal(m[4].finish, 'FOIL');
  m = chooseCandidate(m, r, 'p2');
  assert.equal(m[4].finish, undefined);
  assert.equal(m[4].printingId, 'p2');
});

test('a printing that is not one of the shown candidates is ignored', () => {
  const r = reviewRow(4, 'AMBIGUOUS_PRINTING', [cand('p1', 'm10')]);
  const m = chooseCandidate({}, r, 'not-shown');
  assert.deepEqual(m, {});
});

test('a finish-ambiguous row needs a finish and offers the printing finishes (or all when unknown)', () => {
  const withPrinting = reviewRow(7, 'FINISH_AMBIGUOUS', [cand('p1', 'm10', ['nonfoil', 'foil'])]);
  assert.deepEqual(finishOptionsForRow(withPrinting, undefined), ['NONFOIL', 'FOIL']);
  assert.equal(rowState(withPrinting, undefined, COLS), 'PENDING');
  assert.equal(rowState(withPrinting, { finish: 'FOIL' }, COLS), 'DECIDED');
  const noPrinting = reviewRow(8, 'FINISH_AMBIGUOUS', []);
  assert.equal(finishOptionsForRow(noPrinting, undefined).length, 5);
});

test('rows with no catalog match need no choice and can still be skipped', () => {
  const r = reviewRow(9, 'NO_CATALOG_MATCH');
  assert.equal(rowState(r, undefined, COLS), 'INFO');
  assert.equal(rowState(r, setSkip({}, r, true)[9], COLS), 'SKIPPED');
  assert.deepEqual(setSkip(setSkip({}, r, true), r, false), {});
});

test('skip replaces any earlier choice and "do not skip" clears the row', () => {
  const r = reviewRow(4, 'AMBIGUOUS_PRINTING', [cand('p1', 'm10')]);
  let m = chooseCandidate({}, r, 'p1');
  m = setSkip(m, r, true);
  assert.deepEqual(m[4], { skip: true });
  m = setSkip(m, r, false);
  assert.equal(m[4], undefined);
});

test('apply to all: skip touches only rows in the group that still have no choice', () => {
  const rows = [
    reviewRow(1, 'AMBIGUOUS_PRINTING', [cand('a', 'x')]),
    reviewRow(2, 'AMBIGUOUS_PRINTING', [cand('b', 'x')]),
    reviewRow(3, 'FINISH_AMBIGUOUS', [cand('c', 'x', ['nonfoil', 'foil'])]),
  ];
  const m = chooseCandidate({}, rows[0], 'a');
  const res = applySkipToGroup(rows, m, 'AMBIGUOUS_PRINTING', COLS);
  assert.equal(res.changed, 1);
  assert.equal(res.map[1].printingId, 'a');
  assert.deepEqual(res.map[2], { skip: true });
  assert.equal(res.map[3], undefined);
  assert.equal(applySkipToGroup(rows, {}, 'NO_CATALOG_MATCH', COLS).changed, 0);
});

test('apply to all: same printing set uses a row only when exactly one candidate has that set', () => {
  const rows = [
    reviewRow(1, 'AMBIGUOUS_PRINTING', [cand('a1', 'm10'), cand('a2', 'm11')]),
    reviewRow(2, 'AMBIGUOUS_PRINTING', [cand('b1', 'm10'), cand('b2', 'm12')]),
    reviewRow(3, 'AMBIGUOUS_PRINTING', [cand('c1', 'm10'), cand('c2', 'm10')]),
    reviewRow(4, 'AMBIGUOUS_PRINTING', [cand('d1', 'zzz')]),
    reviewRow(5, 'AMBIGUOUS_PRINTING', [cand('e1', 'M10'), cand('e2', 'm11')]),
  ];
  let m = chooseCandidate({}, rows[0], 'a1');
  m = chooseCandidate(m, rows[4], 'e2');
  const res = applySameSet(rows, m, rows[0], 'a1');
  assert.equal(res.changed, 1);
  assert.equal(res.map[2].printingId, 'b1');
  assert.equal(res.map[3], undefined);
  assert.equal(res.map[4], undefined);
  assert.equal(res.map[5].printingId, 'e2');
  assert.equal(applySameSet(rows, m, rows[0], 'nope').changed, 0);
});

test('apply to all: a finish goes only to waiting rows that offer it', () => {
  const rows = [
    reviewRow(1, 'FINISH_AMBIGUOUS', [cand('a', 'x', ['nonfoil', 'foil'])]),
    reviewRow(2, 'FINISH_AMBIGUOUS', [cand('b', 'x', ['nonfoil', 'etched'])]),
    reviewRow(3, 'FINISH_AMBIGUOUS', [cand('c', 'x', ['nonfoil', 'foil'])]),
  ];
  const start = chooseFinish({}, rows[2], 'NONFOIL');
  const res = applyFinishToGroup(rows, start, 'FINISH_AMBIGUOUS', 'FOIL', COLS);
  assert.equal(res.changed, 1);
  assert.equal(res.map[1].finish, 'FOIL');
  assert.equal(res.map[2], undefined);
  assert.equal(res.map[3].finish, 'NONFOIL');
});

test('group counts and pending count agree', () => {
  const rows = [
    reviewRow(1, 'AMBIGUOUS_PRINTING', [cand('a', 'x')]),
    reviewRow(2, 'AMBIGUOUS_PRINTING', [cand('b', 'x')]),
    reviewRow(3, 'AMBIGUOUS_PRINTING', [cand('c', 'x')]),
    reviewRow(4, 'NO_CATALOG_MATCH'),
  ];
  let m = chooseCandidate({}, rows[0], 'a');
  m = setSkip(m, rows[1], true);
  assert.deepEqual(groupCounts(rows, m, 'AMBIGUOUS_PRINTING', COLS), { total: 3, pending: 1, decided: 1, skipped: 1 });
  assert.equal(pendingRowCount(rows, m, COLS), 1);
});

test('decisions JSON includes only shown rows and offered printings and sorts by row', () => {
  const rows = [reviewRow(9, 'AMBIGUOUS_PRINTING', [cand('p9', 'x', ['nonfoil', 'foil'])]), reviewRow(2, 'FINISH_AMBIGUOUS', [cand('p2', 'x', ['nonfoil', 'foil'])]), reviewRow(5, 'NO_CATALOG_MATCH')];
  const m: DecisionMap = { 9: { printingId: 'p9', finish: 'FOIL' }, 2: { finish: 'NONFOIL' }, 5: { skip: true }, 77: { skip: true }, 3: { printingId: 'ghost' } };
  const json = decisionsJson(rows, m);
  assert.deepEqual(JSON.parse(json), { '2': { finish: 'NONFOIL' }, '5': { skip: true }, '9': { printingId: 'p9', finish: 'FOIL' } });
  assert.ok(json.indexOf('"2"') < json.indexOf('"5"') && json.indexOf('"5"') < json.indexOf('"9"'));
  assert.equal(decisionsJson(rows, {}), '{}');
  const bad = decisionsJson(rows, { 9: { printingId: 'ghost', finish: 'WEIRD' } });
  assert.equal(bad, '{}');
});

// The backend sends needsChoice and noCatalog (services/cardIntake/intakeService.ts runPreview). Rows that need a choice
// are capped at 500 in reviewRows; rows with no catalog match come as a count plus a sample and never use that list.
function bigBackendPreview(over: Record<string, unknown> = {}): PreviewData {
  const listed = Array.from({ length: 500 }, (_v, i) => ({ row: i + 2, reason: 'AMBIGUOUS_PRINTING', candidates: [{ printingId: 'p' + i, name: 'n', setCode: 's', finishes: [] }] }));
  const sample = Array.from({ length: 20 }, (_v, i) => ({ row: 900 + i, reason: 'NO_CATALOG_MATCH', name: 'Loose ' + i, noCatalogMatch: true }));
  return preview({
    reviewRows: listed,
    reviewTruncated: true,
    needsChoice: {
      total: 750,
      listed: 500,
      notListed: 250,
      cap: 500,
      byReason: { AMBIGUOUS_PRINTING: { total: 740, listed: 500, notListed: 240 }, FINISH_AMBIGUOUS: { total: 10, listed: 0, notListed: 10 } },
    },
    noCatalog: { total: 3000, importsAnyway: true, sampleCap: 20, sample },
    summary: { ...(previewBody().data as any).summary, review: { AMBIGUOUS_PRINTING: 740, NO_CATALOG_MATCH: 3000, FINISH_AMBIGUOUS: 10 } },
    ...over,
  });
}

test('readPreview reads needsChoice and noCatalog, and appends the no-catalog sample after the rows that need a choice', () => {
  const p = bigBackendPreview();
  assert.equal(REVIEW_ROWS_SHOWN_CAP, 500);
  assert.equal(p.needsChoice.total, 750);
  assert.equal(p.needsChoice.listed, 500);
  assert.equal(p.needsChoice.notListed, 250);
  assert.deepEqual(p.needsChoice.byReason.FINISH_AMBIGUOUS, { total: 10, listed: 0, notListed: 10 });
  assert.equal(p.reviewTruncated, true);
  assert.equal(p.reviewRows.length, 520);
  assert.equal(p.reviewRows[499].reason, 'AMBIGUOUS_PRINTING');
  assert.equal(p.reviewRows[500].reason, 'NO_CATALOG_MATCH');
  assert.equal(p.noCatalog.total, 3000);
  assert.equal(p.noCatalog.sampleShown, 20);
  assert.equal(noCatalogTotal(p), 3000);
  assert.equal(noCatalogSampleIsPartial(p), true);
});

test('hiddenReviewCount is the number of rows that need a choice and are not listed; no-catalog rows never count', () => {
  assert.equal(hiddenReviewCount(bigBackendPreview()), 250);
  // 3000 no-catalog rows and nothing that needs a choice: nothing is hidden, whatever the list holds.
  const onlyLoose = preview({
    reviewRows: [],
    reviewTruncated: false,
    needsChoice: { total: 0, listed: 0, notListed: 0, cap: 500, byReason: { AMBIGUOUS_PRINTING: { total: 0, listed: 0, notListed: 0 }, FINISH_AMBIGUOUS: { total: 0, listed: 0, notListed: 0 } } },
    noCatalog: { total: 3000, importsAnyway: true, sampleCap: 20, sample: [] },
  });
  assert.equal(hiddenReviewCount(onlyLoose), 0);
  assert.equal(onlyLoose.reviewTruncated, false);
  assert.equal(noCatalogTotal(onlyLoose), 3000);
});

test('a small file: every row is listed, nothing is hidden, and a short no-catalog sample is not partial', () => {
  const p = preview({
    reviewRows: [{ row: 2, reason: 'AMBIGUOUS_PRINTING', candidates: [{ printingId: 'p1', name: 'n', setCode: 's', finishes: [] }] }],
    needsChoice: { total: 1, listed: 1, notListed: 0, cap: 500, byReason: { AMBIGUOUS_PRINTING: { total: 1, listed: 1, notListed: 0 }, FINISH_AMBIGUOUS: { total: 0, listed: 0, notListed: 0 } } },
    noCatalog: { total: 1, importsAnyway: true, sampleCap: 20, sample: [{ row: 3, reason: 'NO_CATALOG_MATCH', name: 'Loose', noCatalogMatch: true }] },
    summary: { ...(previewBody().data as any).summary, review: { AMBIGUOUS_PRINTING: 1, NO_CATALOG_MATCH: 1, FINISH_AMBIGUOUS: 0 } },
  });
  assert.equal(hiddenReviewCount(p), 0);
  assert.equal(noCatalogSampleIsPartial(p), false);
  assert.equal(p.reviewRows.length, 2);
});

test('a response without needsChoice or noCatalog (older backend) is read from summary.review and the rows it sent', () => {
  const summary = { ...(previewBody().data as any).summary, review: { AMBIGUOUS_PRINTING: 0, NO_CATALOG_MATCH: 1, FINISH_AMBIGUOUS: 2 } };
  const rows = [{ row: 4, reason: 'FINISH_AMBIGUOUS', candidates: [] }, { row: 6, reason: 'NO_CATALOG_MATCH' }];
  const cut = preview({ reviewRows: rows, reviewTruncated: true, summary });
  assert.equal(cut.needsChoice.total, 2);
  assert.equal(cut.needsChoice.listed, 1);
  assert.equal(cut.needsChoice.notListed, 1);
  assert.equal(cut.reviewTruncated, true);
  assert.equal(cut.noCatalog.total, 1);
  assert.equal(cut.noCatalog.sampleShown, 1);
  // Not cut off: every row that needs a choice counts as listed.
  const whole = preview({ reviewRows: rows, reviewTruncated: false, summary });
  assert.equal(whole.needsChoice.notListed, 0);
  assert.equal(whole.reviewTruncated, false);
});

test('a sample row with no catalog match can still be skipped and the skip is sent', () => {
  const p = bigBackendPreview();
  assert.equal(decisionsJson(p.reviewRows, { 905: { skip: true } }), '{"905":{"skip":true}}');
});

test('the sample is not added twice when the same row is also in reviewRows', () => {
  const p = preview({
    reviewRows: [{ row: 6, reason: 'NO_CATALOG_MATCH' }],
    noCatalog: { total: 1, importsAnyway: true, sampleCap: 20, sample: [{ row: 6, reason: 'NO_CATALOG_MATCH' }] },
  });
  assert.equal(p.reviewRows.filter((r) => r.row === 6).length, 1);
});

test('hiddenReviewCount counts rows that need a choice but were cut off by the cap', () => {
  const shown = Array.from({ length: 500 }, (_v, i) => ({ row: i + 2, reason: 'AMBIGUOUS_PRINTING', candidates: [{ printingId: 'p' + i, name: 'n', setCode: 's', finishes: [] }] }));
  const p = preview({ reviewRows: shown, reviewTruncated: true, summary: { ...(previewBody().data as any).summary, review: { AMBIGUOUS_PRINTING: 740, NO_CATALOG_MATCH: 0, FINISH_AMBIGUOUS: 10 } } });
  assert.equal(hiddenReviewCount(p), 250);
  assert.equal(hiddenReviewCount(preview({ reviewTruncated: false })), 0);
});

// ---------------------------------------------------------------------------
// Confirm gating
// ---------------------------------------------------------------------------

test('Import stays disabled until a mode is chosen: there is no default mode', () => {
  const p = preview({ conditionMapping: [] });
  const blockers = confirmBlockers({ preview: p, mode: null, conditionChoices: {}, busy: false });
  assert.deepEqual(blockers.map((b) => b.code), ['MODE']);
  assert.equal(canConfirm({ preview: p, mode: null, conditionChoices: {}, busy: false }), false);
  assert.equal(canConfirm({ preview: p, mode: 'ADD', conditionChoices: {}, busy: false }), true);
  assert.equal(canConfirm({ preview: p, mode: 'REPLACE', conditionChoices: {}, busy: false }), true);
});

test('an unconfirmed REVIEW condition blocks Import until the seller chooses, "leave blank" counts', () => {
  const p = preview();
  const choices = initialConditionChoices(p.conditionMapping);
  const gate = (c: Record<string, string>) => confirmBlockers({ preview: p, mode: 'ADD', conditionChoices: c, busy: false }).map((b) => b.code);
  assert.deepEqual(gate(choices), ['CONDITIONS']);
  assert.deepEqual(gate(setConditionChoice(choices, p.conditionMapping[1], 'LP')), []);
  assert.deepEqual(gate(setConditionChoice(choices, p.conditionMapping[1], BLANK_CHOICE)), []);
});

test('Import is blocked while busy, with no preview, and when no row can be imported', () => {
  const p = preview({ conditionMapping: [] });
  assert.deepEqual(confirmBlockers({ preview: p, mode: 'ADD', conditionChoices: {}, busy: true }).map((b) => b.code), ['BUSY']);
  assert.deepEqual(confirmBlockers({ preview: null, mode: 'ADD', conditionChoices: {}, busy: false }).map((b) => b.code), ['NO_PREVIEW']);
  const allBad = preview({ conditionMapping: [], rowsTotal: 4, summary: { ...(previewBody().data as any).summary, errors: 4 } });
  assert.equal(importableRowCount(allBad), 0);
  assert.ok(confirmBlockers({ preview: allBad, mode: 'ADD', conditionChoices: {}, busy: false }).some((b) => b.code === 'NO_ROWS'));
});

test('merge example shows both outcomes in plain words, or says both are the same', () => {
  const text = modeExampleText({ row: 3, name: 'Lightning Bolt', existingStock: 4, fileQuantity: 3, addResult: 7, replaceResult: 3, alreadySold: 0 });
  assert.equal(text, 'Lightning Bolt has 4 in stock and your file says 3. Add: 4 in stock plus 3 = 7. Replace: set to 3.');
  assert.equal(modeExampleText(null), INTAKE_COPY.modeNoExample);
  assert.ok(modeExampleText({ row: 3, name: 'X', existingStock: 1, fileQuantity: 1, addResult: null, replaceResult: null, alreadySold: 0 }).indexOf('cannot be worked out') > 0);
});

test('earlier batches: resume point, completed, or nothing', () => {
  const batch = (over: Record<string, unknown>) => ({ batchId: 'b1', mode: 'ADD', status: 'CANCELLED', rowsTotal: 1000, committedThroughRow: 400, created: 300, merged: 90, skipped: 5, errors: 5, ...over });
  const p = preview({ existingBatches: { ADD: batch({}), REPLACE: batch({ mode: 'REPLACE', status: 'COMPLETED', committedThroughRow: 1000 }) } });
  assert.deepEqual(earlierBatchFor(p, 'ADD'), { kind: 'resume', done: 400, total: 1000 });
  assert.equal(earlierBatchFor(p, 'REPLACE').kind, 'completed');
  assert.deepEqual(earlierBatchFor(p, null), { kind: 'none' });
  const fresh = preview({ existingBatches: { ADD: batch({ committedThroughRow: 0, status: 'RUNNING' }), REPLACE: null } });
  assert.deepEqual(earlierBatchFor(fresh, 'ADD'), { kind: 'none' });
  assert.deepEqual(earlierBatchFor(fresh, 'REPLACE'), { kind: 'none' });
});

// ---------------------------------------------------------------------------
// Errors file and failures
// ---------------------------------------------------------------------------

test('errors.csv is the server header plus its lines, with a byte order mark and a closing newline', () => {
  assert.equal(buildErrorsCsv('Name,Qty,FindASale Error', ['"A",1,"x"', '"B",2,"y"']), '﻿Name,Qty,FindASale Error\n"A",1,"x"\n"B",2,"y"\n');
  assert.equal(buildErrorsCsv('Name,FindASale Error', []), '﻿Name,FindASale Error\n');
});

test('failures show the server text first and add the plain "what to do" line', () => {
  const f = failureFromResponse(400, { success: false, error: 'We could not find a card name column. Choose which column holds the card name.', code: 'NO_NAME_COLUMN' });
  assert.equal(f.code, 'NO_NAME_COLUMN');
  assert.equal(f.message, 'We could not find a card name column. Choose which column holds the card name.');
  assert.ok(f.help.length > 5);
  assert.equal(needsColumnChooser(f.code), true);
  assert.equal(needsColumnChooser('PARSE_ERROR'), false);
});

test('409 ALREADY_APPLIED carries the earlier summary and is not read as a plain failure', () => {
  const f = failureFromResponse(409, { success: false, error: 'This file was already imported. Nothing was changed.', code: 'ALREADY_APPLIED', summary: { batchId: 'b1', mode: 'ADD', status: 'COMPLETED', rowsTotal: 10, committedThroughRow: 10, created: 8, merged: 1, skipped: 0, errors: 1 } });
  assert.equal(f.code, 'ALREADY_APPLIED');
  assert.equal(f.summary?.created, 8);
  assert.equal(f.summary?.errors, 1);
});

test('failures without a usable body fall back to wording by status', () => {
  assert.equal(failureFromResponse(401, null).code, 'SESSION_ENDED');
  assert.equal(failureFromResponse(413, '<html>').code, 'FILE_TOO_LARGE');
  assert.equal(failureFromResponse(429, {}).code, 'RATE_LIMITED');
  assert.equal(failureFromResponse(502, null).code, 'SERVER_ERROR');
  assert.equal(failureFromResponse(418, null).code, 'UNKNOWN');
  assert.ok(failureFromResponse(502, null).message.length > 5);
});

test('axios-style errors, aborts and dropped connections are told apart', () => {
  assert.equal(failureFromError({ response: { status: 400, data: { error: 'Bad file.', code: 'PARSE_ERROR' } } }).message, 'Bad file.');
  assert.equal(failureFromError({ name: 'CanceledError', code: 'ERR_CANCELED' }).kind, 'aborted');
  assert.equal(failureFromError({ name: 'AbortError' }).kind, 'aborted');
  assert.equal(failureFromError(new TypeError('Failed to fetch')).kind, 'network');
  assert.equal(failureFromError(null).kind, 'network');
});

// ---------------------------------------------------------------------------
// Remembered choices
// ---------------------------------------------------------------------------

test('remembered choices round trip and drop anything that no longer applies', () => {
  const p = preview({ reviewRows: [{ row: 4, reason: 'AMBIGUOUS_PRINTING', candidates: [{ printingId: 'p1', name: 'n', setCode: 's', finishes: ['foil', 'nonfoil'] }] }, { row: 6, reason: 'NO_CATALOG_MATCH' }] });
  const choices = setConditionChoice(initialConditionChoices(p.conditionMapping), p.conditionMapping[1], 'MP');
  const decisions: DecisionMap = { 4: { printingId: 'p1', finish: 'FOIL' }, 6: { skip: true }, 99: { skip: true } };
  const text = serializeSavedChoices({ priceSource: 'NONE', conditions: choices, decisions });
  const restored = restoreChoices(parseSavedChoices(text), p);
  assert.equal('mode' in restored, false, 'the mode is never kept: the seller chooses it every time');
  assert.equal(restored.priceSource, 'NONE');
  assert.equal(restored.conditions[conditionKey('excellent')], 'MP');
  assert.deepEqual(restored.decisions, { 4: { printingId: 'p1', finish: 'FOIL' }, 6: { skip: true } });
  // A printing the new preview does not offer is dropped.
  const other = preview({ reviewRows: [{ row: 4, reason: 'AMBIGUOUS_PRINTING', candidates: [{ printingId: 'other', name: 'n', setCode: 's', finishes: [] }] }] });
  assert.deepEqual(restoreChoices(parseSavedChoices(text), other).decisions, {});
});

test('remembered choices reject junk and never keep a mode', () => {
  assert.equal(parseSavedChoices(null), null);
  assert.equal(parseSavedChoices('not json'), null);
  assert.equal(parseSavedChoices('{"v":2}'), null);
  const p = preview();
  const none = restoreChoices(null, p);
  assert.equal('mode' in none, false);
  assert.equal(none.priceSource, null);
  const weird = parseSavedChoices('{"v":1,"mode":"ADD","priceSource":"ALL","conditions":{"excellent":"LP"},"decisions":{"x":{"skip":true}}}');
  assert.equal(weird && 'mode' in weird, false);
  assert.equal(weird?.priceSource, null);
  assert.deepEqual(weird?.decisions, {});
  assert.equal(savedChoicesKey('sale1', SHA), 'fas-card-intake:sale1:' + SHA);
});

test('candidateTitle reads naturally with whatever parts exist', () => {
  assert.equal(candidateTitle(cand('p', 'm10', [], { setName: 'Magic 2010', collectorNumber: '141', releaseYear: 2009 })), 'Magic 2010 (M10) #141, 2009');
  assert.equal(candidateTitle(cand('p', 'm10', [], { setName: null, collectorNumber: null, releaseYear: null })), 'M10');
  assert.equal(candidateTitle(cand('p', '', [], { setName: null, collectorNumber: null, releaseYear: null })), 'Unknown set');
});
