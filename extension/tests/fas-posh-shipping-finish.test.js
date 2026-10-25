// 1.0.63: Poshmark No Discount shipping fix finishes the save (Share Listing "List This Item", fragile acknowledgements)
// before verifying, re-reads once before failing, and reports what it saw. Runs fas-posh-shipping.js in a stub DOM.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-posh-shipping.js'), 'utf8');
const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function el(label, opts) {
  const o = opts || {};
  return {
    tagName: 'BUTTON', disabled: false, innerText: label, textContent: label, value: '',
    clicks: 0,
    getAttribute(n) { return n === 'aria-label' ? null : null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; },
    closest(sel) { return o.modal && /modal|dialog/.test(sel) ? o.modal : null; },
    dispatchEvent(ev) { if (ev.type === 'click') { this.clicks++; if (o.onClick) o.onClick(); } return true; },
  };
}
function load(env) {
  const self = {};
  const ctx = {
    self, window: {}, location: env.location, setTimeout: (f) => f(), console,
    PointerEvent: function (t) { this.type = t; }, MouseEvent: function (t) { this.type = t; }, Event: function (t) { this.type = t; },
    document: { body: { get innerText() { return env.bodyText(); } }, querySelector: () => null, querySelectorAll: (s) => env.qsa(s) },
    fetch: env.fetch, Date, Promise, Set, Array, Object, String, Math, JSON, RegExp,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // make sleep instant
  const SLEEP = 'function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }';
  assert.ok(src.includes(SLEEP));
  vm.runInContext(src.replace(SLEEP, 'function sleep(ms) { return Promise.resolve(); }'), ctx);
  return self.FAS_POSH_SHIP;
}

test('finish phase clicks List This Item on the Share Listing screen, then hands off to verify', async () => {
  let shareShown = true;
  const btn = el('List This Item', { onClick() { shareShown = false; } });
  const api = load({
    location: { pathname: '/share-listing/abc' },
    bodyText: () => (shareShown ? 'Share Listing ... List This Item' : 'Listing page'),
    qsa: (s) => (/button/.test(s) && shareShown ? [btn] : []),
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: { shipping_discount_type: null } }) }),
  });
  const r = await api.step({ id: 'a'.repeat(24), phase: 'finish' });
  assert.strictEqual(btn.clicks, 1);
  assert.strictEqual(r.state, 'continue');
  assert.strictEqual(r.scratch.phase, 'verify');
  assert.deepStrictEqual(Array.from(r.scratch.finishClicks), ['list_this_item']);
});

test('finish phase clicks both fragile packing acknowledgements and nothing else', async () => {
  const fragileModal = { innerText: 'Fragile Item Detected. This is a potential breakable item.', textContent: '' };
  const confirmModal = { innerText: 'Publish Listing: I understand Poshmark will not be compensating me', textContent: '' };
  let stage = 0;
  const cancel = el('Cancel Edit', { modal: fragileModal });
  const pub1 = el('Publish Listing', { modal: fragileModal, onClick() { stage = 1; } });
  const pub2 = el('Publish', { modal: confirmModal, onClick() { stage = 2; } });
  const api = load({
    location: { pathname: '/edit-listing/x' },
    bodyText: () => '',
    qsa: (s) => (!/button/.test(s) ? [] : stage === 0 ? [cancel, pub1] : stage === 1 ? [pub2] : []),
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  const r = await api.step({ id: 'a'.repeat(24), phase: 'finish' });
  assert.deepStrictEqual(Array.from(r.scratch.finishClicks), ['fragile', 'fragile_confirm']);
  assert.strictEqual(cancel.clicks, 0);
});

test('verify re-reads once before failing, and the failure carries diagnostics', async () => {
  const api = load({
    location: { pathname: '/listing/x' }, bodyText: () => '', qsa: () => [],
    // 1.0.64: real shape of a listing that still has a seller-paid discount (Free = discount covers the whole label).
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: { shipping_discount_type: 'free', status: 'published', seller_shipping_discount: { id: 'x', discount_amount: { val: '6.49', currency_code: 'USD' }, label: 'Free Shipping' } } }) }),
  });
  const first = await api.step({ id: 'a'.repeat(24), phase: 'verify', finishClicks: [] });
  assert.strictEqual(first.state, 'continue');
  assert.strictEqual(first.scratch.reread, true);
  const second = await api.step({ id: 'a'.repeat(24), phase: 'verify', reread: true, finishClicks: [], picked: 'No Discount', modalDone: 'done' });
  assert.strictEqual(second.state, 'fail');
  assert.strictEqual(second.code, 'verify_still_discounted');
  assert.match(second.reason, /no Share Listing or packing step was found/);
  assert.strictEqual(second.diag.picked, 'No Discount');
});

test('verify passes on the real No Discount shape even though shipping_discount_type still reads "free"', async () => {
  const api = load({
    location: { pathname: '/listing/x' }, bodyText: () => '', qsa: () => [],
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: { shipping_discount_type: 'free', seller_shipping_discount: { id: '5ff7647a5d29bbebfa25f9d0', discount_amount: { val: '0.0', currency_code: 'USD', currency_symbol: '$' }, label: 'Buyer Shipping: $6.49' } } }) }),
  });
  const r = await api.step({ id: 'a'.repeat(24), phase: 'verify' });
  assert.strictEqual(r.state, 'done');
});

test('a certify prompt after Update stops the run for the person (never clicked)', () => {
  assert.ok(/flaggedPrompt\(\)\) return \{ state: 'blocked', code: 'poshmark_flagged'/.test(src));
  assert.ok(!/certify[^\n]*realClick/i.test(src));
  assert.ok(/stopped === 'poshmark_flagged'/.test(bg));
});

test('background passes the whole scratch to step and logs the diagnostics', () => {
  assert.ok(/args: \[Object\.assign\(\{\}, scratch, \{ id: r\.id, phase: scratch\.phase \|\| '' \}\)\]/.test(bg));
  assert.ok(/\{ step: 'shipping', diag: res\.diag \}/.test(bg));
  assert.ok(/extra\.diag \? \{ diag: extra\.diag \}/.test(bg));
});
