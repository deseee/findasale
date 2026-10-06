/**
 * Bulk lot pack planning and the vendor's pack size setting (ADR-136 Addendum E, roadmap #659).
 *
 * WHAT THIS PROVES (a lot of 10,000 cards at $8 per 1,000 sold in 1,000-card packs: one pack is $8.00)
 *   - planPackLine prices N whole packs on the server, refuses more packs than fit, and compares the client's total to the cent
 *   - a lot sold in packs refuses free quantity lines, and a pack line needs a lot that has a pack size
 *   - the pack size lookup fails closed with the flag on and open with it off
 *   - the vendor can set, change and clear the pack size; a size under 100, over 5,000 or over the lot is refused;
 *     a size change is refused while a hub cart line or a hold is open on the lot (and allowed once they are gone);
 *     another organizer cannot touch the lot; a pack price that cannot be priced is refused
 */
import { assertLotLinesMatchPacks, loadLotPackSizes, packViewForRow, parsePackLineRequests, planPackLine } from '../services/bulkLot/bulkLotPackService';
import { toOrganizerBulkLotView, updateBulkLot } from '../services/bulkLot/bulkLotService';
import { PackFakeDb } from './__fixtures__/bulkLotPackFakes';

const row = (over: Record<string, any> = {}) => ({ price: 8, status: 'AVAILABLE', stockTotal: 10000, stockSold: 0, ...over });

function codeOf(fn: () => unknown): { code: string; status?: number; extra?: any } {
  try {
    fn();
    return { code: 'NO_ERROR' };
  } catch (e: any) {
    return { code: String(e.code ?? e.message), status: e.status, extra: e.extra };
  }
}
async function codeOfAsync(fn: () => Promise<unknown>): Promise<{ code: string; status?: number; extra?: any }> {
  try {
    await fn();
    return { code: 'NO_ERROR' };
  } catch (e: any) {
    return { code: String(e.code ?? e.message), status: e.status, extra: e.extra };
  }
}

describe('planPackLine', () => {
  it('prices whole packs on the server', () => {
    const one = planPackLine(row(), 1000, 1, null);
    expect(one).toMatchObject({ packs: 1, packSize: 1000, cards: 1000, cents: 800, packCents: 800, pricePerThousandCents: 800 });
    const three = planPackLine(row(), 1000, 3, 24);
    expect(three).toMatchObject({ packs: 3, cards: 3000, cents: 2400 });
    expect(planPackLine(row(), 250, '4', null)).toMatchObject({ packs: 4, cards: 1000, cents: 800, packCents: 200 });
  });

  it('N packs are N times the one pack price (a pack that rounds up stays rounded up)', () => {
    const p = planPackLine(row({ price: 3.33, stockTotal: 10000 }), 101, 3, null);
    expect(p.packCents).toBe(34);
    expect(p.cents).toBe(102);
    expect(p.cards).toBe(303);
  });

  it('refuses more packs than fit and says how many are left', () => {
    const e = codeOf(() => planPackLine(row({ stockTotal: 4200 }), 1000, 5, null));
    expect(e).toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409 });
    expect(e.extra).toEqual({ remaining: 4200, packsAvailable: 4 });
    expect(planPackLine(row({ stockTotal: 4200 }), 1000, 4, null).cards).toBe(4000);
  });

  it('fewer cards than one pack left is INSUFFICIENT_STOCK with zero packs, no cards left is NOT_AVAILABLE', () => {
    const e = codeOf(() => planPackLine(row({ stockTotal: 10000, stockSold: 9500 }), 1000, 1, null));
    expect(e.code).toBe('INSUFFICIENT_STOCK');
    expect(e.extra.packsAvailable).toBe(0);
    expect(codeOf(() => planPackLine(row({ stockTotal: 10000, stockSold: 10000 }), 1000, 1, null)).code).toBe('NOT_AVAILABLE');
  });

  it('refuses a lot that is not for sale, a bad pack count, a missing pack size and a bad price', () => {
    expect(codeOf(() => planPackLine(row({ status: 'SOLD' }), 1000, 1, null)).code).toBe('NOT_AVAILABLE');
    expect(codeOf(() => planPackLine(row({ status: 'RESERVED' }), 1000, 1, null)).code).toBe('NOT_AVAILABLE');
    for (const bad of [0, 51, 1.5, 'x', null, undefined, -2]) expect(codeOf(() => planPackLine(row(), 1000, bad, null)).code).toBe('BULK_PACK_COUNT');
    expect(codeOf(() => planPackLine(row(), null, 1, null)).code).toBe('BULK_NOT_PACK');
    expect(codeOf(() => planPackLine(row(), 50, 1, null)).code).toBe('BULK_NOT_PACK');
    expect(codeOf(() => planPackLine(row({ price: null }), 1000, 1, null)).code).toBe('BAD_PRICE');
    expect(codeOf(() => planPackLine(row({ price: 0.004 }), 100, 1, null)).code).toBe('BAD_PRICE');
  });

  it('compares the client total to the cent', () => {
    expect(codeOf(() => planPackLine(row(), 1000, 2, 15.99))).toMatchObject({ code: 'PRICE_CHANGED', status: 409, extra: { expectedCents: 1600 } });
    expect(codeOf(() => planPackLine(row(), 1000, 2, 16.01)).code).toBe('PRICE_CHANGED');
    expect(codeOf(() => planPackLine(row(), 1000, 2, 16)).code).toBe('NO_ERROR');
    expect(codeOf(() => planPackLine(row(), 1000, 2, NaN)).code).toBe('PRICE_CHANGED');
  });
});

describe('parsePackLineRequests', () => {
  it('reads packLines and defaults the count to one', () => {
    expect(parsePackLineRequests(undefined)).toEqual([]);
    expect(parsePackLineRequests(null)).toEqual([]);
    expect(parsePackLineRequests([{ itemId: 'a', packs: 2, amount: 16 }, { itemId: 'b' }])).toEqual([
      { itemId: 'a', packs: 2, amount: 16 },
      { itemId: 'b', packs: 1, amount: null },
    ]);
  });

  it('refuses bad shapes, duplicates and bad counts', () => {
    expect(codeOf(() => parsePackLineRequests('x')).code).toBe('BULK_VALIDATION');
    expect(codeOf(() => parsePackLineRequests([null])).code).toBe('BULK_VALIDATION');
    expect(codeOf(() => parsePackLineRequests([{ itemId: '' }])).code).toBe('BULK_VALIDATION');
    expect(codeOf(() => parsePackLineRequests([{ itemId: 'a' }, { itemId: 'a' }])).code).toBe('BULK_VALIDATION');
    expect(codeOf(() => parsePackLineRequests([{ itemId: 'a', packs: 0 }])).code).toBe('BULK_PACK_COUNT');
    expect(codeOf(() => parsePackLineRequests([{ itemId: 'a', packs: 99 }])).code).toBe('BULK_PACK_COUNT');
  });
});

describe('assertLotLinesMatchPacks', () => {
  const sizes = new Map<string, number | null>([['packed', 1000], ['plain', null]]);
  it('refuses free quantity on a pack lot and a pack line on a plain lot', () => {
    expect(codeOf(() => assertLotLinesMatchPacks({ freeItemIds: ['packed'], packItemIds: [], packSizes: sizes })).code).toBe('BULK_PACK_ONLY');
    expect(codeOf(() => assertLotLinesMatchPacks({ freeItemIds: [], packItemIds: ['plain'], packSizes: sizes })).code).toBe('BULK_NOT_PACK');
    expect(codeOf(() => assertLotLinesMatchPacks({ freeItemIds: [], packItemIds: ['missing'], packSizes: sizes })).code).toBe('BULK_NOT_PACK');
  });
  it('lets each kind of line through on the right lot', () => {
    expect(codeOf(() => assertLotLinesMatchPacks({ freeItemIds: ['plain'], packItemIds: ['packed'], packSizes: sizes })).code).toBe('NO_ERROR');
  });
});

describe('loadLotPackSizes', () => {
  it('maps each lot to its pack size or null; non lots are absent', async () => {
    const db = new PackFakeDb();
    const a = db.addPackLot({}, 500).id;
    const b = db.addLot().id;
    const m = await loadLotPackSizes(db as any, [a, b, 'nope', a], true);
    expect(m.get(a)).toBe(500);
    expect(m.get(b)).toBeNull();
    expect(m.has('nope')).toBe(false);
    expect((await loadLotPackSizes(db as any, [], true)).size).toBe(0);
  });

  it('fails closed with the flag on and open with it off', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { itemBulkLot: { findMany: async () => { throw new Error('column does not exist'); } } };
    expect(await codeOfAsync(() => loadLotPackSizes(broken as any, ['x'], true))).toMatchObject({ code: 'BULK_CHECK_FAILED', status: 503 });
    expect((await loadLotPackSizes(broken as any, ['x'], false)).size).toBe(0);
  });
});

describe('packViewForRow', () => {
  it('builds the display numbers from the lot row', () => {
    expect(packViewForRow(row({ stockTotal: 4200 }), 1000)).toMatchObject({ packCents: 800, packsAvailable: 4, packAvailable: true, packPriceLabel: '$8.00 per pack' });
    expect(packViewForRow(row(), null).packAvailable).toBe(false);
  });
});

describe('updateBulkLot: the pack size setting', () => {
  const ORG = { organizerId: 'org1' };
  let db: PackFakeDb;
  let lotId: string;
  beforeEach(() => {
    db = new PackFakeDb();
    lotId = db.addLot().id;
  });

  it('sets a pack size and returns the pack numbers', async () => {
    const view: any = await updateBulkLot(db as any, ORG, lotId, { packSize: 1000 });
    expect(view.packSize).toBe(1000);
    expect(view.packCents).toBe(800);
    expect(view.packsAvailable).toBe(10);
    expect(db.packs.get(lotId)).toBe(1000);
  });

  it('changes and clears it', async () => {
    await updateBulkLot(db as any, ORG, lotId, { packSize: 1000 });
    const changed: any = await updateBulkLot(db as any, ORG, lotId, { packSize: 250 });
    expect(changed.packSize).toBe(250);
    expect(changed.packCents).toBe(200);
    const cleared: any = await updateBulkLot(db as any, ORG, lotId, { packSize: null });
    expect(cleared.packSize).toBeNull();
    expect(cleared.packAvailable).toBe(false);
    expect(db.packs.get(lotId)).toBeNull();
  });

  it('refuses a size under 100, over 5,000, over the lot, fractional or not a number', async () => {
    for (const bad of [99, 0, 5001, 12.5, -1]) expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { packSize: bad }))).code).toMatch(/BULK_PACK_INVALID|BULK_VALIDATION/);
    const small = db.addLot({ stockTotal: 800 }).id;
    expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, small, { packSize: 1000 }))).code).toBe('BULK_PACK_INVALID');
    expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, small, { packSize: 800 }))).code).toBe('NO_ERROR');
    expect(db.packs.get(lotId) ?? null).toBeNull();
  });

  it('refuses to change the size while a hub cart line is open, then allows it once the line is gone', async () => {
    await updateBulkLot(db as any, ORG, lotId, { packSize: 1000 });
    db.boothCartBulkLine.rows.push({ id: 'l1', itemId: lotId, status: 'RESERVED' });
    const e = await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { packSize: 500 }));
    expect(e).toMatchObject({ code: 'BULK_PACK_LOCKED', status: 409 });
    expect(e.extra).toEqual({ openCartLines: 1, activeHolds: 0 });
    expect(db.packs.get(lotId)).toBe(1000);
    expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { packSize: null }))).code).toBe('BULK_PACK_LOCKED');
    db.boothCartBulkLine.rows[0].status = 'SOLD';
    expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { packSize: 500 }))).code).toBe('NO_ERROR');
    expect(db.packs.get(lotId)).toBe(500);
  });

  it('refuses to change the size while a hold is active', async () => {
    await updateBulkLot(db as any, ORG, lotId, { packSize: 1000 });
    db.bulkLotHold.rows.push({ id: 'h1', itemId: lotId, status: 'ACTIVE' });
    expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { packSize: 500 }))).extra).toEqual({ openCartLines: 0, activeHolds: 1 });
    db.bulkLotHold.rows[0].status = 'RELEASED';
    expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { packSize: 500 }))).code).toBe('NO_ERROR');
  });

  it('saving the same size again while a line is open is not a change', async () => {
    await updateBulkLot(db as any, ORG, lotId, { packSize: 1000 });
    db.boothCartBulkLine.rows.push({ id: 'l1', itemId: lotId, status: 'RESERVED' });
    expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { packSize: 1000 }))).code).toBe('NO_ERROR');
  });

  it('fails closed when the lock check cannot run', async () => {
    await updateBulkLot(db as any, ORG, lotId, { packSize: 1000 });
    const partial: any = Object.create(db);
    partial.boothCartBulkLine = undefined;
    expect((await codeOfAsync(() => updateBulkLot(partial, ORG, lotId, { packSize: 500 }))).code).toBe('BULK_CHECK_FAILED');
  });

  it('only the owning organizer can set it', async () => {
    expect((await codeOfAsync(() => updateBulkLot(db as any, { organizerId: 'org2' }, lotId, { packSize: 1000 }))).code).toBe('BULK_NOT_FOUND');
    expect(db.packs.get(lotId) ?? null).toBeNull();
  });

  it('a price change on a pack lot is checked against the pack price', async () => {
    await updateBulkLot(db as any, ORG, lotId, { packSize: 100 });
    const e = await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { pricePerThousand: 0.04 }));
    expect(['BAD_PRICE', 'BULK_VALIDATION', 'QUANTITY_TOO_SMALL']).toContain(e.code);
  });

  it('an update that does not mention the pack size leaves it alone', async () => {
    await updateBulkLot(db as any, ORG, lotId, { packSize: 1000 });
    const v: any = await updateBulkLot(db as any, ORG, lotId, { pricePerThousand: 10 });
    expect(v.packSize).toBe(1000);
    expect(v.packCents).toBe(1000);
  });

  it('an unknown field is still refused (strict schema)', async () => {
    expect((await codeOfAsync(() => updateBulkLot(db as any, ORG, lotId, { packSize: 1000, packPrice: 5 }))).code).toBe('BULK_VALIDATION');
  });
});

describe('toOrganizerBulkLotView with no pack size', () => {
  it('has the empty pack fields', () => {
    const v: any = toOrganizerBulkLotView({ id: 'x', title: 'T', price: 8, status: 'AVAILABLE', stockTotal: 100, stockSold: 0, bulkLot: { game: 'MTG', lotKind: 'BULK_COMMON_UNCOMMON' } } as any);
    expect(v.packSize).toBeNull();
    expect(v.packAvailable).toBe(false);
    expect(v.packsAvailable).toBe(0);
  });
});
