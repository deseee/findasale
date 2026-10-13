/**
 * priceBookCopy (ADR-140 batch B6, AT-17 frontend half): copy lint and wording coverage for the Price Book screens.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BASIS_LABELS,
  CONDITION_LABELS,
  PRICE_BOOK_COPY,
  PRICE_BOOK_UI,
  PRICE_BOOK_UI_SAMPLES,
  PRICE_BOOK_ERROR_WORDING,
  PRICE_SOURCE_LABELS,
  REVIEW_REASON_WORDING,
  RULE_COPY,
  SKIP_REASON_LABELS,
  SUGGESTION_FAILURE_WORDING,
  TIER_LABELS,
  WARNING_WORDING,
  allPriceBookCopy,
  failureText,
  noRateText,
  reviewReasonText,
  roundPhrase,
  skipReasonText,
  sourceLabel,
  warningText,
  wordingForPriceBookError,
} from '../priceBookCopy';

// Every code the /api/price-book routes can send (ADR-140 section 10.3) plus failures that never reach the server.
const API_CODES = [
  'PRICE_BOOK_DISABLED', 'VALIDATION', 'FOREIGN_PRICE_COLUMN', 'SCOPE_TOO_LARGE', 'VERSION_CONFLICT', 'BOOK_CHANGED', 'PREVIEW_EXPIRED',
  'COUNT_MISMATCH', 'NOTHING_SELECTED', 'ALREADY_APPLIED', 'TEMPLATE_NEEDS_EMPTY', 'RUN_NOT_PREVIEW', 'LIMIT_REACHED', 'NOT_FOUND',
  'RATE_LIMITED', 'SERVER_ERROR',
];
const LOCAL_CODES = ['UNAUTHORIZED', 'FORBIDDEN', 'NETWORK_ERROR', 'BAD_RESPONSE', 'UNKNOWN'];

test('copy lint: no banned words, no dashes, no placeholder text', () => {
  const all = allPriceBookCopy();
  assert.ok(all.length > 250, 'expected the full set of strings, got ' + all.length);
  for (const text of all) {
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0, 'empty string in copy');
    assert.equal(text, text.trim(), `stray whitespace: "${text}"`);
    assert.ok(!/\bAI\b/i.test(text), `the banned word in: ${text}`);
    assert.ok(!/\bA\.I\./.test(text), `"A.I." in: ${text}`);
    assert.ok(!/artificial intelligence/i.test(text), `automation wording in: ${text}`);
    assert.ok(!/estate\s*sale/i.test(text), `banned phrase in: ${text}`);
    assert.ok(!/founder/i.test(text), `founder voice in: ${text}`);
    assert.ok(!text.includes(String.fromCharCode(0x2014)), `em dash in: ${text}`);
    assert.ok(!text.includes(String.fromCharCode(0x2013)), `en dash in: ${text}`);
    assert.ok(!/ -- /.test(text), `double hyphen dash in: ${text}`);
    assert.ok(!/[^\x20-\x7E]/.test(text), `non-ASCII character in: ${text}`);
    assert.ok(!/lorem|\btodo\b|\btbd\b|placeholder|\[[^\]]*\]|\{|\}|<[a-z/][^>]*>/i.test(text), `placeholder-like text in: ${text}`);
    assert.ok(!/undefined|NaN|\[object|null/.test(text), `leaked value in: ${text}`);
  }
});

test('the copy source files hold no em dash, en dash, double hyphen dash, banned phrases or NUL byte, even in comments', () => {
  const names = ['priceBook.ts', 'priceBookCopy.ts', 'priceBookRules.ts'];
  let checked = 0;
  for (const name of names) {
    const candidates = [path.resolve(process.cwd(), 'lib', name), path.resolve(process.cwd(), 'packages', 'frontend', 'lib', name)];
    let src: string | null = null;
    for (const p of candidates) {
      try {
        src = fs.readFileSync(p, 'utf8');
        break;
      } catch {
        /* try the next place */
      }
    }
    if (src === null) continue;
    checked += 1;
    assert.ok(!src.includes(String.fromCharCode(0x2014)), `${name} has an em dash`);
    assert.ok(!src.includes(String.fromCharCode(0x2013)), `${name} has an en dash`);
    assert.ok(!/ -- /.test(src), `${name} has a double hyphen dash`);
    assert.ok(!/\bAI\b/.test(src), `${name} has the banned word`);
    assert.ok(!/estate\s*sale/i.test(src), `${name} has a banned phrase`);
    assert.ok(!/[^\x00-\x7F]/.test(src), `${name} has a non-ASCII character`);
    assert.ok(src.indexOf('\u0000') < 0, `${name} has a NUL byte`);
  }
  assert.ok(checked === 0 || checked === names.length, 'either every file was found or none (a different working folder)');
});

test('the wording ADR-140 section 11.7 asks for is used word for word', () => {
  const c = PRICE_BOOK_COPY;
  assert.equal(c.pageIntro, 'Set your own pricing rules. Prices are suggestions until you apply them. You are always in charge of the final price.');
  assert.equal(c.headerIntro, 'Set your own pricing rules. Prices are suggestions until you apply them.');
  assert.equal(c.noSuggestion, 'No suggestion yet. Add a price for this card in your price book.');
  assert.equal(PRICE_SOURCE_LABELS.MANUAL, 'Your typed price');
  assert.equal(PRICE_SOURCE_LABELS.SHOP_SOLD_HISTORY, 'Your recent sales');
  assert.equal(PRICE_SOURCE_LABELS.SHOP_BENCHMARK, 'Your benchmark for this kind of card');
  assert.equal(PRICE_SOURCE_LABELS.CATALOG_REFERENCE, 'Catalog estimate (marketplace data carried by Scryfall)');
  assert.equal(c.sourceCatalogLong, 'Catalog estimate (marketplace data carried by Scryfall). Use it as a guide only.');
  assert.equal(PRICE_SOURCE_LABELS.RATE_CARD, 'Your bulk rate card');
  assert.equal(PRICE_SOURCE_LABELS.FIXED_RULE, 'Fixed price in your rule');
  assert.equal(PRICE_SOURCE_LABELS.COST, 'Your cost plus your margin');
  assert.equal(c.cardMinimum, 'Card payments need at least $0.99. Cash sales have no minimum.');
  assert.equal(c.oldReference('Oct 3, 2026'), 'This price was set on Oct 3, 2026. Check it still looks right.');
  assert.equal(c.largeMove(38), 'This is 38 percent away from the current price. Take a look before you apply it.');
  assert.equal(c.lowSample(2), 'Based on only 2 sales.');
  assert.equal(c.lowSample(1), 'Based on only 1 sale.');
  assert.equal(c.locked, 'Locked by you, so the price book will not change it.');
  assert.equal(c.recentEdit('Oct 3'), 'You changed this price on Oct 3, so it was left alone.');
  assert.equal(c.markedDown, 'This card is marked down, so it was left alone.');
  assert.equal(c.ebayLive, 'This card is listed on eBay, so it was left alone.');
  assert.equal(c.previewSummary(128, 311, 24, 9), '128 prices will change, 311 stay the same, 24 are skipped, 9 need a look.');
  assert.equal(c.apply(119), 'Apply 119 prices');
  assert.equal(c.applyConfirm(119), 'This changes the price on 119 cards. You can undo for 7 days.');
  assert.equal(c.applied(119), 'Applied 119 prices.');
  assert.equal(c.changedSince(4), '4 cards changed after the preview, so we left them alone.');
  assert.equal(c.undo, 'Undo these changes');
  assert.equal(c.undoSkipped(3), '3 cards were changed by hand since, so we left them alone.');
  assert.equal(c.rateNoteHelp, "Type what you see if you want to compare. We do not look up other shops' rates.");
  assert.equal(
    c.rateGap('$8.00', '$10.00', 'per 1,000', 'Oct 12', '20', 'lower'),
    'You: $8.00 per 1,000. Noted: $10.00 per 1,000 (Oct 12). You are 20 percent lower.'
  );
  assert.equal(c.foreignFile, 'This file has price columns from another site. Use your own prices only.');
  assert.equal(
    c.catalogSettingHelp,
    'Magic only. These numbers come from marketplace data carried by Scryfall. They can be a day old and are a guide, not a quote. Off by default.'
  );
  assert.equal(c.starterLabel, 'Starting point, set your own.');
  assert.equal(c.disabled, 'The price book is not turned on yet. You can still set every price by hand.');
  assert.equal(c.pinLock, 'Keep my price');
  assert.equal(c.pinUnlock, 'Let the price book suggest again');
  assert.equal(c.lockedNotApplied, 'Locked, so the price book will not change it.');
});

test('singular and plural wording reads correctly', () => {
  const c = PRICE_BOOK_COPY;
  assert.equal(c.previewSummary(1, 1, 1, 1), '1 price will change, 1 stays the same, 1 is skipped, 1 needs a look.');
  assert.equal(c.previewSummary(0, 0, 0, 0), '0 prices will change, 0 stay the same, 0 are skipped, 0 need a look.');
  assert.equal(c.apply(1), 'Apply 1 price');
  assert.equal(c.applyConfirm(1), 'This changes the price on 1 card. You can undo for 7 days.');
  assert.equal(c.applied(1), 'Applied 1 price.');
  assert.equal(c.changedSince(1), '1 card changed after the preview, so we left it alone.');
  assert.equal(c.undoSkipped(1), '1 card was changed by hand since, so we left it alone.');
  assert.equal(c.ratesSaved(14), 'Saved. 14 rates changed.');
  assert.equal(c.ratesSaved(1), 'Saved. 1 rate changed.');
});

test('every backend code has plain wording and unknown codes fall back to a generic message', () => {
  for (const code of API_CODES.concat(LOCAL_CODES)) {
    assert.ok(Object.prototype.hasOwnProperty.call(PRICE_BOOK_ERROR_WORDING, code), `missing wording for ${code}`);
    assert.ok(wordingForPriceBookError(code).length > 12, code);
  }
  assert.equal(wordingForPriceBookError('NOT_A_REAL_CODE'), PRICE_BOOK_ERROR_WORDING.UNKNOWN);
  assert.equal(wordingForPriceBookError(null), PRICE_BOOK_ERROR_WORDING.UNKNOWN);
  assert.equal(wordingForPriceBookError(undefined), PRICE_BOOK_ERROR_WORDING.UNKNOWN);
  assert.equal(wordingForPriceBookError('constructor'), PRICE_BOOK_ERROR_WORDING.UNKNOWN);
  assert.equal(wordingForPriceBookError('__proto__'), PRICE_BOOK_ERROR_WORDING.UNKNOWN);
  assert.equal(PRICE_BOOK_ERROR_WORDING.BOOK_CHANGED, 'Your rules changed after this preview. Preview again.');
  assert.equal(PRICE_BOOK_ERROR_WORDING.FOREIGN_PRICE_COLUMN, PRICE_BOOK_COPY.foreignFile);
});

test('lookups never reach the prototype and unknown keys give an empty or fallback string', () => {
  assert.equal(sourceLabel('MANUAL'), 'Your typed price');
  assert.equal(sourceLabel('constructor'), '');
  assert.equal(sourceLabel(null), '');
  assert.equal(skipReasonText('LOCKED'), 'Locked by you');
  assert.equal(skipReasonText('toString'), '');
  assert.equal(failureText('NO_REFERENCE'), PRICE_BOOK_COPY.noSuggestion);
  assert.equal(failureText('__proto__'), PRICE_BOOK_COPY.noSuggestion);
  assert.equal(failureText(undefined), PRICE_BOOK_COPY.noSuggestion);
  assert.equal(warningText('BELOW_CARD_MINIMUM'), PRICE_BOOK_COPY.cardMinimum);
  assert.equal(warningText('BELOW_CARD_MINIMUM', '  Server words.  '), 'Server words.');
  assert.equal(warningText('SOMETHING_NEW'), '');
  assert.equal(reviewReasonText('LARGE_MOVE', 38.4), PRICE_BOOK_COPY.largeMove(38));
  assert.equal(reviewReasonText('LARGE_MOVE', -38.6), PRICE_BOOK_COPY.largeMove(39));
  assert.ok(reviewReasonText('LARGE_MOVE', null).length > 10);
  assert.equal(reviewReasonText('NOT_A_REASON'), '');
  assert.equal(noRateText('Bulk commons'), 'No rate set for Bulk commons');
  assert.equal(noRateText(''), SKIP_REASON_LABELS.NO_RATE);
});

test('every vocabulary value in the ADR has a label', () => {
  for (const t of ['COMMON', 'UNCOMMON', 'COMMON_UNCOMMON', 'RARE', 'MYTHIC', 'SPECIAL', 'LAND', 'MIXED']) assert.ok(TIER_LABELS[t], t);
  for (const b of ['REFERENCE', 'COST_PLUS', 'BULK_RATE', 'FIXED_CENTS', 'RETAIL_PRICE']) assert.ok(BASIS_LABELS[b], b);
  for (const s of ['MANUAL', 'SHOP_SOLD_HISTORY', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED', 'RATE_CARD', 'FIXED_RULE', 'COST']) {
    assert.ok(PRICE_SOURCE_LABELS[s], s);
  }
  for (const r of ['LOCKED', 'RECENT_EDIT', 'MARKED_DOWN', 'EBAY_LIVE', 'NO_REFERENCE', 'NO_RULE', 'NO_RATE', 'GRADED', 'NOT_AVAILABLE', 'UNCHANGED']) {
    assert.ok(SKIP_REASON_LABELS[r], r);
  }
  for (const r of ['HIT_FLOOR', 'HIT_CEILING', 'BELOW_COST', 'REFERENCE_MOVED', 'LOW_SAMPLE', 'REFERENCE_OLD']) assert.ok(REVIEW_REASON_WORDING[r], r);
  for (const w of ['BELOW_CARD_MINIMUM', 'REFERENCE_OLD', 'CATALOG_ESTIMATE', 'FLOOR_APPLIED', 'CEILING_APPLIED', 'RANGE_CONFLICT']) assert.ok(WARNING_WORDING[w], w);
  for (const c of ['NO_REFERENCE', 'NO_RULE', 'NO_COST', 'NO_RATE', 'GRADED_NOT_SUPPORTED', 'UNSUPPORTED_PRODUCT', 'INVALID_INPUT', 'BELOW_MIN_OFFER']) {
    assert.ok(SUGGESTION_FAILURE_WORDING[c], c);
  }
});

test('rounding clauses cover every mode and direction in the ADR', () => {
  const modes = ['NONE', 'TIERED', 'NEAREST_5C', 'NEAREST_25C', 'NEAREST_DOLLAR', 'ENDING_99', 'KEYSTONE_49_99'];
  const seen: string[] = [];
  for (const m of modes) {
    for (const d of ['NEAREST', 'UP', 'DOWN']) {
      const text = roundPhrase(m, d);
      assert.ok(text.length > 6, `${m} ${d}`);
      seen.push(`${m}|${d}|${text}`);
    }
  }
  assert.equal(roundPhrase('NEAREST_25C', 'NEAREST'), 'round to the nearest 25 cents');
  assert.equal(roundPhrase('NEAREST_25C', null), 'round to the nearest 25 cents');
  assert.equal(roundPhrase('NONE', 'UP'), 'do not round');
  assert.equal(roundPhrase(null, null), 'use your usual rounding');
  assert.equal(roundPhrase('SURPRISE', 'UP'), 'use your usual rounding');
  assert.equal(roundPhrase('constructor', 'UP'), 'use your usual rounding');
  assert.ok(new Set(seen.map((s) => s.split('|')[2])).size >= 15);
});

test('rule sentence atoms join lists plainly', () => {
  assert.equal(RULE_COPY.listJoin([]), '');
  assert.equal(RULE_COPY.listJoin(['a']), 'a');
  assert.equal(RULE_COPY.listJoin(['a', 'b']), 'a or b');
  assert.equal(RULE_COPY.listJoin(['a', 'b', 'c']), 'a, b or c');
});

test('screen words (batch B7): condition labels, the fixed price clause, and every screen string joins the copy lint', () => {
  assert.deepEqual(Object.keys(CONDITION_LABELS), ['NM', 'LP', 'MP', 'HP', 'DMG']);
  assert.equal(RULE_COPY.fixedPrice('$5.00'), 'use a fixed price of $5.00');
  const all = allPriceBookCopy();
  const ui = PRICE_BOOK_UI as unknown as Record<string, unknown>;
  for (const key of Object.keys(ui)) {
    const value = ui[key];
    if (typeof value === 'string') assert.ok(all.includes(value), `${key} is not in the copy lint set`);
  }
  assert.equal(PRICE_BOOK_UI.ruleAction('Edit', 'Rares'), 'Edit: Rares');
  assert.equal(PRICE_BOOK_UI.stockDone(1), 'Added 1 price from your items.');
  assert.equal(PRICE_BOOK_UI.stockDone(3), 'Added 3 prices from your items.');
  assert.equal(PRICE_BOOK_UI.importRejected(1), '1 row was left out because of a problem.');
  assert.equal(PRICE_BOOK_UI.importRejected(2), '2 rows were left out because of a problem.');
  assert.equal(PRICE_BOOK_UI.gameTab('MTG'), 'Magic');
  assert.equal(PRICE_BOOK_UI.gameTab('OTHER'), 'OTHER');
  assert.equal(PRICE_BOOK_UI.historyTitle('', 'Oct 12, 2026'), 'Oct 12, 2026');
  assert.equal(PRICE_BOOK_UI.viewWithCount('Changes', 128), 'Changes (128)');
  for (const key of Object.keys(PRICE_BOOK_UI_SAMPLES)) assert.equal(typeof ui[key], 'function', key);
});

test('the line after a card import or scan save (ADR-140 section 12.4) uses the wording asked for and joins the copy lint', () => {
  assert.equal(PRICE_BOOK_COPY.repriceUnpricedLine(12), 'Price the 12 cards without a price from my price book');
  assert.equal(PRICE_BOOK_COPY.repriceUnpricedLine(1), 'Price the card without a price from my price book');
  const all = allPriceBookCopy();
  assert.ok(all.includes(PRICE_BOOK_COPY.repriceUnpricedLine(2)));
});
