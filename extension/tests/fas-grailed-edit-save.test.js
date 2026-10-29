// 1.0.82 (2026-10-29): Grailed price edit, save step. Live failure (1.0.80, /listings/104003051/edit): price 225 -> 202 and Smart
// Pricing floor 202 -> 181 were typed, then save_control_not_found ("No PUBLISH/Save control enabled"). Page text: "Our moderators
// have requested additional photos to verify the a..."; GET /api/listings/104003051 -> hidden: true (fas-grailed-id-first-removal
// test notes). The save step now accepts every known label, commits the fields with focus-out/blur, waits for the control to enable,
// and names a moderation hold. Nothing is clicked without an enabled control; the price is still re-read before 'done'.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8');

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
function all(root) { const out = []; (function w(n) { n.kids.forEach((k) => { out.push(k); w(k); }); })(root); return out; }
function attach(e) { e.querySelectorAll = (s) => { const parts = s.split(',').map((x) => x.trim()); return all(e).filter((x) => parts.some((y) => x.sels.includes(y))); }; e.querySelector = (s) => e.querySelectorAll(s)[0] || null; e.kids.forEach(attach); return e; }

function btn(label, opts) {
  opts = opts || {};
  const sels = ['button'].concat(opts.submit === false ? [] : ['button[type="submit"]']);
  return mk(sels, { tagName: 'BUTTON', innerText: label, textContent: label, disabled: !!opts.disabled, attrs: opts.submit === false ? {} : { type: 'submit' } });
}
function page(opts) {
  opts = opts || {};
  const doc = mk(['#document']);
  const price = add(doc, mk(['input[type="tel"][name="price"]', 'input[name="price"]', 'input'], { tagName: 'INPUT', type: 'tel', name: 'price', value: '225', attrs: { name: 'price', type: 'tel' } }));
  const floor = add(doc, mk(['input[name="smartPricing.minimumPrice"]', 'input'], { tagName: 'INPUT', type: 'tel', name: 'smartPricing.minimumPrice', value: String(opts.floor == null ? 202 : opts.floor), attrs: { name: 'smartPricing.minimumPrice', type: 'tel' } }));
  add(doc, btn('SEARCH', { submit: false }));
  const save = opts.label === null ? null : add(doc, btn(opts.label || 'PUBLISH', { disabled: !!opts.disabled }));
  if (opts.enableOnBlur && save) price.onEvent = (t) => { if (t === 'focusout') save.disabled = false; };
  attach(doc);
  return { doc, price, floor, save };
}
function loadEngine(P, bodyText) {
  let clock = 1e12;
  class FakeDate extends Date { static now() { return clock; } }
  const sb = { console, Math, JSON, Promise, Date: FakeDate, clearTimeout };
  sb.setTimeout = (f, ms) => { clock += ms || 0; return setImmediate(f); };
  sb.self = sb; sb.window = sb;
  sb.document = Object.assign(P.doc, { title: 'Edit your item | Grailed', body: { innerText: bodyText || 'Edit your listing' } });
  sb.location = { href: 'https://www.grailed.com/listings/104003051/edit', pathname: '/listings/104003051/edit', origin: 'https://www.grailed.com' };
  sb.requestAnimationFrame = (f) => f();
  sb.getComputedStyle = () => ({});
  sb.Event = function (t) { this.type = t; }; sb.PointerEvent = function (t) { this.type = t; }; sb.MouseEvent = function (t) { this.type = t; };
  sb.FocusEvent = function (t) { this.type = t; };
  sb.HTMLInputElement = function () {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'fas-edit-core.js'), 'utf8'), sb);
  vm.runInContext(src, sb);
  return sb.FAS_EDIT_ENGINE._test;
}
const ctx = () => ({ platform: 'GRAILED', cfg: {}, scratch: { phase: 'form', remoteId: '104003051' }, item: { id: 'cmo3etpx2005hjqsuvzlkt8qz', title: 'Bored Ape Yacht Club Adidas Tracksuit', remoteListingId: '104003051', priceDrift: true, price: 202 } });
const flush = () => new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r))));

test('an enabled "Save Changes" control (not PUBLISH) is accepted and clicked once; the flow then re-reads the price', async () => {
  const P = page({ label: 'Save Changes' });
  const E = loadEngine(P);
  const r = await E.grStep(ctx());
  await flush();
  assert.strictEqual(r.state, 'continue');
  assert.strictEqual(r.scratch.phase, 'saved');
  assert.strictEqual(P.price.value, '202');
  assert.strictEqual(P.save.clicks, 1);
});

test('PUBLISH still works; "Update" and "Save" variants are found too', async () => {
  for (const label of ['PUBLISH', 'Update', 'Save', 'Update Listing']) {
    const P = page({ label });
    const E = loadEngine(P);
    assert.strictEqual(E.grFindSave(), P.save, label);
  }
});

test('a save control disabled until the field is committed: focus-out/blur is dispatched, then it is clicked', async () => {
  const P = page({ disabled: true, enableOnBlur: true });
  const E = loadEngine(P);
  const r = await E.grStep(ctx());
  await flush();
  assert.ok(P.price.events.includes('focusout'));
  assert.ok(P.price.events.includes('blur'));
  assert.strictEqual(r.state, 'continue');
  assert.strictEqual(P.save.clicks, 1);
});

test('moderation hold (the live 104003051 case): named listing_under_moderation, nothing clicked', async () => {
  const P = page({ disabled: true });
  const E = loadEngine(P, 'Edit your listing HOW TO SELL GUIDE Our moderators have requested additional photos to verify the authenticity of this item. Please upload them.');
  const r = await E.grStep(ctx());
  await flush();
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'listing_under_moderation');
  assert.ok(/moderators have requested additional photos/i.test(r.reason));
  assert.strictEqual(P.save.clicks, 0);
  assert.deepStrictEqual([...r.details.disabledSave], ['publish']);
});

test('save control stays disabled, no moderation text: save_control_not_found says which control was disabled, nothing clicked', async () => {
  const P = page({ disabled: true });
  const E = loadEngine(P);
  const r = await E.grStep(ctx());
  await flush();
  assert.strictEqual(r.code, 'save_control_not_found');
  assert.ok(/publish control stayed disabled/.test(r.reason));
  assert.strictEqual(P.save.clicks, 0);
  assert.ok(Array.isArray(r.details.lastButtons));
});

test('no control with a known label at all: save_control_not_found, nothing clicked', async () => {
  const P = page({ label: null });
  const E = loadEngine(P);
  const r = await E.grStep(ctx());
  assert.strictEqual(r.code, 'save_control_not_found');
  assert.ok(/No Publish\/Save\/Update control/.test(r.reason));
});

test('Smart Pricing floor: 202 is not below the new price 202, so it becomes 181 (90%, strictly below) before saving', async () => {
  const P = page({ label: 'PUBLISH', floor: 202 });
  const E = loadEngine(P);
  await E.grStep(ctx());
  await flush();
  assert.strictEqual(P.floor.value, '181');
  assert.ok(Number(P.floor.value) < Number(P.price.value));
});

test('a floor already below the new price is left alone', async () => {
  const P = page({ label: 'PUBLISH', floor: 150 });
  const E = loadEngine(P);
  await E.grStep(ctx());
  assert.strictEqual(P.floor.value, '150');
});

test('grFloorTarget is always strictly below the price, or null when no valid floor exists', () => {
  const E = loadEngine(page({}));
  assert.strictEqual(E.grFloorTarget(202), 181);
  assert.strictEqual(E.grFloorTarget(225), 202);
  assert.strictEqual(E.grFloorTarget(2), 1);
  assert.strictEqual(E.grFloorTarget(1), null);
});

test('verification after save is kept: saved -> verify re-reads the edit page price before done', () => {
  const fn = src.slice(src.indexOf('async function grStep(ctx)'), src.indexOf('// CRAIGSLIST -- plain HTML'));
  assert.ok(/if \(phase === 'verify'\) \{\s*if \(C\.pricesMatch\('GRAILED', price\.value, W\.price\)\) return done/.test(fn));
  assert.ok(/return go\(S\.editUrl, \{ phase: 'verify', verifyTries: 0 \}/.test(fn));
  assert.strictEqual((fn.match(/deferClick\(save\)/g) || []).length, 1);
});
