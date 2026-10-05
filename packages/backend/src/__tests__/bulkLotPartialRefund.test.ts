/**
 * Partial-quantity refunds of bulk lot sales (ADR-136 Addendum B, roadmap #659).
 *
 * WHAT THIS PROVES (lot at $8 per 1,000; 1,500 cards = $12.00 = 1200 cents):
 *   - the card to money math is exact (BigInt), consistent with sale pricing, and the pieces always add up to the whole amount
 *   - "take 500 cards back" pays the right cents, puts exactly 500 cards back on the lot, and a sold out lot comes back on sale
 *   - a replay of the same refund (same target) changes nothing: no second stock return, no second audit row
 *   - a refund racing another one (compare and swap loses) recomputes its own remainder instead of double returning
 *   - a refund by money converts to a card target; a full refund returns every card and the whole amount
 *   - too many cards, zero cards, junk and a fully returned row are refused with their codes
 *   - a test transaction gives no stock back
 */
import {
  applyBulkRefundReturn,
  centsForCardTarget,
  mulDivFloor,
  mulDivHalfUp,
  planExplicitCardRefund,
  targetCardsForMoney,
} from '../services/bulkLot/bulkLotRefundService';
import { FakeDb } from './__fixtures__/bulkLotFollowupFakes';

const FACTS = { soldCards: 1500, purchaseCents: 1200, returnedCards: 0, refundedCents: 0 };

function codeOf(fn: () => unknown): string {
  try {
    fn();
    return 'NO_ERROR';
  } catch (e: any) {
    return String(e.code ?? e.message);
  }
}

function seed(over: Record<string, any> = {}) {
  const db = new FakeDb();
  const lot = db.addLot({ stockTotal: 1500, stockSold: 1500, status: 'SOLD' });
  db.purchase.rows.push({ id: 'p1', itemId: lot.id, bulkQuantity: 1500, amount: 12, bulkRefundedQuantity: 0, ...over });
  return { db, lot };
}

describe('refund math', () => {
  it('multiplies and divides exactly, even past 2^53', () => {
    expect(mulDivFloor(1500, 1200, 1500)).toBe(1200);
    expect(mulDivFloor(999999, 999999, 1000000)).toBe(999998);
    expect(mulDivFloor(0, 5, 3)).toBe(0);
    expect(mulDivFloor(5, 5, 0)).toBe(0);
    expect(mulDivHalfUp(1200, 1, 3)).toBe(400);
    expect(mulDivHalfUp(5, 1, 2)).toBe(3);
    expect(mulDivHalfUp(4, 1, 3)).toBe(1);
    expect(mulDivHalfUp(9_000_000_000, 9_000_000_000, 9_000_000_000)).toBe(9_000_000_000);
  });

  it('maps money to a card target and back, and the whole amount reaches every card', () => {
    expect(targetCardsForMoney(FACTS, 0)).toBe(0);
    expect(targetCardsForMoney(FACTS, 400)).toBe(500);
    expect(targetCardsForMoney(FACTS, 401)).toBe(501);
    expect(targetCardsForMoney(FACTS, 1199)).toBe(1498);
    expect(targetCardsForMoney(FACTS, 1200)).toBe(1500);
    expect(targetCardsForMoney(FACTS, 5000)).toBe(1500);
    expect(targetCardsForMoney({ soldCards: 0, purchaseCents: 100 }, 100)).toBe(0);
    expect(targetCardsForMoney({ soldCards: 10, purchaseCents: 0 }, 5)).toBe(10);
    expect(centsForCardTarget(FACTS, 500)).toBe(400);
    expect(centsForCardTarget(FACTS, 1500)).toBe(1200);
    expect(centsForCardTarget(FACTS, 9999)).toBe(1200);
  });
});

describe('planExplicitCardRefund', () => {
  it('pays the money for exactly those cards', () => {
    expect(planExplicitCardRefund(FACTS, 500)).toEqual({ cards: 500, targetCards: 500, cents: 400, isFull: false });
  });

  it('accepts a numeric string with separators', () => {
    expect(planExplicitCardRefund(FACTS, '1,000').cents).toBe(800);
  });

  it('pieces add up to the whole amount and the last piece is exact', () => {
    // 1,001 cards at 2 cents each-ish: 1001 cards sold for 1 cent per 1000 -> odd amounts
    const facts = { soldCards: 1001, purchaseCents: 801, returnedCards: 0, refundedCents: 0 };
    let returned = 0;
    let refunded = 0;
    let total = 0;
    for (const take of [333, 333, 335]) {
      const plan = planExplicitCardRefund({ ...facts, returnedCards: returned, refundedCents: refunded }, take);
      returned = plan.targetCards;
      refunded += plan.cents;
      total += plan.cents;
      if (take === 335) expect(plan.isFull).toBe(true);
    }
    expect(returned).toBe(1001);
    expect(total).toBe(801);
  });

  it('refuses too many, zero, junk, and a row already returned in full', () => {
    expect(codeOf(() => planExplicitCardRefund(FACTS, 1501))).toBe('BULK_REFUND_TOO_MANY');
    expect(codeOf(() => planExplicitCardRefund(FACTS, 0))).toBe('BULK_REFUND_BAD_CARDS');
    expect(codeOf(() => planExplicitCardRefund(FACTS, -3))).toBe('BULK_REFUND_BAD_CARDS');
    expect(codeOf(() => planExplicitCardRefund(FACTS, 'abc'))).toBe('BULK_REFUND_BAD_CARDS');
    expect(codeOf(() => planExplicitCardRefund(FACTS, 2.5))).toBe('BULK_REFUND_BAD_CARDS');
    expect(codeOf(() => planExplicitCardRefund({ ...FACTS, returnedCards: 1500, refundedCents: 1200 }, 1))).toBe('BULK_REFUND_DONE');
  });

  it('refuses a refund worth under a cent', () => {
    const tiny = { soldCards: 1000, purchaseCents: 1, returnedCards: 0, refundedCents: 0 };
    expect(codeOf(() => planExplicitCardRefund(tiny, 1))).toBe('BULK_REFUND_TOO_SMALL');
  });
});

describe('applyBulkRefundReturn', () => {
  it('puts the cards back, reopens a sold out lot, and writes one audit row', async () => {
    const { db, lot } = seed();
    const r = await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 500, cents: 400, source: 'ORGANIZER', actorUserId: 'u1' });
    expect(r).toEqual({ deltaCards: 500, stockReturned: 500, cumulativeCards: 500, replay: false });
    expect(db.stock(lot.id)).toMatchObject({ sold: 1000, status: 'AVAILABLE' });
    expect(db.purchase.rows[0].bulkRefundedQuantity).toBe(500);
    expect(db.bulkLotRefund.rows).toHaveLength(1);
    expect(db.bulkLotRefund.rows[0]).toMatchObject({ cardsReturned: 500, cumulativeCards: 500, cents: 400, source: 'ORGANIZER', idempotencyKey: 'cum:500' });
  });

  it('is idempotent: the same target twice returns the cards once and writes one row', async () => {
    const { db, lot } = seed();
    const args = { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 500, cents: 400, source: 'ORGANIZER' as const };
    await applyBulkRefundReturn(db as any, args);
    const again = await applyBulkRefundReturn(db as any, args);
    expect(again).toMatchObject({ deltaCards: 0, stockReturned: 0, replay: true, cumulativeCards: 500 });
    expect(db.stock(lot.id).sold).toBe(1000);
    expect(db.bulkLotRefund.rows).toHaveLength(1);
  });

  it('a smaller target after a larger one never moves the count down', async () => {
    const { db, lot } = seed();
    await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 900, cents: 720, source: 'ORGANIZER' });
    const r = await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 400, cents: 320, source: 'ADMIN' });
    expect(r.replay).toBe(true);
    expect(db.purchase.rows[0].bulkRefundedQuantity).toBe(900);
    expect(db.stock(lot.id).sold).toBe(600);
  });

  it('two refunds in a row move only the difference each time and end exact', async () => {
    const { db, lot } = seed();
    await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 500, cents: 400, source: 'ORGANIZER' });
    const second = await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 1500, cents: 800, source: 'ORGANIZER' });
    expect(second.deltaCards).toBe(1000);
    expect(db.stock(lot.id).sold).toBe(0);
    expect(db.bulkLotRefund.rows.map((x) => x.cardsReturned)).toEqual([500, 1000]);
  });

  it('a client key is kept on the audit row', async () => {
    const { db, lot } = seed();
    await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 100, cents: 80, source: 'ORGANIZER', idempotencyKey: 'client-key-1' });
    expect(db.bulkLotRefund.rows[0].idempotencyKey).toBe('client-key-1');
  });

  it('loses a compare and swap race, re-reads, and returns only its own remainder', async () => {
    const { db, lot } = seed();
    const realUpdateMany = db.purchase.updateMany.bind(db.purchase);
    let raced = false;
    // Another refund lands between our read and our swap: it already moved the count to 300 and returned 300 cards.
    (db.purchase as any).updateMany = async (args: any) => {
      if (!raced) {
        raced = true;
        db.purchase.rows[0].bulkRefundedQuantity = 300;
        db.item.rows.find((x) => x.id === lot.id)!.stockSold -= 300;
      }
      return realUpdateMany(args);
    };
    const r = await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 500, cents: 400, source: 'ORGANIZER' });
    expect(r.deltaCards).toBe(200);
    expect(db.purchase.rows[0].bulkRefundedQuantity).toBe(500);
    expect(db.stock(lot.id).sold).toBe(1000);
  });

  it('floors stockSold at zero when a recount already lowered it', async () => {
    const { db, lot } = seed();
    db.item.rows.find((x) => x.id === lot.id)!.stockSold = 200;
    const r = await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 500, cents: 400, source: 'ORGANIZER' });
    expect(r.stockReturned).toBe(200);
    expect(db.stock(lot.id).sold).toBe(0);
    expect(db.purchase.rows[0].bulkRefundedQuantity).toBe(500);
  });

  it('a test transaction moves the count and writes the row but gives no stock back', async () => {
    const { db, lot } = seed();
    const r = await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 500, cents: 400, source: 'ORGANIZER', isTestTransaction: true });
    expect(r.stockReturned).toBe(0);
    expect(db.stock(lot.id).sold).toBe(1500);
    expect(db.purchase.rows[0].bulkRefundedQuantity).toBe(500);
  });

  it('clamps a target past what was sold', async () => {
    const { db, lot } = seed();
    const r = await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 99999, cents: 1200, source: 'DISPUTE' });
    expect(r.cumulativeCards).toBe(1500);
    expect(db.stock(lot.id).sold).toBe(0);
  });

  it('a full refund after a partial one returns the rest and keeps the lot available', async () => {
    const { db, lot } = seed();
    await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 750, cents: 600, source: 'ORGANIZER' });
    await applyBulkRefundReturn(db as any, { purchaseId: 'p1', itemId: lot.id, soldCards: 1500, targetCards: 1500, cents: 600, source: 'ORGANIZER' });
    expect(db.stock(lot.id)).toMatchObject({ sold: 0, status: 'AVAILABLE' });
  });
});
