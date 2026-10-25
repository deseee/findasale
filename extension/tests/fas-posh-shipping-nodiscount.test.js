// 1.0.64: Poshmark "No Discount" shipping is judged by seller_shipping_discount.discount_amount, never shipping_discount_type
// (which reads "free" on every listing, live 2026-10-25). Already-correct listings are skipped without opening the edit page;
// a real change uses the visible main-form dropdown (or the price modal, opened properly, with its Done), then Update.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-posh-shipping.js'), 'utf8');
const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

// Real field shapes read from GET /vm-rest/posts/<id> on 2026-10-25.
const NO_DISCOUNT = { status: 'published', shipping_discount_type: 'free', seller_shipping_discount_id: '5ff7647a5d29bbebfa25f9d0',
  seller_shipping_discount: { id: '5ff7647a5d29bbebfa25f9d0', discount_amount: { val: '0.0', currency_code: 'USD', currency_symbol: '$' }, label: 'Buyer Shipping: $6.49' } };
const FREE = { status: 'published', shipping_discount_type: 'free', seller_shipping_discount: { id: 'f', discount_amount: { val: '6.49', currency_code: 'USD' }, label: 'Free Shipping' } };
const DISC499 = { status: 'published', shipping_discount_type: null, seller_shipping_discount: { id: 'd', discount_amount: { val: '4.99', currency_code: 'USD' }, label: 'Buyer Shipping: $1.50' } };

// --- tiny fake DOM: elements carry the selector strings they match; querySelectorAll walks descendants. ---
function mk(sels, props) {
  const e = Object.assign({ sels: sels, kids: [], parent: null, shown: true, clicks: 0, innerText: '', textContent: '', disabled: false,
    getAttribute() { return null; },
    getBoundingClientRect() { let n = this; while (n) { if (!n.shown) return { left: 0, top: 0, width: 0, height: 0 }; n = n.parent; } return { left: 0, top: 0, width: 10, height: 10 }; },
    closest(sel) { const parts = sel.split(',').map((x) => x.trim()); let n = this; while (n) { if (parts.some((x) => n.sels.includes(x))) return n; n = n.parent; } return null; },
    dispatchEvent(ev) { if (ev.type === 'click') { this.clicks++; if (this.onClick) this.onClick(); } return true; },
  }, props || {});
  return e;
}
function add(parent, child) { child.parent = parent; parent.kids.push(child); return child; }
function all(root) { const out = []; (function walk(n) { n.kids.forEach((k) => { out.push(k); walk(k); }); })(root); return out; }
function qsa(root, sel) { const parts = sel.split(',').map((x) => x.trim()); return all(root).filter((e) => parts.some((x) => e.sels.includes(x))); }
function attach(e) { e.querySelectorAll = (s) => qsa(e, s); e.querySelector = (s) => qsa(e, s)[0] || null; e.kids.forEach(attach); return e; }

// Builds a dropdown (selector + menu with 3 items) whose selector shows `current`.
function dropdown(parent, current) {
  const wrap = add(parent, mk(['.seller-shipping-discount']));
  const dd = add(wrap, mk(['.seller-shipping-discount .dropdown', '.dropdown']));
  dd._wrapOk = true;
  const sel = add(dd, mk(['.dropdown__selector'], { innerText: current }));
  const menu = add(dd, mk(['ul'], { shown: false }));
  sel.onClick = () => { menu.shown = true; };
  ['No Discount', '$4.99', 'Free'].forEach((t) => {
    const a = add(menu, mk(['a[data-et-name="shipping_discount_item"]'], { textContent: t, innerText: t }));
    a.onClick = () => { sel.innerText = t; menu.shown = false; };
  });
  return { dd, sel, menu };
}
function page(opts) {
  const doc = mk(['#document']);
  const form = add(doc, mk(['form']));
  const main = opts.mainDropdown === false ? null : dropdown(form, opts.current || 'Free');
  const priceInput = add(form, mk(['input[data-vv-name="listingPrice"]'], { value: '65' }));
  const modal = add(doc, mk(['.modal', '.listing-price-suggestion-modal'], { shown: false }));
  const md = dropdown(modal, opts.modalCurrent || 'Free');
  const done = add(modal, mk(['button'], { textContent: 'Done', innerText: 'Done' }));
  done.onClick = () => { modal.shown = false; };
  priceInput.onClick = () => { modal.shown = true; };
  const upd = add(form, mk(['[data-et-name="update"]', 'button'], { textContent: 'Update', innerText: 'Update' }));
  // The hidden modal copy comes FIRST in document order, exactly like the live page.
  doc.kids.unshift(doc.kids.pop());
  attach(doc);
  return { doc, main, md, modal, done, upd, priceInput };
}
function load(env) {
  const self = {};
  const ctx = {
    self, location: env.location, setTimeout: (f) => f(), console,
    PointerEvent: function (t) { this.type = t; }, MouseEvent: function (t) { this.type = t; },
    document: Object.assign(env.doc || mk(['#document']), { body: { innerText: '', scrollHeight: 0 } }),
    fetch: env.fetch, Date, Promise, Set, Array, Object, String, Math, JSON, RegExp, Number, isFinite, NaN,
  };
  if (!env.doc) attach(ctx.document);
  ctx.window = ctx; ctx.window.scrollTo = () => {};
  vm.createContext(ctx);
  const SLEEP = 'function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }';
  assert.ok(src.includes(SLEEP));
  vm.runInContext(src.replace(SLEEP, 'function sleep(ms) { return Promise.resolve(); }'), ctx);
  return self.FAS_POSH_SHIP;
}
const json = (post) => async () => ({ ok: true, status: 200, json: async () => ({ data: post }) });

test('shipState reads seller_shipping_discount.discount_amount, not shipping_discount_type', () => {
  const api = load({ location: { pathname: '/feed' }, fetch: json({}) });
  assert.strictEqual(api.shipState(NO_DISCOUNT), 'no_discount');
  assert.strictEqual(api.shipState(FREE), 'discounted');
  assert.strictEqual(api.shipState(DISC499), 'discounted');
  assert.strictEqual(api.shipState({ shipping_discount_type: 'free' }), 'unknown');
  assert.strictEqual(api.shipState({ seller_shipping_discount: { discount_amount: { val: '' } } }), 'unknown');
  assert.strictEqual(api.shipState({ seller_shipping_discount: { discount_amount: 0 } }), 'no_discount');
});

test('an already-correct listing (type "free", discount 0.0) is done without opening the edit page or clicking anything', async () => {
  const api = load({ location: { pathname: '/closet/artifactm' }, fetch: json(NO_DISCOUNT) });
  const r = await api.step({ id: 'a'.repeat(24), phase: '' });
  assert.strictEqual(r.state, 'done');
  assert.strictEqual(r.details.already, true);
});

test('an unreadable shipping setting is left alone (fail, no goto)', async () => {
  const api = load({ location: { pathname: '/closet/artifactm' }, fetch: json({ status: 'published', shipping_discount_type: 'free' }) });
  const r = await api.step({ id: 'a'.repeat(24), phase: '' });
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'shipping_unreadable');
});

test('a discounted listing goes to its edit page, then the VISIBLE main-form dropdown is set and Update clicked', async () => {
  const away = load({ location: { pathname: '/closet/artifactm' }, fetch: json(FREE) });
  const g = await away.step({ id: 'a'.repeat(24), phase: '' });
  assert.strictEqual(g.state, 'goto');
  const P = page({ current: 'Free' });
  const api = load({ location: { pathname: '/edit-listing/x' }, doc: P.doc, fetch: json(FREE) });
  const r = await api.step({ id: 'a'.repeat(24), phase: '' });
  assert.strictEqual(r.state, 'continue');
  assert.strictEqual(r.scratch.phase, 'finish');
  assert.strictEqual(r.scratch.via, 'main_form');
  assert.strictEqual(P.main.sel.innerText, 'No Discount');
  assert.strictEqual(P.md.sel.innerText, 'Free', 'the hidden modal copy is not touched');
  assert.strictEqual(P.upd.clicks, 1);
});

test('form already reads No Discount while the API says discounted: Update is NOT clicked', async () => {
  const P = page({ current: 'No Discount' });
  const api = load({ location: { pathname: '/edit-listing/x' }, doc: P.doc, fetch: json(DISC499) });
  const r = await api.step({ id: 'a'.repeat(24), phase: '' });
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'form_already_no_discount');
  assert.strictEqual(P.upd.clicks, 0);
});

test('no main-form dropdown: opens the price modal via the price input, picks No Discount, clicks the modal Done, then Update', async () => {
  const P = page({ mainDropdown: false, modalCurrent: 'Free' });
  const api = load({ location: { pathname: '/edit-listing/x' }, doc: P.doc, fetch: json(FREE) });
  const r = await api.step({ id: 'a'.repeat(24), phase: '' });
  assert.strictEqual(r.state, 'continue');
  assert.strictEqual(r.scratch.via, 'price_modal');
  assert.strictEqual(r.scratch.modalDone, 'done');
  assert.strictEqual(P.priceInput.clicks, 1);
  assert.strictEqual(P.md.sel.innerText, 'No Discount');
  assert.strictEqual(P.done.clicks, 1);
  assert.strictEqual(P.upd.clicks, 1);
});

test('verify after Update uses the real No Discount shape', async () => {
  const api = load({ location: { pathname: '/listing/x' }, fetch: json(NO_DISCOUNT) });
  const r = await api.step({ id: 'a'.repeat(24), phase: 'verify', finishClicks: ['list_this_item'] });
  assert.strictEqual(r.state, 'done');
});

test('background picks listings by r.nd === "discounted", never r.ship === "free"', () => {
  assert.ok(!/r\.ship === 'free'/.test(bg));
  assert.ok(/r\.nd === 'discounted'/.test(bg));
  assert.ok(/nd: shipState\(r\.post\)/.test(src));
  assert.ok(!/shipping_discount_type === undefined/.test(src));
});

test('background: per-cycle cap, rolling 24 h cap, flat 24 h back-off after a failure', () => {
  assert.ok(/const FAS_POSH_SHIP_PER_RUN = 4;/.test(bg));
  assert.ok(/const FAS_POSH_SHIP_PER_DAY = 12;/.test(bg));
  assert.ok(/const FAS_POSH_SHIP_FAIL_BACKOFF_MS = 24 \* 3600 \* 1000;/.test(bg));
  assert.ok(/f\.until = Date\.now\(\) \+ FAS_POSH_SHIP_FAIL_BACKOFF_MS/.test(bg));
  assert.ok(/for \(const r of free\.slice\(0, room\)\)/.test(bg));
  assert.ok(!/Math\.min\(24, 2 \* f\.n\)/.test(bg));
});
