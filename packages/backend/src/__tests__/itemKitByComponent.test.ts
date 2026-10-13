/**
 * Kits: GET /api/kits/by-component/:itemId (the "In kits" line on an ordinary item's edit page). No network, no real database.
 */
const mockItemFindUnique = jest.fn();
const mockComponentFindMany = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    item: { findUnique: (...a: unknown[]) => mockItemFindUnique(...a) },
    itemKitComponent: { findMany: (...a: unknown[]) => mockComponentFindMany(...a) },
  },
}));

import * as fs from 'fs';
import * as path from 'path';
import { KitError, listKitsForComponent, shapeKitMemberships } from '../services/itemKitService';

const kitRow = (id: string, title: string, quantity: number, deletedAt: Date | null = null) => ({
  quantity,
  kitItem: { id, title, saleId: 's1', status: 'AVAILABLE', deletedAt },
});

describe('shapeKitMemberships', () => {
  it('drops archived kits and sorts by title', () => {
    const out = shapeKitMemberships([kitRow('k2', 'Zed set', 2), kitRow('k1', 'Alpha set', 1), kitRow('k3', 'Gone', 1, new Date())]);
    expect(out).toEqual([
      { kitId: 'k1', title: 'Alpha set', saleId: 's1', status: 'AVAILABLE', quantity: 1 },
      { kitId: 'k2', title: 'Zed set', saleId: 's1', status: 'AVAILABLE', quantity: 2 },
    ]);
  });
  it('returns an empty list for an item in no kit', () => {
    expect(shapeKitMemberships([])).toEqual([]);
  });
});

describe('listKitsForComponent', () => {
  beforeEach(() => {
    mockItemFindUnique.mockReset();
    mockComponentFindMany.mockReset();
  });

  it('returns the kits of the owner and scopes the query to that organizer', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'i1', organizerId: 'o1', deletedAt: null });
    mockComponentFindMany.mockResolvedValue([kitRow('k1', 'Tube set', 3)]);
    const out = await listKitsForComponent('o1', 'i1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kitId: 'k1', quantity: 3 });
    const where = mockComponentFindMany.mock.calls[0][0].where;
    expect(where.componentItemId).toBe('i1');
    expect(where.kitItem).toMatchObject({ organizerId: 'o1', listingType: 'KIT', deletedAt: null });
  });

  it('treats another organizer, a deleted item and a missing item as 404 and never reads kits', async () => {
    for (const row of [{ id: 'i1', organizerId: 'other', deletedAt: null }, { id: 'i1', organizerId: 'o1', deletedAt: new Date() }, null]) {
      mockItemFindUnique.mockResolvedValue(row);
      await expect(listKitsForComponent('o1', 'i1')).rejects.toBeInstanceOf(KitError);
      await expect(listKitsForComponent('o1', 'i1')).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', status: 404 });
    }
    expect(mockComponentFindMany).not.toHaveBeenCalled();
  });
});

describe('route order', () => {
  it('registers /by-component/:itemId before /:kitId', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/itemKits.ts'), 'utf-8');
    const byComponent = src.indexOf("'/by-component/:itemId'");
    const kitId = src.indexOf("'/:kitId'");
    expect(byComponent).toBeGreaterThan(-1);
    expect(kitId).toBeGreaterThan(-1);
    expect(byComponent).toBeLessThan(kitId);
  });
});
