// 1.0.85 (2026-10-30): (1) the 1.0.83 Poshmark pre-save title guard now runs on every other edit path (Mercari, Grailed, Craigslist,
// Gumtree AU, Facebook); (2) a price edit never saves when another field (title, description...) would change; (3) Mercari save-control
// detection made robust after prod 2026-10-29 04:23 UTC save_control_not_found on three items (1950-C $50 star note 260->231, Iron Man
// #300 5->4, 1994 Motor City Comic Con program 11->10). DOM is STUBBED; nothing here was driven against a live marketplace.
// Run: node --test extension/tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const C = require('../fas-edit-core.js');
const src = read('fas-edit-engine.js');

// ------------------------------------------------------------------------------------------------ core: title equality per platform
test('titleEqualsFor: exact titles match on every platform; a different title never does', () => {
  for (const p of ['MERCARI', 'GRAILED', 'CRAIGSLIST', 'GUMTREE_AU', 'FACEBOOK', 'POSHMARK']) {
    assert.strictEqual(C.titleEqualsFor(p, 'Iron Man #300 Newsstand Variant  (Marvel Comics Jan 1994)', 'Iron Man #300 Newsstand Variant (Marvel Comics Jan 1994)'), true, p);
    assert.strictEqual(C.titleEqualsFor(p, 'Iron Man #301 Newsstand Variant (Marvel Comics Feb 1994)', 'Iron Man #300 Newsstand Variant (Marvel Comics Jan 1994)'), false, p);
  }
  // a title that carries a dollar amount (the 2026-10-19 cleanCandidateTitle trap)
  assert.strictEqual(C.titleEqualsFor('MERCARI', '1950-C $50 *Minneapolis* Federal Reserve Star Note', '1950-C $50 *Minneapolis* Federal Reserve Star Note'), true);
});
test('titleEqualsFor: each platform\'s own truncation is allowed (Mercari 80, Grailed 60 at a word, Craigslist 70), loose prefixes are not', () => {
  const long = 'Vintage 1994 Motor City Comic Con Program Guide March 24-26 Novi Michigan Expo Center Signed';   // 92 chars
  assert.ok(long.length > 80);
  assert.strictEqual(C.titleEqualsFor('MERCARI', long.slice(0, 80), long), true, 'Mercari keeps the first 80');
  assert.strictEqual(C.titleEqualsFor('CRAIGSLIST', long.slice(0, 70), long), true, 'Craigslist cuts at 70');
  assert.strictEqual(C.titleEqualsFor('CRAIGSLIST', long.slice(0, 70) + ' - $10 (Kalamazoo)', long), true, 'dashboard "- $price (place)" tail');
  const gr = long.slice(0, 60).slice(0, long.slice(0, 60).lastIndexOf(' '));
  assert.strictEqual(C.titleEqualsFor('GRAILED', gr, long), true, 'Grailed 60-char word cut');
  assert.strictEqual(C.titleEqualsFor('MERCARI', long.slice(0, 30), long), false, 'a short prefix is not the same listing');
  assert.strictEqual(C.titleEqualsFor('CRAIGSLIST', long.slice(0, 40), long), false);
  assert.strictEqual(C.titleEqualsFor('MERCARI', 'Vintage 1994 Motor City Comic Con', 'Vintage 1994 Motor City Comic Con Program Guide'), false, 'a short title is never treated as truncated');
});
test('editTargetCheck: own saved id always allowed (repair), a different id refused, otherwise the current title decides', () => {
  const it = { id: 'i1', title: 'Iron Man #300 Newsstand Variant (Marvel Comics Jan 1994)', remoteListingId: 'm26453581260' };
  assert.deepStrictEqual(C.editTargetCheck('MERCARI', it, 'm26453581260', 'DAMAGED TITLE'), { ok: true, own: true });
  assert.strictEqual(C.editTargetCheck('MERCARI', it, 'm11111111111', it.title).code, 'remote_id_mismatch');
  const noId = { id: 'i2', title: it.title };
  assert.strictEqual(C.editTargetCheck('MERCARI', noId, 'm11111111111', it.title).ok, true);
  assert.strictEqual(C.editTargetCheck('MERCARI', noId, 'm11111111111', 'Supreme Magnetic Drive Utility Pump').code, 'listing_title_mismatch');
  assert.strictEqual(C.editTargetCheck('MERCARI', noId, 'm11111111111', '').code, 'listing_title_mismatch', 'unreadable title fails closed');
  // Facebook saves the URL as the id; Craigslist may keep it in listingRefs; ids are normalized before comparing
  assert.strictEqual(C.editTargetCheck('FACEBOOK', { title: 'x', remoteListingId: 'https://www.facebook.com/marketplace/item/123456789/' }, '123456789', '').own, true);
  assert.strictEqual(C.editTargetCheck('CRAIGSLIST', { title: 'x', listingRefs: { CRAIGSLIST: 'https://kalamazoo.craigslist.org/clt/d/x/7986095940.html' } }, '7986095940', '').own, true);
  assert.strictEqual(C.editTargetCheck('GRAILED', { title: 'x', remoteListingId: '104003051' }, '104003052', 'x').code, 'remote_id_mismatch');
  // Poshmark keeps its 1.0.83 check
  assert.strictEqual(C.editTargetCheck('POSHMARK', { title: 'abc def ghi', remoteListingId: '6a96050225362175cc1c723d' }, '6a96050225362175cc1c723d', '').own, true);
});

// ------------------------------------------------------------------------------------------------ DOM stub harness (as in fas-grailed-edit-save)
function mk(sels, props) {
  return Object.assign({ sels: sels, kids: [], parent: null, shown: true, clicks: 0, innerText: '', textContent: '', disabled: false, value: undefined, tagName: 'DIV', type: '', name: '', id: '', events: [],
    getAttribute(n) { return this.attrs && n in this.attrs ? this.attrs[n] : null; },
    getBoundingClientRect() { let n = this; while (n) { if (!n.shown) return { left: 0, top: 0, width: 0, height: 0 }; n = n.parent; } return { left: 0, top: 0, width: 10, height: 10 }; },
    closest() { return null; },
    dispatchEvent(e) { this.events.push(e.type); if (this.onEvent) this.onEvent(e.type); return true; }, scrollIntoView() {}, focus() {}, select() {}, blur() { this.events.push('blur()'); },
    click() { this.clicks++; },
  }, props || {});
}
function add(p, c) { c.parent = p; p.kids.push(c); return c; }
function all(r) { const out = []; (function w(n) { n.kids.forEach((k) => { out.push(k); w(k); }); })(r); return out; }
function attach(e) { e.querySelectorAll = (s) => { const parts = s.split(',').map((x) => x.trim()); return all(e).filter((x) => parts.some((y) => x.sels.includes(y))); }; e.querySelector = (s) => e.querySelectorAll(s)[0] || null; e.kids.forEach(attach); return e; }
function input(sels, name, value, extra) { return mk(sels.concat(['input']), Object.assign({ tagName: 'INPUT', type: 'text', name: name, value: value, attrs: Object.assign({ name: name, type: 'text' }, extra || {}) })); }
function button(label, sels, attrs, disabled) { return mk(['button'].concat(sels || []), { tagName: 'BUTTON', innerText: label, textContent: label, disabled: !!disabled, attrs: attrs || {} }); }
function loadEngine(doc, loc, title, bodyText) {
  let clock = 1e12;
  class FakeDate extends Date { static now() { return clock; } }
  const sb = { console, Math, JSON, Promise, Date: FakeDate, clearTimeout, URL };
  sb.setTimeout = (f, ms) => { clock += ms || 0; return setImmediate(f); };
  sb.self = sb; sb.window = sb;
  sb.document = Object.assign(doc, { title: title || '', body: { innerText: bodyText || 'Edit', textContent: '' } });
  sb.location = loc;
  sb.requestAnimationFrame = (f) => f();
  sb.getComputedStyle = () => ({});
  sb.Event = function (t) { this.type = t; }; sb.PointerEvent = function (t) { this.type = t; }; sb.MouseEvent = function (t) { this.type = t; }; sb.FocusEvent = function (t) { this.type = t; };
  sb.KeyboardEvent = function (t) { this.type = t; };
  sb.HTMLInputElement = function () {};
  vm.createContext(sb);
  vm.runInContext(read('fas-edit-core.js'), sb);
  vm.runInContext(src, sb);
  return sb.FAS_EDIT_ENGINE._test;
}
const flush = () => new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r))));

// ------------------------------------------------------------------------------------------------ Mercari
const STAR = '1950-C $50 *Minneapolis* Federal Reserve Star Note';
function mercPage(o) {
  o = o || {};
  const doc = mk(['#document']);
  const title = add(doc, input(['input[name="sellName"]'], 'sellName', o.pageTitle == null ? STAR : o.pageTitle));
  const desc = add(doc, mk(['textarea'], { tagName: 'TEXTAREA', name: 'sellDescription', value: 'Nice note', attrs: { name: 'sellDescription' } }));
  const price = add(doc, input(['input#Price[name="sellPrice"][data-testid="Price"]', 'input[name="sellPrice"]'], 'sellPrice', '260', { 'data-testid': 'Price' }));
  add(doc, button('Deactivate', [], { 'data-testid': 'DeactivateButton' }));
  add(doc, button('Delete', [], { 'data-testid': 'DeleteButton' }));
  const save = o.label === null ? null : add(doc, button(o.label || 'Update', ['button[data-testid="ListButton"]', 'button[type="submit"]'], { 'data-testid': 'ListButton', type: 'submit' }, !!o.disabled));
  if (o.enableOnBlur && save) price.onEvent = (t) => { if (t === 'focusout') save.disabled = false; };
  if (o.touchDesc) price.onEvent = (t) => { if (t === 'input') desc.value = 'Changed by the page'; };
  attach(doc);
  return { doc, title, desc, price, save };
}
const mercLoc = { href: 'https://www.mercari.com/sell/edit/m26453581260/', pathname: '/sell/edit/m26453581260/', origin: 'https://www.mercari.com' };
const mercCtx = (item) => ({ platform: 'MERCARI', cfg: {}, scratch: { phase: 'form' }, item: Object.assign({ id: 'cmo3etwiu006djqsueldb1tdz', title: STAR, priceDrift: true, price: 231 }, item || {}) });

test('Mercari: Update disabled until the price is committed -> input/change/focus-out/blur are dispatched, then it is clicked once', async () => {
  const P = mercPage({ disabled: true, enableOnBlur: true });
  const E = loadEngine(P.doc, mercLoc, 'Edit ' + STAR + ' | Mercari');
  const r = await E.mercStep(mercCtx());
  await flush();
  assert.strictEqual(r.state, 'continue');
  assert.strictEqual(r.scratch.phase, 'saved');
  assert.strictEqual(P.price.value, '231');
  for (const ev of ['input', 'change', 'focusout', 'blur']) assert.ok(P.price.events.includes(ev), ev);
  assert.strictEqual(P.save.clicks, 1);
});
test('Mercari: Update stays disabled -> save_control_disabled with the control named, nothing clicked', async () => {
  const P = mercPage({ disabled: true });
  const E = loadEngine(P.doc, mercLoc);
  const r = await E.mercStep(mercCtx());
  await flush();
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'save_control_disabled');
  assert.ok(/update control stayed disabled/.test(r.reason));
  assert.deepStrictEqual([...r.details.disabledSave], ['update']);
  assert.strictEqual(r.details.listButton.disabled, true);
  assert.strictEqual(P.save.clicks, 0);
});
test('Mercari: no save control at all -> save_control_not_found; Deactivate/Delete are never taken for it', async () => {
  const P = mercPage({ label: null });
  const E = loadEngine(P.doc, mercLoc);
  const r = await E.mercStep(mercCtx());
  assert.strictEqual(r.code, 'save_control_not_found');
  assert.strictEqual(E.mercSaveCandidates().length, 0);
  all(P.doc).forEach((n) => assert.strictEqual(n.clicks, 0));
});
test('Mercari: known label variants are found (Update, Update listing, Save changes, Save)', () => {
  for (const label of ['Update', 'Update listing', 'Save changes', 'Save']) {
    const P = mercPage({ label });
    const E = loadEngine(P.doc, mercLoc);
    assert.strictEqual(E.mercFindSave(), P.save, label);
  }
});
test('Mercari guard: no saved id and the edit page carries ANOTHER item\'s title -> listing_title_mismatch, price not typed, id not kept', async () => {
  const P = mercPage({ pageTitle: 'Supreme Magnetic Drive Utility Pump with Venturi Intake, Model 3' });
  const E = loadEngine(P.doc, mercLoc);
  const r = await E.mercStep(mercCtx());
  await flush();
  assert.strictEqual(r.code, 'listing_title_mismatch');
  assert.strictEqual(P.price.value, '260', 'price untouched');
  assert.strictEqual(P.save.clicks, 0);
  assert.strictEqual(r.scratch.remoteId, null, 'refused id is never cached');
});
test('Mercari guard: the item\'s own saved id may be edited even with a damaged title (repair); a different saved id is refused', async () => {
  const P = mercPage({ pageTitle: 'damaged' });
  const E = loadEngine(P.doc, mercLoc);
  const r = await E.mercStep(mercCtx({ remoteListingId: 'm26453581260' }));
  await flush();
  assert.strictEqual(r.state, 'continue');
  assert.strictEqual(P.title.value, 'damaged', 'the title is never written');
  assert.strictEqual(P.save.clicks, 1);
  const P2 = mercPage({});
  const E2 = loadEngine(P2.doc, mercLoc);
  const r2 = await E2.mercStep(mercCtx({ remoteListingId: 'm99999999999' }));
  assert.strictEqual(r2.code, 'remote_id_mismatch');
  assert.strictEqual(P2.price.value, '260');
});
test('Mercari guard: an 80-char truncated title on the page matches the long FindA.Sale title', async () => {
  const long = 'Vtg 1994 Motor City Comic Con Program Guide Mar 24-26 Novi Michigan Expo Center Signed Copy';
  const P = mercPage({ pageTitle: long.slice(0, 80) });
  const E = loadEngine(P.doc, mercLoc);
  const r = await E.mercStep(mercCtx({ title: long, price: 10 }));
  await flush();
  assert.strictEqual(r.state, 'continue');
  assert.strictEqual(P.save.clicks, 1);
});
test('Mercari: a price edit that would change another field (description) is refused before the save click', async () => {
  const P = mercPage({ touchDesc: true });
  const E = loadEngine(P.doc, mercLoc);
  const r = await E.mercStep(mercCtx());
  await flush();
  assert.strictEqual(r.code, 'payload_would_change_fields');
  assert.ok(/sellDescription/.test(r.reason));
  assert.strictEqual(P.save.clicks, 0);
});
test('Mercari: after-save verification is kept (saved -> verify re-reads the edit page price before done), one save click only', () => {
  const fn = src.slice(src.indexOf('async function mercStep(ctx)'), src.indexOf('// GRAILED -- UI driven'));
  assert.ok(/if \(phase === 'verify'\) \{\s*var okV = C\.pricesMatch\('MERCARI', price\.value, W\.price\);\s*if \(okV\) return done/.test(fn));
  assert.ok(/return go\(S\.editUrl \|\| location\.href, \{ phase: 'verify', verifyTries: 0 \}/.test(fn));
  assert.strictEqual((fn.match(/deferClick\(save\)/g) || []).length, 1);
  assert.ok(fn.indexOf('titleGuard(ctx, mTid') < fn.indexOf('writeField(price'), 'guard runs before anything is typed');
});

// ------------------------------------------------------------------------------------------------ Grailed
function grPage(pageTitle) {
  const doc = mk(['#document']);
  add(doc, input(['input[name="title"]'], 'title', pageTitle));
  const price = add(doc, mk(['input[type="tel"][name="price"]', 'input[name="price"]', 'input'], { tagName: 'INPUT', type: 'tel', name: 'price', value: '225', attrs: { name: 'price', type: 'tel' } }));
  const save = add(doc, button('PUBLISH', ['button[type="submit"]'], { type: 'submit' }));
  attach(doc);
  return { doc, price, save };
}
const grLoc = { href: 'https://www.grailed.com/listings/104003051/edit', pathname: '/listings/104003051/edit', origin: 'https://www.grailed.com' };
const grCtx = (item) => ({ platform: 'GRAILED', cfg: {}, scratch: { phase: 'form' }, item: Object.assign({ id: 'g1', title: 'Bored Ape Yacht Club Adidas Tracksuit', priceDrift: true, price: 202 }, item || {}) });
test('Grailed guard: another listing\'s title -> refused, nothing typed; the matching title (or Grailed\'s 60-char cut) goes ahead', async () => {
  const P = grPage('Supreme Box Logo Hoodie FW17');
  const E = loadEngine(P.doc, grLoc);
  const r = await E.grStep(grCtx());
  assert.strictEqual(r.code, 'listing_title_mismatch');
  assert.strictEqual(P.price.value, '225');
  assert.strictEqual(P.save.clicks, 0);
  const long = 'Bored Ape Yacht Club x Adidas Originals Tracksuit Jacket and Pants Set Size Large';
  const cut = long.slice(0, 60).slice(0, long.slice(0, 60).lastIndexOf(' '));
  const P2 = grPage(cut);
  const E2 = loadEngine(P2.doc, grLoc);
  const r2 = await E2.grStep(grCtx({ title: long }));
  await flush();
  assert.strictEqual(r2.state, 'continue');
  assert.strictEqual(P2.save.clicks, 1);
});

// ------------------------------------------------------------------------------------------------ Gumtree AU
function gtPage(pageTitle) {
  const doc = mk(['#document']);
  const form = add(doc, mk(['form#pstad-main-form', 'form'], { tagName: 'FORM' }));
  add(form, input(['form#pstad-main-form input[name="title"]'], 'title', pageTitle));
  const amount = add(form, input(['input[name="price.amount"]'], 'price.amount', '20'));
  const save = add(form, button('Save ad', ['form#pstad-main-form button[type="submit"]'], { type: 'submit' }));
  attach(doc);
  return { doc, amount, save };
}
const gtLoc = { href: 'https://www.gumtree.com.au/p-post-ad2.html?adId=1234567890', pathname: '/p-post-ad2.html', origin: 'https://www.gumtree.com.au' };
const gtCtx = (item) => ({ platform: 'GUMTREE_AU', cfg: {}, scratch: { phase: 'form' }, item: Object.assign({ id: 't1', title: 'Fender Stratocaster Electric Guitar', priceDrift: true, price: 15 }, item || {}) });
test('Gumtree guard: another ad\'s title -> refused, nothing typed; matching title or the item\'s own saved ad id goes ahead', async () => {
  const P = gtPage('Yamaha Acoustic Guitar');
  const r = await loadEngine(P.doc, gtLoc).gtStep(gtCtx());
  assert.strictEqual(r.code, 'listing_title_mismatch');
  assert.strictEqual(P.amount.value, '20');
  assert.strictEqual(P.save.clicks, 0);
  const P2 = gtPage('Fender Stratocaster Electric Guitar');
  const r2 = await loadEngine(P2.doc, gtLoc).gtStep(gtCtx());
  await flush();
  assert.strictEqual(r2.state, 'continue'); assert.strictEqual(P2.amount.value, '15'); assert.strictEqual(P2.save.clicks, 1);
  const P3 = gtPage('damaged');
  const r3 = await loadEngine(P3.doc, gtLoc).gtStep(gtCtx({ remoteListingId: '1234567890' }));
  await flush();
  assert.strictEqual(r3.state, 'continue'); assert.strictEqual(P3.save.clicks, 1);
});

// ------------------------------------------------------------------------------------------------ Facebook
function fbPage(pageTitle) {
  const doc = mk(['#document']);
  add(doc, input([], 'title', pageTitle, { 'aria-label': 'Title' }));
  const price = add(doc, input([], 'price', '12', { 'aria-label': 'Price' }));
  const save = add(doc, button('Update', []));
  attach(doc);
  return { doc, price, save };
}
const fbLoc = { href: 'https://www.facebook.com/marketplace/item/123456789/', pathname: '/marketplace/item/123456789/', origin: 'https://www.facebook.com' };
const fbCtx = (item) => ({ platform: 'FACEBOOK', cfg: {}, scratch: { phase: 'form' }, item: Object.assign({ id: 'f1', title: 'Coca Cola Skating Girl metal sign', priceDrift: true, price: 10 }, item || {}) });
test('Facebook guard: another listing\'s title -> refused, nothing typed; own saved id (URL form) may be repaired; matching title goes ahead', async () => {
  const P = fbPage('Pepsi bottle cap sign');
  const r = await loadEngine(P.doc, fbLoc).fbStep(fbCtx());
  assert.strictEqual(r.code, 'listing_title_mismatch');
  assert.strictEqual(P.price.value, '12');
  assert.strictEqual(P.save.clicks, 0);
  assert.strictEqual(r.scratch.itemIdFound, null);
  const P2 = fbPage('Pepsi bottle cap sign');
  const r2 = await loadEngine(P2.doc, fbLoc).fbStep(fbCtx({ remoteListingId: 'https://www.facebook.com/marketplace/item/123456789/' }));
  await flush();
  assert.strictEqual(r2.state, 'continue'); assert.strictEqual(P2.price.value, '10'); assert.strictEqual(P2.save.clicks, 1);
  assert.strictEqual(r2.scratch.titleOk, true);
  const P3 = fbPage('Coca Cola Skating Girl metal sign');
  const r3 = await loadEngine(P3.doc, fbLoc).fbStep(fbCtx());
  await flush();
  assert.strictEqual(r3.state, 'continue'); assert.strictEqual(P3.save.clicks, 1);
});

// ------------------------------------------------------------------------------------------------ Craigslist (same stubs as fas-cl-pause.test.js)
function el(o) { return Object.assign({ getBoundingClientRect: () => ({ width: 10, height: 10 }), getAttribute: () => null, classList: { contains: () => false }, tagName: 'DIV', innerText: '', textContent: '', dispatchEvent: () => true, focus() {} }, o || {}); }
function clPage(o) {
  const buttons = (o.buttons || []).map((l) => el({ tagName: 'INPUT', value: l }));
  const heads = (o.heads || []).map((t) => el({ tagName: 'H2', innerText: t, textContent: t }));
  const titleInput = o.titleInput != null ? el({ value: o.titleInput, tagName: 'INPUT' }) : null;
  const priceEl = o.price ? el({ value: '4', tagName: 'INPUT' }) : null;
  return { priceEl, document: { title: 'posting', body: { innerText: 'posting', textContent: '' },
    querySelector: (sel) => (/PostingTitle/.test(sel) ? titleInput : (/price/.test(sel) ? priceEl : null)),
    querySelectorAll: (sel) => (/^h1/.test(sel) ? heads : (/button|submit/.test(sel) ? buttons : [])) } };
}
function loadCl(dom) {
  const clicks = [];
  const sb = { console, clearTimeout, Math, Date, JSON, URL, Promise };
  sb.setTimeout = (f, ms, ...a) => { if (ms === 80) { clicks.push('click'); return 0; } return setTimeout(f, ms, ...a); };
  sb.self = sb; sb.window = sb;
  sb.document = Object.assign({ querySelector: () => null, querySelectorAll: () => [], title: '', body: { innerText: '', textContent: '' } }, dom.document);
  sb.location = { href: 'https://post.craigslist.org/k/abc', hostname: 'post.craigslist.org', pathname: '/k/abc', search: '' };
  sb.getComputedStyle = () => ({ visibility: 'visible', display: 'block' });
  sb.requestAnimationFrame = (f) => setTimeout(f, 0);
  sb.PointerEvent = sb.MouseEvent = sb.Event = function (type, init) { this.type = type; Object.assign(this, init || {}); };
  sb.HTMLInputElement = function () {};
  vm.createContext(sb);
  for (const f of ['fas-edit-core.js', 'fas-cl-guard.js', 'fas-edit-engine.js']) vm.runInContext(read(f), sb);
  return { step: sb.FAS_EDIT_ENGINE._test.clStep, clicks };
}
const CL_ITEM = { id: 'it1', title: 'Cecil Fielder 1990 Fleer Detroit Tigers baseball card', priceDrift: true, price: 5 };
const CL_EDIT = { phase: 'edit', postingId: '7986095940', priceSet: false, hops: 1, rowTitle: CL_ITEM.title };
const clCtx = (scratch, item) => ({ platform: 'CRAIGSLIST', item: Object.assign({}, CL_ITEM, item || {}), scratch: scratch, stepNo: 3 });
test('Craigslist guard: a posting whose title only loosely matches (identity check passes) is refused before the price is typed', async () => {
  const P = clPage({ buttons: ['continue'], titleInput: CL_ITEM.title + ' lot of 5', price: true });
  const e = loadCl(P);
  const r = await e.step(clCtx(CL_EDIT));
  assert.strictEqual(r.code, 'listing_title_mismatch');
  assert.strictEqual(P.priceEl.value, '4', 'price untouched');
  assert.deepStrictEqual(e.clicks, []);
  assert.strictEqual(r.scratch.postingId, null);
});
test('Craigslist guard: exact title, the 70-char cut, or the item\'s own saved posting id pass; Continue is pressed once and remembered', async () => {
  const ok = loadCl(clPage({ buttons: ['continue'], titleInput: CL_ITEM.title, price: true }));
  const r = await ok.step(clCtx(CL_EDIT));
  assert.strictEqual(r.state, 'continue'); assert.strictEqual(ok.clicks.length, 1); assert.strictEqual(r.scratch.clTitleOk, true);
  const long = 'Jefferson Airplane Surrealistic Pillow Original 1967 RCA Victor Vinyl LP Record, 1970s press';
  const cut = loadCl(clPage({ buttons: ['continue'], titleInput: long.slice(0, 70), price: true }));
  const r2 = await cut.step(clCtx(Object.assign({}, CL_EDIT, { rowTitle: long.slice(0, 70) }), { title: long }));
  assert.strictEqual(r2.state, 'continue'); assert.strictEqual(cut.clicks.length, 1);
  const own = loadCl(clPage({ buttons: ['continue'], titleInput: CL_ITEM.title + ' lot of 5', price: true }));
  const r3 = await own.step(clCtx(CL_EDIT, { remoteListingId: '7986095940' }));
  assert.strictEqual(r3.state, 'continue'); assert.strictEqual(own.clicks.length, 1);
});
test('Craigslist guard: publish on a preview whose heading is a different (loosely compatible) title is refused', async () => {
  const e = loadCl(clPage({ buttons: ['publish', 'edit post'], heads: ['Attention: posting will expire in 28 days', CL_ITEM.title + ' lot of 5 - $5 (Detroit)'] }));
  const r = await e.step(clCtx(Object.assign({}, CL_EDIT, { priceSet: true })));
  assert.strictEqual(r.code, 'listing_title_mismatch');
  assert.deepStrictEqual(e.clicks, []);
});
test('Craigslist price edits stay paused (owner decision, FAS_CL_PRICE_EDITS_PAUSED true)', () => {
  assert.match(read('config.js'), /FAS_CL_PRICE_EDITS_PAUSED:\s*true/);
  assert.strictEqual(C.isEditPausedByConfig('CRAIGSLIST', { FAS_CL_PRICE_EDITS_PAUSED: true }), true);
});

// ------------------------------------------------------------------------------------------------ wiring
test('background drops a refused listing id from the id cache; every guard refusal clears the found ids', () => {
  const bg = read('background.js');
  assert.ok(/const FAS_EDIT_TARGET_REFUSED_CODES = \['listing_title_mismatch', 'remote_id_mismatch', 'edit_page_mismatch', 'payload_would_change_fields'\]/.test(bg));
  assert.ok(/if \(FAS_EDIT_TARGET_REFUSED_CODES\.indexOf\(res\.code\) !== -1\) delete state\.idCache\[key\];/.test(bg));
  const tg = src.slice(src.indexOf('function titleGuard('), src.indexOf('var GUARD_SKIP_RE'));
  assert.ok(/remoteId: null, itemIdFound: null, postingId: null, targetId: null/.test(tg));
  for (const fn of ['fbStep', 'mercStep', 'grStep', 'clStep', 'gtStep']) {
    const body = src.slice(src.indexOf('async function ' + fn + '(ctx)'));
    assert.ok(/titleGuard\(ctx,|clTitleGuard\(/.test(body.slice(0, 20000)), fn + ' runs the title guard');
  }
});
test('manifest is 1.0.85 and the changed files carry no NUL bytes', () => {
  assert.strictEqual(JSON.parse(read('manifest.json')).version, '1.0.85');
  for (const f of ['background.js', 'fas-edit-core.js', 'fas-edit-engine.js', 'manifest.json', 'tests/fas-edit-title-guard-1085.test.js']) assert.ok(!fs.readFileSync(path.join(root, f)).includes(0), f);
});
