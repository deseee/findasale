/**
 * ADR-136 Addendum C and ADR-137 (roadmap #659, #660): a bulk lot is never part of the TCGplayer round trip. The export
 * leaves it out, the reconcile can never match a file row to it (so TCGplayer can never sell cards from a lot or add
 * cards to one), and the two stock writes refuse a lot as a second line of defense. Same fakes as the other TCGplayer
 * tests. No network, no real database.
 */
import { buildGroups } from '../services/cardTcgplayer/groups';
import { FileRow, ReconcileOptions } from '../services/cardTcgplayer/reconcileEngine';
import { TCGPLAYER_LOT_ERROR, assertNotBulkLot } from '../services/cardTcgplayer/lotGuard';
import { NOTES, allTcgplayerMessages } from '../services/cardTcgplayer/messages';
import { applyReconcile, createExport, getStatus, previewReconcile, registerCheck } from '../services/cardTcgplayer/syncService';
import { FakeSyncDb, fakeDeps, fakeItem, toSyncRow } from './__fixtures__/tcgplayerFakes';

const OPTS: ReconcileOptions = { lastExportUploaded: false, firstSync: 'FLAG_ONLY' };
const fileOf = (rows: FileRow[]) => ({ rows, problems: [], problemCount: 0, rowsTotal: rows.length });
const fileRow = (total: number, over: Partial<FileRow> = {}): FileRow => ({ row: 2, productId: 1001, conditionCode: 'NM', foil: false, total, key: '1001|NM|N', ...over });

/** A lot that, by mistake or by a future import, carries a card row with a TCGplayer Id (the worst case). */
function lotWithCard(id: string, over: Record<string, unknown> = {}) {
  const row: any = fakeItem(id, { stockTotal: 5000, card: { tcgplayerProductId: 1001, tcgplayerQty: 5000 } });
  row.bulkLot = { itemId: id };
  return Object.assign(row, over);
}

describe('buildGroups never groups a lot', () => {
  it('drops a lot even when it carries a TCGplayer Id, counts it, and keeps ordinary cards', () => {
    const { groups, skipped } = buildGroups([toSyncRow(lotWithCard('lot1')), toSyncRow(fakeItem('single', { card: { tcgplayerProductId: 1001 } }))]);
    expect(groups.size).toBe(1);
    expect(groups.get('1001|NM|N')!.units.map((u) => u.itemId)).toEqual(['single']);
    expect(skipped).toEqual({ noTcgplayerId: 0, graded: 0, notACard: 0, bulkLots: 1 });
  });

  it('adds no bulkLots key when there is no lot (existing shape unchanged)', () => {
    expect(buildGroups([toSyncRow(fakeItem('a'))]).skipped).toEqual({ noTcgplayerId: 0, graded: 0, notACard: 0 });
  });
});

describe('export', () => {
  it('a lot with a TCGplayer Id is not in the update file and its quantity is not remembered as pending', async () => {
    const db = new FakeSyncDb([lotWithCard('lot1'), fakeItem('single', { stockTotal: 3, card: { tcgplayerProductId: 2002, cardName: 'Counterspell', tcgplayerQty: 1 } })]);
    const result = await createExport(db, 'sale-1', {}, new Date('2026-10-05T12:00:00Z'));
    expect(result.plan.rows.map((r) => r.productId)).toEqual([2002]);
    expect(result.plan.csv).not.toContain('1001');
    expect(result.skipped.bulkLots).toBe(1);
    expect(db.card('lot1').tcgplayerPendingQty).toBeNull();
  });

  it('even a sale that is only a lot produces an empty file', async () => {
    const db = new FakeSyncDb([lotWithCard('lot1')]);
    const result = await createExport(db, 'sale-1', { includeNew: true }, new Date('2026-10-05T12:00:00Z'));
    expect(result.plan.rows).toEqual([]);
  });
});

describe('reconcile can never match a lot', () => {
  const NOT_TOUCHED = { stockSold: 0 };

  it('preview: a file row for the lot cards is reported as a card to add with the regular import, never matched', async () => {
    const db = new FakeSyncDb([lotWithCard('lot1', { stockSold: 0 })]);
    const report = await previewReconcile(db, 'sale-1', fileOf([fileRow(0)]), OPTS);
    expect(report.changes.filter((c) => c.kind === 'DECREASE')).toEqual([]);
    expect(report.totals.decreased).toBe(0);
    expect(db.find('lot1')).toMatchObject(NOT_TOUCHED);
  });

  it('apply: a file that says TCGplayer sold everything changes nothing about the lot, and the stock call is never made for it', async () => {
    const db = new FakeSyncDb([lotWithCard('lot1')]);
    const sold: any[] = [];
    const deps = fakeDeps(db, sold);
    const sellSpy = jest.spyOn(deps, 'sellUnits');
    const raiseSpy = jest.spyOn(deps, 'raiseUnits');
    const report = await applyReconcile(db, 'sale-1', fileOf([fileRow(0)]), OPTS, deps);
    expect(sellSpy).not.toHaveBeenCalled();
    expect(raiseSpy).not.toHaveBeenCalled();
    expect(sold).toEqual([]);
    expect(db.find('lot1')).toMatchObject({ stockSold: 0, stockTotal: 5000, status: 'AVAILABLE' });
    expect(db.card('lot1').tcgplayerQty).toBe(5000); // baseline untouched
    expect(report.totals.decreased).toBe(0);
  });

  it('apply: a file that says TCGplayer holds MORE cannot add cards to a lot either', async () => {
    const db = new FakeSyncDb([lotWithCard('lot1')]);
    const deps = fakeDeps(db);
    const raiseSpy = jest.spyOn(deps, 'raiseUnits');
    await applyReconcile(db, 'sale-1', fileOf([fileRow(9000)]), OPTS, deps);
    expect(raiseSpy).not.toHaveBeenCalled();
    expect(db.find('lot1').stockTotal).toBe(5000);
  });

  it('a lot sitting next to a real card of the same TCGplayer Id does not change what the real card does', async () => {
    const db = new FakeSyncDb([lotWithCard('lot1'), fakeItem('single', { stockTotal: 4, card: { tcgplayerQty: 4 } })]);
    const sold: any[] = [];
    await applyReconcile(db, 'sale-1', fileOf([fileRow(3)]), OPTS, fakeDeps(db, sold));
    expect(db.find('single').stockSold).toBe(1);
    expect(db.find('lot1').stockSold).toBe(0);
    expect(sold.map((s) => s.itemId)).toEqual(['single']);
  });

  it('status and the register check ignore the lot', async () => {
    const db = new FakeSyncDb([lotWithCard('lot1')]);
    const status = await getStatus(db, 'sale-1');
    expect(status.cardsTracked).toBe(0);
    expect(status.skipped.bulkLots).toBe(1);
    expect(await registerCheck(db, 'sale-1', ['lot1'])).toEqual([{ itemId: 'lot1', onTcgplayer: false, tcgplayerQty: 0, available: 0 }]);
  });
});

describe('second line of defense at the stock writes', () => {
  const txWith = (lotIds: string[]) => ({ item: { findMany: async (args: any) => (lotIds.includes(args.where.id) && args.where.bulkLot?.isNot === null ? [{ id: args.where.id }] : []) } });

  it('refuses a lot and lets an ordinary item through', async () => {
    await expect(assertNotBulkLot(txWith(['lot1']), 'lot1')).rejects.toThrow(TCGPLAYER_LOT_ERROR);
    await expect(assertNotBulkLot(txWith(['lot1']), 'single')).resolves.toBeUndefined();
  });

  it('the wiring runs the guard before sellItemUnits and keeps the lot out of the raise statement', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src: string = require('fs').readFileSync(require('path').join(process.cwd(), 'src/services/cardTcgplayer/wiring.ts'), 'utf8');
    const sellAt = src.indexOf('sellUnits: async');
    expect(sellAt).toBeGreaterThan(-1);
    expect(src.indexOf('await assertNotBulkLot(tx, itemId)', sellAt)).toBeGreaterThan(sellAt);
    expect(src.indexOf('await assertNotBulkLot(tx, itemId)', sellAt)).toBeLessThan(src.indexOf('return sellItemUnits', sellAt));
    expect(src).toContain('NOT EXISTS (SELECT 1 FROM "ItemBulkLot" b WHERE b."itemId" = "Item"."id")');
  });
});

describe('copy', () => {
  it('the note that lots are left out is in the message list the copy lint scans, and follows the rules', () => {
    expect(allTcgplayerMessages()).toContain(NOTES.BULK_LOTS_IGNORED);
    expect(NOTES.BULK_LOTS_IGNORED).not.toMatch(/[–—]/);
    expect(NOTES.BULK_LOTS_IGNORED).not.toMatch(/\bAI\b|estate sale|automat/i);
  });
});
