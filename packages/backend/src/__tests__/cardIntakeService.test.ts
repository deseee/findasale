/**
 * Card intake service flows (ADR-134 #642, batch B4): preview, confirm, merge modes, resume, conflicts.
 * Everything runs against in-memory fakes (no database, no network). Fixtures are synthetic.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { executeConfirm, isApiFailure, parseIntakeParams, prepareConfirm, runPreview } from '../services/cardIntake/intakeService';
import type { ApiFailure, ConfirmDone, IntakeDeps, IntakeParams } from '../services/cardIntake/intakeService';
import { getIntakeConfig } from '../services/cardIntake/config';
import { sha256OfFile } from '../services/cardIntake/parseSpreadsheet';
import { errorsCsvHeader, errorsCsvLine } from '../services/cardIntake/errorsCsv';
import { computeDedupKey } from '../services/cardRecordService';
import { READY_STATE, makeFakeIntakeDb, makeResolver, printing } from './__fixtures__/intakeFakes';

const FIX = path.join(__dirname, '__fixtures__', 'cardIntake');
const SALE = 'sale_1';
const ORG = 'org_1';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardintake-service-'));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const PRINTINGS = [
  printing({ id: 'SCRYFALL:00000000-0000-4000-8000-000000000001', scryfallId: '00000000-0000-4000-8000-000000000001', name: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161', finishes: ['nonfoil'] }),
  printing({ id: 'SCRYFALL:00000000-0000-4000-8000-000000000002', scryfallId: '00000000-0000-4000-8000-000000000002', name: 'Sol Ring', setCode: 'lea', collectorNumber: '270', finishes: ['nonfoil', 'foil'] }),
  printing({ id: 'SCRYFALL:00000000-0000-4000-8000-000000000003', scryfallId: '00000000-0000-4000-8000-000000000003', name: 'Counterspell', setCode: 'lea', collectorNumber: '55', finishes: ['nonfoil'] }),
];

function makeDeps(db: any, over: Partial<IntakeDeps> = {}): IntakeDeps {
  const resolver = makeResolver(PRINTINGS);
  return {
    db,
    resolve: resolver.resolve,
    getCatalogState: async () => READY_STATE,
    getDbSizeBytes: async () => null,
    env: {},
    ...over,
  };
}

function params(body: Record<string, unknown>, kind: 'preview' | 'confirm' = 'confirm'): IntakeParams {
  const p = parseIntakeParams(body, kind, getIntakeConfig({}));
  if (isApiFailure(p)) throw new Error(`params failed: ${p.code}`);
  return p;
}

function writeFile(name: string, text: string): string {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, text, 'utf8');
  return p;
}

function genericCsv(count: number, prefix = 'Card'): string {
  const lines = ['Name,Quantity,Condition,Price'];
  for (let i = 1; i <= count; i++) lines.push(`${prefix} ${i},${(i % 3) + 1},Near Mint,${(i % 50) + 1}.00`);
  return lines.join('\n') + '\n';
}

type ConfirmResult = { failure: ApiFailure } | { done: ConfirmDone; events: any[] };

async function confirm(deps: IntakeDeps, filePath: string, body: Record<string, unknown>, hooks: { shouldCancel?: () => boolean } = {}): Promise<ConfirmResult> {
  const sha = await sha256OfFile(filePath);
  const p = params({ fileSha256: sha, ...body });
  const prepared = await prepareConfirm(deps, { filePath, fileName: path.basename(filePath), saleId: SALE, organizerId: ORG, params: p });
  if (isApiFailure(prepared)) return { failure: prepared };
  const events: any[] = [];
  const done = await executeConfirm(deps, prepared, { emit: (e) => void events.push(e), shouldCancel: hooks.shouldCancel ?? (() => false) });
  return { done, events };
}

function seedDb() {
  return makeFakeIntakeDb({ sales: [{ id: SALE, organizerId: ORG, userId: 'user_1' }] });
}

const itemsOf = (db: any) => Array.from(db.state.items.values()) as any[];

describe('parameters', () => {
  it('requires a mode on confirm and has no default (acceptance 8)', () => {
    const r = parseIntakeParams({ fileSha256: 'a'.repeat(64) }, 'confirm', getIntakeConfig({}));
    expect(isApiFailure(r)).toBe(true);
    if (isApiFailure(r)) {
      expect(r.status).toBe(400);
      expect(r.code).toBe('MODE_REQUIRED');
    }
  });

  it('accepts a missing mode on preview but rejects an unknown one', () => {
    expect(isApiFailure(parseIntakeParams({}, 'preview', getIntakeConfig({})))).toBe(false);
    const bad = parseIntakeParams({ mode: 'MERGE' }, 'preview', getIntakeConfig({}));
    expect(isApiFailure(bad) && bad.code).toBe('BAD_MODE');
  });

  it('defaults the price source to NONE and validates the hash shape', () => {
    const ok = parseIntakeParams({ mode: 'add', fileSha256: 'A'.repeat(64) }, 'confirm', getIntakeConfig({}));
    expect(isApiFailure(ok)).toBe(false);
    if (!isApiFailure(ok)) {
      expect(ok.mode).toBe('ADD');
      expect(ok.priceSource).toBe('NONE');
      expect(ok.fileSha256).toBe('a'.repeat(64));
    }
    const missing = parseIntakeParams({ mode: 'ADD' }, 'confirm', getIntakeConfig({}));
    expect(isApiFailure(missing) && missing.code).toBe('FILE_HASH_REQUIRED');
  });

  it('rejects malformed JSON fields and bad decisions', () => {
    const cfg = getIntakeConfig({});
    expect((parseIntakeParams({ mode: 'ADD', conditionMapping: '{oops' }, 'preview', cfg) as any).code).toBe('BAD_JSON');
    expect((parseIntakeParams({ mode: 'ADD', conditionMapping: JSON.stringify({ a: 'ZZ' }) }, 'preview', cfg) as any).code).toBe('BAD_CONDITION_MAPPING');
    expect((parseIntakeParams({ mode: 'ADD', decisions: JSON.stringify({ abc: { skip: true } }) }, 'preview', cfg) as any).code).toBe('BAD_DECISIONS');
    expect((parseIntakeParams({ mode: 'ADD', decisions: JSON.stringify({ 2: { nope: 1 } }) }, 'preview', cfg) as any).code).toBe('BAD_DECISIONS');
    expect((parseIntakeParams({ mode: 'ADD', game: 'Quidditch' }, 'preview', cfg) as any).code).toBe('BAD_GAME');
  });
});

describe('preview', () => {
  it('previews a ManaBox file, reports condition lines for review and writes nothing (acceptance 11)', async () => {
    const db = seedDb();
    const file = path.join(FIX, 'manabox-synthetic.csv');
    const out = await runPreview(makeDeps(db), { filePath: file, fileName: 'manabox-synthetic.csv', saleId: SALE, organizerId: ORG, params: params({}, 'preview') });
    expect(isApiFailure(out)).toBe(false);
    if (isApiFailure(out)) return;
    const d: any = out.data;
    expect(d.detectedFormat).toBe('manabox');
    expect(d.fileSha256).toBe(await sha256OfFile(file));
    expect(d.rowsTotal).toBe(4);
    expect(d.summary.exact).toBe(3);
    expect(d.summary.unmatched).toBe(1);
    // excellent, played and mystery_grade are all REVIEW lines; near_mint is EXACT.
    const lines = d.conditionMapping as Array<{ sourceValue: string; confidence: string; proposed: string | null }>;
    expect(lines.find((l) => l.sourceValue === 'near_mint')?.confidence).toBe('EXACT');
    expect(lines.find((l) => l.sourceValue === 'excellent')).toMatchObject({ confidence: 'REVIEW', proposed: 'LP' });
    expect(lines.find((l) => l.sourceValue === 'mystery_grade')).toMatchObject({ confidence: 'REVIEW', proposed: null });
    expect(d.conditionReviewCount).toBe(3);
    expect(d.priceSource).toBe('NONE');
    expect(itemsOf(db)).toHaveLength(0);
    expect(db.state.itemCreates).toBe(0);
    expect(db.state.transactions).toBe(0);
  });

  it('reports willMerge when an available item of the sale already has the same card', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const file = path.join(FIX, 'manabox-synthetic.csv');
    const choices = { excellent: 'LP', played: 'HP', mystery_grade: 'MP' };
    const first = await confirm(deps, file, { mode: 'ADD', conditionMapping: JSON.stringify(choices) });
    expect('done' in first && first.done.status).toBe('COMPLETED');
    const out = await runPreview(deps, { filePath: file, fileName: 'x.csv', saleId: SALE, organizerId: ORG, params: params({ conditionMapping: JSON.stringify(choices) }, 'preview') });
    if (isApiFailure(out)) throw new Error(out.code);
    const d: any = out.data;
    expect(d.summary.willMerge).toBeGreaterThan(0);
    expect(d.firstMerge).toMatchObject({ existingStock: 3, fileQuantity: 3, addResult: 6, replaceResult: 3 });
    expect(d.existingBatches.ADD.status).toBe('COMPLETED');
    expect(d.existingBatches.REPLACE).toBeNull();
  });

  it('keeps preview running for a game with no catalog and marks it NO_CATALOG_MATCH', async () => {
    const db = seedDb();
    const file = path.join(FIX, 'generic-synthetic.tsv');
    const out = await runPreview(makeDeps(db), { filePath: file, fileName: 'g.tsv', saleId: SALE, organizerId: ORG, params: params({}, 'preview') });
    if (isApiFailure(out)) throw new Error(out.code);
    const d: any = out.data;
    expect(d.detectedFormat).toBe('generic');
    expect(d.summary.noCatalogMatch).toBe(3);
    expect(d.summary.review.NO_CATALOG_MATCH).toBe(3);
    // No-catalog rows import anyway, so they never use the capped list of rows that need a choice: they come as a count and a sample.
    expect(d.reviewRows).toEqual([]);
    expect(d.reviewTruncated).toBe(false);
    expect(d.needsChoice).toMatchObject({ total: 0, listed: 0, notListed: 0 });
    expect(d.noCatalog).toMatchObject({ total: 3, importsAnyway: true });
    expect(d.noCatalog.sample.map((r: any) => r.reason)).toEqual(['NO_CATALOG_MATCH', 'NO_CATALOG_MATCH', 'NO_CATALOG_MATCH']);
    expect(d.noCatalog.sample[0].noCatalogMatch).toBe(true);
  });

  it('works when the catalog state cannot be read', async () => {
    const db = seedDb();
    const deps = makeDeps(db, { getCatalogState: async () => { throw new Error('relation does not exist'); } });
    const out = await runPreview(deps, { filePath: path.join(FIX, 'moxfield-synthetic.csv'), fileName: 'm.csv', saleId: SALE, organizerId: ORG, params: params({}, 'preview') });
    expect(isApiFailure(out)).toBe(false);
    if (!isApiFailure(out)) expect((out.data as any).summary.noCatalogMatch).toBeGreaterThan(0);
  });

  it('rejects a non-spreadsheet file', async () => {
    const db = seedDb();
    const bin = path.join(tmp, 'binary.csv');
    fs.writeFileSync(bin, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3]));
    const out = await runPreview(makeDeps(db), { filePath: bin, fileName: 'binary.csv', saleId: SALE, organizerId: ORG, params: params({}, 'preview') });
    expect(isApiFailure(out) && out.code).toBe('NOT_A_CSV_FILE');
  });
});

describe('confirm: conditions, errors and prices', () => {
  const choices = { excellent: 'LP', played: 'HP' };

  it('errors a row whose condition was never confirmed and never creates it as NM (acceptance 11)', async () => {
    const db = seedDb();
    const res = await confirm(makeDeps(db), path.join(FIX, 'manabox-synthetic.csv'), { mode: 'ADD', conditionMapping: JSON.stringify(choices) });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(res.done.status).toBe('COMPLETED');
    expect(res.done.summary).toMatchObject({ rowsTotal: 4, created: 3, errors: 1 });
    const rowErrors = res.events.filter((e) => e.type === 'rowError');
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0]).toMatchObject({ row: 5, code: 'CONDITION_UNMAPPED', field: 'condition' });
    const items = itemsOf(res.done ? db : db);
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.title.includes('Giant Growth'))).toBe(false);
    expect(items.every((i) => i.card.conditionCode !== 'NM' || i.title.includes('Lightning Bolt'))).toBe(true);
    // The two REVIEW lines the seller confirmed were applied; nothing silently became NM.
    const byName = (n: string) => items.find((i) => i.title.includes(n));
    expect(byName('Sol Ring').card.conditionCode).toBe('LP');
    expect(byName('Counterspell').card.conditionCode).toBe('HP');
    expect(byName('Lightning Bolt').card.conditionCode).toBe('NM');
  });

  it('with no choices at all, every REVIEW condition row errors and only exact ones are created', async () => {
    const db = seedDb();
    const res = await confirm(makeDeps(db), path.join(FIX, 'manabox-synthetic.csv'), { mode: 'ADD' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(res.done.summary.created).toBe(1);
    expect(res.done.summary.errors).toBe(3);
    expect(res.events.filter((e) => e.type === 'rowError').every((e) => e.code === 'CONDITION_UNMAPPED')).toBe(true);
    expect(itemsOf(db)).toHaveLength(1);
  });

  it('a seller choice of null leaves the condition blank on purpose', async () => {
    const db = seedDb();
    const res = await confirm(makeDeps(db), path.join(FIX, 'manabox-synthetic.csv'), {
      mode: 'ADD',
      conditionMapping: JSON.stringify({ ...choices, mystery_grade: null }),
    });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(res.done.summary.errors).toBe(0);
    const gg = itemsOf(db).find((i) => i.title.includes('Giant Growth'));
    expect(gg.card.conditionCode ?? null).toBeNull();
  });

  it('never invents a price: no price source leaves price null, FILE takes the file price (price from file or null)', async () => {
    const file = writeFile('prices-synthetic.csv', 'Name,Quantity,Condition,Price\nAlpha,1,NM,\nBeta,2,NM,4.50\nGamma,1,NM,abc\n');
    const none = seedDb();
    const a = await confirm(makeDeps(none), file, { mode: 'ADD' });
    if ('failure' in a) throw new Error(a.failure.code);
    expect(itemsOf(none).every((i) => i.price === null)).toBe(true);
    expect(a.done.summary.needsPrice).toBe(3);

    const withFile = seedDb();
    const b = await confirm(makeDeps(withFile), file, { mode: 'ADD', priceSource: 'FILE' });
    if ('failure' in b) throw new Error(b.failure.code);
    const byTitle = (n: string) => itemsOf(withFile).find((i) => i.title.includes(n));
    expect(byTitle('Alpha').price).toBeNull();
    expect(byTitle('Beta').price).toBe(4.5);
    expect(b.events.filter((e) => e.type === 'rowError').map((e) => e.code)).toContain('BAD_PRICE');
    expect(byTitle('Gamma')).toBeUndefined();
  });

  it('keeps going past bad rows and reports each with the csv line (acceptance 12 neighbour)', async () => {
    const db = seedDb();
    const file = path.join(FIX, 'formula-cells-synthetic.csv');
    const res = await confirm(makeDeps(db), file, { mode: 'ADD' });
    if ('failure' in res) throw new Error(res.failure.code);
    const rowErrors = res.events.filter((e) => e.type === 'rowError');
    expect(rowErrors.length).toBeGreaterThanOrEqual(2);
    // Every formula-leading cell is neutralized in the rendered line (acceptance 12).
    for (const e of rowErrors) {
      for (const cell of e.csvLine.split(',')) {
        const bare = cell.replace(/^"/, '');
        expect(/^[=+\-@\t\r]/.test(bare)).toBe(false);
      }
    }
    expect(rowErrors[0].csvLine).toContain("'=CMD(1)");
    expect(res.done.errorsCsvHeader).toBe(errorsCsvHeader(['Name', 'Quantity', 'Condition', 'Notes']));
  });

  it('neutralizes formula cells in the header and the message as well (acceptance 12)', () => {
    const header = errorsCsvHeader(['=HYPERLINK("x")', 'Name']);
    expect(header.startsWith("row,")).toBe(false);
    for (const cell of header.split(',')) expect(/^"?[=+\-@]/.test(cell.replace(/^"/, ''))).toBe(false);
    const line = errorsCsvLine(['A', 'B'], { A: '=1+1', B: '+cmd|x' }, '-bad');
    expect(line).toContain("'=1+1");
    expect(line).toContain("'+cmd|x");
    expect(line).toContain("'-bad");
  });
});

describe('confirm: ledger, replay and resume', () => {
  it('re-sending a completed file returns ALREADY_APPLIED and writes nothing (acceptance 3)', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const file = writeFile('twice-synthetic.csv', genericCsv(5));
    const first = await confirm(deps, file, { mode: 'ADD' });
    expect('done' in first && first.done.summary.created).toBe(5);
    const writes = db.state.itemCreates + db.state.itemUpdates;
    const again = await confirm(deps, file, { mode: 'ADD' });
    expect('failure' in again).toBe(true);
    if ('failure' in again) {
      expect(again.failure).toMatchObject({ status: 409, code: 'ALREADY_APPLIED' });
      expect((again.failure.extra as any).summary).toMatchObject({ status: 'COMPLETED', created: 5 });
    }
    expect(db.state.itemCreates + db.state.itemUpdates).toBe(writes);
    expect(itemsOf(db)).toHaveLength(5);
  });

  it('a file changed between preview and confirm returns FILE_CHANGED (acceptance 4)', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const original = writeFile('changed-synthetic.csv', genericCsv(3));
    const sha = await sha256OfFile(original);
    const changed = writeFile('changed2-synthetic.csv', genericCsv(3) + 'Extra Card,1,Near Mint,1.00\n');
    const p = params({ mode: 'ADD', fileSha256: sha });
    const prepared = await prepareConfirm(deps, { filePath: changed, fileName: 'c.csv', saleId: SALE, organizerId: ORG, params: p });
    expect(isApiFailure(prepared) && [prepared.status, prepared.code]).toEqual([409, 'FILE_CHANGED']);
    expect(itemsOf(db)).toHaveLength(0);
    expect(db.state.transactions).toBe(0);
  });

  it('a disconnect mid-run marks the batch CANCELLED and a resend resumes with no duplicates (acceptance 5)', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const file = writeFile('cancel-synthetic.csv', genericCsv(250));
    let leave = false;
    db.state.afterCommit = (n: number) => {
      if (n === 1) leave = true;
    };
    const first = await confirm(deps, file, { mode: 'ADD' }, { shouldCancel: () => leave });
    if ('failure' in first) throw new Error(first.failure.code);
    expect(first.done.status).toBe('CANCELLED');
    expect(first.done.summary.created).toBe(100);
    const batch = Array.from(db.state.batches.values())[0] as any;
    expect(batch.status).toBe('CANCELLED');
    expect(batch.committedThroughRow).toBe(101);
    expect(itemsOf(db)).toHaveLength(100);

    db.state.afterCommit = null;
    const second = await confirm(deps, file, { mode: 'ADD' });
    if ('failure' in second) throw new Error(second.failure.code);
    expect(second.done.status).toBe('COMPLETED');
    expect(second.done.resumed).toBe(true);
    expect(second.done.summary.created).toBe(250);
    expect(itemsOf(db)).toHaveLength(250);
    const titles = itemsOf(db).map((i) => i.title);
    expect(new Set(titles).size).toBe(250);
    expect(itemsOf(db).every((i) => i.stockTotal === ((Number(String(i.card.cardName).split(' ').pop()) % 3) + 1))).toBe(true);
  });

  it('a failed chunk rolls back, marks FAILED and a resend finishes without duplicates', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const file = writeFile('fail-synthetic.csv', genericCsv(150));
    db.state.failTransactionNumber = 2;
    await expect(confirm(deps, file, { mode: 'ADD' })).rejects.toThrow('simulated database failure');
    const batch = Array.from(db.state.batches.values())[0] as any;
    expect(batch.status).toBe('FAILED');
    expect(batch.committedThroughRow).toBe(101);
    expect(itemsOf(db)).toHaveLength(100);
    const again = await confirm(deps, file, { mode: 'ADD' });
    if ('failure' in again) throw new Error(again.failure.code);
    expect(again.done.status).toBe('COMPLETED');
    expect(itemsOf(db)).toHaveLength(150);
  });

  it('takes the sale advisory lock once per chunk and scopes every write to the sale and organizer', async () => {
    const db = seedDb();
    const res = await confirm(makeDeps(db), writeFile('lock-synthetic.csv', genericCsv(210)), { mode: 'ADD' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(db.state.locks).toEqual([SALE, SALE, SALE]);
    expect(itemsOf(db).every((i) => i.saleId === SALE && i.organizerId === ORG)).toBe(true);
  });

  it('a force re-run of a cancelled file starts over on the same ledger row', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const file = writeFile('force-cancel-synthetic.csv', genericCsv(120));
    let leave = false;
    db.state.afterCommit = () => {
      leave = true;
    };
    await confirm(deps, file, { mode: 'ADD' }, { shouldCancel: () => leave });
    db.state.afterCommit = null;
    const res = await confirm(deps, file, { mode: 'ADD', force: 'true' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(res.done.resumed).toBe(false);
    expect(db.state.batches.size).toBe(1);
  });
});

describe('merge modes', () => {
  const file = () => writeFile('merge-synthetic.csv', 'Name,Quantity,Condition\nWidget A,3,Near Mint\nWidget B,1,Near Mint\n');
  const stockOf = (db: any, name: string) => itemsOf(db).find((i) => i.title.includes(name)).stockTotal;

  it('ADD twice with force doubles stockTotal (acceptance 6)', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const f = file();
    await confirm(deps, f, { mode: 'ADD' });
    expect(stockOf(db, 'Widget A')).toBe(3);
    const second = await confirm(deps, f, { mode: 'ADD', force: 'true' });
    if ('failure' in second) throw new Error(second.failure.code);
    expect(second.done.summary).toMatchObject({ created: 0, merged: 2 });
    expect(stockOf(db, 'Widget A')).toBe(6);
    expect(stockOf(db, 'Widget B')).toBe(2);
    expect(itemsOf(db)).toHaveLength(2);
  });

  it('REPLACE twice does not change stockTotal (acceptance 6)', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const f = file();
    await confirm(deps, f, { mode: 'REPLACE' });
    await confirm(deps, f, { mode: 'REPLACE', force: 'true' });
    expect(stockOf(db, 'Widget A')).toBe(3);
    expect(stockOf(db, 'Widget B')).toBe(1);
    expect(itemsOf(db)).toHaveLength(2);
  });

  it('ADD without force on the same file is blocked, so a double click cannot double stock', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const f = file();
    await confirm(deps, f, { mode: 'ADD' });
    const second = await confirm(deps, f, { mode: 'ADD' });
    expect('failure' in second && second.failure.code).toBe('ALREADY_APPLIED');
    expect(stockOf(db, 'Widget A')).toBe(3);
  });

  it('REPLACE never sets stockTotal below stockSold (acceptance 7)', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const f = file();
    await confirm(deps, f, { mode: 'ADD' });
    const widget = itemsOf(db).find((i) => i.title.includes('Widget A'));
    widget.stockSold = 2;
    widget.stockTotal = 5;
    const smaller = writeFile('merge-smaller-synthetic.csv', 'Name,Quantity,Condition\nWidget A,1,Near Mint\n');
    const res = await confirm(deps, smaller, { mode: 'REPLACE' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(widget.stockTotal).toBe(2);
    expect(widget.stockTotal).toBeGreaterThanOrEqual(widget.stockSold);
  });

  it('a sold item is never a merge target; a new item is created instead (acceptance 9)', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const f = file();
    await confirm(deps, f, { mode: 'ADD' });
    const sold = itemsOf(db).find((i) => i.title.includes('Widget A'));
    sold.status = 'SOLD';
    sold.stockSold = 3;
    const res = await confirm(deps, f, { mode: 'ADD', force: 'true' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(sold.stockTotal).toBe(3);
    expect(sold.status).toBe('SOLD');
    const widgetAs = itemsOf(db).filter((i) => i.title.includes('Widget A'));
    expect(widgetAs).toHaveLength(2);
    expect(widgetAs.filter((i) => i.status === 'AVAILABLE')).toHaveLength(1);
  });

  it('a deleted item and an item of another sale are never merge targets', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const f = file();
    await confirm(deps, f, { mode: 'ADD' });
    const first = itemsOf(db).find((i) => i.title.includes('Widget A'));
    const other = { ...first };
    first.deletedAt = new Date();
    db.addItem({ ...other, id: 'foreign', saleId: 'other_sale', organizerId: 'other_org', deletedAt: null, card: other.card });
    const res = await confirm(deps, f, { mode: 'ADD', force: 'true' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(first.stockTotal).toBe(3);
    expect(db.state.items.get('foreign').stockTotal).toBe(3);
    expect(itemsOf(db).filter((i) => i.saleId === SALE && !i.deletedAt && i.title.includes('Widget A'))).toHaveLength(1);
  });

  it('sums in-file duplicates into one item and merges onto the oldest available item', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const dup = writeFile('dups-synthetic.csv', 'Name,Quantity,Condition\nWidget C,2,Near Mint\nWidget C,3,Near Mint\n');
    const res = await confirm(deps, dup, { mode: 'ADD' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(res.done.summary.created).toBe(1);
    expect(res.done.summary.warnings.DUPLICATE_IN_FILE_MERGED).toBe(1);
    expect(stockOf(db, 'Widget C')).toBe(5);
  });

  it('an item that already has stockTotal null counts as one unit on ADD', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const f = writeFile('null-stock-synthetic.csv', 'Name,Quantity,Condition\nWidget D,2,Near Mint\n');
    await confirm(deps, f, { mode: 'ADD' });
    const item = itemsOf(db)[0];
    item.stockTotal = null;
    await confirm(deps, f, { mode: 'ADD', force: 'true' });
    expect(item.stockTotal).toBe(3);
  });

  it('a sku that belongs to a different card fails with SKU_CONFLICT and writes nothing', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const a = writeFile('sku-a-synthetic.csv', 'Name,Quantity,Condition,SKU\nWidget E,1,Near Mint,SKU-1\n');
    await confirm(deps, a, { mode: 'ADD' });
    const b = writeFile('sku-b-synthetic.csv', 'Name,Quantity,Condition,SKU\nWidget F,1,Near Mint,SKU-1\n');
    const res = await confirm(deps, b, { mode: 'ADD' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(res.events.filter((e) => e.type === 'rowError').map((e) => e.code)).toEqual(['SKU_CONFLICT']);
    expect(itemsOf(db)).toHaveLength(1);
  });
});

describe('confirm: catalog and decisions', () => {
  it('locks seller fields, leaves catalog fields unlocked and sets the dedup key from the card record service', async () => {
    const db = seedDb();
    const res = await confirm(makeDeps(db), path.join(FIX, 'moxfield-synthetic.csv'), {
      mode: 'ADD',
      conditionMapping: JSON.stringify({ 'good (lightly played)': 'LP' }),
    });
    if ('failure' in res) throw new Error(res.failure.code);
    const bolt = itemsOf(db).find((i) => i.title.includes('Lightning Bolt'));
    expect(bolt.card.catalogPrintingId).toBe('SCRYFALL:00000000-0000-4000-8000-000000000001');
    expect(bolt.card.game).toBe('MTG');
    expect(typeof bolt.card.dedupKey).toBe('string');
    expect(bolt.card.dedupKey).toBe(computeDedupKey(bolt.card as any));
    expect(bolt.card.lockedFields).toEqual(expect.arrayContaining(['conditionCode']));
    expect(bolt.card.lockedFields).not.toContain('name');
    expect(bolt.ebayCategoryId).toBeTruthy();
    expect(bolt.draftStatus).toBe('DRAFT');
    expect(bolt.embedding).toEqual([]);
  });

  it('imports another game with the file details and reports no catalog match (never errors)', async () => {
    const db = seedDb();
    const res = await confirm(makeDeps(db), path.join(FIX, 'generic-synthetic.tsv'), { mode: 'ADD', priceSource: 'FILE' });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(res.done.summary).toMatchObject({ created: 3, errors: 0, noCatalogMatch: 3 });
    const pika = itemsOf(db).find((i) => i.title.includes('Pikachu'));
    expect(pika.card.game).toBe('POKEMON');
    expect(pika.card.grader).toBe('PSA');
    expect(pika.card.grade).toBe('10');
    expect(pika.card.catalogPrintingId ?? null).toBeNull();
    expect(pika.price).toBe(199.99);
    expect(pika.sku).toBe('A-101');
    const yugi = itemsOf(db).find((i) => i.title.includes('Blue-Eyes'));
    expect(yugi.card.game).toBe('YUGIOH');
    expect(yugi.price).toBe(25);
    const other = itemsOf(db).find((i) => i.sku === 'A-102');
    expect(other.card.game).toBe('OTHER');
  });

  it('an ambiguous printing becomes a row error on confirm until the seller picks one', async () => {
    const twin = [
      printing({ id: 'SCRYFALL:aaaaaaaa-0000-4000-8000-000000000011', scryfallId: 'aaaaaaaa-0000-4000-8000-000000000011', name: 'Twin Card', setCode: 'abc', collectorNumber: '1', tcgplayerProductId: 11 }),
      printing({ id: 'SCRYFALL:aaaaaaaa-0000-4000-8000-000000000012', scryfallId: 'aaaaaaaa-0000-4000-8000-000000000012', name: 'Twin Card', setCode: 'abc', collectorNumber: '1', tcgplayerProductId: 12 }),
    ];
    const file = writeFile('twin-synthetic.csv', 'Name,Set code,Collector number,Quantity,Condition\nTwin Card,abc,1,1,Near Mint\n');
    const db = seedDb();
    const deps = makeDeps(db, { resolve: makeResolver(twin).resolve });
    const prev = await runPreview(deps, { filePath: file, fileName: 't.csv', saleId: SALE, organizerId: ORG, params: params({}, 'preview') });
    if (isApiFailure(prev)) throw new Error(prev.code);
    expect((prev.data as any).summary.review.AMBIGUOUS_PRINTING).toBe(1);
    expect((prev.data as any).reviewRows[0].candidates).toHaveLength(2);

    const blocked = await confirm(deps, file, { mode: 'ADD' });
    if ('failure' in blocked) throw new Error(blocked.failure.code);
    expect(blocked.events.filter((e) => e.type === 'rowError').map((e) => e.code)).toEqual(['AMBIGUOUS_PRINTING']);
    expect(itemsOf(db)).toHaveLength(0);

    const chosen = await confirm(deps, file, { mode: 'ADD', force: 'true', decisions: JSON.stringify({ 2: { printingId: twin[1].id } }) });
    if ('failure' in chosen) throw new Error(chosen.failure.code);
    expect(itemsOf(db)).toHaveLength(1);
    expect(itemsOf(db)[0].card.catalogPrintingId).toBe(twin[1].id);
  });

  it('a seller skip decision skips the row and counts it', async () => {
    const db = seedDb();
    const f = writeFile('skip-synthetic.csv', 'Name,Quantity,Condition\nWidget G,1,Near Mint\nWidget H,1,Near Mint\n');
    const res = await confirm(makeDeps(db), f, { mode: 'ADD', decisions: JSON.stringify({ 2: { skip: true } }) });
    if ('failure' in res) throw new Error(res.failure.code);
    expect(res.done.summary).toMatchObject({ created: 1, skipped: 1 });
    expect(itemsOf(db).map((i) => i.title.includes('Widget H'))).toEqual([true]);
  });

  it('rejects a quantity of zero, text quantity and an over-long row with row-level codes', async () => {
    const db = seedDb();
    const f = writeFile('bad-synthetic.csv', `Name,Quantity,Condition\nWidget I,0,Near Mint\nWidget J,abc,Near Mint\n${'x'.repeat(9000)},1,Near Mint\n`);
    const res = await confirm(makeDeps(db), f, { mode: 'ADD' });
    if ('failure' in res) throw new Error(res.failure.code);
    const codes = res.events.filter((e) => e.type === 'rowError').map((e) => e.code);
    expect(codes).toEqual(['BAD_QUANTITY', 'BAD_QUANTITY', 'ROW_TOO_LONG']);
    expect(itemsOf(db)).toHaveLength(0);
  });

  it('refuses when the database is close to its size limit (before any write)', async () => {
    const db = seedDb();
    const deps = makeDeps(db, { getDbSizeBytes: async () => 5000 * 1024 * 1024 });
    const f = writeFile('space-synthetic.csv', genericCsv(3));
    const res = await confirm(deps, f, { mode: 'ADD' });
    expect('failure' in res && res.failure.code).toBe('DB_SPACE_LOW');
    expect(db.state.transactions).toBe(0);
  });

  it('rejects a file over the row cap before any write (acceptance 2, service level)', async () => {
    const db = seedDb();
    const deps = makeDeps(db, { env: { CARD_INTAKE_MAX_ROWS: '50' } });
    const f = writeFile('toomany-synthetic.csv', genericCsv(51));
    const res = await confirm(deps, f, { mode: 'ADD' });
    expect('failure' in res && [res.failure.status, res.failure.code]).toEqual([413, 'TOO_MANY_ROWS']);
    expect(db.state.transactions).toBe(0);
    expect(db.state.batches.size).toBe(0);
  });
});
