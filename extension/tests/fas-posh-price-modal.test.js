// 1.0.64: Poshmark price edit through the form. Live DOM 2026-10-25: the visible main-form input[data-vv-name="listingPrice"]
// holds the price; #listing-price-modal-listing-price-input sits in a hidden .listing-price-suggestion-modal (value "") that
// opens when the main input is clicked, and its own "Done" writes the price back. The old code typed into the hidden modal
// input, never saw Done, and Update saved $65 (verify_mismatch on cmrw9af83001zttrxjzaj1gfx, wanted 58.49).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8');

function mk(sels, props) {
  return Object.assign({ sels: sels, kids: [], parent: null, shown: true, clicks: 0, innerText: '', textContent: '', disabled: false, value: undefined,
    getAttribute(n) { return this.attrs && n in this.attrs ? this.attrs[n] : null; },
    getBoundingClientRect() { let n = this; while (n) { if (!n.shown) return { left: 0, top: 0, width: 0, height: 0 }; n = n.parent; } return { left: 0, top: 0, width: 10, height: 10 }; },
    closest(sel) { const parts = sel.split(',').map((x) => x.trim()); let n = this; while (n) { if (parts.some((x) => n.sels.includes(x))) return n; n = n.parent; } return null; },
    dispatchEvent() { return true; }, scrollIntoView() {}, focus() {}, select() {},
    click() { this.clicks++; if (this.onClick) this.onClick(); },
  }, props || {});
}
function add(p, c) { c.parent = p; p.kids.push(c); return c; }
function all(root) { const out = []; (function w(n) { n.kids.forEach((k) => { out.push(k); w(k); }); })(root); return out; }
function attach(e) { e.querySelectorAll = (s) => { const parts = s.split(',').map((x) => x.trim()); return all(e).filter((x) => parts.some((y) => x.sels.includes(y))); }; e.querySelector = (s) => e.querySelectorAll(s)[0] || null; e.kids.forEach(attach); return e; }

function page(opts) {
  const doc = mk(['#document']);
  const modal = add(doc, mk(['.modal', '.listing-price-suggestion-modal'], { shown: false }));
  const mi = add(modal, mk(['#listing-price-modal-listing-price-input', 'input'], { value: '', id: 'listing-price-modal-listing-price-input', attrs: { 'aria-label': 'Listing Price' } }));
  const done = add(modal, mk(['button'], { innerText: 'Done', textContent: 'Done' }));
  const main = add(doc, mk(['input[data-vv-name="listingPrice"]', 'input'], { value: '65', attrs: { 'data-vv-name': 'listingPrice', placeholder: '*Required' } }));
  main.onClick = () => { if (opts.modalOpens !== false) { modal.shown = true; mi.value = main.value; } };
  done.onClick = () => { if (opts.doneWorks !== false) main.value = mi.value; modal.shown = false; };
  if (opts.noDone) done.sels = ['span'];
  attach(doc);
  return { doc, modal, mi, done, main };
}
function loadEngine(doc) {
  const sb = { console, setTimeout, clearTimeout, Math, Date, JSON, Promise };
  sb.self = sb; sb.window = sb;
  sb.document = Object.assign(doc, { title: '', body: { innerText: '' } });
  sb.location = { href: 'https://poshmark.com/edit-listing/x', pathname: '/edit-listing/x', origin: 'https://poshmark.com' };
  sb.requestAnimationFrame = (f) => f();
  sb.getComputedStyle = () => ({});
  sb.Event = function (t) { this.type = t; }; sb.PointerEvent = function (t) { this.type = t; }; sb.MouseEvent = function (t) { this.type = t; };
  sb.HTMLInputElement = function () {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fas-edit-core.js'), 'utf8'), sb);
  vm.runInContext(src, sb);
  return sb.FAS_EDIT_ENGINE._test;
}

test('poshPriceInput prefers the visible main-form input over the hidden modal input', () => {
  const P = page({});
  const E = loadEngine(P.doc);
  assert.strictEqual(E.poshPriceInput(), P.main);
});

test('price set: opens the modal from the main input, types, clicks Done, main form shows the new price', async () => {
  const P = page({});
  const E = loadEngine(P.doc);
  const d = await E.poshSetPriceViaModal('58');
  assert.strictEqual(P.main.clicks, 1);
  assert.strictEqual(d.modalOpened, true);
  assert.strictEqual(d.doneClicked, true);
  assert.strictEqual(P.done.clicks, 1);
  assert.strictEqual(P.main.value, '58');
  assert.strictEqual(d.mainAfter, '58');
  assert.strictEqual(d.ok, true);
});

test('Done not found: reported, ok=false (so the caller does not click Update)', async () => {
  const P = page({ noDone: true });
  const E = loadEngine(P.doc);
  const d = await E.poshSetPriceViaModal('58');
  assert.strictEqual(d.modalOpened, true);
  assert.strictEqual(d.doneClicked, false);
  assert.strictEqual(d.ok, false);
});

test('Done clicked but the form kept the old price: ok=false with mainAfter recorded', async () => {
  const P = page({ doneWorks: false });
  const E = loadEngine(P.doc);
  const d = await E.poshSetPriceViaModal('58');
  assert.strictEqual(d.doneClicked, true);
  assert.strictEqual(d.mainAfter, '65');
  assert.strictEqual(d.ok, false);
});

test('form fallback never clicks Update when the price did not stick, and verify_mismatch names the Done result', () => {
  const i = src.indexOf('async function poshFormFallback');
  const w = src.slice(i, src.indexOf('async function poshUiVerify'));
  assert.ok(w.indexOf("if (!priceForm.ok) return fail('price_value_did_not_stick'") !== -1);
  assert.ok(w.indexOf("if (!priceForm.ok) return fail(") < w.indexOf("var btn = q('[data-et-name=\"update\"]')"));
  assert.ok(!/writeField\(price,/.test(w), 'never writes straight into whichever input was found first');
  assert.ok(/Done clicked: ' \+ \(pf\.doneClicked \? 'yes' : 'no'\)/.test(src));
});
