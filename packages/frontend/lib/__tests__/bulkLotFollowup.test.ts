/**
 * bulkLotFollowup (ADR-136 Addendum B, roadmap #659): the register and organizer screens for adjust, refunds, holds and offline conflicts.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 *
 * What this proves:
 *   - the price the register shows and queues matches the server to the cent (same golden numbers as the backend tests)
 *   - the refund preview gives the same cents the server will pay, pieces add up to the whole amount, and refusals match
 *   - adjust previews follow the server rules for each reason
 *   - conflict details from the server are read safely and described in one plain line each
 *   - every user facing string is free of em dashes, the word "AI", and the phrase "estate sale", and every code the new endpoints send has wording
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADJUST_REASONS,
  FOLLOWUP_COPY,
  FOLLOWUP_ERROR_COPY,
  allFollowupCopy,
  cardsOnHandAfter,
  clientLineAmount,
  clientPriceCents,
  describeAdjustment,
  describeConflict,
  describeFollowupCode,
  formatDollarsFromCents,
  isBulkReconcileCode,
  isNoRegisterAccess,
  parseOptionalEmail,
  pricePerThousandCents,
  previewCardRefund,
  readAdjustments,
  readConflicts,
} from '../bulkLotFollowup';

test('register price matches the server golden numbers', () => {
  const golden: Array<[number, number, number | null]> = [
    [1500, 800, 1200],
    [999, 800, 799],
    [1000, 800, 800],
    [1, 800, 1],
    [1, 500, 1],
    [3, 500, 2],
    [2, 1000, 2],
    [500, 1, 1],
    [1, 1, null], // under one cent
    [1_000_000, 99_999, 99_999_000],
    [123_457, 789, 97_408],
    [0, 800, null],
    [1.5, 800, null],
    [1_000_001, 800, null],
  ];
  for (const [cards, per, want] of golden) assert.equal(clientPriceCents(cards, per), want, `${cards} cards at ${per}`);
});

test('price per 1,000 rounds to whole cents and must be above zero', () => {
  assert.equal(pricePerThousandCents('8'), 800);
  assert.equal(pricePerThousandCents(8.005), 801);
  assert.equal(pricePerThousandCents('0'), null);
  assert.equal(pricePerThousandCents(''), null);
  assert.equal(pricePerThousandCents('abc'), null);
  assert.equal(pricePerThousandCents(0.001), null);
  assert.equal(clientLineAmount(1500, '8'), 12);
  assert.equal(clientLineAmount(1, '0.001'), null);
});

const FACTS = { soldCards: 1500, purchaseCents: 1200, returnedCards: 0, refundedCents: 0 };

test('refund preview pays the same cents as the server', () => {
  assert.deepEqual(previewCardRefund(FACTS, 500), { ok: true, cards: 500, cents: 400, isFull: false, outstandingAfter: 1000 });
  assert.deepEqual(previewCardRefund(FACTS, 1500), { ok: true, cards: 1500, cents: 1200, isFull: true, outstandingAfter: 0 });
});

test('refund preview pieces add up to the whole amount and the last is exact', () => {
  const facts = { soldCards: 1001, purchaseCents: 801, returnedCards: 0, refundedCents: 0 };
  let returned = 0;
  let refunded = 0;
  for (const take of [333, 333, 335]) {
    const p = previewCardRefund({ ...facts, returnedCards: returned, refundedCents: refunded }, take);
    assert.equal(p.ok, true);
    if (p.ok) {
      returned += p.cards;
      refunded += p.cents;
      if (take === 335) assert.equal(p.isFull, true);
    }
  }
  assert.equal(returned, 1001);
  assert.equal(refunded, 801);
});

test('refund preview refuses what the server refuses', () => {
  assert.deepEqual(previewCardRefund(FACTS, 1501), { ok: false, code: 'TOO_MANY', outstanding: 1500 });
  assert.equal(previewCardRefund(FACTS, 0).ok, false);
  assert.equal((previewCardRefund(FACTS, 0) as { code: string }).code, 'BAD_CARDS');
  assert.equal((previewCardRefund(FACTS, 2.5) as { code: string }).code, 'BAD_CARDS');
  assert.equal((previewCardRefund({ ...FACTS, returnedCards: 1500, refundedCents: 1200 }, 1) as { code: string }).code, 'DONE');
  assert.equal((previewCardRefund({ soldCards: 1000, purchaseCents: 1, returnedCards: 0, refundedCents: 0 }, 1) as { code: string }).code, 'TOO_SMALL');
});

test('adjust previews follow the server rules', () => {
  assert.deepEqual(ADJUST_REASONS, ['RECOUNT', 'DAMAGE', 'CORRECTION', 'ADDED_STOCK']);
  assert.equal(cardsOnHandAfter('RECOUNT', 7500, 7000), 7000);
  assert.equal(cardsOnHandAfter('RECOUNT', 7500, 0), 0);
  assert.equal(cardsOnHandAfter('CORRECTION', 7500, 8000), 8000);
  assert.equal(cardsOnHandAfter('DAMAGE', 7500, 500), 7000);
  assert.equal(cardsOnHandAfter('DAMAGE', 7500, 7501), null);
  assert.equal(cardsOnHandAfter('DAMAGE', 7500, 0), null);
  assert.equal(cardsOnHandAfter('ADDED_STOCK', 7500, 1000), 8500);
  assert.equal(cardsOnHandAfter('ADDED_STOCK', 7500, 0), null);
  assert.equal(cardsOnHandAfter('RECOUNT', 7500, -1), null);
  assert.equal(cardsOnHandAfter('RECOUNT', 7500, 1.5), null);
});

test('adjustment history is read safely and described plainly', () => {
  const rows = readAdjustments({ data: { adjustments: [{ id: 'a1', reason: 'RECOUNT', beforeCount: 1500, afterCount: 1420, totalBefore: 2000, totalAfter: 1920, note: ' counted twice ', createdAt: '2026-10-05T12:00:00.000Z' }, { nope: true }, null, 'x'] } });
  assert.equal(rows.length, 1);
  assert.equal(describeAdjustment(rows[0]), 'Recount: 1,500 to 1,420 (-80)');
  assert.equal(describeAdjustment({ reason: 'ADDED_STOCK', beforeCount: 10, afterCount: 1010 }), 'Added stock: 10 to 1,010 (+1,000)');
  assert.deepEqual(readAdjustments(undefined), []);
  assert.deepEqual(readAdjustments({ data: { adjustments: 'bad' } }), []);
});

test('conflict details are read safely and described in one line each', () => {
  const list = readConflicts({
    conflicts: [
      { itemId: 'i1', title: 'Commons', code: 'PRICE_CHANGED', message: 'x', requestedCards: 1500, clientCents: 1200, expectedCents: 1500, remainingCards: 10000 },
      { itemId: 'i2', title: 'Low', code: 'INSUFFICIENT_STOCK', message: 'y', requestedCards: 500, clientCents: 400, expectedCents: 400, remainingCards: 100 },
      { itemId: 'i3', code: 'NOT_AVAILABLE' },
      { title: 'no id' },
      null,
    ],
  });
  assert.equal(list.length, 3);
  assert.equal(describeConflict(list[0]), 'Commons: 1,500 cards were rung up at $12.00, now $15.00. The price changed while this device was offline.');
  assert.equal(describeConflict(list[1]), 'Low: 500 cards were rung up but only 100 are left.');
  assert.equal(describeConflict(list[2]), 'Bulk lot: sold out or no longer available.');
  assert.deepEqual(readConflicts(undefined), []);
  assert.deepEqual(readConflicts({ conflicts: 'bad' }), []);
});

test('the reconcile code is recognised', () => {
  assert.equal(isBulkReconcileCode('BULK_CONFLICT'), true);
  assert.equal(isBulkReconcileCode('ITEM_UNAVAILABLE'), false);
  assert.equal(isBulkReconcileCode(undefined), false);
});

test('money formatting', () => {
  assert.equal(formatDollarsFromCents(1200), '$12.00');
  assert.equal(formatDollarsFromCents(5), '$0.05');
  assert.equal(formatDollarsFromCents(123456789), '$1,234,567.89');
  assert.equal(formatDollarsFromCents(NaN), '$0.00');
});

test('every code the new endpoints send has wording, and the server text wins when present', () => {
  const sent = [
    'BULK_CONFLICT', 'BULK_USE_ADJUST', 'BULK_LOT_LISTING_TYPE', 'BULK_LOT_AUCTION', 'BULK_LOT_STATUS', 'BULK_LOT_PRICE', 'BULK_LOT_CHANNEL', 'BULK_LOT_BUSY',
    'BULK_ADJUST_BAD_COUNT', 'BULK_ADJUST_NO_CHANGE', 'BULK_ADJUST_CONFLICT', 'BULK_ADJUST_TOO_MANY', 'BULK_ADJUST_TOO_BIG',
    'BULK_REFUND_NOT_BULK', 'BULK_REFUND_BAD_CARDS', 'BULK_REFUND_TOO_MANY', 'BULK_REFUND_TOO_SMALL', 'BULK_REFUND_DONE', 'BULK_REFUND_AMOUNT_MISMATCH',
    'BULK_HOLD_NOT_FOUND', 'BULK_HOLD_NOT_ACTIVE', 'BULK_HOLD_LIMIT', 'BULK_HOLD_HAS_INVOICE', 'BULK_HOLD_LINK_FAILED', 'BULK_HOLD_PAYMENT_FAILED', 'BULK_HOLD_SQUARE_UNAVAILABLE',
    'BULK_CART_NOT_OPEN',
  ];
  for (const code of sent) assert.ok(FOLLOWUP_ERROR_COPY[code], `missing wording for ${code}`);
  assert.equal(describeFollowupCode('BULK_HOLD_LIMIT', 'Server says this'), 'Server says this');
  assert.equal(describeFollowupCode('BULK_HOLD_LIMIT'), FOLLOWUP_ERROR_COPY.BULK_HOLD_LIMIT);
  assert.ok(describeFollowupCode('SOMETHING_NEW').length > 0);
  assert.ok(describeFollowupCode(null).length > 0);
});

test('copy lint: no em dash, no "AI", no "estate sale", no empty or hype strings', () => {
  const all = allFollowupCopy();
  assert.ok(all.length > 60);
  for (const s of all) {
    assert.ok(s.trim().length > 0, 'empty string');
    assert.ok(!/[—–]/.test(s), `dash in: ${s}`);
    assert.ok(!/\bAI\b/i.test(s), `AI in: ${s}`);
    assert.ok(!/estate sale/i.test(s), `estate sale in: ${s}`);
    assert.ok(!/!{2,}/.test(s), `hype in: ${s}`);
  }
  assert.equal(FOLLOWUP_COPY.adjustButton, 'Adjust count');
});

// ---------------------------------------------------------------------------
// ADR-136 Addendum D: hold contact email and the team member view
// ---------------------------------------------------------------------------

test('optional customer email: blank is none, a valid address is lower-cased, anything else is refused', () => {
  assert.deepEqual(parseOptionalEmail(''), { ok: true, email: null });
  assert.deepEqual(parseOptionalEmail('   '), { ok: true, email: null });
  assert.deepEqual(parseOptionalEmail('  Sam@Example.COM '), { ok: true, email: 'sam@example.com' });
  for (const bad of ['nope', 'a@b', 'a b@example.com', '@example.com', 'sam@', 'sam@example.com\nBcc: x@y.com', 'x'.repeat(250) + '@example.com']) {
    assert.deepEqual(parseOptionalEmail(bad), { ok: false }, bad);
  }
});

test('a 403 from the server means no register access, nothing else does', () => {
  assert.equal(isNoRegisterAccess({ response: { status: 403, data: { code: 'FORBIDDEN' } } }), true);
  assert.equal(isNoRegisterAccess({ response: { status: 403 } }), true);
  assert.equal(isNoRegisterAccess({ response: { status: 404, data: { code: 'BULK_NOT_FOUND' } } }), false);
  assert.equal(isNoRegisterAccess({ response: { status: 500 } }), false);
  assert.equal(isNoRegisterAccess(new Error('network')), false);
  assert.equal(isNoRegisterAccess(null), false);
  assert.equal(describeFollowupCode('FORBIDDEN'), FOLLOWUP_COPY.staffNoAccess);
});

test('the team member view: the panel hides recount and refunds behind holdsOnly, and the staff page asks for it', () => {
  const panel = readFileSync(join(__dirname, '..', '..', 'components', 'BulkLotFollowupPanel.tsx'), 'utf8');
  const adjustAt = panel.indexOf('{/* Adjust */}');
  const holdsAt = panel.indexOf('{/* Holds */}');
  const gateAt = panel.indexOf('{!holdsOnly && (');
  assert.ok(gateAt > -1 && gateAt < adjustAt && adjustAt < holdsAt, 'adjust and refunds sit inside the holdsOnly gate, holds after it');
  assert.ok(panel.includes('enabled: !holdsOnly'), 'the sales list is not fetched for a team member');
  assert.ok(panel.includes('customerEmail: email.email'), 'the email is sent only when typed');
  const page = readFileSync(join(__dirname, '..', '..', 'pages', 'organizer', 'bulk-lots', '[saleId]', 'holds.tsx'), 'utf8');
  assert.ok(/<BulkLotFollowupPanel[^>]*holdsOnly/s.test(page));
  assert.ok(!page.includes("roles.includes('ORGANIZER')"), 'the page does not require the organizer role; the server decides');
});
