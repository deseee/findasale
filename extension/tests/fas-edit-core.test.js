// Node tests for fas-edit-core.js (no extension test runner exists). Run: node --test extension/tests/fas-edit-core.test.js
const test = require('node:test');
const assert = require('node:assert');
const C = require('../fas-edit-core.js');

test('backoff is capped exponential with bounded jitter', () => {
  assert.strictEqual(C.backoffMs(1, 0), 15 * 60 * 1000);
  assert.strictEqual(C.backoffMs(2, 0), 30 * 60 * 1000);
  assert.strictEqual(C.backoffMs(3, 0), 60 * 60 * 1000);
  assert.strictEqual(C.backoffMs(20, 0), C.BACKOFF_CAP_MS);
  assert.ok(C.backoffMs(2, 0.99) <= C.BACKOFF_CAP_MS);
  assert.ok(C.backoffMs(2, 0.99) > C.backoffMs(2, 0));
  assert.strictEqual(C.backoffMs(0, 0), C.BACKOFF_BASE_MS);
});

test('failures back off, park after MAX_ATTEMPTS, never loop hot', () => {
  let s;
  const t0 = 1_000_000;
  for (let i = 1; i < C.MAX_ATTEMPTS; i++) {
    s = C.recordFailure(s, t0, 0, 'x');
    assert.strictEqual(s.attempts, i);
    assert.ok(!C.shouldAttempt(s, t0 + 1));
    assert.ok(C.shouldAttempt(s, s.nextAt));
  }
  s = C.recordFailure(s, t0, 0, 'last');
  assert.strictEqual(s.parked, true);
  assert.strictEqual(s.attempts, 0);
  assert.ok(!C.shouldAttempt(s, t0 + C.PARK_MS - 1));
  assert.ok(C.shouldAttempt(s, t0 + C.PARK_MS));
  assert.ok(C.shouldAttempt(undefined, t0));
});

test('hourly allowance honours per-run and per-hour caps', () => {
  const now = 10_000_000;
  const lim = C.LIMITS.FACEBOOK;
  assert.strictEqual(C.allowance('FACEBOOK', [], now), Math.min(lim.perRun, lim.perHour));
  const stamps = Array(lim.perHour - 2).fill(now - 1000);
  assert.strictEqual(C.allowance('FACEBOOK', stamps, now), 2);
  assert.strictEqual(C.allowance('FACEBOOK', Array(lim.perHour).fill(now - 1000), now), 0);
  assert.strictEqual(C.allowance('FACEBOOK', Array(lim.perHour).fill(now - 3600 * 1000 - 5), now), Math.min(lim.perRun, lim.perHour));
  const d = C.jitterDelay('POSHMARK', 0.5);
  assert.ok(d >= C.LIMITS.POSHMARK.delayMin && d <= C.LIMITS.POSHMARK.delayMax);
  assert.ok(C.LIMITS.POSHMARK.delayMin >= 2000 && C.LIMITS.POSHMARK.delayMax <= 9000);
});

test('normalizeEntry handles both queue shapes', () => {
  const fb = C.normalizeEntry({ id: 'a', title: 'T', newPrice: 25, remoteListingId: '123456789', priceDrift: true, quantityDrift: false, quantity: 1 }, 'FACEBOOK');
  assert.strictEqual(fb.price, 25);
  assert.strictEqual(fb.remoteListingId, '123456789');
  const m = C.normalizeEntry({ id: 'b', title: 'T2', price: 19.99, priceDrift: false, quantityDrift: true, quantity: 3, remoteListingId: 'm123456789' }, 'MERCARI');
  assert.strictEqual(m.price, 19.99);
  assert.strictEqual(m.priceDrift, false);
  assert.strictEqual(m.quantityDrift, true);
  const u = C.normalizeEntry({ id: 'c', title: 'x', price: 5, remoteListingUrl: 'https://poshmark.com/listing/Thing-0123456789abcdef01234567' }, 'POSHMARK');
  assert.strictEqual(u.remoteListingId, '0123456789abcdef01234567');
  assert.ok(C.hasWork(fb));
  assert.ok(!C.hasWork({ id: 'z', priceDrift: true, price: null }));
  assert.ok(!C.hasWork({ id: 'z', priceDrift: false, quantityDrift: false, price: 4 }));
});

test('quantity applicability per platform', () => {
  const e = { quantityDrift: true, quantity: 2 };
  assert.ok(C.wantsQuantity('POSHMARK', e));
  assert.ok(C.wantsQuantity('FACEBOOK', e));
  assert.ok(!C.wantsQuantity('MERCARI', e));
  assert.ok(!C.wantsQuantity('GRAILED', e));
  assert.ok(!C.wantsQuantity('POSHMARK', { quantityDrift: true, quantity: 0 }));
  assert.ok(!C.wantsQuantity('POSHMARK', { quantityDrift: false, quantity: 2 }));
});

test('price formatting and matching', () => {
  assert.strictEqual(C.formatPrice('POSHMARK', 24.6), '25');
  assert.strictEqual(C.formatPrice('FACEBOOK', 0.2), '1');
  assert.strictEqual(C.formatPrice('GUMTREE_AU', 12.5), '12.50');
  assert.strictEqual(C.formatPrice('GUMTREE_AU', 12), '12');
  assert.strictEqual(C.parsePriceText('$1,250.00'), 1250);
  assert.strictEqual(C.parsePriceText('A$ 40'), 40);
  assert.strictEqual(C.parsePriceText('free'), null);
  assert.ok(C.pricesMatch('MERCARI', '12.00', 12));
  assert.ok(C.pricesMatch('FACEBOOK', '$25', 24.6));
  assert.ok(!C.pricesMatch('FACEBOOK', '$26', 24.6));
  assert.ok(!C.pricesMatch('GUMTREE_AU', '12.00', 12.5));
  assert.ok(C.pricesMatch('GUMTREE_AU', '12.50', 12.5));
  assert.ok(!C.pricesMatch('FACEBOOK', '', 5));
});

test('title matching never guesses', () => {
  assert.ok(C.titleEquals('Vintage Lamp, Brass\n$40 OS', 'Vintage Lamp, Brass'));
  assert.ok(C.titleEquals('Vintage Lamp, Brass - $40', 'vintage  lamp, brass'));
  assert.ok(!C.titleEquals('Vintage Lamp, Brass and Glass', 'Vintage Lamp, Brass'));
  assert.ok(!C.titleEquals('Lamp', 'Lamp'), 'too short to trust');
  const long = 'Martha Living 7.5 ft Pre-Lit Sparkling Pine Christmas Tree, 600 LED Warm White L';
  assert.ok(C.titleEquals('Martha Living 7.5 ft Pre-Lit Sparkling Pine Christmas Tree, 600 LED Warm White', long));
  assert.ok(!C.titleEquals('Martha Living 7.5 ft Pre-Lit Sparkling Pine Christmas Tree, 600 LED', long));
  assert.ok(C.titleContained('Requires Action11 days agoAdidasmBored Ape Yacht Club Adidas Tracksuit$225Edit Listing', 'Bored Ape Yacht Club Adidas Tracksuit'));
  const cands = [{ key: '1', texts: ['Vintage Lamp, Brass'] }, { key: '1', texts: ['vintage lamp, brass $40'] }, { key: '2', texts: ['Other thing here'] }];
  assert.strictEqual(C.pickUnique(cands, 'Vintage Lamp, Brass').reason, 'ok');
  cands.push({ key: '3', texts: ['Vintage Lamp, Brass'] });
  const amb = C.pickUnique(cands, 'Vintage Lamp, Brass');
  assert.strictEqual(amb.reason, 'ambiguous');
  assert.strictEqual(amb.match, null);
  assert.strictEqual(C.pickUnique(cands, 'Nothing like it at all').reason, 'none');
});

test('id extraction per platform', () => {
  assert.strictEqual(C.extractIdFromUrl('FACEBOOK', 'https://www.facebook.com/marketplace/item/1234567890123/?ref=x'), '1234567890123');
  assert.strictEqual(C.extractIdFromUrl('POSHMARK', 'https://poshmark.com/listing/Cool-Thing-ABCDEF0123456789abcdef01'), 'abcdef0123456789abcdef01');
  assert.strictEqual(C.extractIdFromUrl('MERCARI', 'https://www.mercari.com/us/item/M12345678901/'), 'm12345678901');
  assert.strictEqual(C.extractIdFromUrl('GRAILED', 'https://www.grailed.com/listings/98400943-thing'), '98400943');
  assert.strictEqual(C.extractIdFromUrl('CRAIGSLIST', 'https://x.craigslist.org/abc/d/thing/7712345678.html'), '7712345678');
  assert.strictEqual(C.extractIdFromUrl('POSHMARK', 'https://poshmark.com/closet/me'), '');
});

test('start urls: direct when the id is known, discovery page otherwise', () => {
  const cfg = { MERC_EDIT_URL_PREFIX: 'https://www.mercari.com/sell/edit/', MERC_MANAGE_URL: 'https://www.mercari.com/mypage/listings/', GRAILED_MANAGE_URL: 'https://www.grailed.com/sell/for-sale' };
  assert.strictEqual(C.startUrl('MERCARI', { id: 'a', remoteListingId: 'm123456789' }, cfg), 'https://www.mercari.com/sell/edit/m123456789/');
  assert.strictEqual(C.startUrl('MERCARI', { id: 'a', remoteListingId: '' }, cfg), 'https://www.mercari.com/mypage/listings/');
  assert.strictEqual(C.startUrl('GRAILED', { id: 'a', remoteListingId: '' }, cfg), 'https://www.grailed.com/sell/for-sale');
  assert.strictEqual(C.startUrl('GRAILED', { id: 'a', remoteListingId: '555' }, cfg), 'https://www.grailed.com/listings/555/edit');
  assert.strictEqual(C.startUrl('POSHMARK', { id: 'a', remoteListingId: '' }, cfg, { 'POSHMARK:a': 'abcdef0123456789abcdef01' }), 'https://poshmark.com/edit-listing/abcdef0123456789abcdef01');
  assert.strictEqual(C.startUrl('POSHMARK', { id: 'a', remoteListingId: '' }, cfg), 'https://poshmark.com/feed');
  assert.ok(/^https:\/\/accounts\.craigslist\.org\/login\/home/.test(C.startUrl('CRAIGSLIST', { id: 'a' }, cfg)));
  assert.strictEqual(C.startUrl('FACEBOOK', { id: 'a', remoteListingId: '99999999' }, cfg), 'https://www.facebook.com/marketplace/item/99999999/');
});

const rawPost = () => ({
  id: 'abcdef0123456789abcdef01', title: 'Thing', description: 'Desc', brand: 'Nike', condition: 'nwt',
  catalog: { department: { id: 'women' } }, colors: [{ name: 'Red', rgb: '#f00' }, { name: 'Blue' }],
  inventory: { size_quantity_revision: 3, status: 'available', size_quantities: [{ size_id: 'OS', quantity_available: 2, quantity_sold: 1 }] },
  price_amount: { val: '40', currency_code: 'USD', currency_symbol: '$' }, original_price_amount: { val: '80', currency_code: 'USD', currency_symbol: '$' },
  cover_shot: { id: 'c1', url: 'x' }, pictures: [{ id: 'p1' }, { id: 'p2' }], creator_id: 'zzz', offer_auto_actions_v2_enabled: true
});

test('poshmark update body: only price/qty change, everything else echoed', () => {
  const r = C.buildPoshmarkUpdate(rawPost(), 33.4, 5);
  assert.ok(!r.error);
  const p = r.body.post;
  assert.deepStrictEqual(p.price_amount, { val: '33', currency_code: 'USD', currency_symbol: '$' });
  assert.deepStrictEqual(p.colors, ['Red', 'Blue']);
  assert.strictEqual(p.inventory.size_quantities[0].quantity_available, 5);
  assert.strictEqual(p.inventory.size_quantity_revision, 3);
  assert.strictEqual(p.inventory.size_quantities[0].quantity_sold, 1);
  assert.deepStrictEqual(p.original_price_amount, rawPost().original_price_amount);
  assert.deepStrictEqual(p.cover_shot, { id: 'c1' });
  assert.strictEqual(p.offer_auto_actions_v2_enabled, true);
  assert.strictEqual(p.creator_id, undefined);
  assert.deepStrictEqual(r.changes, ['price', 'quantity']);
});

test('poshmark update body: price only leaves inventory untouched; refuses unsafe shapes', () => {
  const r = C.buildPoshmarkUpdate(rawPost(), 20, null);
  assert.deepStrictEqual(r.changes, ['price']);
  assert.strictEqual(r.body.post.inventory.size_quantities[0].quantity_available, 2);
  const noOrig = rawPost(); noOrig.original_price_amount = null;
  assert.strictEqual(C.buildPoshmarkUpdate(noOrig, 20, null).error, 'original_price_amount_missing');
  const multi = rawPost(); multi.inventory.size_quantities.push({ size_id: 'M', quantity_available: 1 });
  assert.ok(/^multi_size_inventory_unsupported/.test(C.buildPoshmarkUpdate(multi, 20, 3).error));
  assert.ok(!C.buildPoshmarkUpdate(multi, 20, null).error);
  assert.strictEqual(C.buildPoshmarkUpdate(null, 1, null).error, 'no_post');
});

test('poshmark error payload (HTTP 200 with error body) and unwrap', () => {
  assert.ok(/^poshmark_error:403/.test(C.isPoshmarkErrorPayload({ error: { statusCode: 403, errorType: 'Forbidden', errorMessage: 'nope' } })));
  assert.strictEqual(C.isPoshmarkErrorPayload({ data: { id: 1 } }), null);
  assert.strictEqual(C.unwrapPoshmarkPost({ data: { id: 'x', title: 't' } }).id, 'x');
  assert.strictEqual(C.unwrapPoshmarkPost({ id: 'y', title: 't' }).id, 'y');
  assert.strictEqual(C.poshmarkPriceVal(rawPost()), 40);
  assert.strictEqual(C.poshmarkQuantity(rawPost()), 2);
});

test('poshmark collateral diff catches silent resets', () => {
  const a = rawPost();
  const b = rawPost(); b.price_amount.val = '33';
  assert.deepStrictEqual(C.poshmarkCollateralDiff(a, b, false), []);
  const c = rawPost(); c.brand = 'Adidas'; c.description = '';
  assert.deepStrictEqual(C.poshmarkCollateralDiff(a, c, false).sort(), ['brand', 'description']);
  const d = rawPost(); d.inventory.size_quantities[0].quantity_available = 9;
  assert.deepStrictEqual(C.poshmarkCollateralDiff(a, d, false), ['inventory']);
  assert.deepStrictEqual(C.poshmarkCollateralDiff(a, d, true), []);
});

test('block classification stops the platform run', () => {
  assert.strictEqual(C.classifyBlock('Just a moment...', '', 'https://www.mercari.com/').code, 'challenge_page');
  assert.strictEqual(C.classifyBlock('Poshmark', 'Error 429 too many requests', 'https://poshmark.com/').code, 'http_429');
  assert.strictEqual(C.classifyBlock('Facebook', "You're temporarily blocked from using this feature", 'https://www.facebook.com/marketplace/').code, 'action_blocked');
  assert.strictEqual(C.classifyBlock('Log in', '', 'https://www.facebook.com/login/?next=x').code, 'login_required');
  assert.strictEqual(C.classifyBlock('Account', '', 'https://accounts.craigslist.org/login/home?show_tab=postings'), null);
  assert.strictEqual(C.classifyBlock('Account', '', 'https://accounts.craigslist.org/login').code, 'login_required');
  assert.strictEqual(C.classifyBlock('Mercari: sell', 'Edit your listing', 'https://www.mercari.com/sell/edit/m1/'), null);
  assert.strictEqual(C.classifyBlock('x', '', 'https://www.facebook.com/checkpoint/1234/').code, 'facebook_checkpoint');
});

test('redaction strips secrets and caps size', () => {
  const r = C.redact({ csrfToken: 'abc', nested: { Authorization: 'Bearer z', ok: 'fine' }, long: 'x'.repeat(1000) });
  assert.strictEqual(r.csrfToken, '[redacted]');
  assert.strictEqual(r.nested.Authorization, '[redacted]');
  assert.strictEqual(r.nested.ok, 'fine');
  assert.ok(r.long.length < 400);
  assert.strictEqual(C.safeUrl('https://poshmark.com/vm-rest/posts/abc?app_version=2.55&_csrf=zzz'), 'https://poshmark.com/vm-rest/posts/abc?app_version=2.55&_csrf=[redacted]');
});

test('ring buffer and diagnostics store stay bounded', () => {
  let a = [];
  for (let i = 0; i < 250; i++) a = C.pushRing(a, i, 100);
  assert.strictEqual(a.length, 100);
  assert.strictEqual(a[0], 150);
  let store = {};
  for (let i = 0; i < 30; i++) store = C.addDiag(store, 'FACEBOOK', { i: i, blob: 'y'.repeat(5000) }, 4, 30000);
  assert.ok(store.FACEBOOK.length <= 4);
  assert.ok(JSON.stringify(store).length <= 30000);
  assert.strictEqual(store.FACEBOOK[store.FACEBOOK.length - 1].i, 29);
});

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb', D = 'dddddddddddddddddddddddd';
test('normalizeEntry carries a sanitized titleGroup', () => {
  const e = C.normalizeEntry({ id: 'i1', title: 'T', price: 5, titleGroup: { unresolved: 1, claimedIds: [A.toUpperCase(), 'nope', A] } }, 'POSHMARK');
  assert.deepStrictEqual(e.titleGroup, { unresolved: 1, claimedIds: [A] });
  assert.strictEqual(C.normalizeEntry({ id: 'i1', title: 'T', price: 5 }, 'POSHMARK').titleGroup, null);
  assert.strictEqual(C.normalizeEntry({ id: 'i1', title: 'T', price: 5, titleGroup: { unresolved: 0 } }, 'POSHMARK').titleGroup, null);
});

test('resolveDuplicateTitleId picks only the single unclaimed listing when this is the only unresolved item', () => {
  const r = C.resolveDuplicateTitleId([{ id: A }, { id: B }, { id: D }], { unresolved: 1, claimedIds: [A, B] }, true);
  assert.strictEqual(r.id, D);
});

test('resolveDuplicateTitleId never guesses among identical duplicates and says what is needed', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: String(i).repeat(24) }));
  const r = C.resolveDuplicateTitleId(nine, { unresolved: 9, claimedIds: [] }, true);
  assert.strictEqual(r.id, '');
  assert.strictEqual(r.reason, 'multiple_unresolved');
  assert.match(r.message, /^Needs info:/);
  // unresolved === 1: one FindA.Sale item owns the title, so the nine listings are copies of it (no guessing between items)
  const cp = C.resolveDuplicateTitleId(nine, { unresolved: 1, claimedIds: [] }, true);
  assert.strictEqual(cp.id, '');
  assert.strictEqual(cp.reason, 'copies_of_single_item');
  assert.strictEqual(cp.copies.length, 9);
  // copies already tied to a sibling item are never included
  const cp2 = C.resolveDuplicateTitleId(nine, { unresolved: 1, claimedIds: ['0'.repeat(24)] }, true);
  assert.strictEqual(cp2.copies.length, 8);
  assert.ok(cp2.copies.indexOf('0'.repeat(24)) === -1);
  // an incomplete closet read or missing accounting never yields copies
  assert.strictEqual(C.resolveDuplicateTitleId(nine, { unresolved: 1, claimedIds: [] }, false).reason, 'closet_incomplete');
  assert.strictEqual(C.resolveDuplicateTitleId(nine, { unresolved: 2, claimedIds: [] }, true).copies, undefined);
  assert.strictEqual(C.resolveDuplicateTitleId(nine, null, true).reason, 'no_accounting');
  assert.strictEqual(C.resolveDuplicateTitleId([{ id: A }, { id: B }], { unresolved: 1, claimedIds: [A] }, false).reason, 'closet_incomplete');
  assert.strictEqual(C.resolveDuplicateTitleId([{ id: A }], { unresolved: 1, claimedIds: [A] }, true).reason, 'all_claimed');
  assert.strictEqual(C.resolveDuplicateTitleId([], { unresolved: 1, claimedIds: [] }, true).reason, 'no_candidates');
});

test('copyStart keeps valid unique ids, canonical first', () => {
  const s = C.copyStart([A, B.toUpperCase(), A, 'bad']);
  assert.deepStrictEqual(s.copies, [A, B]);
  assert.strictEqual(s.remoteId, A);
  assert.strictEqual(s.copyIdx, 0);
});

test('copyAdvance walks every copy serially, collects failures and keeps going', () => {
  let S = C.copyStart([A, B, D]);
  let r = C.copyAdvance(S, { state: 'done' });
  assert.strictEqual(r.next, 'goto');
  assert.strictEqual(r.scratch.remoteId, B);
  assert.strictEqual(r.scratch.copyWait, true);
  assert.strictEqual(r.scratch.apiTried, false);
  S = Object.assign({}, S, r.scratch);
  r = C.copyAdvance(S, { state: 'fail', code: 'verify_mismatch', reason: 'shows 9' });
  assert.strictEqual(r.next, 'goto');
  S = Object.assign({}, S, r.scratch);
  r = C.copyAdvance(S, { state: 'done' });
  assert.strictEqual(r.next, 'finish');
  assert.deepStrictEqual(r.summary.edited, [A, D]);
  assert.strictEqual(r.summary.failed.length, 1);
  assert.strictEqual(r.summary.failed[0].id, B);
  assert.strictEqual(r.summary.allOk, false);
  assert.strictEqual(r.summary.canonical, A);
  const line = C.copySummaryLine('Camel sign', r.summary);
  assert.match(line, /Edited 2 of 3/);
  assert.ok(line.indexOf('FAILED: ' + B.slice(-6)) !== -1);
  assert.match(line, /nothing was deleted or delisted/);
});

test('copyAdvance: all copies edited is allOk; a gone listing is skipped not failed; a block stops the rest', () => {
  let S = C.copyStart([A, B]);
  let r = C.copyAdvance(S, { state: 'done' });
  S = Object.assign({}, S, r.scratch);
  r = C.copyAdvance(S, { state: 'done' });
  assert.strictEqual(r.summary.allOk, true);
  S = C.copyStart([A, B]);
  r = C.copyAdvance(S, { state: 'fail', code: 'api_get_failed', reason: 'GET post: HTTP 404' });
  assert.strictEqual(r.next, 'goto');
  S = Object.assign({}, S, r.scratch);
  r = C.copyAdvance(S, { state: 'done' });
  assert.deepStrictEqual(r.summary.gone, [A]);
  assert.strictEqual(r.summary.failed.length, 0);
  S = C.copyStart([A, B, D]);
  r = C.copyAdvance(S, { state: 'blocked', code: 'http_429', reason: 'slow down' });
  assert.strictEqual(r.next, 'finish');
  assert.deepStrictEqual(r.summary.untried, [B, D]);
  assert.strictEqual(r.summary.allOk, false);
});

// 2026-10-19: Poshmark closet lookups (real closet titles seen live).
test('titleEquals keeps a title that contains a dollar amount', () => {
  const C = require('../fas-edit-core.js');
  assert.equal(C.titleEquals('1950-C $50 *Minneapolis* Federal Reserve Star Note', '1950-C $50 *Minneapolis* Federal Reserve Star Note'), true);
});
test('pickUniquePoshmark finds a listing Poshmark cut to 80 characters', () => {
  const C = require('../fas-edit-core.js');
  const posh = 'Titleist Pro 98 Plus Golf Hat, Signed by Professional Golfers Chi Chi Rodriguez';
  const full = posh + ' Autographed Memorabilia Collectible';
  const r = C.pickUniquePoshmark([{ key: 'a', texts: [posh] }, { key: 'b', texts: ['Other thing entirely here'] }], full);
  assert.equal(r.reason, 'ok'); assert.equal(r.match.key, 'a');
  assert.equal(C.pickUniquePoshmark([{ key: 'b', texts: ['Other thing entirely here'] }], full).reason, 'none');
});

test('isPoshmarkErrorPayload keeps the full detail when errorMessage is empty (Poshmark "suspicious" certify response)', () => {
  const C = require('../fas-edit-core.js');
  const r = C.isPoshmarkErrorPayload({ error: { statusCode: 400, errorType: 'PostValidationError', errorMessage: null, userMessage: 'We have detected that this item is suspicious.', params: { certify_action: true } } });
  assert.ok(/suspicious/.test(r) && /certify_action/.test(r), r);
});

test('pickFuzzyPoshmark: finds a retitled listing, refuses weak or ambiguous matches', () => {
  const C = require('../fas-edit-core.js');
  const cards = [
    { key: 'cel', texts: ['Celestion Vintage 30 G12 Guitar Speaker, 12-inch, 8 Ohm'] },
    { key: 'bank', texts: ["Banker's lamp with green glass shade and brass base"] },
    { key: 'xlr', texts: ['Professional Low Noise Microphone Cable 6 ft, XLR 3-Pin'] },
  ];
  assert.strictEqual(C.pickFuzzyPoshmark(cards, 'Celestion G12 Vintage 30 Guitar Speaker Cabinet Insert').match.key, 'cel');
  assert.strictEqual(C.pickFuzzyPoshmark(cards, "Banker's Lamp, Brass Brass with Green Glass Shade").match.key, 'bank');
  assert.strictEqual(C.pickFuzzyPoshmark(cards, 'Breit Professional Microphone Cable, XLR Male to Female').match, null);
  assert.strictEqual(C.pickFuzzyPoshmark(cards, 'Celestion G12 Vintage 75 Guitar Speaker Cabinet Insert').match, null); // different model number
  assert.strictEqual(C.pickFuzzyPoshmark([{ key: 'a', texts: ['Celestion Vintage 30 G12 Guitar Speaker, 12-inch'] }, { key: 'b', texts: ['Celestion Vintage 30 G12 Guitar Speaker, 12-inch 16 Ohm'] }], 'Celestion G12 Vintage 30 Guitar Speaker').reason, 'ambiguous');
});
