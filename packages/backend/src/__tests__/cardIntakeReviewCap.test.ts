/**
 * Card intake review list cap (follow-up to ADR-134 #642, batch B4): what really happens at confirm to rows that
 * needed a choice or had no catalog match, whether that depends on the capped preview list, and that a large file
 * does not strand the seller. Everything runs against in-memory fakes (no database, no network). Fixtures are synthetic.
 *
 * Findings these tests pin down (they were first run against the code as it was, then kept):
 *  (a) an ambiguous-printing row with no decision becomes row error AMBIGUOUS_PRINTING and is not written;
 *  (b) a finish-ambiguous row with no decision becomes row error UNKNOWN_FINISH and is not written;
 *  (c) a row with no catalog match is written with the file's own details and never needs a choice;
 *  (d) confirm never reads the preview, so none of (a) to (c) depends on whether the row was listed in the capped list;
 *  (e) sending the SAME file again does not finish the skipped rows (409 ALREADY_APPLIED); importing the errors file as
 *      a new file does, and does not add the rows imported in the first round a second time.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { executeConfirm, isApiFailure, parseIntakeParams, prepareConfirm, runPreview } from '../services/cardIntake/intakeService';
import type { ApiFailure, ConfirmDone, IntakeDeps, IntakeParams } from '../services/cardIntake/intakeService';
import { NO_CATALOG_SAMPLE_CAP, REVIEW_ROWS_CAP, getIntakeConfig } from '../services/cardIntake/config';
import { sha256OfFile } from '../services/cardIntake/parseSpreadsheet';
import { REVIEW_MESSAGES } from '../services/cardIntake/messages';
import type { PrintingDto, ResolveRef, ResolveResult } from '../services/cardCatalog/cardCatalogLookup';
import { READY_STATE, makeFakeIntakeDb, printing } from './__fixtures__/intakeFakes';

const SALE = 'sale_cap';
const ORG = 'org_cap';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardintake-cap-'));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const pid = (kind: 'a' | 'b' | 'd', n: number, variant: number) =>
  `SCRYFALL:${kind}${String(variant)}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Twin N has two printings (needs a printing choice); Duo N has one printing in two finishes; anything else has none. */
function twinPrintings(n: number): PrintingDto[] {
  return [1, 2].map((v) =>
    printing({
      id: pid('a', n, v),
      scryfallId: pid('a', n, v).slice('SCRYFALL:'.length),
      name: `Twin ${n}`,
      setCode: 'twn',
      collectorNumber: String(n),
      tcgplayerProductId: n * 10 + v,
      finishes: ['NONFOIL'],
    })
  );
}
function duoPrinting(n: number): PrintingDto {
  return printing({
    id: pid('d', n, 1),
    scryfallId: pid('d', n, 1).slice('SCRYFALL:'.length),
    name: `Duo ${n}`,
    setCode: 'duo',
    collectorNumber: String(n),
    tcgplayerProductId: 900000 + n,
    finishes: ['NONFOIL', 'FOIL'],
  });
}

function resolve(refs: ResolveRef[]): Promise<ResolveResult[]> {
  return Promise.resolve(
    refs.map((r) => {
      const name = r.name ?? '';
      const twin = /^Twin (\d+)$/.exec(name);
      if (twin) return { ref: r.ref, status: 'AMBIGUOUS', candidates: twinPrintings(Number(twin[1])), truncated: false } as ResolveResult;
      const duo = /^Duo (\d+)$/.exec(name);
      if (duo) return { ref: r.ref, status: 'EXACT', candidates: [duoPrinting(Number(duo[1]))], truncated: false } as ResolveResult;
      return { ref: r.ref, status: 'UNMATCHED', candidates: [], truncated: false } as ResolveResult;
    })
  );
}

function makeDeps(db: any): IntakeDeps {
  return { db, resolve, getCatalogState: async () => READY_STATE, getDbSizeBytes: async () => null, env: {} };
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

const HEADER = 'Name,Set code,Collector number,Quantity,Condition';
function csv(lines: string[]): string {
  return [HEADER, ...lines].join('\n') + '\n';
}
const twinLine = (n: number, qty = 1) => `Twin ${n},twn,${n},${qty},Near Mint`;
const duoLine = (n: number) => `Duo ${n},duo,${n},1,Near Mint`;
const looseLine = (n: number) => `Loose ${n},zzz,${n},2,Near Mint`;

async function preview(deps: IntakeDeps, file: string): Promise<any> {
  const out = await runPreview(deps, { filePath: file, fileName: path.basename(file), saleId: SALE, organizerId: ORG, params: params({}, 'preview') });
  if (isApiFailure(out)) throw new Error(`preview failed: ${out.code}`);
  return out.data;
}

type ConfirmResult = { failure: ApiFailure } | { done: ConfirmDone; events: any[] };
async function confirm(deps: IntakeDeps, filePath: string, body: Record<string, unknown>): Promise<ConfirmResult> {
  const sha = await sha256OfFile(filePath);
  const p = params({ fileSha256: sha, ...body });
  const prepared = await prepareConfirm(deps, { filePath, fileName: path.basename(filePath), saleId: SALE, organizerId: ORG, params: p });
  if (isApiFailure(prepared)) return { failure: prepared };
  const events: any[] = [];
  const done = await executeConfirm(deps, prepared, { emit: (e) => void events.push(e), shouldCancel: () => false });
  return { done, events };
}
function mustConfirm(r: ConfirmResult): { done: ConfirmDone; events: any[] } {
  if ('failure' in r) throw new Error(`confirm failed: ${r.failure.code}`);
  return r;
}

const seedDb = () => makeFakeIntakeDb({ sales: [{ id: SALE, organizerId: ORG, userId: 'user_cap' }] });
const itemsOf = (db: any) => Array.from(db.state.items.values()) as any[];
const rowErrors = (events: any[]) => events.filter((e) => e.type === 'rowError');

describe('what confirm does with rows that needed a choice or had no catalog match (no decisions at all)', () => {
  const file = () => writeFile('mixed-small.csv', csv([twinLine(1), duoLine(2), looseLine(3)]));

  it('preview classifies the three rows by reason', async () => {
    const d = await preview(makeDeps(seedDb()), file());
    expect(d.summary.review).toEqual({ AMBIGUOUS_PRINTING: 1, FINISH_AMBIGUOUS: 1, NO_CATALOG_MATCH: 1 });
  });

  it('(a) an ambiguous-printing row with no decision becomes AMBIGUOUS_PRINTING and is not written', async () => {
    const db = seedDb();
    const { events } = mustConfirm(await confirm(makeDeps(db), file(), { mode: 'ADD' }));
    const err = rowErrors(events).find((e) => e.row === 2);
    expect(err).toMatchObject({ code: 'AMBIGUOUS_PRINTING', field: 'printing' });
    expect(itemsOf(db).some((i) => String(i.title).includes('Twin 1'))).toBe(false);
  });

  it('(b) a finish-ambiguous row with no decision becomes UNKNOWN_FINISH and is not written', async () => {
    const db = seedDb();
    const { events } = mustConfirm(await confirm(makeDeps(db), file(), { mode: 'ADD' }));
    const err = rowErrors(events).find((e) => e.row === 3);
    expect(err).toMatchObject({ code: 'UNKNOWN_FINISH', field: 'finish' });
    expect(itemsOf(db).some((i) => String(i.title).includes('Duo 2'))).toBe(false);
  });

  it('(c) a no-catalog-match row is written with the details from the file and needs no choice', async () => {
    const db = seedDb();
    const { done, events } = mustConfirm(await confirm(makeDeps(db), file(), { mode: 'ADD' }));
    expect(rowErrors(events).map((e) => e.row)).toEqual([2, 3]);
    expect(done.summary).toMatchObject({ rowsTotal: 3, created: 1, errors: 2, noCatalogMatch: 1 });
    const items = itemsOf(db);
    expect(items).toHaveLength(1);
    expect(items[0].card.cardName).toBe('Loose 3');
    expect(items[0].card.setCode).toBe('zzz');
    expect(items[0].card.catalogPrintingId ?? null).toBeNull();
    expect(items[0].stockTotal).toBe(2);
  });
});

describe('confirm does not depend on the capped preview list (d)', () => {
  it('a no-catalog row far past the cap imports, an undecided ambiguous row far past the cap errors, either way', async () => {
    const lines: string[] = [];
    for (let i = 1; i <= REVIEW_ROWS_CAP + 50; i++) lines.push(twinLine(i));
    for (let i = 1; i <= 30; i++) lines.push(looseLine(i));
    const file = writeFile('past-cap.csv', csv(lines));
    const db = seedDb();
    const deps = makeDeps(db);
    const d = await preview(deps, file);
    // Whatever the preview chose to list, the confirm outcome below is the same.
    expect(d.reviewRows.length).toBeLessThanOrEqual(REVIEW_ROWS_CAP);

    // Decide only the first 500 ambiguous rows (rows 2 to 501). Rows 502 to 551 are not decided.
    const decisions: Record<string, unknown> = {};
    for (let i = 1; i <= REVIEW_ROWS_CAP; i++) decisions[String(i + 1)] = { printingId: twinPrintings(i)[1].id };
    const { done, events } = mustConfirm(await confirm(deps, file, { mode: 'ADD', decisions: JSON.stringify(decisions) }));
    expect(done.summary).toMatchObject({ created: REVIEW_ROWS_CAP + 30, errors: 50, noCatalogMatch: 30 });
    expect(new Set(rowErrors(events).map((e) => e.code))).toEqual(new Set(['AMBIGUOUS_PRINTING']));
    expect(rowErrors(events).map((e) => e.row)[0]).toBe(REVIEW_ROWS_CAP + 2);
    expect(itemsOf(db).filter((i) => String(i.card?.cardName).startsWith('Loose '))).toHaveLength(30);
  });

  it('a decision for a row the preview did not list is still applied (the server never checks the list)', async () => {
    const lines: string[] = [];
    for (let i = 1; i <= REVIEW_ROWS_CAP + 5; i++) lines.push(twinLine(i));
    const file = writeFile('unlisted-decision.csv', csv(lines));
    const db = seedDb();
    const last = REVIEW_ROWS_CAP + 5;
    const { done } = mustConfirm(await confirm(makeDeps(db), file, { mode: 'ADD', decisions: JSON.stringify({ [String(last + 1)]: { printingId: twinPrintings(last)[0].id } }) }));
    expect(done.summary.created).toBe(1);
    expect(itemsOf(db)[0].card.cardName).toBe(`Twin ${last}`);
  });
});

describe('preview: the review list holds only rows that need a choice', () => {
  it('no-catalog rows do not use the list: 600 of them leave it empty and are reported as a count plus a small sample', async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 600; i++) lines.push(looseLine(i));
    const d = await preview(makeDeps(seedDb()), writeFile('only-loose.csv', csv(lines)));
    expect(d.reviewRows).toEqual([]);
    expect(d.reviewTruncated).toBe(false);
    expect(d.summary.review.NO_CATALOG_MATCH).toBe(600);
    expect(d.summary.noCatalogMatch).toBe(600);
    expect(d.needsChoice).toMatchObject({ total: 0, listed: 0, notListed: 0, cap: REVIEW_ROWS_CAP });
    expect(d.noCatalog.total).toBe(600);
    expect(d.noCatalog.importsAnyway).toBe(true);
    expect(d.noCatalog.sampleCap).toBe(NO_CATALOG_SAMPLE_CAP);
    expect(d.noCatalog.sample).toHaveLength(NO_CATALOG_SAMPLE_CAP);
    expect(d.noCatalog.sample[0]).toMatchObject({ row: 2, reason: 'NO_CATALOG_MATCH', noCatalogMatch: true, name: 'Loose 1', message: REVIEW_MESSAGES.NO_CATALOG_MATCH });
    expect(d.noCatalog.sample.map((r: any) => r.row)).toEqual(Array.from({ length: NO_CATALOG_SAMPLE_CAP }, (_v, i) => i + 2));
  });

  it('500 no-catalog rows first no longer hide the ambiguous rows after them', async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 520; i++) lines.push(looseLine(i));
    for (let i = 1; i <= 40; i++) lines.push(twinLine(i));
    for (let i = 1; i <= 7; i++) lines.push(duoLine(i));
    const d = await preview(makeDeps(seedDb()), writeFile('loose-first.csv', csv(lines)));
    expect(d.reviewRows).toHaveLength(47);
    expect(d.reviewRows.filter((r: any) => r.reason === 'AMBIGUOUS_PRINTING')).toHaveLength(40);
    expect(d.reviewRows.filter((r: any) => r.reason === 'FINISH_AMBIGUOUS')).toHaveLength(7);
    expect(d.reviewRows.some((r: any) => r.reason === 'NO_CATALOG_MATCH')).toBe(false);
    expect(d.reviewTruncated).toBe(false);
    expect(d.needsChoice).toMatchObject({ total: 47, listed: 47, notListed: 0 });
    expect(d.needsChoice.byReason).toEqual({
      AMBIGUOUS_PRINTING: { total: 40, listed: 40, notListed: 0 },
      FINISH_AMBIGUOUS: { total: 7, listed: 7, notListed: 0 },
    });
    expect(d.noCatalog.total).toBe(520);
  });

  it('the cap applies only to rows that need a choice, and the counts say how many are not listed', async () => {
    const lines: string[] = [];
    for (let i = 1; i <= REVIEW_ROWS_CAP + 120; i++) lines.push(twinLine(i));
    for (let i = 1; i <= 30; i++) lines.push(duoLine(i));
    for (let i = 1; i <= 25; i++) lines.push(looseLine(i));
    const d = await preview(makeDeps(seedDb()), writeFile('over-cap.csv', csv(lines)));
    expect(d.reviewRows).toHaveLength(REVIEW_ROWS_CAP);
    expect(d.reviewTruncated).toBe(true);
    // The first 500 in file order are the first 500 twins, so every hidden row is a twin or a duo.
    expect(d.needsChoice).toEqual({
      total: REVIEW_ROWS_CAP + 120 + 30,
      listed: REVIEW_ROWS_CAP,
      notListed: 150,
      cap: REVIEW_ROWS_CAP,
      byReason: {
        AMBIGUOUS_PRINTING: { total: REVIEW_ROWS_CAP + 120, listed: REVIEW_ROWS_CAP, notListed: 120 },
        FINISH_AMBIGUOUS: { total: 30, listed: 0, notListed: 30 },
      },
    });
    expect(d.summary.review).toEqual({ AMBIGUOUS_PRINTING: REVIEW_ROWS_CAP + 120, FINISH_AMBIGUOUS: 30, NO_CATALOG_MATCH: 25 });
    expect(d.noCatalog.total).toBe(25);
    expect(d.noCatalog.sample).toHaveLength(20);
  });

  it('a small file lists every row and reports nothing as not listed', async () => {
    const d = await preview(makeDeps(seedDb()), writeFile('small.csv', csv([twinLine(1), duoLine(2), looseLine(3)])));
    expect(d.reviewRows.map((r: any) => r.reason)).toEqual(['AMBIGUOUS_PRINTING', 'FINISH_AMBIGUOUS']);
    expect(d.reviewTruncated).toBe(false);
    expect(d.needsChoice).toMatchObject({ total: 2, listed: 2, notListed: 0 });
    expect(d.noCatalog).toMatchObject({ total: 1, importsAnyway: true });
    expect(d.noCatalog.sample).toHaveLength(1);
  });
});

describe('finishing the rows that were not listed (e)', () => {
  // 620 rows that need a printing choice (120 more than the list can hold) plus 10 rows with no catalog match.
  const buildFile = () => {
    const lines: string[] = [];
    for (let i = 1; i <= 620; i++) lines.push(twinLine(i, (i % 3) + 1));
    for (let i = 1; i <= 10; i++) lines.push(looseLine(i));
    return writeFile('big-round.csv', csv(lines));
  };

  /** What the page does: header line plus every rowError csvLine, with a byte order mark in front. */
  const errorsFileFrom = (done: ConfirmDone, events: any[]) => {
    const lines = events.filter((e) => e.type === 'rowError').map((e) => e.csvLine as string);
    return writeFile('errors-round-1.csv', '﻿' + done.errorsCsvHeader + '\n' + lines.join('\n') + '\n');
  };

  it('sending the same file again does not finish the rows that were skipped', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const file = buildFile();
    const d = await preview(deps, file);
    const listed = (d.reviewRows as any[]).map((r) => r.row);
    expect(listed).toHaveLength(REVIEW_ROWS_CAP);

    const decisions: Record<string, unknown> = {};
    for (const r of d.reviewRows as any[]) decisions[String(r.row)] = { printingId: r.candidates[1].printingId };
    const first = mustConfirm(await confirm(deps, file, { mode: 'ADD', decisions: JSON.stringify(decisions) }));
    expect(first.done.summary).toMatchObject({ created: REVIEW_ROWS_CAP + 10, errors: 120 });

    const again = await confirm(deps, file, { mode: 'ADD', decisions: JSON.stringify(decisions) });
    expect('failure' in again && [again.failure.status, again.failure.code]).toEqual([409, 'ALREADY_APPLIED']);
    expect(itemsOf(db)).toHaveLength(REVIEW_ROWS_CAP + 10);
  });

  it('importing the errors file as a new file lists the remaining rows and adds nothing twice', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const file = buildFile();
    const d1 = await preview(deps, file);
    const decisions1: Record<string, unknown> = {};
    for (const r of d1.reviewRows as any[]) decisions1[String(r.row)] = { printingId: r.candidates[1].printingId };
    const first = mustConfirm(await confirm(deps, file, { mode: 'ADD', decisions: JSON.stringify(decisions1) }));
    expect(first.done.summary).toMatchObject({ created: REVIEW_ROWS_CAP + 10, errors: 120 });
    const stockAfterFirst = new Map(itemsOf(db).map((i) => [i.id, i.stockTotal]));

    // Round two: the errors file from round one is a new file (a different hash), so it gets its own ledger row.
    const errorsFile = errorsFileFrom(first.done, first.events);
    const d2 = await preview(deps, errorsFile);
    expect(d2.detectedFormat).toBe('generic');
    expect(d2.rowsTotal).toBe(120);
    expect(d2.needsChoice).toMatchObject({ total: 120, listed: 120, notListed: 0 });
    expect(d2.reviewTruncated).toBe(false);
    expect(d2.existingBatches.ADD).toBeNull();
    const names2 = (d2.reviewRows as any[]).map((r) => r.name);
    expect(names2[0]).toBe(`Twin ${REVIEW_ROWS_CAP + 1}`);
    expect(names2[119]).toBe('Twin 620');

    const decisions2: Record<string, unknown> = {};
    for (const r of d2.reviewRows as any[]) decisions2[String(r.row)] = { printingId: r.candidates[0].printingId };
    const second = mustConfirm(await confirm(deps, errorsFile, { mode: 'ADD', decisions: JSON.stringify(decisions2) }));
    expect(second.done.summary).toMatchObject({ rowsTotal: 120, created: 120, merged: 0, errors: 0, skipped: 0 });

    const items = itemsOf(db);
    expect(items).toHaveLength(620 + 10);
    // Nothing from round one was touched or doubled.
    for (const [id, stock] of stockAfterFirst) expect(db.state.items.get(id).stockTotal).toBe(stock);
    const twin = (n: number) => items.find((i) => i.card?.cardName === `Twin ${n}`);
    expect(twin(1).stockTotal).toBe(2);
    expect(twin(620).stockTotal).toBe((620 % 3) + 1);
    expect(new Set(items.map((i) => i.card?.cardName)).size).toBe(630);
    expect(db.state.batches.size).toBe(2);
  });

  it('skips the seller chose on purpose are not in the errors file', async () => {
    const db = seedDb();
    const deps = makeDeps(db);
    const file = writeFile('skips.csv', csv([twinLine(1), twinLine(2), looseLine(3)]));
    const decisions = { 2: { skip: true } };
    const r = mustConfirm(await confirm(deps, file, { mode: 'ADD', decisions: JSON.stringify(decisions) }));
    expect(r.done.summary).toMatchObject({ created: 1, skipped: 1, errors: 1 });
    expect(rowErrors(r.events).map((e) => e.row)).toEqual([3]);
  });
});
