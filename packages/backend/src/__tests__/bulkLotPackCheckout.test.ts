/**
 * Online purchase of a bulk lot pack: the money core (ADR-136 Addendum E, roadmap #659). Fakes only: no Square, no database.
 *
 * WHAT THIS PROVES (lot: 10,000 cards at $8 per 1,000 in 1,000-card packs, so one pack is $8.00; PRO online fee 7.5% with the $0.75 floor)
 *   - the amount charged is the server price (N x pack price), the app fee is the single item checkout's fee math, and the Purchase
 *     carries the cards (bulkQuantity), the fee snapshot and the retry key
 *   - pickup only, no coupon, no item discount, and a pack too cheap to charge are all refused before any money moves
 *   - a replay (same retry token) answers with the first Purchase and charges nothing
 *   - two submits racing with two different card tokens: one sale, the second payment is refunded in full, the cards are taken once
 *   - cards that ran out between the page and the charge: nothing recorded, full refund, cash fee debt claim given back
 *   - a declined card or a thrown charge records nothing and gives the claim back
 *   - an unexpected failure while recording: if the sale did not commit the payment is refunded in full and the cards are back;
 *     if it did commit it is a replay; if we cannot tell, nothing is refunded and the caller is told not to pay again
 *   - the cash fee debt claimed into the app fee is stored on the Purchase
 */
import {
  PACK_MIN_CHARGE_CENTS,
  PackCheckoutDeps,
  PackCheckoutInput,
  assertPackSellableOnline,
  computePackFees,
  executePackCheckout,
  findPackReplay,
  packBuyerKey,
  packClientTransactionId,
  parsePackClientToken,
} from '../services/bulkLot/bulkLotPackCheckout';
import { planPackLine } from '../services/bulkLot/bulkLotPackService';
import { applyInclusiveFloor, calculateApplicationFee } from '../utils/feeCalculator';
import { fakeSell } from './__fixtures__/bulkLotFollowupFakes';
import { PackFakeDb } from './__fixtures__/bulkLotPackFakes';

const FEE = 0.075;
let db: PackFakeDb;
let lot: string;
let seq: number;

function codeOf(fn: () => unknown): string {
  try {
    fn();
    return 'NO_ERROR';
  } catch (e: any) {
    return String(e.code ?? e.message);
  }
}

function makeInput(over: Partial<PackCheckoutInput> & { packs?: number; token?: string; user?: string | null } = {}): PackCheckoutInput {
  const row = db.item.rows.find((x) => x.id === lot)!;
  const plan = planPackLine({ price: row.price, status: row.status, stockTotal: row.stockTotal, stockSold: row.stockSold }, 1000, over.packs ?? 1, null);
  const fees = computePackFees({ cents: plan.cents, feePercent: FEE });
  const user = over.user === undefined ? 'u1' : over.user;
  const buyerKey = packBuyerKey(user, 'guest@example.com');
  return {
    itemId: lot,
    saleId: 'sale1',
    txnKey: packClientTransactionId(buyerKey, over.token ?? 'token-aaaa-1111'),
    idempotencyKey: 'idem-' + (over.token ?? 'token-aaaa-1111'),
    plan,
    feeBreakdown: fees.feeBreakdown,
    platformFeeCents: fees.platformFeeCents,
    feePercent: FEE,
    buyer: { userId: user, email: user ? null : 'guest@example.com', name: user ? null : 'Guest' },
    ...over,
  } as PackCheckoutInput;
}

function makeDeps(over: Partial<PackCheckoutDeps> & { debtCents?: number } = {}) {
  const calls = { charge: [] as any[], refund: [] as any[], released: [] as number[], errors: [] as any[], applied: [] as any[] };
  const deps: PackCheckoutDeps = {
    db: db as any,
    sell: fakeSell(db) as any,
    applyDebt: async (a) => {
      calls.applied.push(a);
      const debt = over.debtCents ?? 0;
      return { appFeeCents: a.baseAppFeeCents + debt, debtAppliedCents: debt };
    },
    releaseDebt: async (c) => {
      calls.released.push(c);
    },
    charge: async (a) => {
      calls.charge.push(a);
      return { ok: true, paymentId: `pay_${++seq}`, cardFingerprint: 'fp_1' };
    },
    refund: async (a) => {
      calls.refund.push(a);
      return { status: 'REFUNDED', refundCents: a.amountCents };
    },
    resolveAttribution: async () => null,
    captureError: (err, extra) => {
      calls.errors.push({ err, extra });
    },
    ...over,
  };
  return { deps, calls };
}

beforeEach(() => {
  db = new PackFakeDb();
  lot = db.addPackLot({ title: 'Commons', price: 8, stockTotal: 10000 }, 1000).id;
  seq = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('fees and refusals', () => {
  it('uses the same fee math as the single item checkout, with the $0.75 floor', () => {
    expect(computePackFees({ cents: 800, feePercent: FEE }).platformFeeCents).toBe(75); // 60 floors to 75
    expect(computePackFees({ cents: 1600, feePercent: FEE }).platformFeeCents).toBe(120);
    expect(computePackFees({ cents: 20000, feePercent: FEE }).platformFeeCents).toBe(1500);
    expect(computePackFees({ cents: 800, feePercent: 0 }).platformFeeCents).toBe(0); // referral discount: no floor
    const same = applyInclusiveFloor(calculateApplicationFee(1600, FEE, false), FEE);
    expect(computePackFees({ cents: 1600, feePercent: FEE }).feeBreakdown).toEqual(same);
    expect(computePackFees({ cents: 1600, feePercent: FEE }).feeBreakdown.buyerPremiumCents).toBe(0);
  });

  it('refuses shipping, a coupon, an item discount and a pack too cheap to charge', () => {
    const ok = { cents: 1600, platformFeeCents: 120, shippingRequested: false, couponCode: undefined, organizerDiscountAmount: 0 };
    expect(codeOf(() => assertPackSellableOnline(ok))).toBe('NO_ERROR');
    expect(codeOf(() => assertPackSellableOnline({ ...ok, shippingRequested: true }))).toBe('BULK_PACK_PICKUP_ONLY');
    expect(codeOf(() => assertPackSellableOnline({ ...ok, couponCode: 'SAVE10' }))).toBe('BULK_PACK_NO_DISCOUNT');
    expect(codeOf(() => assertPackSellableOnline({ ...ok, couponCode: '   ' }))).toBe('NO_ERROR');
    expect(codeOf(() => assertPackSellableOnline({ ...ok, organizerDiscountAmount: 2 }))).toBe('BULK_PACK_NO_DISCOUNT');
    expect(codeOf(() => assertPackSellableOnline({ ...ok, cents: PACK_MIN_CHARGE_CENTS - 1, platformFeeCents: 0 }))).toBe('BULK_PACK_TOO_CHEAP');
    expect(codeOf(() => assertPackSellableOnline({ ...ok, cents: 70, platformFeeCents: 75 }))).toBe('BULK_PACK_TOO_CHEAP'); // the fee would take it all
    expect(codeOf(() => assertPackSellableOnline({ ...ok, cents: 80, platformFeeCents: 75 }))).toBe('NO_ERROR');
  });

  it('the retry token and keys', () => {
    expect(parsePackClientToken('abcdefgh')).toBe('abcdefgh');
    expect(parsePackClientToken('  3f2b1c9e-1111-4222-8333-444455556666 ')).toBe('3f2b1c9e-1111-4222-8333-444455556666');
    for (const bad of [undefined, null, 5, '', 'short', 'x'.repeat(101), 'has space here', 'semi;colon-token']) expect(parsePackClientToken(bad as any)).toBeNull();
    expect(packBuyerKey('u1', null)).toBe('u:u1');
    const g = packBuyerKey(null, ' Guest@Example.com ');
    expect(g).toBe(packBuyerKey(null, 'guest@example.com'));
    expect(g).not.toContain('example');
    expect(packClientTransactionId('u:u1', 'tok-12345')).toBe('bulkpack:u:u1:tok-12345');
  });
});

describe('a normal sale', () => {
  it('charges the server price, records the cards and the fee snapshot, and takes the stock', async () => {
    const { deps, calls } = makeDeps();
    const res = await executePackCheckout(deps, makeInput({ packs: 2 }));
    expect(res.outcome).toBe('RECORDED');
    expect(calls.charge).toHaveLength(1);
    expect(calls.charge[0]).toMatchObject({ amountCents: 1600, appFeeCents: 120, idempotencyKey: 'idem-token-aaaa-1111' });
    expect(calls.applied[0]).toEqual({ baseAppFeeCents: 120, saleAmountCents: 1600 });
    expect(db.purchase.rows).toHaveLength(1);
    expect(db.purchase.rows[0]).toMatchObject({
      userId: 'u1',
      itemId: lot,
      saleId: 'sale1',
      amount: 16,
      platformFeeAmount: 1.2,
      bulkQuantity: 2000,
      processor: 'SQUARE',
      status: 'PAID',
      source: 'ONLINE',
      deliveryMethod: 'LOCAL_PICKUP',
      squarePaymentId: 'pay_1',
      buyerCardFingerprint: 'fp_1',
      clientTransactionId: packClientTransactionId(packBuyerKey('u1', null), 'token-aaaa-1111'),
      commissionAmount: 1.2,
      commissionRate: FEE,
      buyerPremiumAmount: 0,
      organizerAbsorbedPremium: false,
    });
    expect(db.stock(lot).sold).toBe(2000);
    if (res.outcome === 'RECORDED') {
      expect(res.fullySoldOut).toBe(false);
      expect(res.remainingStock).toBe(8000);
      expect(res.purchase.id).toBe(db.purchase.rows[0].id);
    }
    // The recording transaction takes the advisory lock on this attempt's key first.
    expect(db.rawCalls.filter((c) => c.includes('pg_advisory_xact_lock'))).toHaveLength(1);
    expect(db.rawCalls[0]).toContain('pack-attempt:' + packClientTransactionId(packBuyerKey('u1', null), 'token-aaaa-1111'));
    expect(calls.refund).toEqual([]);
    expect(calls.released).toEqual([]);
  });

  it('a guest purchase stores the email and name and no user id', async () => {
    const { deps } = makeDeps();
    await executePackCheckout(deps, makeInput({ user: null }));
    expect(db.purchase.rows[0]).toMatchObject({ userId: null, buyerEmail: 'guest@example.com', guestName: 'Guest' });
  });

  it('the last pack marks the lot sold out', async () => {
    db.item.rows.find((x) => x.id === lot)!.stockSold = 9000;
    const { deps } = makeDeps();
    const res = await executePackCheckout(deps, makeInput());
    expect(res.outcome === 'RECORDED' && res.fullySoldOut).toBe(true);
    expect(db.stock(lot)).toMatchObject({ left: 0, status: 'SOLD' });
  });

  it('stores the cash fee debt claimed into the app fee and the affiliate attribution', async () => {
    const { deps, calls } = makeDeps({ debtCents: 30, resolveAttribution: async () => 'aff_1' });
    const res = await executePackCheckout(deps, makeInput({ packs: 2 }));
    expect(calls.charge[0].appFeeCents).toBe(150);
    expect(db.purchase.rows[0]).toMatchObject({ platformFeeAmount: 1.5, cashDebtCollectedAmount: 0.3, affiliateLinkId: 'aff_1' });
    expect(res.outcome === 'RECORDED' && res.debtAppliedCents).toBe(30);
  });
});

describe('replays and double submits', () => {
  it('the same retry token after a recorded sale answers with it and charges nothing', async () => {
    const first = makeDeps();
    await executePackCheckout(first.deps, makeInput());
    const second = makeDeps();
    const res = await executePackCheckout(second.deps, makeInput());
    expect(res.outcome).toBe('REPLAY');
    expect(second.calls.charge).toEqual([]);
    expect(second.calls.applied).toEqual([]);
    expect(db.purchase.rows).toHaveLength(1);
    expect(db.stock(lot).sold).toBe(1000);
    expect(await findPackReplay(db as any, makeInput().txnKey)).toBeTruthy();
    expect(await findPackReplay(db as any, 'bulkpack:u:u1:other-token')).toBeNull();
  });

  it('two submits at once with two different card tokens: one sale, the second payment is refunded in full', async () => {
    const a = makeDeps();
    const b = makeDeps();
    const inputA = makeInput();
    const inputB = makeInput(); // same retry token, so the same key; different card nonce means a different Square payment
    const [ra, rb] = await Promise.all([executePackCheckout(a.deps, inputA), executePackCheckout(b.deps, inputB)]);
    const outcomes = [ra.outcome, rb.outcome].sort();
    expect(outcomes).toEqual(['DUPLICATE_REFUNDED', 'RECORDED']);
    expect(db.purchase.rows).toHaveLength(1);
    expect(db.stock(lot).sold).toBe(1000);
    const loser = ra.outcome === 'DUPLICATE_REFUNDED' ? a : b;
    const winner = ra.outcome === 'RECORDED' ? a : b;
    expect(loser.calls.refund).toHaveLength(1);
    expect(loser.calls.refund[0]).toMatchObject({ amountCents: 800, reason: 'DUPLICATE' });
    expect(loser.calls.refund[0].paymentId).not.toBe(db.purchase.rows[0].squarePaymentId);
    expect(loser.calls.released).toEqual([0]);
    expect(winner.calls.refund).toEqual([]);
    const dup = ra.outcome === 'DUPLICATE_REFUNDED' ? ra : rb;
    if (dup.outcome === 'DUPLICATE_REFUNDED') expect(dup.purchase.id).toBe(db.purchase.rows[0].id);
  });

  it('two different buyers with the same token text are two orders', async () => {
    const { deps } = makeDeps();
    await executePackCheckout(deps, makeInput({ user: 'u1' }));
    await executePackCheckout(deps, makeInput({ user: 'u2' }));
    expect(db.purchase.rows).toHaveLength(2);
    expect(db.stock(lot).sold).toBe(2000);
  });

  it('a new token after a decline is a fresh attempt', async () => {
    const decline = makeDeps({ charge: async () => ({ ok: false, code: 'GENERIC_DECLINE', message: 'Your card was declined.' }) });
    expect((await executePackCheckout(decline.deps, makeInput())).outcome).toBe('DECLINED');
    const good = makeDeps();
    expect((await executePackCheckout(good.deps, makeInput({ token: 'token-bbbb-2222' }))).outcome).toBe('RECORDED');
    expect(db.purchase.rows).toHaveLength(1);
  });
});

describe('failures around the charge', () => {
  it('cards that ran out after the page but before the charge: nothing recorded, full refund, claim given back', async () => {
    const input = makeInput({ packs: 2 }); // planned while 10 packs were left
    db.item.rows.find((x) => x.id === lot)!.stockSold = 9500; // another sale took cards since
    const { deps, calls } = makeDeps({ debtCents: 20 });
    const res = await executePackCheckout(deps, input);
    expect(res.outcome).toBe('SOLD_OUT_AFTER_PAYMENT');
    expect(calls.charge).toHaveLength(1);
    expect(calls.refund).toHaveLength(1);
    expect(calls.refund[0]).toMatchObject({ amountCents: 1600, reason: 'SOLD_OUT', paymentId: 'pay_1' });
    expect(calls.released).toEqual([20]);
    expect(db.purchase.rows).toHaveLength(0);
    expect(db.stock(lot).sold).toBe(9500);
  });

  it('a manual refund result is passed through for the caller to explain', async () => {
    const { deps } = makeDeps({ refund: async (a) => ({ status: 'MANUAL', refundCents: a.amountCents }) });
    const input = makeInput({ packs: 2 });
    db.item.rows.find((x) => x.id === lot)!.stockSold = 9500;
    const res = await executePackCheckout(deps, input);
    expect(res.outcome).toBe('SOLD_OUT_AFTER_PAYMENT');
    if (res.outcome === 'SOLD_OUT_AFTER_PAYMENT') expect(res.refund.status).toBe('MANUAL');
  });

  it('a declined card records nothing and gives the claim back', async () => {
    const { deps, calls } = makeDeps({ debtCents: 25, charge: async () => ({ ok: false, code: 'CVV_FAILURE', message: 'Your card was declined.' }) });
    const res = await executePackCheckout(deps, makeInput());
    expect(res).toEqual({ outcome: 'DECLINED', code: 'CVV_FAILURE', message: 'Your card was declined.' });
    expect(calls.released).toEqual([25]);
    expect(db.purchase.rows).toHaveLength(0);
    expect(db.stock(lot).sold).toBe(0);
  });

  it('a charge that throws records nothing, gives the claim back, and rethrows', async () => {
    const { deps, calls } = makeDeps({ debtCents: 25, charge: async () => { throw new Error('network'); } });
    await expect(executePackCheckout(deps, makeInput())).rejects.toThrow('network');
    expect(calls.released).toEqual([25]);
    expect(db.purchase.rows).toHaveLength(0);
  });
});

describe('an unexpected failure while recording (the card is already charged)', () => {
  function failingCreate() {
    const original = db.purchase.create.bind(db.purchase);
    db.purchase.create = async () => {
      throw new Error('connection reset');
    };
    return original;
  }

  it('did not commit: the cards are back, the payment is refunded in full, the error is reported', async () => {
    failingCreate();
    const { deps, calls } = makeDeps({ debtCents: 10 });
    const res = await executePackCheckout(deps, makeInput({ packs: 3 }));
    expect(res.outcome).toBe('RECORD_FAILED');
    if (res.outcome === 'RECORD_FAILED') expect(res.refund).toEqual({ status: 'REFUNDED', refundCents: 2400 });
    expect(calls.refund[0]).toMatchObject({ amountCents: 2400, reason: 'RECORD_FAILED' });
    expect(calls.released).toEqual([10]);
    expect(calls.errors).toHaveLength(1);
    expect(calls.errors[0].extra).toMatchObject({ itemId: lot, squarePaymentId: 'pay_1' });
    expect(db.stock(lot).sold).toBe(0); // the transaction rolled the cards back
    expect(db.purchase.rows).toHaveLength(0);
  });

  it('did commit before the error: it is a replay, nothing is refunded', async () => {
    const realTx = db.$transaction.bind(db);
    db.$transaction = (async (fn: any) => {
      await realTx(fn);
      throw new Error('lost the commit acknowledgement');
    }) as any;
    const { deps, calls } = makeDeps();
    const res = await executePackCheckout(deps, makeInput());
    expect(res.outcome).toBe('REPLAY');
    if (res.outcome === 'REPLAY') expect(res.commitRecovered).toBe(true);
    expect(calls.refund).toEqual([]);
    expect(db.purchase.rows).toHaveLength(1);
    expect(db.stock(lot).sold).toBe(1000);
  });

  it('cannot tell (the read back also fails): nothing is refunded and the claim stays', async () => {
    failingCreate();
    const realFind = db.purchase.findFirst.bind(db.purchase);
    let calls_ = 0;
    db.purchase.findFirst = (async (a: any) => {
      calls_++;
      // 1 = replay check before the charge, 2 = inside the transaction, 3 = the read back
      if (calls_ >= 3) throw new Error('database unreachable');
      return realFind(a);
    }) as any;
    const { deps, calls } = makeDeps({ debtCents: 10 });
    const res = await executePackCheckout(deps, makeInput());
    expect(res).toMatchObject({ outcome: 'RECORD_FAILED', paymentId: 'pay_1', refund: null });
    expect(calls.refund).toEqual([]);
    expect(calls.released).toEqual([]);
    expect(calls.errors).toHaveLength(1);
  });
});
