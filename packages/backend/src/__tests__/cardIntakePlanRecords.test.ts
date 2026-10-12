/**
 * The planFile / planRecords split (ADR-138 section 3.2, acceptance AT-17). planFile must behave exactly as before:
 * same rows, same totals, same condition table, same errors. planRecords is the same engine over any record source.
 * The existing cardIntake*.test.ts suite is the wider regression net for the file path.
 */
import path from 'path';
import { detectImporter } from '../services/cardIntake/importers';
import { genericImporter } from '../services/cardIntake/importers/generic';
import { streamRecords } from '../services/cardIntake/parseSpreadsheet';
import type { StreamedRecord } from '../services/cardIntake/parseSpreadsheet';
import { planFile, planRecords } from '../services/cardIntake/planner';
import type { PlanOptions } from '../services/cardIntake/planner';
import type { ColumnMapping, PlannedRow, RowDecision } from '../services/cardIntake/types';
import { READY_STATE, makeResolver, printing } from './__fixtures__/intakeFakes';

const FIX = path.join(__dirname, '__fixtures__', 'cardIntake');

const CATALOG = [
  printing(),
  printing({
    id: 'SCRYFALL:00000000-0000-4000-8000-000000000002',
    scryfallId: '00000000-0000-4000-8000-000000000002',
    tcgplayerProductId: 1002,
    name: 'Sol Ring',
    collectorNumber: '270',
    finishes: ['NONFOIL', 'FOIL'],
  }),
];

async function* fromList(list: StreamedRecord[]): AsyncGenerator<StreamedRecord> {
  for (const r of list) yield r;
}

async function loadFile(file: string): Promise<{ records: StreamedRecord[]; options: Omit<PlanOptions, 'strict'> }> {
  let headers: string[] = [];
  const records: StreamedRecord[] = [];
  for await (const r of streamRecords(file, { onHeader: (h) => void (headers = h) })) records.push(r);
  const importer = detectImporter(headers);
  return {
    records,
    options: {
      importer,
      mapping: importer.mapColumns(headers),
      defaultGame: 'MTG',
      priceSource: 'FILE',
      defaultCondition: null,
      conditionChoices: new Map(),
      decisions: new Map(),
      organizerId: 'org_plan',
      catalog: READY_STATE,
      maxRows: 20000,
    },
  };
}

describe('AT-17 planFile output equals planRecords output over the same records', () => {
  it.each([
    ['manabox-synthetic.csv', false],
    ['manabox-synthetic.csv', true],
    ['generic-synthetic.tsv', false],
    ['generic-synthetic.tsv', true],
    ['moxfield-synthetic.csv', false],
    ['tcgplayer-seller-synthetic.csv', true],
  ] as const)('%s (strict: %s)', async (fixture, strict) => {
    const file = path.join(FIX, fixture);
    const { records, options } = await loadFile(file);
    expect(records.length).toBeGreaterThan(0);
    const opts: PlanOptions = { ...options, strict };

    const viaFile: PlannedRow[] = [];
    const resolverA = makeResolver(CATALOG);
    const fileResult = await planFile(file, opts, { resolve: resolverA.resolve }, (r) => {
      viaFile.push(r);
    });

    const viaRecords: PlannedRow[] = [];
    const resolverB = makeResolver(CATALOG);
    const recordsResult = await planRecords(fromList(records), opts, { resolve: resolverB.resolve }, (r) => {
      viaRecords.push(r);
    });

    expect(viaRecords).toEqual(viaFile);
    expect(recordsResult).toEqual(fileResult);
    expect(resolverB.calls).toEqual(resolverA.calls);
    expect(fileResult.rowsTotal).toBe(records.length);
  });
});

describe('planRecords over in-memory sources', () => {
  const mapping: ColumnMapping = { name: 'Name', setCode: 'Set code', collectorNumber: 'Number', quantity: 'Qty', condition: 'Cond' };
  const opts = (over: Partial<PlanOptions> = {}): PlanOptions => ({
    importer: genericImporter,
    mapping,
    defaultGame: 'MTG',
    priceSource: 'NONE',
    defaultCondition: null,
    conditionChoices: new Map(),
    strict: true,
    decisions: new Map(),
    organizerId: 'org_plan',
    catalog: READY_STATE,
    maxRows: 20000,
    ...over,
  });

  it('plans an empty source as zero rows', async () => {
    const rows: PlannedRow[] = [];
    const res = await planRecords(fromList([]), opts(), { resolve: makeResolver(CATALOG).resolve }, (r) => {
      rows.push(r);
    });
    expect(res.rowsTotal).toBe(0);
    expect(rows).toEqual([]);
  });

  it('plans records in order, in batches of at most 500 resolver refs, and numbers rows as given', async () => {
    const list: StreamedRecord[] = [];
    for (let i = 1; i <= 1200; i += 1) {
      list.push({ row: i * 2, tooLong: false, record: { Name: `Synthetic Card ${i}`, Qty: '1', Cond: 'NM' } });
    }
    const resolver = makeResolver(CATALOG);
    const seen: number[] = [];
    const res = await planRecords(fromList(list), opts(), { resolve: resolver.resolve }, (r) => {
      seen.push(r.row);
    });
    expect(res.rowsTotal).toBe(1200);
    expect(seen).toEqual(list.map((r) => r.row));
    expect(resolver.calls.map((c) => c.length)).toEqual([500, 500, 200]);
  });

  it('honors per-row decisions and skip exactly as the file path does', async () => {
    const list: StreamedRecord[] = [
      { row: 1, tooLong: false, record: { Name: 'Lightning Bolt', 'Set code': 'lea', Number: '161', Qty: '2', Cond: 'NM' } },
      { row: 2, tooLong: false, record: { Name: 'Sol Ring', Qty: '1', Cond: 'NM' } },
      { row: 3, tooLong: false, record: { Name: 'Skipped Card', Qty: '1', Cond: 'NM' } },
    ];
    const decisions = new Map<number, RowDecision>([
      [2, { finish: 'FOIL' }],
      [3, { skip: true }],
    ]);
    const rows: PlannedRow[] = [];
    await planRecords(fromList(list), opts({ decisions }), { resolve: makeResolver(CATALOG).resolve }, (r) => {
      rows.push(r);
    });
    expect(rows.map((r) => r.status)).toEqual(['OK', 'OK', 'SKIP']);
    expect(rows[0].card).toMatchObject({ cardName: 'Lightning Bolt', conditionCode: 'NM' });
    expect(rows[0].quantity).toBe(2);
    expect(rows[1].card).toMatchObject({ cardName: 'Sol Ring', finish: 'FOIL' });
  });

  it('lets an error thrown by the source propagate unchanged', async () => {
    async function* broken(): AsyncGenerator<StreamedRecord> {
      yield { row: 1, tooLong: false, record: { Name: 'Lightning Bolt' } };
      throw new Error('source failed');
    }
    await expect(planRecords(broken(), opts(), { resolve: makeResolver(CATALOG).resolve }, () => undefined)).rejects.toThrow('source failed');
  });

  it('planFile still rejects for a file that cannot be read', async () => {
    await expect(planFile(path.join(FIX, 'does-not-exist.csv'), opts(), { resolve: makeResolver(CATALOG).resolve }, () => undefined)).rejects.toBeDefined();
  });
});
