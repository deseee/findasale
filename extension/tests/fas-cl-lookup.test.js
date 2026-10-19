// Node tests for extension 1.0.19: Craigslist dashboard lookup order, guarded reconcile, Mercari weight boxes.
// Run: node --test extension/tests/*.test.js     (real Craigslist / Mercari were NOT driven; DOM is stubbed)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../fas-cl-guard.js');
const C = require('../fas-edit-core.js');
const W = require('../fas-mercari-weight.js');

const row = (id, status, title) => ({ postingId: String(id), status, active: status === 'active', titleRaw: title });
const matcher = (raw, wanted) => C.titleEquals(raw, wanted);

// ---- search word ----
test('word choice: skips stopwords and short words, prefers digit/brand-like tokens, then length', () => {
  assert.strictEqual(G.pickSearchWord('Mouse Trap Board Game, Milton Bradley, Vintage 1990s'), '1990s');
  assert.strictEqual(G.pickSearchWord('Sea World Ashtray Nassau'), 'Ashtray');
  assert.strictEqual(G.pickSearchWord('BAYC Adidas tracksuit'), 'BAYC');
  assert.strictEqual(G.pickSearchWord('The old box and a cat'), '');
  assert.strictEqual(G.pickSearchWord('HDE MIDI Cable, 6-Feet, Shielded'), 'MIDI');
});

// ---- lookup classification ----
test('id first: matches the saved id only, never the title', () => {
  const rows = [row(1111111111, 'active', 'Twister Game - $10'), row(2222222222, 'active', 'Twister Game - $12')];
  assert.strictEqual(G.classifyLookup(rows, { remoteId: '2222222222', title: 'Twister Game', matcher }).row.postingId, '2222222222');
  assert.strictEqual(G.classifyLookup(rows, { remoteId: '3333333333', title: 'Twister Game', matcher }).kind, 'none');
});
test('exact title with one Active row is found; two Active rows are ambiguous with ids', () => {
  const one = [row(1111111111, 'active', 'Youngblood #1 comic - $8'), row(2222222222, 'active', 'Youngblood #2 comic - $8')];
  assert.strictEqual(G.classifyLookup(one, { title: 'Youngblood #1 comic', matcher }).kind, 'found');
  const two = one.concat([row(3333333333, 'active', 'Youngblood #1 comic - $9')]);
  const r = G.classifyLookup(two, { title: 'Youngblood #1 comic', matcher });
  assert.strictEqual(r.kind, 'ambiguous');
  assert.deepStrictEqual(r.ids.sort(), ['1111111111', '3333333333']);
});
test('a Deleted/Expired match with no Active match means gone; an Active match wins over a Deleted duplicate', () => {
  const gone = [row(1111111111, 'deleted', 'Nassau ashtray - $5')];
  assert.deepStrictEqual([G.classifyLookup(gone, { title: 'Nassau ashtray', matcher }).kind, G.classifyLookup(gone, { title: 'Nassau ashtray', matcher }).status], ['gone', 'deleted']);
  assert.strictEqual(G.classifyLookup([row(1111111111, 'expired', 'Nassau ashtray - $5')], { title: 'Nassau ashtray', matcher }).status, 'expired');
  const both = [row(1111111111, 'deleted', 'Nassau ashtray - $5'), row(2222222222, 'active', 'Nassau ashtray - $5')];
  assert.strictEqual(G.classifyLookup(both, { title: 'Nassau ashtray', matcher }).kind, 'found');
  assert.strictEqual(G.classifyLookup([row(1111111111, 'deleted', 'Saved id row')], { remoteId: '1111111111' }).kind, 'gone');
});
test('search finds nothing -> none, so the caller must go on to scan (search alone never means gone)', () => {
  assert.strictEqual(G.classifyLookup([], { title: 'Sea World Ashtray', matcher }).kind, 'none');
  assert.strictEqual(G.classifyLookup([row(1111111111, 'active', 'Other thing - $1')], { title: 'Sea World Ashtray', matcher }).kind, 'none');
});

// ---- dashboard parsing with a stub document ----
function stubDoc(rowsSpec) {
  const mkTr = (r) => ({
    querySelector(sel) {
      if (sel.startsWith('td.status')) return { classList: { contains: (c) => c === r.status }, textContent: r.status, getAttribute: () => r.id };
      if (sel === 'td.title a') return { textContent: r.title };
      return null;
    }
  });
  return { querySelector: (s) => s === 'table.accthp_postings' ? { querySelectorAll: () => rowsSpec.map(mkTr) } : null };
}
test('parseDashboardRows reads id, status word and title; no table -> null', () => {
  const rows = G.parseDashboardRows(stubDoc([{ id: '1234567890', status: 'active', title: 'A - $5' }, { id: 'x', status: 'deleted', title: 'bad id' }, { id: '2234567890', status: 'expired', title: 'B - $5' }]));
  assert.deepStrictEqual(rows.map((r) => [r.postingId, r.status]), [['1234567890', 'active'], ['2234567890', 'expired']]);
  assert.strictEqual(G.parseDashboardRows({ querySelector: () => null }), null);
  assert.strictEqual(G.parseTotal('Showing 1 - 50 of 315 total'), 315);
  assert.strictEqual(G.isNoPostings('no postings'), true);
});

// ---- guarded reconcile ----
const NOW = 2_000_000_000_000, MIN = 60_000;
const goodScan = (rows) => ({ loggedIn: true, accountOk: true, complete: true, total: rows.length, rows });
const items = [{ id: 'A', title: 'Mouse Trap Board Game, Milton Bradley, Vintage 1990s' }, { id: 'B', title: 'Twister Game Hasbro' }];
const twister = [row(1111111111, 'active', 'Twister Game Hasbro - $9')];

test('reconcile: a single sighting never reports; the second complete scan a few minutes later does', () => {
  const d1 = G.reconcileDecide({ scan: goodScan(twister), items, state: {}, now: NOW });
  assert.strictEqual(d1.ok, true);
  assert.deepStrictEqual(d1.toReport, []);
  assert.deepStrictEqual(d1.absent, ['A']);
  const tooSoon = G.reconcileDecide({ scan: goodScan(twister), items, state: d1.state, now: NOW + MIN });
  assert.deepStrictEqual(tooSoon.toReport, []);
  const d2 = G.reconcileDecide({ scan: goodScan(twister), items, state: d1.state, now: NOW + 6 * MIN });
  assert.deepStrictEqual(d2.toReport.map((x) => x.id), ['A']);
});
test('reconcile: partial / errored / logged-out / wrong-account / count-mismatch scans change nothing', () => {
  const seeded = { A: { firstAt: NOW - 10 * MIN, lastAt: NOW - 10 * MIN, count: 1 } };
  const bad = [
    Object.assign(goodScan(twister), { complete: false }), Object.assign(goodScan(twister), { loggedIn: false }),
    Object.assign(goodScan(twister), { accountOk: false }), Object.assign(goodScan(twister), { total: 400 }), Object.assign(goodScan(twister), { total: null })
  ];
  bad.forEach((scan) => {
    const d = G.reconcileDecide({ scan, items, state: seeded, now: NOW });
    assert.strictEqual(d.ok, false);
    assert.deepStrictEqual(d.toReport, []);
    assert.deepStrictEqual(d.state, seeded);
  });
});
test('reconcile: an Active duplicate, a Deleted/Expired row or the saved id means present; sighting is dropped', () => {
  const seeded = { A: { firstAt: NOW - 10 * MIN, lastAt: NOW - 10 * MIN, count: 1 } };
  const withActive = twister.concat([row(2222222222, 'active', 'Mouse Trap Board Game, Milton Bradley, Vintage 1990s - $7')]);
  let d = G.reconcileDecide({ scan: goodScan(withActive), items, state: seeded, now: NOW });
  assert.deepStrictEqual(d.toReport, []); assert.strictEqual(d.state.A, undefined);
  const withDeleted = twister.concat([row(2222222222, 'deleted', 'Mouse Trap Board Game, Milton Bradley, Vintage 1990s - $7')]);
  assert.deepStrictEqual(G.reconcileDecide({ scan: goodScan(withDeleted), items, state: seeded, now: NOW }).toReport, []);
  const byId = twister.concat([row(3333333333, 'expired', 'Totally different title')]);
  const withId = items.map((i) => i.id === 'A' ? Object.assign({ remoteId: '3333333333' }, i) : i);
  assert.deepStrictEqual(G.reconcileDecide({ scan: goodScan(byId), items: withId, state: seeded, now: NOW }).toReport, []);
});
test('reconcile: capped per run, the rest wait', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 'I' + i, title: 'Unlisted thing number ' + i }));
  const seeded = {}; many.forEach((m) => { seeded[m.id] = { firstAt: NOW - 10 * MIN, lastAt: NOW - 10 * MIN, count: 1 }; });
  const d = G.reconcileDecide({ scan: goodScan(twister), items: many, state: seeded, now: NOW });
  assert.strictEqual(d.toReport.length, 20);
  assert.strictEqual(d.capped, true);
  assert.strictEqual(G.reconcileDecide({ scan: goodScan(twister), items: many, state: seeded, now: NOW, cap: 3 }).toReport.length, 3);
});
test('reconcile: account is confirmed only when the expected email is on the page', () => {
  assert.strictEqual(G.accountConfirmed('Logged in as Artifactmi@gmail.com', 'artifactmi@gmail.com'), true);
  assert.strictEqual(G.accountConfirmed('logged in as someone@else.com', 'artifactmi@gmail.com'), false);
  assert.strictEqual(G.accountConfirmed('anything', ''), false);
});

// ---- Mercari weight boxes (stub DOM; models the observed "0 does not stick" quirk) ----
function box(rejectZero, name) {
  return { name, value: '', focus() {}, select() {}, _typed: null };
}
const nativeSetter = (rejectZero) => (el, v) => { el.value = (rejectZero && String(v) === '0') ? '' : String(v); };
test('mercari weight: 9 oz fills pounds=0 and ounces=9 even when a native "0" write is dropped', () => {
  const lb = box(), oz = box();
  const doc = { execCommand(cmd, _u, v) { const t = document_target; if (t) t.value = v; return true; } };
  let document_target = null;
  lb.select = () => { document_target = lb; };
  const r = W.fillWeightBoxes(lb, oz, 9, nativeSetter(true), doc);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual([lb.value, oz.value], ['0', '9']);
  assert.strictEqual(r.lb.via, 'typed');
});
test('mercari weight: a whole number of pounds fills ounces=0; 15.6 oz rounds up to 1 lb 0 oz', () => {
  const lb = box(), oz = box();
  let target = null; lb.select = () => { target = lb; }; oz.select = () => { target = oz; };
  const doc = { execCommand(_c, _u, v) { target.value = v; return true; } };
  const r = W.fillWeightBoxes(lb, oz, 32, nativeSetter(true), doc);
  assert.deepStrictEqual([lb.value, oz.value, r.ok], ['2', '0', true]);
  assert.deepStrictEqual(W.splitOunces(15.6), { lbs: 1, oz: 0 });
});
test('mercari weight: if no method makes a box keep its value the failure names the box; no weight or no fields is reported', () => {
  const lb = box(), oz = box();
  // 1.0.20: 9 oz = 0 lb 9 oz; a pounds box that refuses "0" is NOT a failure while ounces stuck.
  const sub = W.fillWeightBoxes(lb, oz, 9, nativeSetter(true), { execCommand: () => false });
  assert.deepStrictEqual([sub.ok, sub.failed, sub.poundsEmptyOk], [true, [], true]);
  // a package over a pound (41 oz = 2 lb 9 oz) with boxes that never keep a value still names both boxes
  const never = W.fillWeightBoxes(box(), box(), 41, () => {}, { execCommand: () => false });
  assert.deepStrictEqual(never.failed, ['pounds', 'ounces']);
  assert.strictEqual(never.reason, 'box_rejected_pounds_ounces');
  assert.strictEqual(W.fillWeightBoxes(lb, oz, null, nativeSetter(false)).reason, 'no_weight');
  assert.strictEqual(W.fillWeightBoxes(null, null, 9, nativeSetter(false)).reason, 'no_fields');
});

// ---- wiring ----
test('wiring: 1.0.19 manifest loads the weight helper before fas-mercari.js; engine and frame carry the new code paths; buildDiag keeps the new codes', () => {
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.strictEqual(man.version, '1.0.29');
  const merc = man.content_scripts.find((c) => c.js.indexOf('fas-mercari.js') !== -1).js;
  assert.ok(merc.indexOf('fas-mercari-weight.js') !== -1 && merc.indexOf('fas-mercari-weight.js') < merc.indexOf('fas-mercari.js'));
  const eng = fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8');
  ['listing_gone_on_dashboard', 'dashboard_scan_failed', 'clLookup', 'pickSearchWord', 'ambiguous_title'].forEach((k) => assert.ok(eng.indexOf(k) !== -1, k));
  for (const code of ['listing_gone_on_dashboard', 'dashboard_scan_failed', 'ambiguous_title']) {
    const d = C.buildDiag({ platform: 'CRAIGSLIST', itemId: 'x', title: 'T', outcome: 'failed', code, reason: 'r', details: { candidates: ['1111111111', '2222222222'], searchWord: 'Ashtray' } }, { version: '1.0.19' });
    assert.strictEqual(d.code, code); assert.strictEqual(d.v, '1.0.19');
    assert.deepStrictEqual(d.details.candidates, ['1111111111', '2222222222']);
  }
});
