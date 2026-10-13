/**
 * Kit stale-total sweep helpers (findStaleKits, recomputeAllKitStock). The SQL itself is exercised by CI against a real
 * database; here a fake client stands in for $queryRaw / $executeRaw so the mapping and the "only recompute what is stale"
 * behavior are covered. Production fact used as the fixture: kit 'Tubes for CBW' stores stockTotal 14, sold 0, but its
 * components (Quarter 85/5, Penny 89/3, Dime 96/3, Nickel 92/3) really supply min(17, 29, 32, 30) = 17.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import { computeKitAvailability, findStaleKits, recomputeAllKitStock } from '../services/itemKitStock';

function fakeClient(rows: Array<Record<string, unknown>>) {
  const executed: unknown[] = [];
  const client = {
    $queryRaw: jest.fn(async () => rows),
    $executeRaw: jest.fn(async (...args: unknown[]) => {
      executed.push(args);
      return rows.length;
    }),
  };
  return { client: client as any, executed };
}

describe('Tubes for CBW fixture', () => {
  it('true availability is 17', () => {
    expect(
      computeKitAvailability([
        { remaining: 85, quantity: 5 },
        { remaining: 89, quantity: 3 },
        { remaining: 96, quantity: 3 },
        { remaining: 92, quantity: 3 },
      ])
    ).toBe(17);
  });
});

describe('findStaleKits', () => {
  it('maps the stored vs expected numbers', async () => {
    const { client } = fakeClient([
      { kitId: 'cmv6nvwp800m2p1z0xu5psl7l', title: 'Tubes for CBW', storedStockTotal: 14, stockSold: 0, avail: 17 },
    ]);
    const stale = await findStaleKits(client);
    expect(stale).toEqual([
      { kitId: 'cmv6nvwp800m2p1z0xu5psl7l', title: 'Tubes for CBW', storedStockTotal: 14, expectedStockTotal: 17, storedAvail: 14, expectedAvail: 17 },
    ]);
  });

  it('accounts for units already sold and a null stored total', async () => {
    const { client } = fakeClient([{ kitId: 'k', title: 'K', storedStockTotal: null, stockSold: 2, avail: 5 }]);
    const [k] = await findStaleKits(client);
    expect(k.expectedStockTotal).toBe(7);
    expect(k.storedStockTotal).toBeNull();
    expect(k.storedAvail).toBe(0); // COALESCE(null, 1) - 2 floored at 0
  });

  it('returns an empty list when nothing is stale', async () => {
    const { client } = fakeClient([]);
    expect(await findStaleKits(client)).toEqual([]);
  });
});

describe('recomputeAllKitStock', () => {
  it('recomputes only when something is stale and returns the count changed', async () => {
    const { client } = fakeClient([
      { kitId: 'a', title: 'A', storedStockTotal: 1, stockSold: 0, avail: 2 },
      { kitId: 'b', title: 'B', storedStockTotal: 0, stockSold: 0, avail: 1 },
    ]);
    expect(await recomputeAllKitStock(client)).toBe(2);
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('is a no-op (no write) when no kit is stale', async () => {
    const { client } = fakeClient([]);
    expect(await recomputeAllKitStock(client)).toBe(0);
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
});
