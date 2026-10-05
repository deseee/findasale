/**
 * ADR-137 part A (roadmap #660): the TCGplayer upload CSV built from FindA.Sale card stock.
 * Pure modules only (groups.ts, exportBuilder.ts); no database.
 */
import {
  buildGroups,
  conditionWord,
  groupKey,
  isFoilFinish,
  isListedOnTcgplayer,
  productLineWord,
} from '../services/cardTcgplayer/groups';
import { HEADER, buildExportPlan, exportFileName, exportHeaders } from '../services/cardTcgplayer/exportBuilder';
import { tcgplayerSellerImporter } from '../services/cardIntake/importers/tcgplayerSeller';
import { normHeader } from '../services/cardIntake/importers/shared';
import { parseGameCell } from '../services/cardIntake/normalizeCells';
import { FakeItemRow, fakeItem, toSyncRow } from './__fixtures__/tcgplayerFakes';

function groupsOf(...items: FakeItemRow[]) {
  return buildGroups(items.map(toSyncRow));
}

function lines(csv: string): string[] {
  return csv.trimEnd().split('\n');
}

describe('headers', () => {
  it('default file has only columns the TCGplayer importer already reads', () => {
    const headers = exportHeaders({ includePrices: false, quantityColumn: 'ADD' });
    expect(headers).toEqual(['TCGplayer Id', 'Product Line', 'Set Name', 'Product Name', 'Number', 'Rarity', 'Condition', 'Add to Quantity']);
    const mapping = tcgplayerSellerImporter.mapColumns(headers);
    expect(mapping.tcgplayerProductId).toBe(HEADER.id);
    expect(mapping.game).toBe(HEADER.line);
    expect(mapping.setName).toBe(HEADER.set);
    expect(mapping.name).toBe(HEADER.name);
    expect(mapping.collectorNumber).toBe(HEADER.number);
    expect(mapping.rarity).toBe(HEADER.rarity);
    expect(mapping.condition).toBe(HEADER.condition);
    expect(tcgplayerSellerImporter.detect(new Set(headers.map(normHeader)))).toBe(true);
  });

  it('adds the price column only when asked, and swaps the quantity column for TOTAL', () => {
    const withPrice = exportHeaders({ includePrices: true, quantityColumn: 'ADD' });
    expect(withPrice[withPrice.length - 1]).toBe('TCG Marketplace Price');
    expect(tcgplayerSellerImporter.mapColumns(withPrice).price).toBe('TCG Marketplace Price');
    const total = exportHeaders({ includePrices: false, quantityColumn: 'TOTAL' });
    expect(total).toContain('Total Quantity');
    expect(total).not.toContain('Add to Quantity');
  });
});

describe('cell words', () => {
  it('writes condition the way TCGplayer does, with a trailing Foil', () => {
    expect(conditionWord('NM', false)).toBe('Near Mint');
    expect(conditionWord('LP', false)).toBe('Lightly Played');
    expect(conditionWord('MP', true)).toBe('Moderately Played Foil');
    expect(conditionWord('HP', false)).toBe('Heavily Played');
    expect(conditionWord('DMG', false)).toBe('Damaged');
    expect(conditionWord(null, false)).toBe('');
    expect(conditionWord(null, true)).toBe('Foil');
  });

  it('treats every non-plain finish as foil', () => {
    expect(isFoilFinish('NONFOIL')).toBe(false);
    expect(isFoilFinish(null)).toBe(false);
    for (const f of ['FOIL', 'ETCHED', 'HOLO', 'REVERSE_HOLO']) expect(isFoilFinish(f)).toBe(true);
  });

  it('writes a Product Line the card intake reads back as the same game', () => {
    for (const game of ['MTG', 'POKEMON', 'YUGIOH', 'LORCANA', 'ONE_PIECE']) {
      expect(parseGameCell(productLineWord(game))).toBe(game);
    }
    expect(productLineWord('OTHER')).toBe('');
    expect(productLineWord(null)).toBe('');
  });

  it('keys one card by TCGplayer Id, condition and foil', () => {
    expect(groupKey(1001, 'NM', false)).toBe('1001|NM|N');
    expect(groupKey(1001, 'NM', true)).toBe('1001|NM|F');
    expect(groupKey(1001, null, false)).toBe('1001||N');
  });
});

describe('grouping', () => {
  it('adds up items of the same card and keeps foil and condition apart', () => {
    const { groups } = groupsOf(
      fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 4 } }),
      fakeItem('b', { stockTotal: 2 }),
      fakeItem('c', { card: { finish: 'FOIL' } }),
      fakeItem('d', { card: { conditionCode: 'LP' } })
    );
    expect(groups.size).toBe(3);
    const nm = groups.get('1001|NM|N')!;
    expect(nm.units.map((u) => u.itemId)).toEqual(['a', 'b']);
    expect(nm.units.reduce((s, u) => s + u.available, 0)).toBe(5);
  });

  it('counts only an AVAILABLE item as available (held and sold items are 0)', () => {
    const { groups } = groupsOf(
      fakeItem('a', { stockTotal: 4, stockSold: 1 }),
      fakeItem('b', { status: 'RESERVED', stockTotal: 2 }),
      fakeItem('c', { status: 'SOLD', stockTotal: 1, stockSold: 1 })
    );
    expect(groups.get('1001|NM|N')!.units.map((u) => u.available)).toEqual([3, 0, 0]);
  });

  it('skips graded cards, cards with no TCGplayer Id, and items with no card, and says how many', () => {
    const { groups, skipped } = groupsOf(
      fakeItem('g', { card: { grader: 'PSA' } }),
      fakeItem('n', { card: { tcgplayerProductId: null } }),
      fakeItem('x', { card: null }),
      fakeItem('ok')
    );
    expect(groups.size).toBe(1);
    expect(skipped).toEqual({ noTcgplayerId: 1, graded: 1, notACard: 1 });
  });

  it('orders items oldest first so every caller picks the same one', () => {
    const newer = fakeItem('a');
    const older = fakeItem('z');
    older.createdAt = new Date(newer.createdAt.getTime() - 60000);
    const { groups } = groupsOf(newer, older);
    expect(groups.get('1001|NM|N')!.units.map((u) => u.itemId)).toEqual(['z', 'a']);
  });

  it('is listed on TCGplayer only when a baseline above zero is known', () => {
    expect(isListedOnTcgplayer(groupsOf(fakeItem('a')).groups.get('1001|NM|N')!)).toBe(false);
    expect(isListedOnTcgplayer(groupsOf(fakeItem('a', { card: { tcgplayerQty: 0 } })).groups.get('1001|NM|N')!)).toBe(false);
    expect(isListedOnTcgplayer(groupsOf(fakeItem('a', { card: { tcgplayerQty: 2 } })).groups.get('1001|NM|N')!)).toBe(true);
  });
});

describe('buildExportPlan', () => {
  it('writes the change (available minus the quantity last on TCGplayer), negative included', () => {
    const { groups } = groupsOf(
      fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 5, cardName: 'Counterspell', tcgplayerProductId: 2002, collectorNumber: '9' } }),
      fakeItem('b', { stockTotal: 6, card: { tcgplayerQty: 4, cardName: 'Black Lotus', tcgplayerProductId: 3003, collectorNumber: '1' } })
    );
    const plan = buildExportPlan(groups.values());
    const out = lines(plan.csv);
    expect(out[0]).toBe('TCGplayer Id,Product Line,Set Name,Product Name,Number,Rarity,Condition,Add to Quantity');
    // sorted by card name: Black Lotus first
    expect(out[1]).toBe('3003,Magic,Alpha,Black Lotus,1,common,Near Mint,2');
    expect(out[2]).toBe('2002,Magic,Alpha,Counterspell,9,common,Near Mint,-2');
    expect(plan.rows.map((r) => r.delta)).toEqual([2, -2]);
    expect(plan.summary).toEqual({ rows: 2, newListings: 0, unchanged: 0, notOnTcgplayer: 0 });
  });

  it('leaves out cards whose quantity already matches and counts them', () => {
    const { groups } = groupsOf(fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 3 } }));
    const plan = buildExportPlan(groups.values());
    expect(lines(plan.csv)).toHaveLength(1);
    expect(plan.rows).toHaveLength(0);
    expect(plan.pending).toHaveLength(0);
    expect(plan.summary.unchanged).toBe(1);
  });

  it('leaves out cards never synced unless includeNew is set, which lists them with their full quantity', () => {
    const { groups } = groupsOf(fakeItem('a', { stockTotal: 2 }));
    const normal = buildExportPlan(groups.values());
    expect(normal.rows).toHaveLength(0);
    expect(normal.summary.notOnTcgplayer).toBe(1);

    const withNew = buildExportPlan(groups.values(), { includeNew: true });
    expect(withNew.rows).toHaveLength(1);
    expect(withNew.rows[0]).toMatchObject({ baseline: 0, available: 2, delta: 2, isNew: true });
    expect(withNew.summary.newListings).toBe(1);
  });

  it('does not list a never-synced card that has no stock', () => {
    const { groups } = groupsOf(fakeItem('a', { status: 'SOLD', stockTotal: 1, stockSold: 1 }));
    expect(buildExportPlan(groups.values(), { includeNew: true }).rows).toHaveLength(0);
  });

  it('writes the full count in TOTAL mode', () => {
    const { groups } = groupsOf(fakeItem('a', { stockTotal: 3, card: { tcgplayerQty: 5 } }));
    const plan = buildExportPlan(groups.values(), { quantityColumn: 'TOTAL' });
    expect(lines(plan.csv)[0].endsWith('Total Quantity')).toBe(true);
    expect(lines(plan.csv)[1].endsWith(',3')).toBe(true);
  });

  it('adds the FindA.Sale price only when asked, with two decimals', () => {
    const { groups } = groupsOf(fakeItem('a', { stockTotal: 3, price: 12.5, card: { tcgplayerQty: 5 } }));
    expect(lines(buildExportPlan(groups.values()).csv)[1].split(',')).toHaveLength(8);
    const priced = buildExportPlan(groups.values(), { includePrices: true });
    expect(lines(priced.csv)[1].endsWith(',-2,12.50')).toBe(true);
    const noPrice = groupsOf(fakeItem('b', { stockTotal: 3, price: null, card: { tcgplayerQty: 5 } }));
    expect(lines(buildExportPlan(noPrice.groups.values(), { includePrices: true }).csv)[1].endsWith(',-2,')).toBe(true);
  });

  it('writes foil in the condition and keeps foil and non-foil as separate rows', () => {
    const { groups } = groupsOf(
      fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 1 } }),
      fakeItem('b', { stockTotal: 2, card: { tcgplayerQty: 1, finish: 'FOIL' } })
    );
    const out = lines(buildExportPlan(groups.values()).csv);
    expect(out).toHaveLength(3);
    expect(out.some((l) => l.includes(',Near Mint,1'))).toBe(true);
    expect(out.some((l) => l.includes(',Near Mint Foil,1'))).toBe(true);
  });

  it('counts held and sold-out items as zero, so a held card lowers the quantity sent', () => {
    const { groups } = groupsOf(
      fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 3 } }),
      fakeItem('b', { status: 'RESERVED', stockTotal: 1, card: { tcgplayerQty: 0 } })
    );
    const plan = buildExportPlan(groups.values());
    expect(plan.rows[0]).toMatchObject({ available: 2, baseline: 3, delta: -1 });
    expect(plan.pending).toEqual([
      { itemId: 'a', qty: 2 },
      { itemId: 'b', qty: 0 },
    ]);
  });

  it('keeps spreadsheet formulas from running: text starting with = + - or @ gets a leading apostrophe', () => {
    const { groups } = groupsOf(
      fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 1, cardName: '=HYPERLINK("http://x")', tcgplayerProductId: 11 } }),
      fakeItem('b', { stockTotal: 2, card: { tcgplayerQty: 1, cardName: '-2 Mana', tcgplayerProductId: 12 } }),
      fakeItem('c', { stockTotal: 2, card: { tcgplayerQty: 1, cardName: '@home, again', tcgplayerProductId: 13 } })
    );
    const csv = buildExportPlan(groups.values()).csv;
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(",'-2 Mana,");
    expect(csv).toContain(`"'@home, again"`);
  });

  it('never prefixes a negative quantity (it is a number, not text)', () => {
    const { groups } = groupsOf(fakeItem('a', { stockTotal: 1, card: { tcgplayerQty: 4 } }));
    const row = lines(buildExportPlan(groups.values()).csv)[1];
    expect(row.endsWith(',-3')).toBe(true);
    expect(row).not.toContain("'-3");
  });

  it('sums several items of one card into one row and saves a pending quantity for each', () => {
    const { groups } = groupsOf(
      fakeItem('a', { stockTotal: 2, card: { tcgplayerQty: 1 } }),
      fakeItem('b', { stockTotal: 3, card: { tcgplayerQty: 0 } })
    );
    const plan = buildExportPlan(groups.values());
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ available: 5, baseline: 1, delta: 4 });
    expect(plan.pending).toEqual([
      { itemId: 'a', qty: 2 },
      { itemId: 'b', qty: 3 },
    ]);
  });

  it('writes only the header line when nothing changed', () => {
    const plan = buildExportPlan([].values());
    expect(plan.csv).toBe('TCGplayer Id,Product Line,Set Name,Product Name,Number,Rarity,Condition,Add to Quantity\n');
    expect(plan.rows).toEqual([]);
  });

  it('names the file by UTC date', () => {
    expect(exportFileName(new Date('2026-10-05T23:59:00.000Z'))).toBe('tcgplayer-update-2026-10-05.csv');
  });
});
