/**
 * priceBookRules (ADR-140 batch B6, AT-31 part): money parsing, describeRule sentences, preview summary and rate gap text,
 * and the WhyThisPrice view model. Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MONEY_CENTS,
  buildWhyThisPrice,
  defaultSelectedCount,
  describeApplyButton,
  describeApplyConfirm,
  describeApplyOutcome,
  describePreviewSummary,
  describeRateGap,
  describeRule,
  describeUndoOutcome,
  formatBps,
  formatChangePercent,
  formatLongDate,
  formatMoney,
  formatShortDate,
  isPreviewStale,
  parseMoneyToCents,
  parsePercentToBps,
  rateChangeWarnings,
  runItemStatusText,
} from '../priceBookRules';
import { PRICE_BOOK_COPY } from '../priceBookCopy';
import type { PriceBookResultBlock } from '../priceBook';

function lintLine(text: string, where: string): void {
  assert.ok(text.trim().length > 0, `${where}: empty`);
  assert.ok(!/\bAI\b/i.test(text), `${where}: banned word in ${text}`);
  assert.ok(!/estate\s*sale/i.test(text), `${where}: banned phrase in ${text}`);
  assert.ok(!text.includes(String.fromCharCode(0x2014)) && !text.includes(String.fromCharCode(0x2013)), `${where}: dash in ${text}`);
  assert.ok(!/[^\x20-\x7E]/.test(text), `${where}: non-ASCII in ${text}`);
  assert.ok(!/undefined|NaN|\[object|null/.test(text), `${where}: leaked value in ${text}`);
}

// ---------------------------------------------------------------------------
// Money, percent, dates
// ---------------------------------------------------------------------------

test('parseMoneyToCents: typed money becomes whole cents, anything else is null', () => {
  const good: Array<[unknown, number]> = [
    ['12', 1200], ['12.5', 1250], ['12.50', 1250], ['0.99', 99], ['.5', 50], ['0', 0], ['  $1,234.50 ', 123450], ['$ 7', 700],
    ['1,000', 100000], ['1000000', 100000000], ['0.05', 5], [12, 1200], [12.5, 1250], [0.1 + 0.2 + 0.7, 100], [1.15, 115], [0, 0],
  ];
  for (const [input, cents] of good) assert.equal(parseMoneyToCents(input), cents, String(input));
  const bad: unknown[] = [
    '', '   ', '$', '.', 'abc', '12abc', '-5', '-0.5', '1.234', '1e3', '12.', '1,23', '1,2345', ',100', '1.2.3', '1 000', '$$5', '5%',
    '1000000.01', '99999999999', null, undefined, {}, [], true, -1, NaN, Infinity, 1.234, 1000000.01,
  ];
  for (const input of bad) assert.equal(parseMoneyToCents(input), null, String(input));
  assert.equal(MAX_MONEY_CENTS, 100000000);
});

test('formatMoney: cents become a dollar string with commas, and non-numbers give an empty string', () => {
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(formatMoney(5), '$0.05');
  assert.equal(formatMoney(99), '$0.99');
  assert.equal(formatMoney(1025), '$10.25');
  assert.equal(formatMoney(100000), '$1,000.00');
  assert.equal(formatMoney(123456789), '$1,234,567.89');
  assert.equal(formatMoney(-150), '-$1.50');
  assert.equal(formatMoney(1025.4), '$10.25');
  assert.equal(formatMoney(null), '');
  assert.equal(formatMoney(undefined), '');
  assert.equal(formatMoney(NaN), '');
  assert.equal(formatMoney(Infinity), '');
  for (const cents of [0, 1, 99, 100, 101, 999, 1000, 123456, 99999999]) {
    assert.equal(parseMoneyToCents(formatMoney(cents)), cents, `round trip ${cents}`);
  }
});

test('percent helpers: basis points to a number and back', () => {
  assert.equal(formatBps(10000), '100');
  assert.equal(formatBps(9500), '95');
  assert.equal(formatBps(9550), '95.5');
  assert.equal(formatBps(8333), '83.33');
  assert.equal(formatBps(0), '0');
  assert.equal(formatBps(null), '');
  assert.equal(parsePercentToBps('95'), 9500);
  assert.equal(parsePercentToBps('95.5'), 9550);
  assert.equal(parsePercentToBps(' 95% '), 9500);
  assert.equal(parsePercentToBps('0'), 0);
  assert.equal(parsePercentToBps('1000'), 100000);
  for (const bad of ['', 'abc', '-5', '95.555', '1001', '12345', '5 %%', null, undefined, 95]) assert.equal(parsePercentToBps(bad), null, String(bad));
});

test('dates are shown in UTC so they read the same everywhere', () => {
  assert.equal(formatShortDate('2026-10-03T14:00:00.000Z'), 'Oct 3');
  assert.equal(formatShortDate('2026-10-12T23:59:59.000Z'), 'Oct 12');
  assert.equal(formatLongDate('2026-10-03T14:00:00.000Z'), 'Oct 3, 2026');
  assert.equal(formatShortDate('2026-01-01T00:00:00.000Z'), 'Jan 1');
  for (const bad of [null, undefined, '', 'not a date']) {
    assert.equal(formatShortDate(bad), '');
    assert.equal(formatLongDate(bad), '');
  }
  assert.equal(formatChangePercent(12.5), '+12.5 percent');
  assert.equal(formatChangePercent(8), '+8 percent');
  assert.equal(formatChangePercent(-3), '-3 percent');
  assert.equal(formatChangePercent(0), '0 percent');
  assert.equal(formatChangePercent(null), '');
});

// ---------------------------------------------------------------------------
// describeRule
// ---------------------------------------------------------------------------

test('describeRule: the sentence of ADR-140 section 11.2 is produced word for word', () => {
  assert.equal(
    describeRule({
      family: 'RETAIL',
      rarityClass: 'RARE',
      finish: 'FOIL',
      refMinCents: 100,
      refMaxCents: 999,
      sourceKinds: ['MANUAL', 'SHOP_SOLD_HISTORY'],
      basis: 'REFERENCE',
      percentBps: 9500,
      roundingMode: 'NEAREST_25C',
      roundingDirection: 'NEAREST',
      floorCents: 99,
    }),
    'Rare foil cards worth $1.00 to $9.99: start from your typed price or your recent sales, price at 95 percent, round to the nearest 25 cents, never go below $0.99.'
  );
});

test('describeRule: matchers read as a short noun phrase', () => {
  const base = { family: 'RETAIL', basis: 'REFERENCE', percentBps: 10000, roundingMode: 'TIERED', roundingDirection: 'NEAREST' };
  const tail = ': start from the first price your book finds, price at 100 percent, round in steps that grow with the price.';
  assert.equal(describeRule(base), 'All cards' + tail);
  assert.equal(describeRule({ ...base, game: 'MTG' }), 'Magic cards' + tail);
  assert.equal(describeRule({ ...base, game: 'POKEMON', finish: 'REVERSE_HOLO', rarityClass: 'RARE' }), 'Pokemon rare reverse holo cards' + tail);
  assert.equal(describeRule({ ...base, game: 'POKEMON', variantToken: 'FIRST_EDITION', rarityText: 'Double Rare' }), 'Pokemon 1st Edition double rare cards' + tail);
  assert.equal(describeRule({ ...base, variantToken: 'NONE' }), 'All cards with no edition mark' + tail);
  assert.equal(describeRule({ ...base, setCode: 'lea', language: 'ja' }), 'All cards from set LEA in Japanese' + tail);
  assert.equal(describeRule({ ...base, rarityClass: 'COMMON', finish: 'ANY' }), 'Common cards' + tail);
  assert.equal(describeRule({ ...base, game: 'LORCANA' }), 'Lorcana cards' + tail);
  assert.equal(describeRule({ ...base, game: 'FUTUREGAME', language: 'xx' }), 'FUTUREGAME cards in XX' + tail);
  assert.equal(describeRule({ ...base, rarityClass: 'constructor' }), 'All cards' + tail);
});

test('describeRule: price band, at least, up to', () => {
  const base = { family: 'RETAIL', basis: 'REFERENCE', percentBps: 10000 };
  assert.ok(describeRule({ ...base, refMinCents: 100 }).startsWith('All cards worth $1.00 or more: '));
  assert.ok(describeRule({ ...base, refMaxCents: 149 }).startsWith('All cards worth up to $1.49: '));
  assert.ok(describeRule({ ...base, refMinCents: 150, refMaxCents: 2499 }).startsWith('All cards worth $1.50 to $24.99: '));
  assert.ok(describeRule({ ...base, refMinCents: 0 }).startsWith('All cards worth $0.00 or more: '));
});

test('describeRule: what to start from', () => {
  const sentence = (over: Record<string, unknown>) => describeRule({ family: 'RETAIL', percentBps: 10000, ...over });
  assert.ok(sentence({ basis: 'REFERENCE', sourceKinds: ['SHOP_BENCHMARK'] }).includes('start from your benchmark for this kind of card'));
  assert.ok(sentence({ basis: 'REFERENCE', sourceKinds: ['MANUAL', 'SHOP_SOLD_HISTORY', 'CATALOG_REFERENCE'] }).includes('start from your typed price, your recent sales or the catalog estimate'));
  assert.ok(sentence({ basis: 'REFERENCE', sourceKinds: ['NOT_A_KIND'] }).includes('start from the first price your book finds'));
  assert.ok(sentence({ basis: 'REFERENCE' }).includes('start from the first price your book finds'));
  assert.ok(sentence({ basis: 'COST_PLUS', percentBps: 12000, minMarginBps: 1500 }).includes('start from your cost, price at 120 percent, keep at least 15 percent over your cost'));
  assert.ok(sentence({ basis: 'BULK_RATE' }).includes('start from your bulk rate card'));
  assert.ok(sentence({ basis: 'RETAIL_PRICE' }).includes('start from your shelf price'));
  assert.ok(sentence({ basis: 'FIXED_CENTS', fixedCents: 500 }).includes(': use a fixed price of $5.00, '));
  assert.ok(!sentence({ basis: 'FIXED_CENTS', fixedCents: 500 }).includes('percent'));
  assert.ok(sentence({ basis: 'FIXED_CENTS', fixedCents: 500, percentBps: 9000 }).includes('use a fixed price of $5.00, price at 90 percent'));
  assert.ok(sentence({ basis: 'SOMETHING_ELSE' }).includes('start from the first price your book finds'));
});

test('describeRule: adding, taking off, never below, never above', () => {
  const base = { family: 'RETAIL', basis: 'REFERENCE', percentBps: 8750, roundingMode: 'NONE' };
  assert.equal(
    describeRule({ ...base, addCents: 25, floorCents: 50, ceilingCents: 99900 }),
    'All cards: start from the first price your book finds, price at 87.5 percent, add $0.25, do not round, never go below $0.50, never go above $999.00.'
  );
  assert.ok(describeRule({ ...base, addCents: -10 }).includes('take off $0.10'));
  assert.ok(!describeRule({ ...base, addCents: 0 }).includes('add '));
  assert.ok(describeRule({ ...base, roundingMode: undefined }).includes('use your usual rounding'));
  assert.ok(describeRule({ ...base, roundingMode: 'ENDING_99', roundingDirection: 'UP' }).includes('round up to a price ending in 99 cents'));
  assert.ok(describeRule({ ...base, roundingMode: 'KEYSTONE_49_99', roundingDirection: 'NEAREST' }).includes('end prices in 49 or 99 cents'));
});

test('describeRule: buying rules pay a percent, round down by default, and name credit and minimum offer', () => {
  assert.equal(
    describeRule({ family: 'BUYLIST', refMinCents: 150, refMaxCents: 2499, basis: 'REFERENCE', percentBps: 5000, creditBps: 12000, minOfferCents: 10 }),
    'All cards worth $1.50 to $24.99: start from the first price your book finds, pay 50 percent, round down in steps that grow with the price, pay store credit at 120 percent of cash, make no offer below $0.10.'
  );
  assert.ok(describeRule({ family: 'BUYLIST', basis: 'RETAIL_PRICE', percentBps: 5000 }).includes('start from your shelf price, pay 50 percent'));
  assert.ok(describeRule({ family: 'BUYLIST', basis: 'FIXED_CENTS', fixedCents: 10 }).includes('pay a fixed $0.10 per card'));
  assert.ok(describeRule({ family: 'BUYLIST', basis: 'REFERENCE', percentBps: 5000, roundingMode: 'NEAREST_5C' }).includes('round down to a 5 cent step'));
  assert.ok(describeRule({ family: 'BUYLIST', basis: 'REFERENCE', percentBps: 5000, roundingMode: 'NEAREST_5C', roundingDirection: 'UP' }).includes('round up to the next 5 cents'));
  // credit and minimum offer are buying words only
  assert.ok(!describeRule({ family: 'RETAIL', basis: 'REFERENCE', percentBps: 10000, creditBps: 12000, minOfferCents: 10 }).includes('credit'));
});

test('describeRule: every combination reads cleanly (copy lint over a grid)', () => {
  const games = [undefined, 'MTG', 'POKEMON', 'other'];
  const rarities = [undefined, 'RARE', 'UNKNOWN'];
  const finishes = [undefined, 'FOIL', 'ANY', 'HOLO'];
  const variants = [undefined, 'NONE', 'SHADOWLESS', 'STAMPED'];
  const bases = ['REFERENCE', 'COST_PLUS', 'BULK_RATE', 'FIXED_CENTS', 'RETAIL_PRICE'];
  const modes = [undefined, 'NONE', 'TIERED', 'NEAREST_5C', 'NEAREST_DOLLAR', 'ENDING_99', 'KEYSTONE_49_99'];
  let count = 0;
  for (const family of ['RETAIL', 'BUYLIST']) {
    for (const game of games) {
      for (const rarityClass of rarities) {
        for (const finish of finishes) {
          for (const variantToken of variants) {
            for (const basis of bases) {
              const mode = modes[count % modes.length];
              const text = describeRule({
                family, game, rarityClass, finish, variantToken, basis, percentBps: 9000 + (count % 7) * 100, roundingMode: mode,
                roundingDirection: ['NEAREST', 'UP', 'DOWN', undefined][count % 4], fixedCents: 250, addCents: (count % 3) - 1,
                refMinCents: count % 2 ? 100 : undefined, refMaxCents: count % 5 === 0 ? 9999 : undefined,
                floorCents: count % 4 === 0 ? 99 : undefined, creditBps: family === 'BUYLIST' && count % 2 ? 12000 : undefined,
                sourceKinds: count % 3 === 0 ? ['MANUAL', 'SHOP_BENCHMARK'] : [],
              } as never);
              lintLine(text, 'describeRule');
              assert.ok(text.endsWith('.'), text);
              assert.ok(text.indexOf(': ') > 0, text);
              assert.ok(/^[A-Z0-9]/.test(text), text);
              assert.ok(!/  /.test(text), `double space in ${text}`);
              count += 1;
            }
          }
        }
      }
    }
  }
  assert.ok(count > 1000);
  lintLine(describeRule({}), 'empty rule');
  assert.equal(describeRule({}), 'All cards: start from the first price your book finds, price at 100 percent, use your usual rounding.');
});

// ---------------------------------------------------------------------------
// Preview, apply and undo text
// ---------------------------------------------------------------------------

test('preview summary and the apply lines use the ADR numbers', () => {
  const counts = { eligible: 482, changes: 128, unchanged: 311, skipped: 24, review: 9 };
  assert.equal(describePreviewSummary(counts), '128 prices will change, 311 stay the same, 24 are skipped, 9 need a look.');
  assert.equal(defaultSelectedCount(counts), 119);
  assert.equal(defaultSelectedCount({ changes: 0, review: 0 }), 0);
  assert.equal(defaultSelectedCount({ changes: 2, review: 5 }), 0);
  assert.equal(describeApplyButton(119), 'Apply 119 prices');
  assert.equal(describeApplyButton(-4), 'Apply 0 prices');
  assert.equal(describeApplyConfirm(119), 'This changes the price on 119 cards. You can undo for 7 days.');
  assert.deepEqual(describeApplyOutcome({ applied: 119, changedSince: 0, failed: 0 }), ['Applied 119 prices.']);
  assert.deepEqual(describeApplyOutcome({ applied: 115, changedSince: 4, failed: 1 }), [
    'Applied 115 prices.',
    '4 cards changed after the preview, so we left them alone.',
    '1 card could not be changed.',
  ]);
  assert.deepEqual(describeUndoOutcome({ undone: 116, undoSkipped: 3 }), ['Undid 116 prices.', '3 cards were changed by hand since, so we left them alone.']);
  assert.deepEqual(describeUndoOutcome({ undone: 1, undoSkipped: 0 }), ['Undid 1 price.']);
});

test('preview staleness uses the server expiry time and an injected clock', () => {
  const expires = '2026-10-12T20:30:00.000Z';
  assert.equal(isPreviewStale(expires, new Date('2026-10-12T20:29:59.999Z')), false);
  assert.equal(isPreviewStale(expires, new Date('2026-10-12T20:30:00.000Z')), true);
  assert.equal(isPreviewStale(expires, new Date('2026-10-13T00:00:00.000Z')), true);
  assert.equal(isPreviewStale(null, new Date()), false);
  assert.equal(isPreviewStale('garbage', new Date()), false);
});

test('run rows show the reason a card was left out, else the state', () => {
  assert.equal(runItemStatusText({ state: 'SKIPPED', skipReason: 'LOCKED' }), 'Locked by you');
  assert.equal(runItemStatusText({ state: 'SKIPPED', skipReason: 'MARKED_DOWN' }), 'Marked down');
  assert.equal(runItemStatusText({ state: 'SKIPPED', skipReason: 'NO_REFERENCE' }), 'No price to base on');
  assert.equal(runItemStatusText({ state: 'PENDING', skipReason: null }), 'Ready to apply');
  assert.equal(runItemStatusText({ state: 'CHANGED_SINCE_PREVIEW', skipReason: null }), 'Changed after the preview');
  assert.equal(runItemStatusText({ state: 'WEIRD', skipReason: null }), '');
});

// ---------------------------------------------------------------------------
// Rate gap and rate change warnings
// ---------------------------------------------------------------------------

test('rate gap: the ADR-140 section 8.3 example, and the other directions', () => {
  assert.equal(
    describeRateGap({ youCents: 800, themCents: 1000, unit: 'PER_1000', asOf: '2026-10-12T10:00:00.000Z' }),
    'You: $8.00 per 1,000. Noted: $10.00 per 1,000 (Oct 12). You are 20 percent lower.'
  );
  assert.equal(
    describeRateGap({ youCents: 25, themCents: 20, unit: 'PER_CARD', asOf: null }),
    'You: $0.25 per card. Noted: $0.20 per card. You are 25 percent higher.'
  );
  assert.equal(
    describeRateGap({ youCents: 800, themCents: 800, asOf: '2026-10-12T10:00:00.000Z' }),
    'You: $8.00 per 1,000. Noted: $8.00 per 1,000 (Oct 12). You match the rate you noted.'
  );
  assert.ok(describeRateGap({ youCents: 1001, themCents: 1000 }).endsWith('You are less than 1 percent higher.'));
  assert.ok(describeRateGap({ youCents: 333, themCents: 1000 }).endsWith('You are 67 percent lower.'));
  assert.equal(describeRateGap({ youCents: 800, themCents: null }), '');
  assert.equal(describeRateGap({ youCents: null, themCents: 800 }), '');
  assert.equal(describeRateGap({ youCents: 800, themCents: 0 }), '');
  assert.equal(describeRateGap({ youCents: -1, themCents: 800 }), '');
  assert.equal(describeRateGap({ youCents: NaN, themCents: 800 }), '');
  lintLine(describeRateGap({ youCents: 800, themCents: 1000, unit: 'PER_1000', asOf: '2026-10-12T10:00:00.000Z' }), 'rate gap');
});

test('rate change warnings: a rate that moves by more than half is flagged, normal edits are not', () => {
  const warnings = rateChangeWarnings([
    { label: 'Commons', oldCents: 800, newCents: 80000 },
    { label: 'Uncommons', oldCents: 800, newCents: 900 },
    { label: 'Rares', oldCents: 25, newCents: 12 },
    { label: 'Mythics', oldCents: 50, newCents: 25 },
    { label: 'Special', oldCents: null, newCents: 100 },
    { label: 'Lands', oldCents: 200, newCents: null },
    { label: 'Mixed', oldCents: 0, newCents: 500 },
  ]);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0], 'Commons goes from $8.00 to $800.00. Check that is what you meant.');
  assert.equal(warnings[1], 'Rares goes from $0.25 to $0.12. Check that is what you meant.');
  assert.deepEqual(rateChangeWarnings([]), []);
});

// ---------------------------------------------------------------------------
// WhyThisPrice
// ---------------------------------------------------------------------------

const OK_BLOCK: PriceBookResultBlock = {
  ref: 'a1',
  ok: true,
  priceCents: 1025,
  price: 10.25,
  currency: 'USD',
  priceSource: 'MANUAL',
  priceAsOf: '2026-10-03T14:00:00.000Z',
  referenceCents: 1200,
  referenceOrigin: 'SHOP',
  referenceLabel: 'Your typed price',
  rule: { id: 'cm1xyz', name: 'Rares over $5', bookVersion: 7, isDefault: false },
  unchanged: false,
  applyAllowed: true,
  lockedReason: null,
  review: { required: false, reasons: [], movePercent: 8 },
  warnings: [],
  trace: [
    { step: 'REFERENCE', label: 'Your typed price', beforeCents: null, afterCents: 1200 },
    { step: 'PERCENT', label: '95 percent', beforeCents: 1200, afterCents: 1140 },
    { step: 'CONDITION', label: 'Lightly Played, 90 percent', beforeCents: 1140, afterCents: 1026 },
    { step: 'ROUND', label: 'Nearest 25 cents', beforeCents: 1026, afterCents: 1025 },
  ],
  why: 'Based on your typed price of $12.00 (Oct 3). Rule: Rares over $5. 95 percent, Lightly Played at 90 percent, rounded to the nearest 25 cents.',
};

test('WhyThisPrice: the ADR-140 section 10.1 example becomes the popover content, using only response fields', () => {
  const v = buildWhyThisPrice(OK_BLOCK);
  assert.ok(v);
  assert.equal(v.ok, true);
  assert.equal(v.buttonLabel, 'Why this price');
  assert.equal(v.headline, 'Suggested price: $10.25');
  assert.equal(v.priceText, '$10.25');
  assert.equal(v.sourceLabel, 'Your typed price');
  assert.equal(v.basedOn, 'Your typed price (Oct 3)');
  assert.equal(v.provenanceText, 'Your typed price, Oct 3.');
  assert.equal(v.referenceText, 'Worth $12.00 at Near Mint');
  assert.equal(v.ruleText, 'Rares over $5');
  assert.deepEqual(v.traceLines, [
    'Your typed price: $12.00',
    '95 percent: $11.40',
    'Lightly Played, 90 percent: $10.26',
    'Nearest 25 cents: $10.25',
  ]);
  assert.deepEqual(v.warnings, []);
  assert.deepEqual(v.reviewNotes, []);
  assert.equal(v.lockedText, '');
  assert.equal(v.why, OK_BLOCK.why);
  assert.equal(v.applyAllowed, true);
});

test('WhyThisPrice: a default rule, a catalog estimate with the server warning, and a large move', () => {
  const v = buildWhyThisPrice({
    ...OK_BLOCK,
    priceSource: 'CATALOG_REFERENCE',
    referenceLabel: undefined,
    rule: { id: null, name: 'Default', bookVersion: 7, isDefault: true },
    warnings: [
      { code: 'CATALOG_ESTIMATE', message: 'Catalog estimate (marketplace data carried by Scryfall). Use it as a guide only.' },
      { code: 'BELOW_CARD_MINIMUM', message: '' },
      { code: 'SOMETHING_NEW', message: '' },
    ],
    review: { required: true, reasons: ['LARGE_MOVE', 'HIT_FLOOR'], movePercent: 38.2 },
  });
  assert.ok(v);
  assert.equal(v.sourceLabel, 'Catalog estimate (marketplace data carried by Scryfall)');
  assert.equal(v.basedOn, 'Catalog estimate (marketplace data carried by Scryfall) (Oct 3)');
  assert.equal(v.ruleText, 'Your default rule');
  assert.deepEqual(v.warnings, [
    'Catalog estimate (marketplace data carried by Scryfall). Use it as a guide only.',
    'Card payments need at least $0.99. Cash sales have no minimum.',
  ]);
  assert.deepEqual(v.reviewNotes, [
    'This is 38 percent away from the current price. Take a look before you apply it.',
    'The price hit your lowest allowed price. Take a look before you apply it.',
  ]);
});

test('WhyThisPrice: a locked price still shows its number and says it is not applied', () => {
  const pinned = buildWhyThisPrice({ ...OK_BLOCK, lockedReason: 'PIN', applyAllowed: false });
  assert.ok(pinned);
  assert.equal(pinned.ok, true);
  assert.equal(pinned.priceText, '$10.25');
  assert.equal(pinned.lockedText, 'Locked, so the price book will not change it.');
  assert.equal(pinned.applyAllowed, false);
  const recent = buildWhyThisPrice({ ...OK_BLOCK, lockedReason: 'RECENT_EDIT', applyAllowed: false });
  assert.ok(recent);
  assert.equal(recent.lockedText, PRICE_BOOK_COPY.recentEditNoDate);
});

test('WhyThisPrice: no number gives the plain reason and nothing invented', () => {
  const none = buildWhyThisPrice({ ref: 'a2', ok: false, code: 'NO_REFERENCE', priceCents: null, applyAllowed: false, why: 'No suggestion yet. Add a price for this card in your price book.' });
  assert.ok(none);
  assert.equal(none.ok, false);
  assert.equal(none.headline, 'No suggestion yet. Add a price for this card in your price book.');
  assert.equal(none.priceText, '');
  assert.equal(none.sourceLabel, '');
  assert.equal(none.basedOn, '');
  assert.equal(none.provenanceText, '');
  assert.equal(none.ruleText, '');
  assert.deepEqual(none.traceLines, []);
  assert.equal(none.applyAllowed, false);
  const noRule = buildWhyThisPrice({ ok: false, code: 'NO_RULE', priceCents: null });
  assert.ok(noRule);
  assert.equal(noRule.headline, 'No suggestion yet. None of your rules fit this card.');
  assert.equal(noRule.why, noRule.headline);
  const below = buildWhyThisPrice({ ok: false, code: 'BELOW_MIN_OFFER', priceCents: null });
  assert.ok(below);
  assert.equal(below.headline, 'Below your minimum buy price. No offer.');
  // ok true but no number is treated as no suggestion
  const odd = buildWhyThisPrice({ ok: true, priceCents: null });
  assert.ok(odd);
  assert.equal(odd.ok, false);
});

test('WhyThisPrice: missing or malformed blocks give null, and sparse blocks never throw', () => {
  assert.equal(buildWhyThisPrice(null), null);
  assert.equal(buildWhyThisPrice(undefined), null);
  assert.equal(buildWhyThisPrice({}), null);
  assert.equal(buildWhyThisPrice('nope' as never), null);
  const sparse = buildWhyThisPrice({ ok: true, priceCents: 500, warnings: null as never, trace: 'x' as never, review: 3 as never, rule: 'r' as never });
  assert.ok(sparse);
  assert.equal(sparse.priceText, '$5.00');
  assert.deepEqual(sparse.warnings, []);
  assert.deepEqual(sparse.traceLines, []);
  assert.equal(sparse.ruleText, '');
  const dirty = buildWhyThisPrice({ ok: true, priceCents: 500, warnings: [null, { code: 5 }, { code: 'CEILING_APPLIED', message: '' }] as never });
  assert.ok(dirty);
  assert.deepEqual(dirty.warnings, ['Your highest allowed price was used.']);
});

test('WhyThisPrice: every line it can produce passes the copy lint', () => {
  const blocks: PriceBookResultBlock[] = [
    OK_BLOCK,
    { ...OK_BLOCK, lockedReason: 'PIN' },
    { ...OK_BLOCK, lockedReason: 'RECENT_EDIT' },
    { ...OK_BLOCK, review: { required: true, reasons: ['LARGE_MOVE', 'HIT_FLOOR', 'HIT_CEILING', 'BELOW_COST', 'REFERENCE_MOVED', 'LOW_SAMPLE', 'REFERENCE_OLD'], movePercent: -12 } },
    { ...OK_BLOCK, warnings: ['BELOW_CARD_MINIMUM', 'REFERENCE_OLD', 'CATALOG_ESTIMATE', 'FLOOR_APPLIED', 'CEILING_APPLIED', 'RANGE_CONFLICT'].map((code) => ({ code, message: '' })) },
  ];
  for (const code of ['NO_REFERENCE', 'NO_RULE', 'NO_COST', 'NO_RATE', 'GRADED_NOT_SUPPORTED', 'UNSUPPORTED_PRODUCT', 'INVALID_INPUT', 'BELOW_MIN_OFFER'] as const) {
    blocks.push({ ok: false, code, priceCents: null });
  }
  for (const block of blocks) {
    const v = buildWhyThisPrice(block);
    assert.ok(v);
    const lines = [v.headline, v.basedOn, v.provenanceText, v.referenceText, v.ruleText, v.lockedText, v.why, ...v.warnings, ...v.reviewNotes];
    for (const line of lines) if (line) lintLine(line, 'WhyThisPrice');
  }
});
