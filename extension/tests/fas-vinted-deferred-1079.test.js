// 1.0.79 (live bug 2026-10-28): Patrick listed "Samsung Super-Writemaster CDR 5 pack" on Vinted, the category was not
// set automatically, he picked one by hand, and Condition, Colors and Material stayed empty. The step log ended with
// deferred:end and no deferred:fillStart. Reproduced live: Vinted's new listing form has no #category input (Category,
// Brand, Condition, Colors and Material are now <button aria-haspopup="menu"> triggers that show their value in a
// "...-input--value" span), so vintedCategoryValue() read '' for the whole wait and the watch then ended on the
// organizer's Upload click. These tests pin:
//  - the deferred watch runs the dependent fill exactly once after a category appears, even when the review overlay was
//    replaced or closed and the organizer already clicked Upload, and logs why it ended to the trace;
//  - it still stops (with a trace entry) when superseded or when the tab leaves /items/new;
//  - a chosen category is never read as a Vinted form reset, and the reset watcher stands down during the fill;
//  - the new menu triggers are read and opened correctly (value span, placeholder, pointerdown).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const src = rd('fas-vinted.js');

function fnSrc(name) {
  let i = src.indexOf('  async function ' + name + '(');
  if (i < 0) i = src.indexOf('  function ' + name + '(');
  assert.ok(i > 0, name + ' not found');
  return src.slice(i, src.indexOf('\n  }\n', i) + 4);
}

// ---- the deferred watch, run against stubs with a manual clock and timer queue ------------------------------------
function watchHarness(opts) {
  const o = opts || {};
  let clock = 1000000;
  const timers = [];
  const steps = [];
  const trace = [];
  const fills = [];
  const listeners = {};
  const page = { category: '', pathname: '/items/new', dependents: true, catalogOpen: false };
  const overlayEl = { innerHTML: '' };
  const els = { 'fas-vin-deferred': { innerHTML: '' }, 'fas-vin-warnings': { innerHTML: '' } };
  let barRef = o.noBar ? null : { firstChild: null, isConnected: !o.barDetached, innerHTML: '', appendChild() {} };
  const env = {
    Date: { now: () => clock },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    location: { get pathname() { return page.pathname; } },
    document: {
      addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
      removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
      getElementById: (id) => els[id] || null,
      createDocumentFragment: () => ({ appendChild() {} }),
      documentElement: { appendChild: () => {} },
    },
    console: { log: () => {}, warn: () => {} },
    T: { info: (code, msg, ctx) => trace.push({ lvl: 'info', code, msg, ctx }), warn: (code, msg, ctx) => trace.push({ lvl: 'warn', code, msg, ctx }) },
    fasMarkStep: (s) => steps.push(s),
    norm: (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(),
    vintedCategoryValue: () => page.category,
    vintedPickerControl: (id) => (page.dependents && (id === 'brand' || id === 'condition' || id === 'color') ? { id } : null),
    fieldByLabel: () => null,
    findOpenPanel: () => (page.catalogOpen ? {} : null),
    overlay: (h) => { overlayEl.innerHTML = h; },
    fasNewWarnings: () => [],
    vintedWarningsBlockHtml: (w) => 'W' + w.length,
    vintedDeferredNoteHtml: (s) => 'NOTE:' + s,
    fillVintedCategoryDependent: async (item, warnings, preset) => {
      fills.push({ id: item.id, preset, resetWatcherStoodDown: api.filling() });
      if (o.fillThrows) throw new Error('boom');
    },
  };
  const body = 'let bar = barRef;\n' +
    src.slice(src.indexOf('  let fasVintedDeferredToken = 0;'), src.indexOf('  // 2026-10-04 (S-EXT-VINTED-CATEGORY-CASCADE): deferred-mode only.')) +
    '\nreturn { start: fasVintedStartDeferredWatch, bump: () => { fasVintedDeferredToken++; }, filling: () => fasVintedDeferredFilling };';
  const api = new Function('barRef', ...Object.keys(env), body)(barRef, ...Object.values(env));
  // Advance the clock and run due ticks (each tick re-schedules itself).
  const advance = async (ms) => {
    const end = clock + ms;
    while (clock < end) {
      clock += 1500;
      const due = timers.splice(0, timers.length);
      due.forEach((fn) => fn());
      await new Promise((r) => setImmediate(r));
    }
  };
  const clickUpload = () => (listeners.click || []).forEach((fn) => fn({ target: { closest: () => ({ textContent: 'Upload' }) } }));
  return { api, page, steps, trace, fills, els, advance, clickUpload, listeners };
}

const ITEM = { id: 'cmvfau72000fjt78ml673hdv7', title: 'Samsung Super-Writemaster CDR 5 pack' };

test('deferred watch: a manual category pick runs the dependent fill once, even after Upload clicks and a replaced/closed overlay', async () => {
  const h = watchHarness({ noBar: true }); // the review overlay is gone (closed, or replaced by the continue prompt)
  h.api.start(ITEM, ['Category could not be filled automatically -- please set it yourself.', 'Other note'], true);
  await h.advance(30000);
  assert.strictEqual(h.fills.length, 0, 'nothing runs before a category exists');
  h.clickUpload(); // the organizer clicked Upload first (Vinted showed "Fill in condition to continue")
  h.clickUpload();
  await h.advance(9000);
  assert.strictEqual(h.fills.length, 0);
  assert.ok(!h.steps.includes('deferred:end'), 'an Upload click no longer ends the watch');
  h.page.category = 'cd, dvd & blu-ray discs'; // picked by hand in the new menu trigger
  await h.advance(6000);
  assert.strictEqual(h.fills.length, 1, 'the dependent fill ran');
  assert.deepStrictEqual(h.fills[0].preset, { photosOk: true, deferred: true });
  assert.strictEqual(h.fills[0].resetWatcherStoodDown, true, 'the form-reset watcher stands down while it runs');
  assert.deepStrictEqual(h.steps.filter((s) => /^deferred:/.test(s)), ['deferred:end', 'deferred:fillStart', 'deferred:fillDone']);
  assert.strictEqual(h.api.filling(), false);
  const end = h.trace.find((t) => t.code === 'vinted_deferred_watch_end');
  assert.ok(end && end.lvl === 'info' && /chosen, running the dependent fills once/.test(end.msg));
  assert.strictEqual(end.ctx.willFill, true);
  assert.strictEqual(end.ctx.uploadClicks, 2);
  assert.strictEqual(end.ctx.itemId, ITEM.id);
  assert.strictEqual(h.els['fas-vin-deferred'].innerHTML, 'NOTE:done');
  await h.advance(60000);
  assert.strictEqual(h.fills.length, 1, 'runs once only');
  assert.strictEqual((h.listeners.click || []).length, 0, 'the click observer is removed');
});

test('deferred watch: a category Vinted suggests itself (detached overlay, upload watch armed) also triggers the fill once', async () => {
  const h = watchHarness({ barDetached: true });
  h.page.category = 'other computer accessories';
  h.api.start(ITEM, [], false);
  await h.advance(12000);
  assert.strictEqual(h.fills.length, 1);
});

test('deferred watch: waits for the catalog panel to close and for the value to settle; a change restarts the settle clock', async () => {
  const h = watchHarness();
  h.api.start(ITEM, [], true);
  await h.advance(7500);
  h.page.catalogOpen = true;
  h.page.category = 'electronics';
  await h.advance(6000);
  assert.strictEqual(h.fills.length, 0, 'not while the picker is open');
  h.page.catalogOpen = false;
  h.page.category = 'cd, dvd & blu-ray discs';
  await h.advance(1500);
  assert.strictEqual(h.fills.length, 0, 'the new value has to settle first');
  await h.advance(3000);
  assert.strictEqual(h.fills.length, 1);
});

test('deferred watch: no dependent controls yet -> still runs after 12s of a settled category', async () => {
  const h = watchHarness();
  h.page.dependents = false;
  h.page.category = 'cd, dvd & blu-ray discs';
  h.api.start(ITEM, [], true);
  await h.advance(15000);
  assert.strictEqual(h.fills.length, 0);
  await h.advance(6000);
  assert.strictEqual(h.fills.length, 1);
});

test('deferred watch: superseded or leaving /items/new ends it without a fill, with a trace warning', async () => {
  const a = watchHarness();
  a.api.start(ITEM, [], true);
  a.api.bump(); // a newer fill started (for example the refill after a real Vinted reset)
  a.page.category = 'cd, dvd & blu-ray discs';
  await a.advance(20000);
  assert.strictEqual(a.fills.length, 0);
  const ea = a.trace.find((t) => t.code === 'vinted_deferred_watch_end');
  assert.ok(ea && ea.lvl === 'warn' && /superseded/.test(ea.msg) && ea.ctx.willFill === false);

  const b = watchHarness();
  b.api.start(ITEM, [], true);
  b.page.pathname = '/member/123';
  await b.advance(3000);
  const eb = b.trace.find((t) => t.code === 'vinted_deferred_watch_end');
  assert.ok(eb && /left the sell page/.test(eb.msg));
  assert.strictEqual(b.fills.length, 0);
});

test('deferred watch: a throwing fill is reported, the flag is cleared and the note says error', async () => {
  const h = watchHarness({ fillThrows: true });
  h.page.category = 'cd, dvd & blu-ray discs';
  h.api.start(ITEM, [], true);
  await h.advance(12000);
  assert.strictEqual(h.fills.length, 1);
  assert.strictEqual(h.api.filling(), false);
  assert.strictEqual(h.els['fas-vin-deferred'].innerHTML, 'NOTE:error');
});

test('deferred watch source: no Upload/overlay finish reasons remain, and nothing is clicked in the fill', () => {
  const block = src.slice(src.indexOf('  function fasVintedStartDeferredWatch('), src.indexOf('  // 2026-10-04 (S-EXT-VINTED-CATEGORY-CASCADE): deferred-mode only.'));
  assert.ok(!/finish\('organizer clicked Upload'/.test(block));
  assert.ok(!/overlayStillUp/.test(block));
  assert.ok(!/\.click\(/.test(block));
  assert.ok(/T\.info\('vinted_deferred_watch_end'/.test(block) && /T\.warn\('vinted_deferred_watch_end'/.test(block));
});

// ---- a category change is never a form reset ---------------------------------------------------------------------
test('form reset: blank title and description with a category chosen is not a reset; without one it is', () => {
  const form = { title: '', description: '', category: 'cd, dvd & blu-ray discs' };
  const blank = new Function('looksLikeListingForm', 'fieldByLabel', 'vintedCategoryValue', fnSrc('fasVintedFormLooksBlank') + '\nreturn fasVintedFormLooksBlank;')(
    () => true, (l) => ({ value: l === 'Title' ? form.title : form.description }), () => form.category);
  assert.strictEqual(blank(), false, 'Vinted re-rendering after a category pick is not a reset');
  form.category = '';
  assert.strictEqual(blank(), true, 'a real reset clears the category too');
  form.title = 'Samsung Super-Writemaster CDR 5 pack';
  assert.strictEqual(blank(), false);
});

test('form reset watcher stands down while the post-category fill runs', () => {
  const w = fnSrc('fasVintedWatchForReset');
  assert.ok(/if \(fasVintedDeferredFilling\) \{ blankStreak = 0; return; \}/.test(w));
  assert.ok(w.indexOf('fasVintedDeferredFilling') < w.indexOf('fasVintedFormLooksBlank()'));
});

// ---- the new menu triggers --------------------------------------------------------------------------------------
function triggerHelpers() {
  const events = [];
  const body = src.slice(src.indexOf('  const VINTED_PICKER_INPUT_TESTIDS = {'), src.indexOf('  function findOpenPanel(fieldId, strict) {')) +
    '\nreturn { control: vintedPickerControl, text: vintedControlText, open: vintedOpenPicker, isTrigger: vintedIsMenuTrigger };';
  const dom = { byId: {}, byTestid: {} };
  const document = {
    getElementById: (id) => dom.byId[id] || null,
    querySelector: (sel) => { const m = /data-testid="([^"]+)"/.exec(sel); return m ? dom.byTestid[m[1]] || null : null; },
  };
  class PointerEvent { constructor(type, init) { this.type = type; this.init = init; } }
  class MouseEvent { constructor(type, init) { this.type = type; this.init = init; } }
  const api = new Function('document', 'PointerEvent', 'MouseEvent', 'window', body)(document, PointerEvent, MouseEvent, {});
  return { api, dom, events };
}
const trigger = (testid, shown, state) => {
  const attrs = { 'aria-haspopup': 'menu', 'data-state': state || 'closed', 'data-testid': testid };
  const t = {
    tagName: 'BUTTON', value: '', textContent: shown + ' ', clicks: 0, dispatched: [],
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    querySelector: (sel) => (/--value/.test(sel) ? { textContent: shown } : null),
    click() { this.clicks++; },
    dispatchEvent(e) { this.dispatched.push(e.type); },
  };
  return t;
};

test('menu triggers: the category value is read from the value span, a "Select ..." placeholder reads empty', () => {
  const { api, dom } = triggerHelpers();
  dom.byTestid['catalog-select-dropdown-input'] = trigger('catalog-select-dropdown-input', 'CD, DVD & Blu-ray discs');
  const c = api.control('category');
  assert.ok(c);
  assert.strictEqual(api.text(c), 'CD, DVD & Blu-ray discs');
  assert.strictEqual(api.control('catalog'), c);
  assert.strictEqual(api.text(trigger('x', 'Select a category')), '');
  assert.strictEqual(api.text(trigger('x', 'Select condition')), '');
  assert.strictEqual(api.text(trigger('x', 'Select up to 2 colors')), '');
  assert.strictEqual(api.text(trigger('x', 'New with tags')), 'New with tags');
  // The old form: a readonly input keeps working through .value.
  dom.byId.brand = { tagName: 'INPUT', value: 'Samsung ' };
  assert.strictEqual(api.text(api.control('brand')), 'Samsung');
});

test('menu triggers: opened with pointerdown (not click), never toggled shut when open; old inputs still click', () => {
  const { api } = triggerHelpers();
  const t = trigger('category-condition-single-list-input', 'Select condition');
  api.open(t);
  assert.deepStrictEqual(t.dispatched, ['pointerdown']);
  assert.strictEqual(t.clicks, 0);
  const open = trigger('category-condition-single-list-input', 'Select condition', 'open');
  api.open(open);
  assert.deepStrictEqual(open.dispatched, []);
  const old = { tagName: 'INPUT', clicks: 0, getAttribute: () => null, click() { this.clicks++; } };
  api.open(old);
  assert.strictEqual(old.clicks, 1);
});

test('vintedCategoryValue reads the menu trigger; pickers and the deferred field check use the new controls', () => {
  const v = fnSrc('vintedCategoryValue');
  assert.ok(/vintedPickerControl\('category'\)/.test(v) && /vintedControlText\(el\)/.test(v));
  const p = fnSrc('pickFromPanel');
  assert.ok(/vintedOpenPicker\(opener\)/.test(p));
  assert.ok(/const resolveOpener = \(\) => vintedPickerControl\(fieldId\)/.test(p));
  const d = fnSrc('fasDeferredFieldValue');
  assert.ok(/vintedPickerControl\(id\)/.test(d) && /return vintedControlText\(el\);/.test(d));
  assert.ok(/'material \(recommended\)'/.test(d));
});

test('manifest is 1.0.80', () => {
  assert.strictEqual(JSON.parse(rd('manifest.json')).version, '1.0.80');
});
