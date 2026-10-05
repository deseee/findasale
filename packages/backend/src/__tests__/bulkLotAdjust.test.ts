/**
 * Recount and adjust a bulk lot's card count (ADR-136 Addendum B, roadmap #659).
 *
 * WHAT THIS PROVES (lot of 10,000 cards, 2,500 sold, so 7,500 on hand):
 *   - a recount sets the cards on hand, keeps the cards already sold, and writes a history row with before, after, reason, actor
 *   - damage takes cards off, added stock puts cards on, a correction sets the count; each records its own reason
 *   - the plan refuses damage past what is on hand, zero, no change (except a recount, which is a statement), and past 1,000,000
 *   - emptying the lot marks it sold; adding cards to a sold out lot puts it back on sale
 *   - a recount racing a sale is refused as a conflict and changes nothing; added stock retries on the new numbers
 *   - another organizer's lot, a missing item, and a plain item all refuse; the history is newest first and scoped to the owner
 */
import { ADJUST_REASONS, adjustBulkLot, listAdjustments, planAdjustment } from '../services/bulkLot/bulkLotAdjustService';
import { FakeDb } from './__fixtures__/bulkLotFollowupFakes';

const CTX = { organizerId: 'org1', actorUserId: 'u_org' };
let db: FakeDb;
let lotId: string;

async function code(fn: () => Promise<unknown> | unknown): Promise<string> {
  try {
    await fn();
    return 'NO_ERROR';
  } catch (e: any) {
    return String(e.code ?? e.message);
  }
}

beforeEach(() => {
  db = new FakeDb();
  lotId = db.addLot({ stockTotal: 10000, stockSold: 2500 }).id;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('planAdjustment', () => {
  it('works out the count on hand and the new total for each reason', () => {
    expect(planAdjustment('RECOUNT', 7000, 10000, 2500)).toEqual({ onHandBefore: 7500, onHandAfter: 7000, totalAfter: 9500 });
    expect(planAdjustment('CORRECTION', 8000, 10000, 2500)).toEqual({ onHandBefore: 7500, onHandAfter: 8000, totalAfter: 10500 });
    expect(planAdjustment('DAMAGE', 500, 10000, 2500)).toEqual({ onHandBefore: 7500, onHandAfter: 7000, totalAfter: 9500 });
    expect(planAdjustment('ADDED_STOCK', 1000, 10000, 2500)).toEqual({ onHandBefore: 7500, onHandAfter: 8500, totalAfter: 11000 });
  });

  it('refuses damage past what is on hand, zero damage or stock, no change, and past 1,000,000', async () => {
    expect(ADJUST_REASONS).toEqual(['RECOUNT', 'DAMAGE', 'CORRECTION', 'ADDED_STOCK']);
    expect(await code(() => planAdjustment('DAMAGE', 7501, 10000, 2500))).toBe('BULK_ADJUST_TOO_MANY');
    expect(await code(() => planAdjustment('DAMAGE', 0, 10000, 2500))).toBe('BULK_ADJUST_BAD_COUNT');
    expect(await code(() => planAdjustment('ADDED_STOCK', 0, 10000, 2500))).toBe('BULK_ADJUST_BAD_COUNT');
    expect(await code(() => planAdjustment('CORRECTION', 7500, 10000, 2500))).toBe('BULK_ADJUST_NO_CHANGE');
    expect(await code(() => planAdjustment('ADDED_STOCK', 1_000_000, 10000, 2500))).toBe('BULK_ADJUST_TOO_BIG');
  });

  it('lets a recount confirm the same number (it is a statement, still recorded)', () => {
    expect(planAdjustment('RECOUNT', 7500, 10000, 2500).onHandAfter).toBe(7500);
  });
});

describe('adjustBulkLot', () => {
  it('a recount records before and after, the reason, the actor, and keeps the cards already sold', async () => {
    const res = await adjustBulkLot(db as any, CTX, lotId, { reason: 'RECOUNT', cards: 7000, note: '  counted twice  ' });
    expect(db.stock(lotId)).toMatchObject({ total: 9500, sold: 2500, left: 7000 });
    expect(db.bulkLotAdjustment.rows).toHaveLength(1);
    expect(db.bulkLotAdjustment.rows[0]).toMatchObject({
      itemId: lotId,
      organizerId: 'org1',
      actorUserId: 'u_org',
      reason: 'RECOUNT',
      beforeCount: 7500,
      afterCount: 7000,
      totalBefore: 10000,
      totalAfter: 9500,
      note: 'counted twice',
    });
    expect(res.adjustment).toMatchObject({ beforeCount: 7500, afterCount: 7000, reason: 'RECOUNT' });
  });

  it('damage takes cards off and added stock puts cards on', async () => {
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'DAMAGE', cards: 500 });
    expect(db.stock(lotId).left).toBe(7000);
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'ADDED_STOCK', cards: 2000 });
    expect(db.stock(lotId)).toMatchObject({ left: 9000, sold: 2500, total: 11500 });
    expect(db.bulkLotAdjustment.rows.map((r) => r.reason)).toEqual(['DAMAGE', 'ADDED_STOCK']);
  });

  it('emptying the lot marks it sold and adding cards puts it back on sale', async () => {
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'RECOUNT', cards: 0 });
    expect(db.stock(lotId)).toMatchObject({ left: 0, status: 'SOLD' });
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'ADDED_STOCK', cards: 300 });
    expect(db.stock(lotId)).toMatchObject({ left: 300, status: 'AVAILABLE' });
  });

  it('runs the change hook after it commits, and a failing hook does not undo it', async () => {
    const seen: string[] = [];
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'DAMAGE', cards: 100 }, { afterChange: (id, why) => void seen.push(`${id}:${why}`) });
    expect(seen).toEqual([`${lotId}:adjust`]);
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'DAMAGE', cards: 100 }, { afterChange: () => { throw new Error('boom'); } });
    expect(db.stock(lotId).left).toBe(7300);
  });

  it('refuses a recount that raced a sale, and changes nothing', async () => {
    const realUpdateMany = db.item.updateMany.bind(db.item);
    (db.item as any).updateMany = async (args: any) => {
      db.item.rows.find((x) => x.id === lotId)!.stockSold += 10; // a sale lands between the read and the write
      return realUpdateMany(args);
    };
    expect(await code(() => adjustBulkLot(db as any, CTX, lotId, { reason: 'RECOUNT', cards: 7000 }))).toBe('BULK_ADJUST_CONFLICT');
    expect(db.stock(lotId).total).toBe(10000);
    expect(db.bulkLotAdjustment.rows).toHaveLength(0);
  });

  it('added stock retries on the new numbers when it loses a race once', async () => {
    const realUpdateMany = db.item.updateMany.bind(db.item);
    let raced = false;
    (db.item as any).updateMany = async (args: any) => {
      if (!raced) {
        raced = true;
        db.item.rows.find((x) => x.id === lotId)!.stockSold += 10;
      }
      return realUpdateMany(args);
    };
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'ADDED_STOCK', cards: 100 });
    expect(db.stock(lotId)).toMatchObject({ sold: 2510, total: 10100 });
    expect(db.bulkLotAdjustment.rows).toHaveLength(1);
    expect(db.bulkLotAdjustment.rows[0]).toMatchObject({ beforeCount: 7490, afterCount: 7590 });
  });

  it('refuses another organizer, a missing item, and an item that is not a lot', async () => {
    expect(await code(() => adjustBulkLot(db as any, { organizerId: 'org2', actorUserId: 'x' }, lotId, { reason: 'DAMAGE', cards: 1 }))).toBe('BULK_NOT_FOUND');
    expect(await code(() => adjustBulkLot(db as any, CTX, 'nope', { reason: 'DAMAGE', cards: 1 }))).toBe('BULK_NOT_FOUND');
    db.item.rows.push({ id: 'plain1', organizerId: 'org1', stockTotal: 5, stockSold: 0, status: 'AVAILABLE' });
    expect(await code(() => adjustBulkLot(db as any, CTX, 'plain1', { reason: 'DAMAGE', cards: 1 }))).toBe('BULK_NOT_LOT');
    expect(db.bulkLotAdjustment.rows).toHaveLength(0);
  });

  it('refuses bad input: unknown reason, fraction, negative, too big, extra fields', async () => {
    for (const bad of [{ reason: 'OOPS', cards: 5 }, { reason: 'RECOUNT', cards: 1.5 }, { reason: 'RECOUNT', cards: -1 }, { reason: 'RECOUNT', cards: 2_000_000 }, { reason: 'RECOUNT', cards: 5, price: 1 }, { cards: 5 }]) {
      expect(await code(() => adjustBulkLot(db as any, CTX, lotId, bad))).toBe('BULK_VALIDATION');
    }
    expect(db.stock(lotId).total).toBe(10000);
  });
});

describe('listAdjustments', () => {
  it('lists the history newest first for the owner only', async () => {
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'DAMAGE', cards: 100 });
    await adjustBulkLot(db as any, CTX, lotId, { reason: 'ADDED_STOCK', cards: 50 });
    const list = await listAdjustments(db as any, CTX, lotId);
    expect(list.map((x) => x.reason)).toEqual(['ADDED_STOCK', 'DAMAGE']);
    expect(list[1]).toMatchObject({ beforeCount: 7500, afterCount: 7400 });
    expect(await code(() => listAdjustments(db as any, { organizerId: 'org2' }, lotId))).toBe('BULK_NOT_FOUND');
  });
});
