/**
 * ADR-137 part A (roadmap #660): re-importing a TCGplayer seller export reconciles quantities with existing stock.
 * Three layers: the pure engine (three-way merge), the file reader, and the database service on an in-memory fake.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildGroups } from '../services/cardTcgplayer/groups';
import { FileRow, ReconcileOptions, planAbsent, planGroup, reconcile, totalsOf } from '../services/cardTcgplayer/reconcileEngine';
import { parseRow, parseTcgplayerFile } from '../services/cardTcgplayer/reconcileFile';
import {
  applyReconcile,
  createExport,
  getStatus,
  hasPendingExport,
  markExportUploaded,
  previewReconcile,
  registerCheck,
} from '../services/cardTcgplayer/syncService';
import { FakeItemRow, FakeSyncDb, fakeDeps, fakeItem, toSyncRow } from './__fixtures__/tcgplayerFakes';

const KEY = '1001|NM|N';
const OPTS: ReconcileOptions = { lastExportUploaded: false, firstSync: 'FLAG_ONLY' };

function fileRow(total: number, over: Partial<FileRow> = {}): FileRow {
  return { row: 2, productId: 1001, conditionCode: 'NM', foil: false, total, key: KEY, ...over };
}

function groupOf(...items: FakeItemRow[]) {
  return buildGroups(items.map(toSyncRow)).groups.get(KEY)!;
}

describe('planGroup: three-way merge', () => {
  it('removes what TCGplayer sold and leaves counter sales alone', () => {
    // 5 were on TCGplayer last time. 2 sold at the counter since (3 available). TCGplayer now shows 4 (1 sold there).
    const g = groupOf(fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 5 } }));
    const p = planGroup(g, fileRow(4), OPTS);
    expect(p.kind).toBe('DECREASE');
    expect(p.change).toBe(-1);
    expect(p.sells).toEqual([{ itemId: 'a', units: 1 }]);
    expect(p.availableAfter).toBe(2);
    // still owed to TCGplayer: the 2 counter sales. 2 available minus 4 on TCGplayer.
    expect(p.stillToSend).toBe(-2);
    expect(p.baselineWrites).toEqual([{ itemId: 'a', qty: 4 }]);
    expect(p.shortfall).toBe(0);
  });

  it('is a no-op when the file matches the baseline', () => {
    const g = groupOf(fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 5 } }));
    const p = planGroup(g, fileRow(5), OPTS);
    expect(p.kind).toBe('IN_SYNC');
    expect(p.sells).toEqual([]);
    expect(p.raise).toBeNull();
    expect(p.baselineWrites).toEqual([]);
  });

  it('is idempotent: after the baseline is stored, the same file changes nothing', () => {
    const items = [fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 5 } })];
    const first = planGroup(groupOf(...items), fileRow(4), OPTS);
    // apply by hand
    items[0].stockSold += first.sells[0].units;
    items[0].card!.tcgplayerQty = first.baselineWrites![0].qty;
    const second = planGroup(groupOf(...items), fileRow(4), OPTS);
    expect(second.kind).toBe('IN_SYNC');
    expect(second.change).toBe(0);
    expect(second.baselineWrites).toEqual([]);
  });

  it('quantity zero in the file removes all available units', () => {
    const g = groupOf(fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 2 } }));
    const p = planGroup(g, fileRow(0), OPTS);
    expect(p.kind).toBe('DECREASE');
    expect(p.sells).toEqual([{ itemId: 'a', units: 2 }]);
    expect(p.availableAfter).toBe(0);
    expect(p.baselineWrites).toEqual([{ itemId: 'a', qty: 0 }]);
  });

  it('reports a shortfall when TCGplayer sold more than FindA.Sale has left (a possible double sale)', () => {
    // 2 were on TCGplayer, 1 sold at the counter (1 available), TCGplayer now shows 0: it sold 2.
    const g = groupOf(fakeItem('a', { stockTotal: 1, card: { tcgplayerQty: 2 } }));
    const p = planGroup(g, fileRow(0), OPTS);
    expect(p.change).toBe(-2);
    expect(p.sells).toEqual([{ itemId: 'a', units: 1 }]);
    expect(p.shortfall).toBe(1);
    expect(p.availableAfter).toBe(0);
  });

  it('takes units from the oldest item first and spreads over several items', () => {
    const g = groupOf(
      fakeItem('old', { stockTotal: 2, card: { tcgplayerQty: 3 } }),
      fakeItem('new', { stockTotal: 4, card: { tcgplayerQty: 0 } })
    );
    const p = planGroup(g, fileRow(0), OPTS);
    expect(p.sells).toEqual([
      { itemId: 'old', units: 2 },
      { itemId: 'new', units: 1 },
    ]);
  });

  it('raises the oldest AVAILABLE item when TCGplayer shows more', () => {
    const g = groupOf(
      fakeItem('sold', { status: 'SOLD', stockTotal: 1, stockSold: 1, card: { tcgplayerQty: 1 } }),
      fakeItem('open', { stockTotal: 2, card: { tcgplayerQty: 0 } })
    );
    const p = planGroup(g, fileRow(4), OPTS);
    expect(p.kind).toBe('INCREASE');
    expect(p.raise).toEqual({ itemId: 'open', units: 3 });
    expect(p.availableAfter).toBe(5);
  });

  it('does not reopen a sold item: a card with no available item needs the regular import', () => {
    const g = groupOf(fakeItem('sold', { status: 'SOLD', stockTotal: 1, stockSold: 1, card: { tcgplayerQty: 0 } }));
    const p = planGroup(g, fileRow(3), OPTS);
    expect(p.kind).toBe('NEEDS_NEW_ITEM');
    expect(p.raise).toBeNull();
    expect(p.baselineWrites).toBeNull();
  });

  it('stores the quantity on the oldest item and zero on the others', () => {
    const g = groupOf(
      fakeItem('a', { stockTotal: 1, card: { tcgplayerQty: 1 } }),
      fakeItem('b', { stockTotal: 1, card: { tcgplayerQty: 1 } })
    );
    const p = planGroup(g, fileRow(2), OPTS);
    expect(p.kind).toBe('IN_SYNC');
    expect(p.baselineWrites).toEqual([
      { itemId: 'a', qty: 2 },
      { itemId: 'b', qty: 0 },
    ]);
    // already stored that way: nothing to write
    const stored = groupOf(
      fakeItem('a', { stockTotal: 1, card: { tcgplayerQty: 2 } }),
      fakeItem('b', { stockTotal: 1, card: { tcgplayerQty: 0 } })
    );
    expect(planGroup(stored, fileRow(2), OPTS).baselineWrites).toEqual([]);
  });

  describe('a card never synced before', () => {
    it('FLAG_ONLY keeps FindA.Sale stock and shows the difference as still to send', () => {
      const g = groupOf(fakeItem('a', { stockTotal: 3 }));
      const p = planGroup(g, fileRow(5), OPTS);
      expect(p.firstSync).toBe(true);
      expect(p.kind).toBe('IN_SYNC');
      expect(p.change).toBe(0);
      expect(p.baselineWrites).toEqual([{ itemId: 'a', qty: 5 }]);
      expect(p.stillToSend).toBe(-2);
    });

    it('ADOPT_TCGPLAYER takes the TCGplayer number', () => {
      const g = groupOf(fakeItem('a', { stockTotal: 3 }));
      const up = planGroup(g, fileRow(5), { ...OPTS, firstSync: 'ADOPT_TCGPLAYER' });
      expect(up.kind).toBe('INCREASE');
      expect(up.raise).toEqual({ itemId: 'a', units: 2 });
      expect(up.stillToSend).toBe(0);
      const down = planGroup(g, fileRow(1), { ...OPTS, firstSync: 'ADOPT_TCGPLAYER' });
      expect(down.kind).toBe('DECREASE');
      expect(down.sells).toEqual([{ itemId: 'a', units: 2 }]);
    });
  });

  describe('an export that was uploaded but not marked uploaded', () => {
    // Baseline 5. The export lowered TCGplayer to 3 (pending 3) after 2 counter sales; FindA.Sale has 3.
    const items = () => [fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 5, tcgplayerPendingQty: 3 } })];

    it('answer yes: the pending quantity is the baseline, so nothing is counted twice', () => {
      const p = planGroup(groupOf(...items()), fileRow(3), { ...OPTS, lastExportUploaded: true });
      expect(p.kind).toBe('IN_SYNC');
      expect(p.change).toBe(0);
    });

    it('answer yes with one more sold on TCGplayer: only that one is removed', () => {
      const p = planGroup(groupOf(...items()), fileRow(2), { ...OPTS, lastExportUploaded: true });
      expect(p.change).toBe(-1);
      expect(p.availableAfter).toBe(2);
    });

    it('answer no: the stored baseline is used', () => {
      const p = planGroup(groupOf(...items()), fileRow(5), OPTS);
      expect(p.kind).toBe('IN_SYNC');
    });

    it('a card that only has a pending quantity (listed by an uploaded export) is known, not first sync', () => {
      const g = groupOf(fakeItem('a', { stockTotal: 2, card: { tcgplayerPendingQty: 2 } }));
      const p = planGroup(g, fileRow(2), { ...OPTS, lastExportUploaded: true });
      expect(p.firstSync).toBe(false);
      expect(p.change).toBe(0);
      expect(p.baselineWrites).toEqual([{ itemId: 'a', qty: 2 }]);
    });
  });
});

describe('reconcile (whole file)', () => {
  it('matches condition and foil separately, lists cards missing here, cards missing in the file and duplicates', () => {
    const { groups } = buildGroups(
      [
        fakeItem('nm', { stockTotal: 2, card: { tcgplayerQty: 2 } }),
        fakeItem('foil', { stockTotal: 1, card: { tcgplayerQty: 1, finish: 'FOIL' } }),
        fakeItem('lp', { stockTotal: 1, card: { tcgplayerQty: 1, conditionCode: 'LP' } }),
        fakeItem('gone', { stockTotal: 1, card: { tcgplayerQty: 1, tcgplayerProductId: 7 } }),
      ].map(toSyncRow)
    );
    const rows: FileRow[] = [
      fileRow(1, { row: 2 }), // NM nonfoil: 2 -> 1
      fileRow(1, { row: 3, foil: true, key: '1001|NM|F' }),
      fileRow(5, { row: 4, productId: 99, key: '99|NM|N' }), // not in FindA.Sale
      fileRow(1, { row: 5, conditionCode: 'LP', key: '1001|LP|N' }),
      fileRow(1, { row: 6, conditionCode: 'HP', key: '1001|HP|N' }),
      fileRow(2, { row: 7, conditionCode: 'HP', key: '1001|HP|N' }), // duplicate key
    ];
    const plan = reconcile(groups, rows, OPTS);
    expect(plan.plans.map((p) => p.key)).toEqual(['1001|LP|N', '1001|NM|F', '1001|NM|N']);
    expect(plan.plans.find((p) => p.key === KEY)!.kind).toBe('DECREASE');
    expect(plan.notInFindasale.map((r) => r.productId)).toEqual([99]);
    expect(plan.duplicates).toEqual([{ key: '1001|HP|N', rows: [6, 7] }]);
    expect(plan.absent.map((a) => a.key)).toEqual(['7|NM|N']);
    expect(plan.absent[0].listedButMissing).toBe(true);
    const t = totalsOf(plan);
    expect(t).toMatchObject({ decreased: 1, inSync: 2, unitsRemoved: 1, notInFindasale: 1, listedButMissing: 1, duplicateKeys: 1 });
  });

  it('a card absent from the file keeps its baseline unless an uploaded export is waiting', () => {
    const g = groupOf(fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 5, tcgplayerPendingQty: 2 } }));
    expect(planAbsent(g, OPTS).baselineWrites).toEqual([]);
    expect(planAbsent(g, { ...OPTS, lastExportUploaded: true }).baselineWrites).toEqual([{ itemId: 'a', qty: 2 }]);
  });
});

describe('parseRow and parseTcgplayerFile', () => {
  it('reads id, quantity (zero allowed) and condition with a foil marker', () => {
    const ok = parseRow(2, { tcgplayerProductId: '12345', quantity: '0', condition: 'Lightly Played Foil' });
    expect(ok).toEqual({ ok: true, value: { row: 2, productId: 12345, conditionCode: 'LP', foil: true, total: 0, key: '12345|LP|F' } });
    const dec = parseRow(3, { tcgplayerProductId: '9', quantity: '4.0', condition: 'Near Mint' });
    expect(dec.ok && dec.value.total).toBe(4);
  });

  it.each([
    [{ tcgplayerProductId: '', quantity: '1', condition: 'Near Mint' }, 'BAD_TCGPLAYER_ID'],
    [{ tcgplayerProductId: 'abc', quantity: '1', condition: 'Near Mint' }, 'BAD_TCGPLAYER_ID'],
    [{ tcgplayerProductId: '0', quantity: '1', condition: 'Near Mint' }, 'BAD_TCGPLAYER_ID'],
    [{ tcgplayerProductId: '5', quantity: '', condition: 'Near Mint' }, 'BAD_QUANTITY'],
    [{ tcgplayerProductId: '5', quantity: '-1', condition: 'Near Mint' }, 'BAD_QUANTITY'],
    [{ tcgplayerProductId: '5', quantity: '1.5', condition: 'Near Mint' }, 'BAD_QUANTITY'],
    [{ tcgplayerProductId: '5', quantity: '10001', condition: 'Near Mint' }, 'BAD_QUANTITY'],
    [{ tcgplayerProductId: '5', quantity: '1', condition: 'Pristine' }, 'BAD_CONDITION'],
  ])('rejects %j as %s', (src, code) => {
    const r = parseRow(4, src);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem.code).toBe(code);
  });

  it('a blank condition is a card with no condition, not an error', () => {
    const r = parseRow(2, { tcgplayerProductId: '5', quantity: '1', condition: '' });
    expect(r.ok && r.value.key).toBe('5||N');
  });

  describe('file', () => {
    let dir: string;
    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-reconcile-'));
    });
    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const write = (name: string, text: string) => {
      const p = path.join(dir, name);
      fs.writeFileSync(p, text, 'utf8');
      return p;
    };
    const HEAD =
      'TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price';

    it('reads a TCGplayer export (BOM, quoted names, foil, zero quantity) and collects problems', async () => {
      const text =
        '﻿' + HEAD + '\n' +
        '1001,Magic,Alpha,"Lightning Bolt, the Burn",,161,Common,Near Mint,1.00,,,,3,0,1.25\n' +
        '1001,Magic,Alpha,Lightning Bolt,,161,Common,Near Mint Foil,1.00,,,,0,0,1.25\n' +
        'abc,Magic,Alpha,Bad,,1,Common,Near Mint,1.00,,,,1,0,1\n' +
        '1002,Magic,Alpha,Bad Qty,,1,Common,Near Mint,1.00,,,,x,0,1\n';
      const parsed = await parseTcgplayerFile(write('ok.csv', text), 100);
      expect(parsed.rowsTotal).toBe(4);
      expect(parsed.rows.map((r) => [r.key, r.total])).toEqual([
        ['1001|NM|N', 3],
        ['1001|NM|F', 0],
      ]);
      expect(parsed.problemCount).toBe(2);
      expect(parsed.problems.map((p) => [p.row, p.code])).toEqual([
        [4, 'BAD_TCGPLAYER_ID'],
        [5, 'BAD_QUANTITY'],
      ]);
    });

    it('refuses a file that is not a TCGplayer seller export', async () => {
      await expect(parseTcgplayerFile(write('other.csv', 'Name,Qty\nBolt,1\n'), 100)).rejects.toMatchObject({ name: 'SyncFileError' });
      await expect(parseTcgplayerFile(write('noqty.csv', 'TCGplayer Id,Condition\n1,Near Mint\n'), 100)).rejects.toMatchObject({ name: 'SyncFileError' });
    });
  });
});

describe('syncService on an in-memory database', () => {
  function seed() {
    return new FakeSyncDb([
      fakeItem('a', { stockTotal: 5, card: { tcgplayerQty: 5 } }),
      fakeItem('b', { stockTotal: 2, card: { tcgplayerProductId: 2002, cardName: 'Counterspell', tcgplayerQty: 2 } }),
      // not touched: another sale, no card, graded
      fakeItem('other-sale', { saleId: 'sale-2', stockTotal: 5, card: { tcgplayerQty: 5 } }),
      fakeItem('plain', { card: null }),
      fakeItem('slab', { card: { grader: 'PSA' } }),
    ]);
  }

  const fileOf = (rows: FileRow[]) => ({ rows, problems: [], problemCount: 0, rowsTotal: rows.length });

  it('preview writes nothing', async () => {
    const db = seed();
    const before = db.snapshot();
    const report = await previewReconcile(db, 'sale-1', fileOf([fileRow(3)]), OPTS);
    expect(db.snapshot()).toBe(before);
    expect(report.applied).toBe(false);
    expect(report.totals.decreased).toBe(1);
    expect(report.changes[0]).toMatchObject({ kind: 'DECREASE', fileTotal: 3, available: 5, availableAfter: 3, change: -2 });
  });

  it('apply removes what TCGplayer sold through the stock call, ends the sold-out item and reports it for propagation', async () => {
    const db = seed();
    const sold: Array<{ itemId: string; fullySoldOut: boolean; remainingStock: number }> = [];
    const deps = fakeDeps(db, sold);
    const report = await applyReconcile(
      db,
      'sale-1',
      fileOf([fileRow(3), fileRow(0, { row: 3, productId: 2002, key: '2002|NM|N' })]),
      OPTS,
      deps
    );
    expect(report.applied).toBe(true);
    expect(db.find('a')).toMatchObject({ stockSold: 2, status: 'AVAILABLE' });
    expect(db.find('b')).toMatchObject({ stockSold: 2, status: 'SOLD' });
    expect(db.card('a').tcgplayerQty).toBe(3);
    expect(db.card('b').tcgplayerQty).toBe(0);
    expect(sold).toEqual([
      { itemId: 'a', fullySoldOut: false, remainingStock: 3 },
      { itemId: 'b', fullySoldOut: true, remainingStock: 0 },
    ]);
    // not touched
    expect(db.find('other-sale').stockSold).toBe(0);
    expect(db.card('other-sale').tcgplayerQty).toBe(5);
    expect(db.find('slab').stockSold).toBe(0);
  });

  it('running the same file twice changes nothing the second time', async () => {
    const db = seed();
    const sold: any[] = [];
    const deps = fakeDeps(db, sold);
    await applyReconcile(db, 'sale-1', fileOf([fileRow(3)]), OPTS, deps);
    const after = db.snapshot();
    sold.length = 0;
    const again = await applyReconcile(db, 'sale-1', fileOf([fileRow(3)]), OPTS, deps);
    expect(db.snapshot()).toBe(after);
    expect(sold).toEqual([]);
    expect(again.totals.decreased).toBe(0);
  });

  it('a counter sale between export and re-import is kept: it is pending for the next export', async () => {
    const db = seed();
    const deps = fakeDeps(db);
    // counter sold 2 of "a" (available 3). TCGplayer still shows 5.
    await deps.sellUnits('a', 2, db);
    const report = await applyReconcile(db, 'sale-1', fileOf([fileRow(5)]), OPTS, deps);
    expect(report.totals.decreased).toBe(0);
    expect(db.find('a').stockSold).toBe(2);
    const exportResult = await createExport(db, 'sale-1', {}, deps.now());
    expect(exportResult.plan.rows).toHaveLength(1);
    expect(exportResult.plan.rows[0]).toMatchObject({ key: KEY, delta: -2 });
  });

  it('reports a shortfall when the stock call says fewer units remain than planned, and still stores the baseline', async () => {
    const db = seed();
    const deps = fakeDeps(db);
    const real = deps.sellUnits;
    deps.sellUnits = async (itemId, units, tx) => {
      // a counter sale slipped in: only 1 unit left by the time we sell
      db.find(itemId).stockSold = (db.find(itemId).stockTotal ?? 1) - 1;
      return real(itemId, units, tx);
    };
    const report = await applyReconcile(db, 'sale-1', fileOf([fileRow(2)]), OPTS, deps);
    // 3 units were to be removed, none could be: all 3 are reported as a shortfall
    expect(report.changes[0].shortfall).toBe(3);
    expect(report.totals.shortfallUnits).toBe(3);
    expect(db.card('a').tcgplayerQty).toBe(2);
  });

  it('rolls the card back and propagates nothing when a write fails', async () => {
    const db = seed();
    const sold: any[] = [];
    const deps = fakeDeps(db, sold);
    const realUpdate = db.itemCard.update;
    db.itemCard.update = async () => {
      throw new Error('db down');
    };
    const before = db.snapshot();
    await expect(applyReconcile(db, 'sale-1', fileOf([fileRow(3)]), OPTS, deps)).rejects.toThrow('db down');
    expect(db.snapshot()).toBe(before);
    expect(sold).toEqual([]);
    db.itemCard.update = realUpdate;
  });

  it('raises the stock total when TCGplayer shows more, and leaves a card with no available item for the regular import', async () => {
    const db = new FakeSyncDb([
      fakeItem('open', { stockTotal: 1, card: { tcgplayerQty: 1 } }),
      fakeItem('sold', { status: 'SOLD', stockTotal: 1, stockSold: 1, card: { tcgplayerProductId: 2002, tcgplayerQty: 0 } }),
    ]);
    const report = await applyReconcile(
      db,
      'sale-1',
      fileOf([fileRow(4), fileRow(2, { row: 3, productId: 2002, key: '2002|NM|N' })]),
      OPTS,
      fakeDeps(db)
    );
    expect(db.find('open').stockTotal).toBe(4);
    expect(db.card('open').tcgplayerQty).toBe(4);
    expect(db.find('sold')).toMatchObject({ status: 'SOLD', stockTotal: 1 });
    expect(db.card('sold').tcgplayerQty).toBe(0);
    expect(report.totals).toMatchObject({ increased: 1, unitsAdded: 3, needsNewItem: 1 });
  });

  it('first sync stores baselines in batches without changing stock', async () => {
    const items: FakeItemRow[] = [];
    for (let i = 0; i < 30; i++) items.push(fakeItem(`i${String(i).padStart(2, '0')}`, { stockTotal: 2, card: { tcgplayerProductId: 5000 + i } }));
    const db = new FakeSyncDb(items);
    const rows = items.map((it, i) => fileRow(2, { row: i + 2, productId: 5000 + i, key: `${5000 + i}|NM|N` }));
    const report = await applyReconcile(db, 'sale-1', fileOf(rows), OPTS, fakeDeps(db));
    expect(report.totals.firstSyncCards).toBe(30);
    expect(items.every((it) => it.stockSold === 0 && it.card!.tcgplayerQty === 2)).toBe(true);
    expect(db.transactions).toBe(1);
  });

  it('clears the waiting export when an uploaded export is reconciled', async () => {
    const db = seed();
    const deps = fakeDeps(db);
    await deps.sellUnits('a', 2, db);
    await createExport(db, 'sale-1', {}, deps.now());
    expect(await hasPendingExport(db, 'sale-1')).toBe(true);
    // TCGplayer now shows 3 (the export removed 2), answer: uploaded
    await applyReconcile(db, 'sale-1', fileOf([fileRow(3)]), { lastExportUploaded: true, firstSync: 'FLAG_ONLY' }, deps);
    expect(await hasPendingExport(db, 'sale-1')).toBe(false);
    expect(db.card('a').tcgplayerQty).toBe(3);
    expect(db.find('a').stockSold).toBe(2);
  });
});

describe('export bookkeeping and the whole round trip', () => {
  it('export saves what each item will hold, mark uploaded moves the baseline, and the next export is empty', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 5, card: { tcgplayerQty: 5 } })]);
    const deps = fakeDeps(db);
    await deps.sellUnits('a', 2, db);

    const first = await createExport(db, 'sale-1', {}, deps.now());
    expect(first.plan.rows).toHaveLength(1);
    expect(db.card('a').tcgplayerPendingQty).toBe(3);
    expect(db.card('a').tcgplayerQty).toBe(5);
    expect((await getStatus(db, 'sale-1')).exportWaiting).toBe(true);

    expect(await markExportUploaded(db, 'sale-1', deps.now())).toBe(1);
    expect(db.card('a').tcgplayerQty).toBe(3);
    expect(db.card('a').tcgplayerPendingQty).toBeNull();

    const status = await getStatus(db, 'sale-1');
    expect(status.exportWaiting).toBe(false);
    expect(status.waitingToSendCount).toBe(0);
    const second = await createExport(db, 'sale-1', {}, deps.now());
    expect(second.plan.rows).toHaveLength(0);
    expect(await markExportUploaded(db, 'sale-1', deps.now())).toBe(0);
  });

  it('a new export replaces the pending quantities of the earlier one', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 5, card: { tcgplayerQty: 5 } })]);
    const deps = fakeDeps(db);
    await deps.sellUnits('a', 1, db);
    await createExport(db, 'sale-1', {}, deps.now());
    expect(db.card('a').tcgplayerPendingQty).toBe(4);
    await deps.sellUnits('a', 1, db);
    await createExport(db, 'sale-1', {}, deps.now());
    expect(db.card('a').tcgplayerPendingQty).toBe(3);
  });

  it('an export with no rows leaves an earlier waiting export alone', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 5, card: { tcgplayerQty: 5, tcgplayerPendingQty: 4 } })]);
    const empty = await createExport(db, 'sale-1', {}, new Date());
    expect(empty.plan.rows).toHaveLength(0);
    expect(db.card('a').tcgplayerPendingQty).toBe(4);
  });

  it('status lists cards waiting, counts cards not on TCGplayer and skips', async () => {
    const db = new FakeSyncDb([
      fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 3 } }),
      fakeItem('new', { stockTotal: 1, card: { tcgplayerProductId: 77 } }),
      fakeItem('slab', { card: { grader: 'BGS' } }),
    ]);
    const s = await getStatus(db, 'sale-1');
    expect(s).toMatchObject({ cardsTracked: 2, listedOnTcgplayer: 1, notOnTcgplayer: 1, waitingToSendCount: 1 });
    expect(s.waitingToSend[0]).toMatchObject({ available: 2, onTcgplayer: 3, toSend: -1, condition: 'Near Mint' });
    expect(s.skipped.graded).toBe(1);
  });
});

describe('registerCheck (the counter warning)', () => {
  it('says which items are also listed on TCGplayer', async () => {
    const db = new FakeSyncDb([
      fakeItem('listed', { stockTotal: 3, card: { tcgplayerQty: 3 } }),
      fakeItem('twin', { stockTotal: 1, card: { tcgplayerQty: 0 } }), // same card, baseline 0, still counts as the card TCGplayer holds
      fakeItem('never', { card: { tcgplayerProductId: 55 } }),
      fakeItem('zero', { card: { tcgplayerProductId: 56, tcgplayerQty: 0 } }),
      fakeItem('plain', { card: null }),
      fakeItem('elsewhere', { saleId: 'sale-2', card: { tcgplayerQty: 4 } }),
    ]);
    const rows = await registerCheck(db, 'sale-1', ['listed', 'twin', 'never', 'zero', 'plain', 'elsewhere', 'missing', 'listed']);
    const by = Object.fromEntries(rows.map((r) => [r.itemId, r]));
    expect(rows).toHaveLength(7); // duplicates collapsed
    expect(by.listed).toMatchObject({ onTcgplayer: true, tcgplayerQty: 3, available: 4 });
    expect(by.twin).toMatchObject({ onTcgplayer: true });
    expect(by.never.onTcgplayer).toBe(false);
    expect(by.zero.onTcgplayer).toBe(false);
    expect(by.plain.onTcgplayer).toBe(false);
    expect(by.elsewhere.onTcgplayer).toBe(false);
    expect(by.missing.onTcgplayer).toBe(false);
  });

  it('answers an empty list for no ids and ignores overlong ids', async () => {
    const db = new FakeSyncDb([]);
    expect(await registerCheck(db, 'sale-1', [])).toEqual([]);
    expect(await registerCheck(db, 'sale-1', ['x'.repeat(65)])).toEqual([]);
  });

  it('after a counter sale of a listed card the sale record shows it waiting to be sent', async () => {
    const db = new FakeSyncDb([fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 2 } })]);
    const deps = fakeDeps(db);
    expect((await registerCheck(db, 'sale-1', ['a']))[0].onTcgplayer).toBe(true);
    await deps.sellUnits('a', 1, db);
    const status = await getStatus(db, 'sale-1');
    expect(status.waitingToSend.map((l) => [l.available, l.onTcgplayer, l.toSend])).toEqual([[1, 2, -1]]);
  });
});
