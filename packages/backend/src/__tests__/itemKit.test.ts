/**
 * Kits / bundles, Phase 1 (2026-10-16). No network, no real database.
 *
 * What is covered here:
 *  - the derived-stock math (computeKitAvailability, materializedKitStockTotal),
 *  - the kit sale taking every component all-or-nothing (against an in-memory store whose transaction() rolls back on a throw,
 *    standing in for the caller's Postgres transaction), and its lock order,
 *  - the refund restock (components given back, floored, sold-out components reopened, kits recomputed),
 *  - that the real sale paths call the kit hooks (itemStockService.sellItemUnitsInTransaction, itemSaleGuard.commitItemSale) and
 *    that ordinary items cost nothing extra,
 *  - the input validation and component eligibility rules.
 * The raw SQL itself (guarded UPDATEs, the recompute UPDATE) is exercised only by CI against a real database when the kit
 * smoke is run; it is deliberately written to match the proven statements in itemStockService.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import {
  computeKitAvailability,
  materializedKitStockTotal,
  restockKitComponents,
  restockKitIfKit,
  sellKitComponents,
  KitStockDeps,
} from '../services/itemKitStock';
import { InsufficientStockError, KitComponentShortError } from '../services/itemStockErrors';
import { parseKitComponents, parseKitCreate, parseKitUpdate, componentIneligibleReason, KitError } from '../services/itemKitService';

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface Row {
  stockTotal: number;
  stockSold: number;
  status: string;
}
type Recipes = Record<string, Array<{ componentItemId: string; quantity: number }>>;

function makeWorld(rows: Record<string, Row>, recipes: Recipes) {
  const calls: string[] = [];
  const remaining = (r: Row) => Math.max(r.stockTotal - r.stockSold, 0);
  const recompute = (kitId: string) => {
    const comps = recipes[kitId].map((c) => {
      const r = rows[c.componentItemId];
      return { remaining: r.status === 'SOLD' ? 0 : remaining(r), quantity: c.quantity };
    });
    const kit = rows[kitId];
    const avail = computeKitAvailability(comps);
    const oldRemaining = kit.stockTotal - kit.stockSold;
    kit.stockTotal = materializedKitStockTotal(kit.stockSold, avail);
    if (avail === 0 && kit.status === 'AVAILABLE') kit.status = 'SOLD';
    else if (avail > 0 && kit.status === 'SOLD' && oldRemaining <= 0) kit.status = 'AVAILABLE';
  };
  const deps: KitStockDeps = {
    loadComponents: async (_c, kitId) => [...recipes[kitId]].sort((a, b) => a.componentItemId.localeCompare(b.componentItemId)),
    decrement: async (_c, kitId, componentId, units) => {
      calls.push(`dec:${componentId}:${units}`);
      const r = rows[componentId];
      if (!r || r.stockSold + units > r.stockTotal) {
        throw new KitComponentShortError(kitId, componentId, units, r ? remaining(r) : 0);
      }
      r.stockSold += units;
      if (r.stockSold >= r.stockTotal) r.status = 'SOLD';
    },
    increment: async (_c, componentId, units) => {
      calls.push(`inc:${componentId}:${units}`);
      const r = rows[componentId];
      r.stockSold = Math.max(r.stockSold - units, 0);
      if (r.status === 'SOLD' && r.stockSold < r.stockTotal) r.status = 'AVAILABLE';
    },
    recomputeForComponents: async (_c, ids) => {
      calls.push(`recompute:${ids.join(',')}`);
      for (const kitId of Object.keys(recipes)) {
        if (recipes[kitId].some((c) => ids.includes(c.componentItemId))) recompute(kitId);
      }
    },
  };
  // Stands in for the caller's database transaction: a throw restores every row, exactly like a Postgres ROLLBACK.
  async function transaction<T>(fn: () => Promise<T>): Promise<T> {
    const snapshot = JSON.parse(JSON.stringify(rows)) as Record<string, Row>;
    try {
      return await fn();
    } catch (err) {
      for (const k of Object.keys(rows)) delete rows[k];
      Object.assign(rows, snapshot);
      throw err;
    }
  }
  return { rows, deps, calls, transaction, recompute };
}

const tube = (total: number, sold = 0): Row => ({ stockTotal: total, stockSold: sold, status: sold >= total ? 'SOLD' : 'AVAILABLE' });

// ---------------------------------------------------------------------------
// Stock math
// ---------------------------------------------------------------------------

describe('computeKitAvailability', () => {
  it('is the minimum of floor(remaining / quantity) over the components', () => {
    expect(computeKitAvailability([{ remaining: 10, quantity: 1 }, { remaining: 7, quantity: 2 }, { remaining: 100, quantity: 5 }])).toBe(3);
  });
  it('floors partial kits: 5 units at 2 per kit is 2 kits', () => {
    expect(computeKitAvailability([{ remaining: 5, quantity: 2 }])).toBe(2);
  });
  it('is 0 when any component is out, when there are no components, and for a bad quantity', () => {
    expect(computeKitAvailability([{ remaining: 9, quantity: 1 }, { remaining: 0, quantity: 1 }])).toBe(0);
    expect(computeKitAvailability([])).toBe(0);
    expect(computeKitAvailability([{ remaining: 9, quantity: 0 }])).toBe(0);
  });
  it('never goes negative on an oversold component', () => {
    expect(computeKitAvailability([{ remaining: -3, quantity: 1 }])).toBe(0);
  });
});

describe('materializedKitStockTotal', () => {
  it('keeps (total - sold) equal to the derived availability', () => {
    expect(materializedKitStockTotal(4, 6)).toBe(10);
    expect(materializedKitStockTotal(0, 0)).toBe(0);
    expect(materializedKitStockTotal(-1, 2)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Selling a kit
// ---------------------------------------------------------------------------

describe('sellKitComponents', () => {
  const recipes: Recipes = {
    kitA: [{ componentItemId: 'tubeB', quantity: 2 }, { componentItemId: 'tubeA', quantity: 1 }],
    kitB: [{ componentItemId: 'tubeB', quantity: 1 }],
  };

  it('takes quantity x kits from every component, recomputes sibling kits that share a component, and locks in id order', async () => {
    const w = makeWorld({ tubeA: tube(5), tubeB: tube(6), kitA: { stockTotal: 3, stockSold: 0, status: 'AVAILABLE' }, kitB: { stockTotal: 6, stockSold: 0, status: 'AVAILABLE' } }, recipes);
    const touched = await w.transaction(() => sellKitComponents({} as any, 'kitA', 1, w.deps));
    expect(touched.sort()).toEqual(['tubeA', 'tubeB']);
    expect(w.calls.filter((c) => c.startsWith('dec:'))).toEqual(['dec:tubeA:1', 'dec:tubeB:2']);
    expect(w.rows.tubeA.stockSold).toBe(1);
    expect(w.rows.tubeB.stockSold).toBe(2);
    // kitA: min(4/1, 4/2) = 2 left; kitB (sibling sharing tubeB): 4 left
    expect(w.rows.kitA.stockTotal - w.rows.kitA.stockSold).toBe(2);
    expect(w.rows.kitB.stockTotal - w.rows.kitB.stockSold).toBe(4);
  });

  it('is all-or-nothing: a short second component rolls back the first and throws a clean oversold error', async () => {
    const w = makeWorld({ tubeA: tube(5), tubeB: tube(1), kitA: { stockTotal: 1, stockSold: 0, status: 'AVAILABLE' }, kitB: { stockTotal: 1, stockSold: 0, status: 'AVAILABLE' } }, recipes);
    const before = JSON.parse(JSON.stringify(w.rows));
    let caught: unknown;
    try {
      await w.transaction(() => sellKitComponents({} as any, 'kitA', 1, w.deps));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(KitComponentShortError);
    expect(caught).toBeInstanceOf(InsufficientStockError);
    expect((caught as KitComponentShortError).componentItemId).toBe('tubeB');
    // tubeA was decremented first (id order) and was rolled back with the transaction.
    expect(w.calls[0]).toBe('dec:tubeA:1');
    expect(w.rows).toEqual(before);
  });

  it('closes the kit and reopens nothing when the last unit of the scarcest component goes', async () => {
    const w = makeWorld({ tubeA: tube(5), tubeB: tube(2), kitA: { stockTotal: 1, stockSold: 0, status: 'AVAILABLE' }, kitB: { stockTotal: 2, stockSold: 0, status: 'AVAILABLE' } }, recipes);
    await w.transaction(() => sellKitComponents({} as any, 'kitA', 1, w.deps));
    expect(w.rows.tubeB.status).toBe('SOLD');
    // kitA's own sale counter is owned by the caller (sellItemUnits); here only the derived total moves: 0 more can be made.
    expect(w.rows.kitA.stockTotal).toBe(0);
    expect(w.rows.kitA.status).toBe('SOLD');
    expect(w.rows.kitB.status).toBe('SOLD');
  });

  it('refuses a kit with no components and a non-positive unit count', async () => {
    const w = makeWorld({ kitX: { stockTotal: 1, stockSold: 0, status: 'AVAILABLE' } }, { kitX: [] });
    await expect(sellKitComponents({} as any, 'kitX', 1, w.deps)).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(sellKitComponents({} as any, 'kitX', 0, w.deps)).rejects.toThrow(/positive integer/);
  });
});

// ---------------------------------------------------------------------------
// Refund restock
// ---------------------------------------------------------------------------

describe('restockKitComponents', () => {
  const recipes: Recipes = { kitA: [{ componentItemId: 'tubeA', quantity: 1 }, { componentItemId: 'tubeB', quantity: 2 }] };

  it('gives quantity x kits back to every component, reopens a sold-out component and recomputes the kit', async () => {
    // One kit was sold: tubeA 5/5 sold out, tubeB 2/2 sold out, kitA sold 1 of 1.
    const w = makeWorld({ tubeA: tube(5, 5), tubeB: tube(2, 2), kitA: { stockTotal: 1, stockSold: 1, status: 'SOLD' } }, recipes);
    // The refund code returns the kit's own counter first (stockSold 1 -> 0), then restocks the components.
    w.rows.kitA.stockSold = 0;
    await restockKitComponents({} as any, 'kitA', 1, w.deps);
    expect(w.calls.filter((c) => c.startsWith('inc:'))).toEqual(['inc:tubeA:1', 'inc:tubeB:2']);
    expect(w.rows.tubeA).toMatchObject({ stockSold: 4, status: 'AVAILABLE' });
    expect(w.rows.tubeB).toMatchObject({ stockSold: 0, status: 'AVAILABLE' });
    // 1 left of tubeA, 2 of tubeB at 2 per kit: min(1, 1) = 1 kit; the kit is purchasable again.
    expect(w.rows.kitA.stockTotal - w.rows.kitA.stockSold).toBe(1);
    // The kit row's own SOLD -> AVAILABLE flip on a refund is done by the refund code (every refund caller restores status), not here.
  });

  it('never drives a component stockSold below zero', async () => {
    const w = makeWorld({ tubeA: tube(5, 0), tubeB: tube(2, 1), kitA: { stockTotal: 1, stockSold: 0, status: 'AVAILABLE' } }, recipes);
    await restockKitComponents({} as any, 'kitA', 3, w.deps);
    expect(w.rows.tubeA.stockSold).toBe(0);
    expect(w.rows.tubeB.stockSold).toBe(0);
  });

  it('rejects a non-positive unit count', async () => {
    const w = makeWorld({ kitA: { stockTotal: 1, stockSold: 0, status: 'AVAILABLE' } }, { kitA: [] });
    await expect(restockKitComponents({} as any, 'kitA', 0, w.deps)).rejects.toThrow(/positive integer/);
  });
});

describe('restockKitIfKit', () => {
  it('is a no-op (false) for an ordinary item, and for a client without item.findUnique', async () => {
    const findUnique = jest.fn(async () => ({ listingType: 'FIXED' }));
    expect(await restockKitIfKit({ item: { findUnique } } as any, 'plain1')).toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(await restockKitIfKit({} as any, 'plain1')).toBe(false);
  });

  it('restocks when the item is a kit', async () => {
    const w = makeWorld({ tubeA: tube(2, 2), kitA: { stockTotal: 1, stockSold: 0, status: 'SOLD' } }, { kitA: [{ componentItemId: 'tubeA', quantity: 1 }] });
    const client = { item: { findUnique: jest.fn(async () => ({ listingType: 'KIT' })) } };
    expect(await restockKitIfKit(client as any, 'kitA', 1, w.deps)).toBe(true);
    expect(w.rows.tubeA.stockSold).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The real sale paths call the hooks
// ---------------------------------------------------------------------------

describe('itemStockService.sellItemUnitsInTransaction kit hook', () => {
  const sellKit = jest.fn(async () => ['c1']);
  const recompute = jest.fn(async () => undefined);
  let sellItemUnitsInTransaction: typeof import('../services/itemStockService').sellItemUnitsInTransaction;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('../services/itemKitStock', () => ({
      KIT_LISTING_TYPE: 'KIT',
      sellKitComponents: sellKit,
      recomputeKitsForComponents: recompute,
      undoKitCounter: jest.fn(),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sellItemUnitsInTransaction = require('../services/itemStockService').sellItemUnitsInTransaction;
  });
  afterAll(() => {
    jest.dontMock('../services/itemKitStock');
  });
  beforeEach(() => {
    sellKit.mockClear();
    recompute.mockClear();
  });

  const txReturning = (row: Record<string, unknown>) => ({ $queryRaw: jest.fn(async () => [row]), item: { findUnique: jest.fn() } });

  it('selling a KIT takes its components inside the same transaction', async () => {
    const tx = txReturning({ stockTotal: 3, stockSold: 1, status: 'AVAILABLE', listingType: 'KIT', isKitComponent: false });
    const r = await sellItemUnitsInTransaction(tx as any, 'kit1', 1);
    expect(r).toEqual({ fullySoldOut: false, remainingStock: 2 });
    expect(sellKit).toHaveBeenCalledWith(tx, 'kit1', 1);
    expect(recompute).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('propagates a short component so the caller transaction rolls back the kit counter too', async () => {
    sellKit.mockRejectedValueOnce(new KitComponentShortError('kit1', 'c1', 2, 1));
    const tx = txReturning({ stockTotal: 3, stockSold: 1, status: 'AVAILABLE', listingType: 'KIT', isKitComponent: false });
    await expect(sellItemUnitsInTransaction(tx as any, 'kit1', 1)).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('selling a component recomputes the kits that contain it', async () => {
    const tx = txReturning({ stockTotal: 5, stockSold: 2, status: 'AVAILABLE', listingType: 'FIXED', isKitComponent: true });
    await sellItemUnitsInTransaction(tx as any, 'c1', 1);
    expect(recompute).toHaveBeenCalledWith(tx, ['c1']);
    expect(sellKit).not.toHaveBeenCalled();
  });

  it('an ordinary item does no kit work at all', async () => {
    const tx = txReturning({ stockTotal: 5, stockSold: 2, status: 'AVAILABLE' });
    await sellItemUnitsInTransaction(tx as any, 'plain', 1);
    expect(recompute).not.toHaveBeenCalled();
    expect(sellKit).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('itemSaleGuard.commitItemSale kit hook', () => {
  const commitKit = jest.fn(async () => ['c1']);
  const recompute = jest.fn(async () => undefined);
  let commitItemSale: typeof import('../services/itemSaleGuard').commitItemSale;
  let ItemAlreadyCommittedError: typeof import('../services/itemSaleGuard').ItemAlreadyCommittedError;
  let FreshKitShortError: typeof KitComponentShortError;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('../services/itemKitStock', () => ({
      KIT_LISTING_TYPE: 'KIT',
      commitKitSale: commitKit,
      recomputeKitsForComponents: recompute,
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const guard = require('../services/itemSaleGuard');
    commitItemSale = guard.commitItemSale;
    ItemAlreadyCommittedError = guard.ItemAlreadyCommittedError;
    // After resetModules the guard sees a fresh itemStockErrors module; build the error from the same registry so instanceof matches.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    FreshKitShortError = require('../services/itemStockErrors').KitComponentShortError;
  });
  afterAll(() => {
    jest.dontMock('../services/itemKitStock');
  });
  beforeEach(() => {
    commitKit.mockClear();
    recompute.mockClear();
  });

  const txFor = (item: Record<string, unknown>) => ({
    purchase: { findFirst: jest.fn(async () => null) },
    item: { updateMany: jest.fn(async () => ({ count: 1 })), findUniqueOrThrow: jest.fn(async () => item) },
  });

  it('marking a kit SOLD takes its components', async () => {
    const tx = txFor({ id: 'kit1', listingType: 'KIT', isKitComponent: false });
    await commitItemSale('kit1', 'SOLD', ['AVAILABLE'], tx as any);
    expect(commitKit).toHaveBeenCalledWith(tx, 'kit1');
  });

  it('a short component refuses the sale as an already-committed conflict', async () => {
    commitKit.mockRejectedValueOnce(new FreshKitShortError('kit1', 'c1', 1, 0));
    const tx = txFor({ id: 'kit1', listingType: 'KIT', isKitComponent: false });
    await expect(commitItemSale('kit1', 'SOLD', ['AVAILABLE'], tx as any)).rejects.toBeInstanceOf(ItemAlreadyCommittedError);
  });

  it('holding a kit (INVOICE_ISSUED) takes nothing; the payment path does the real sale', async () => {
    const tx = txFor({ id: 'kit1', listingType: 'KIT', isKitComponent: false });
    await commitItemSale('kit1', 'INVOICE_ISSUED', ['AVAILABLE'], tx as any);
    expect(commitKit).not.toHaveBeenCalled();
  });

  it('marking a component SOLD recomputes its kits; an ordinary item does nothing extra', async () => {
    const compTx = txFor({ id: 'c1', listingType: 'FIXED', isKitComponent: true });
    await commitItemSale('c1', 'SOLD', ['AVAILABLE'], compTx as any);
    expect(recompute).toHaveBeenCalledWith(compTx, ['c1']);
    recompute.mockClear();
    const plainTx = txFor({ id: 'p1', listingType: 'FIXED', isKitComponent: false });
    await commitItemSale('p1', 'SOLD', ['AVAILABLE'], plainTx as any);
    expect(recompute).not.toHaveBeenCalled();
    expect(commitKit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Validation and eligibility
// ---------------------------------------------------------------------------

describe('kit input validation', () => {
  const expectCode = (fn: () => unknown, code: string) => {
    try {
      fn();
    } catch (err) {
      expect(err).toBeInstanceOf(KitError);
      expect((err as KitError).code).toBe(code);
      return;
    }
    throw new Error(`expected ${code}`);
  };

  it('accepts a normal recipe', () => {
    expect(parseKitComponents([{ itemId: 'a', quantity: 1 }, { itemId: 'b', quantity: 3 }])).toEqual([{ itemId: 'a', quantity: 1 }, { itemId: 'b', quantity: 3 }]);
  });
  it('rejects empty, duplicate, bad-quantity and oversized recipes', () => {
    expectCode(() => parseKitComponents([]), 'KIT_COMPONENTS_REQUIRED');
    expectCode(() => parseKitComponents(undefined), 'KIT_COMPONENTS_REQUIRED');
    expectCode(() => parseKitComponents([{ itemId: 'a', quantity: 1 }, { itemId: 'a', quantity: 2 }]), 'KIT_COMPONENT_DUPLICATE');
    expectCode(() => parseKitComponents([{ itemId: 'a', quantity: 0 }]), 'KIT_QUANTITY_INVALID');
    expectCode(() => parseKitComponents([{ itemId: 'a', quantity: 1.5 }]), 'KIT_QUANTITY_INVALID');
    expectCode(() => parseKitComponents([{ itemId: '', quantity: 1 }]), 'KIT_COMPONENT_INVALID');
    expectCode(() => parseKitComponents(Array.from({ length: 26 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 }))), 'KIT_TOO_MANY_COMPONENTS');
  });
  it('parses create input and rounds the price to cents', () => {
    const out = parseKitCreate({ title: '  Tube set ', price: '12.345', components: [{ itemId: 'a', quantity: 1 }], saleId: 's1' });
    expect(out).toMatchObject({ title: 'Tube set', price: 12.35, saleId: 's1', description: null });
    expectCode(() => parseKitCreate({ title: '', price: 5, components: [{ itemId: 'a', quantity: 1 }] }), 'KIT_TITLE_REQUIRED');
    expectCode(() => parseKitCreate({ title: 'x', price: 0, components: [{ itemId: 'a', quantity: 1 }] }), 'KIT_PRICE_INVALID');
  });
  it('requires something to change on update', () => {
    expectCode(() => parseKitUpdate({}), 'KIT_NOTHING_TO_UPDATE');
    expect(parseKitUpdate({ price: 9 })).toEqual({ price: 9 });
  });
});

describe('componentIneligibleReason', () => {
  const base = { id: 'i1', organizerId: 'org1', status: 'AVAILABLE', listingType: 'FIXED', deletedAt: null, consignorId: null, vendorBoothId: null, bulkLot: null };
  it('accepts a plain available item of the same organizer', () => {
    expect(componentIneligibleReason(base, 'org1')).toBeNull();
  });
  it('treats another organizer or a deleted item as not found', () => {
    expect(componentIneligibleReason(base, 'org2')?.code).toBe('KIT_COMPONENT_NOT_FOUND');
    expect(componentIneligibleReason({ ...base, deletedAt: new Date() }, 'org1')?.code).toBe('KIT_COMPONENT_NOT_FOUND');
  });
  it('rejects kits, auctions, consigned, vendor-booth, bulk-lot and unavailable items', () => {
    expect(componentIneligibleReason({ ...base, listingType: 'KIT' }, 'org1')?.code).toBe('KIT_COMPONENT_IS_KIT');
    expect(componentIneligibleReason({ ...base, listingType: 'AUCTION' }, 'org1')?.code).toBe('KIT_COMPONENT_TYPE');
    expect(componentIneligibleReason({ ...base, listingType: 'CONSIGNOR_TAG' }, 'org1')?.code).toBe('KIT_COMPONENT_TYPE');
    expect(componentIneligibleReason({ ...base, consignorId: 'c1' }, 'org1')?.code).toBe('KIT_COMPONENT_CONSIGNED');
    expect(componentIneligibleReason({ ...base, vendorBoothId: 'v1' }, 'org1')?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
  });
  describe('vendor booth components', () => {
    const booth = { userId: 'u1', status: 'CONFIRMED', deletedAt: null, isHubOwnerBooth: false, hub: { organizerId: 'org1' } };
    const inBooth = (b: unknown) => ({ ...base, vendorBoothId: 'v1', vendorBooth: b as never });
    it('allows an item in the organizer\'s own booth (booth.userId matches)', () => {
      expect(componentIneligibleReason(inBooth(booth), 'org1', 'u1')).toBeNull();
    });
    it('allows the house booth of a hub the organizer owns', () => {
      expect(componentIneligibleReason(inBooth({ ...booth, userId: 'u9', isHubOwnerBooth: true }), 'org1', 'u1')).toBeNull();
    });
    it('rejects another vendor\'s booth', () => {
      expect(componentIneligibleReason(inBooth({ ...booth, userId: 'u2' }), 'org1', 'u1')?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
      expect(componentIneligibleReason(inBooth({ ...booth, userId: null }), 'org1', 'u1')?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
    });
    it('rejects a house booth of someone else\'s hub', () => {
      expect(componentIneligibleReason(inBooth({ ...booth, userId: 'u9', isHubOwnerBooth: true, hub: { organizerId: 'orgX' } }), 'org1', 'u1')?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
    });
    it('rejects a deleted or unconfirmed own booth', () => {
      expect(componentIneligibleReason(inBooth({ ...booth, deletedAt: new Date() }), 'org1', 'u1')?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
      for (const status of ['PENDING', 'REJECTED', 'CANCELLED']) {
        expect(componentIneligibleReason(inBooth({ ...booth, status }), 'org1', 'u1')?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
      }
    });
    it('fails closed when the booth was not loaded or the organizer user is unknown', () => {
      expect(componentIneligibleReason({ ...base, vendorBoothId: 'v1' }, 'org1', 'u1')?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
      expect(componentIneligibleReason(inBooth(booth), 'org1', null)?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
      expect(componentIneligibleReason(inBooth(booth), 'org1')?.code).toBe('KIT_COMPONENT_VENDOR_BOOTH');
    });
  });
  it('still rejects the other ineligible kinds', () => {
    expect(componentIneligibleReason({ ...base, bulkLot: { id: 'b1' } }, 'org1')?.code).toBe('KIT_COMPONENT_BULK_LOT');
    expect(componentIneligibleReason({ ...base, status: 'SOLD' }, 'org1')?.code).toBe('KIT_COMPONENT_UNAVAILABLE');
  });
});
