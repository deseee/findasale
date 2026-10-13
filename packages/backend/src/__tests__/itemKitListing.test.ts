/**
 * itemKitListing: what a marketplace listing of a kit needs (stock number, Includes list, saleless-kit scope). No database.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import {
  applyKitIncludes,
  buildKitIncludesBlock,
  listingExtraFields,
  loadKitComponentLines,
  loadListingExtras,
  loadPublishText,
  organizerListableScope,
  stockRemainingOf,
  withKitIncludes,
  withKitListingText,
} from '../services/itemKitListing';

function fakeDb(items: any[], comps: any[]) {
  return {
    item: { findMany: jest.fn().mockResolvedValue(items) },
    itemKitComponent: { findMany: jest.fn().mockResolvedValue(comps) },
  } as any;
}
const compRow = (kitItemId: string, title: string, quantity: number) => ({ kitItemId, quantity, componentItem: { title } });

describe('stockRemainingOf', () => {
  it('is max(COALESCE(stockTotal,1) - stockSold, 0)', () => {
    expect(stockRemainingOf({ stockTotal: null, stockSold: 0 })).toBe(1);
    expect(stockRemainingOf({ stockTotal: null, stockSold: 1 })).toBe(0);
    expect(stockRemainingOf({ stockTotal: 5, stockSold: 2 })).toBe(3);
    expect(stockRemainingOf({ stockTotal: 2, stockSold: 9 })).toBe(0);
  });
});

describe('Includes block', () => {
  const lines = [{ title: 'Charger', quantity: 1 }, { title: ' Cable ', quantity: 2 }];
  it('builds "Includes:" with "N x Title" lines, empty for no components', () => {
    expect(buildKitIncludesBlock(lines)).toBe('Includes:\n- 1 x Charger\n- 2 x Cable');
    expect(buildKitIncludesBlock([])).toBe('');
    expect(buildKitIncludesBlock([{ title: '  ', quantity: 1 }])).toBe('');
  });
  it('appends to the description and is idempotent', () => {
    const once = withKitIncludes('Great set', lines);
    expect(once).toBe('Great set\n\nIncludes:\n- 1 x Charger\n- 2 x Cable');
    expect(withKitIncludes(once, lines)).toBe(once);
    expect(withKitIncludes(null, lines)).toBe('Includes:\n- 1 x Charger\n- 2 x Cable');
    expect(withKitIncludes('Plain', [])).toBe('Plain');
  });
});

describe('loadKitComponentLines', () => {
  it('groups by kit with one query and skips the query for no ids', async () => {
    const db = fakeDb([], [compRow('k1', 'A', 1), compRow('k1', 'B', 3), compRow('k2', 'C', 1)]);
    const m = await loadKitComponentLines(['k1', 'k2', 'k1'], db);
    expect(db.itemKitComponent.findMany).toHaveBeenCalledTimes(1);
    expect(m.get('k1')).toEqual([{ title: 'A', quantity: 1 }, { title: 'B', quantity: 3 }]);
    expect(m.get('k2')).toEqual([{ title: 'C', quantity: 1 }]);
    const empty = fakeDb([], []);
    expect((await loadKitComponentLines([], empty)).size).toBe(0);
    expect(empty.itemKitComponent.findMany).not.toHaveBeenCalled();
  });
});

describe('loadListingExtras / listingExtraFields', () => {
  const items = [
    { id: 'k1', listingType: 'KIT', stockTotal: 4, stockSold: 1, description: 'Kit text' },
    { id: 'i1', listingType: 'FIXED', stockTotal: null, stockSold: 0, description: 'Plain' },
    { id: 'z1', listingType: 'KIT', stockTotal: 2, stockSold: 2, description: null },
  ];
  it('gives every item stockRemaining; kits also get isKit, kitComponents and the Includes description', async () => {
    const db = fakeDb(items, [compRow('k1', 'A', 2)]);
    const m = await loadListingExtras(['k1', 'i1', 'z1'], db);
    expect(m.get('k1')).toEqual({ stockRemaining: 3, isKit: true, kitComponents: [{ title: 'A', quantity: 2 }], description: 'Kit text\n\nIncludes:\n- 2 x A' });
    expect(m.get('i1')).toEqual({ stockRemaining: 1, isKit: false });
    expect(m.get('z1')?.stockRemaining).toBe(0); // zero stock is reported as 0, never negative
  });
  it('spreads the right fields', () => {
    expect(listingExtraFields(undefined)).toEqual({});
    expect(listingExtraFields({ stockRemaining: 2, isKit: false })).toEqual({ stockRemaining: 2 });
    const kit = { stockRemaining: 3, isKit: true, kitComponents: [{ title: 'A', quantity: 1 }], description: 'D' };
    expect(listingExtraFields(kit)).toEqual({ stockRemaining: 3, isKit: true, kitComponents: [{ title: 'A', quantity: 1 }], description: 'D' });
    expect(listingExtraFields(kit, { keepDescription: false })).not.toHaveProperty('description');
  });
});

describe('publish helpers', () => {
  it('loadPublishText: kit gets Includes; ordinary item text is untouched; quantity is the stock number, at least 1', async () => {
    const db = fakeDb([], [compRow('k1', 'A', 1)]);
    const kit = await loadPublishText({ id: 'k1', listingType: 'KIT', title: 'T', description: 'D', stockTotal: 3, stockSold: 1 }, db);
    expect(kit).toMatchObject({ isKit: true, quantity: 2, description: 'D\n\nIncludes:\n- 1 x A' });
    const plain = await loadPublishText({ id: 'i1', listingType: 'FIXED', title: 'T', description: 'D', stockTotal: null, stockSold: 0 }, db);
    expect(plain).toMatchObject({ isKit: false, quantity: 1, description: 'D', kitComponents: [] });
    expect(db.itemKitComponent.findMany).toHaveBeenCalledTimes(1);
    const sold = await loadPublishText({ id: 'i2', listingType: 'FIXED', stockTotal: 1, stockSold: 1 }, db);
    expect(sold.quantity).toBe(1);
  });
  it('withKitListingText returns the same object for non-kits and a copy for kits (never written back)', async () => {
    const db = fakeDb([], [compRow('k1', 'A', 1)]);
    const plain = { id: 'i1', listingType: 'FIXED', description: 'D' };
    expect(await withKitListingText(plain, db)).toBe(plain);
    const kit = { id: 'k1', listingType: 'KIT', description: 'D' };
    const out = await withKitListingText(kit, db);
    expect(out).not.toBe(kit);
    expect(out.description).toBe('D\n\nIncludes:\n- 1 x A');
    expect(kit.description).toBe('D');
  });
  it('applyKitIncludes changes only kits, in one query', async () => {
    const db = fakeDb([], [compRow('k1', 'A', 1)]);
    const items = [{ id: 'k1', listingType: 'KIT', description: null }, { id: 'i1', listingType: 'FIXED', description: 'X' }];
    const out = await applyKitIncludes(items, db);
    expect(out[0].description).toBe('Includes:\n- 1 x A');
    expect(out[1]).toBe(items[1]);
    const none = fakeDb([], []);
    const same = [items[1]];
    expect(await applyKitIncludes(same, none)).toBe(same);
    expect(none.itemKitComponent.findMany).not.toHaveBeenCalled();
  });
});

describe('organizerListableScope', () => {
  it('covers sale items plus the organizer\'s saleless KITS only', () => {
    expect(organizerListableScope('o1')).toEqual([
      { sale: { organizerId: 'o1', deletedAt: null } },
      { saleId: null, organizerId: 'o1', listingType: 'KIT' },
    ]);
  });
});
