// Node tests for the Craigslist flow fixes (extension 1.0.18): terminal-state detection in the edit engine, price verification outcomes,
// single-flight lock decisions, post-queue tab scoping and posting-identity checks. Run: node --test extension/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const G = require('../fas-cl-guard.js');
const C = require('../fas-edit-core.js');

// ---------------------------------------------------------------- lock -------------------------------------------------------------
const NOW = 1_000_000_000_000;
const idle = () => ({ post: { queueRemaining: false, tabAlive: true, beatAt: 0, paused: false }, edit: null, removal: { inProgress: false }, claim: null });

test('lock: free when nothing else is running', () => {
  for (const k of ['post', 'edit', 'removal']) assert.deepStrictEqual(G.decideLock(k, idle(), NOW), { ok: true });
});
test('lock: an active post run makes edit and removal wait, but not another post (a new queue replaces the old one)', () => {
  const s = idle(); s.post = { queueRemaining: true, tabAlive: true, beatAt: NOW - 60_000, paused: false };
  assert.strictEqual(G.decideLock('edit', s, NOW).heldBy, 'post');
  assert.strictEqual(G.decideLock('removal', s, NOW).heldBy, 'post');
  assert.strictEqual(G.decideLock('post', s, NOW).ok, true);
});
test('lock: a running Craigslist edit makes post and removal wait; an edit run on another marketplace does not', () => {
  const s = idle(); s.edit = { platform: 'CRAIGSLIST', startedAt: NOW - 30_000, tabAlive: true };
  assert.strictEqual(G.decideLock('post', s, NOW).heldBy, 'edit');
  assert.strictEqual(G.decideLock('removal', s, NOW).heldBy, 'edit');
  s.edit.platform = 'POSHMARK';
  assert.strictEqual(G.decideLock('post', s, NOW).ok, true);
});
test('lock: a removal / Renew All tab blocks post and edit', () => {
  const s = idle(); s.removal = { inProgress: true };
  assert.strictEqual(G.decideLock('post', s, NOW).heldBy, 'removal');
  assert.strictEqual(G.decideLock('edit', s, NOW).heldBy, 'removal');
});
test('lock: a crashed flow cannot hold it forever (stale heartbeat, dead tab)', () => {
  const s = idle();
  s.post = { queueRemaining: true, tabAlive: true, beatAt: NOW - G.LOCK_TTL_MS - 1, paused: false };
  assert.strictEqual(G.decideLock('edit', s, NOW).ok, true, 'stale post heartbeat');
  s.post = { queueRemaining: true, tabAlive: false, beatAt: NOW, paused: false };
  assert.strictEqual(G.decideLock('edit', s, NOW).ok, true, 'post tab closed');
  s.post = idle().post;
  s.edit = { platform: 'CRAIGSLIST', startedAt: NOW - G.LOCK_TTL_MS - 1, tabAlive: true };
  assert.strictEqual(G.decideLock('post', s, NOW).ok, true, 'stale edit run');
  s.edit = { platform: 'CRAIGSLIST', startedAt: NOW, tabAlive: false };
  assert.strictEqual(G.decideLock('post', s, NOW).ok, true, 'edit tab closed');
});
test('lock: a post run paused for a session cooldown still holds it (past the TTL), so edits wait instead of colliding on resume', () => {
  const s = idle(); s.post = { queueRemaining: true, tabAlive: true, beatAt: NOW - 3 * G.LOCK_TTL_MS, paused: true };
  assert.strictEqual(G.decideLock('edit', s, NOW).heldBy, 'post');
});
test('lock: a fresh claim by another kind blocks for CLAIM_MS only (closes the check-then-start gap)', () => {
  const s = idle(); s.claim = { kind: 'edit', at: NOW - 5000 };
  assert.strictEqual(G.decideLock('post', s, NOW).heldBy, 'edit');
  assert.strictEqual(G.decideLock('edit', s, NOW).ok, true);
  s.claim.at = NOW - G.CLAIM_MS - 1;
  assert.strictEqual(G.decideLock('post', s, NOW).ok, true);
});
test('lock serialization: two flows racing for a free lock - exactly one wins, the other is told who holds it', () => {
  // Models background.js fasClTryClaim: gather -> decide -> write claim, run one at a time.
  let claim = null;
  const tryClaim = (kind, t) => { const g = G.decideLock(kind, Object.assign(idle(), { claim: claim }), t); if (g.ok) claim = { kind: kind, at: t }; return g; };
  const a = tryClaim('post', NOW), b = tryClaim('edit', NOW + 1);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.heldBy, 'post');
});

// ---------------------------------------------------------------- queue tab scoping ------------------------------------------------
test('post queue is only served to the tab it opened; the edit and removal tabs are never handed it', () => {
  assert.strictEqual(G.queueTabVerdict(10, true, 10, [20]), 'serve');
  assert.strictEqual(G.queueTabVerdict(10, true, 20, [20]), 'refuse');   // the edit flow's tab (the production hijack)
  assert.strictEqual(G.queueTabVerdict(10, true, 30, [20]), 'refuse');   // some other open post.craigslist.org tab
  assert.strictEqual(G.queueTabVerdict(10, false, 30, [20]), 'adopt');   // queue tab closed, organizer reopened by hand
  assert.strictEqual(G.queueTabVerdict(10, false, 20, [20]), 'refuse');
  assert.strictEqual(G.queueTabVerdict(null, false, 30, []), 'refuse');  // tab still being created: fail closed
  assert.strictEqual(G.queueTabVerdict(10, true, null, []), 'refuse');
});

// ---------------------------------------------------------------- identity ---------------------------------------------------------
test('identity: same posting, Craigslist truncation and price suffix still match; a different item mismatches; unreadable is unknown', () => {
  const t = 'Cecil Fielder 1990 Fleer Detroit Tigers baseball card in sleeve';
  assert.strictEqual(G.titlesCompatible(t, t), 'match');
  assert.strictEqual(G.titlesCompatible('Cecil Fielder 1990 Fleer Detroit Tigers baseball card in sleeve - $4', t), 'match');
  assert.strictEqual(G.titlesCompatible(t.slice(0, 40), t), 'match');
  assert.strictEqual(G.titlesCompatible('Coca Cola Skating Girl metal sign', t), 'mismatch');
  assert.strictEqual(G.titlesCompatible('', t), 'unknown');
  assert.strictEqual(G.titlesCompatible(t, ''), 'unknown');
  assert.strictEqual(G.titlesCompatible('Coca Cola sign', ['Brigade #1 comic book', 'Coca Cola sign']), 'match', 'either expected title is accepted');
  assert.strictEqual(G.titlesCompatible('Short', 'Shorter thing here'), 'mismatch', 'short titles need equality, not a loose prefix');
});
test('identity: page title is read from the form input, then the preview heading', () => {
  const mk = (map) => ({ querySelector: (sel) => { for (const k of Object.keys(map)) if (sel.indexOf(k) !== -1) return map[k]; return null; } });
  assert.strictEqual(G.pagePostingTitle(mk({ '#PostingTitle': { value: ' My title ' } })), 'My title');
  assert.strictEqual(G.pagePostingTitle(mk({ '#titletextonly': { innerText: 'Heading title' } })), 'Heading title');
  assert.strictEqual(G.pagePostingTitle(mk({})), '');
});

// ---------------------------------------------------------------- confirmation + outcomes -------------------------------------------
test('confirmation page is recognised ("Thanks for posting!", "Manage your post", posting confirmation title) and an edit form is not', () => {
  assert.strictEqual(G.isPostingConfirmation('Thanks for posting! Manage your post', ''), true);
  assert.strictEqual(G.isPostingConfirmation('Your changes', 'posting confirmation | craigslist'), true);
  assert.strictEqual(G.isPostingConfirmation('Manage your post', ''), true);
  assert.strictEqual(G.isPostingConfirmation('title price continue edit location edit images', 'craigslist'), false);
});
test('price verification outcomes: verified, honest "confirmed without price", mismatch after typing, unverified', () => {
  assert.strictEqual(G.editOutcome(true, 12, true), 'verified');
  assert.strictEqual(G.editOutcome(false, 12, true), 'verified');           // live price already equals target: nothing to fix, still true
  assert.strictEqual(G.editOutcome(false, 20, false), 'confirmed_without_price');
  assert.strictEqual(G.editOutcome(true, 20, false), 'verify_mismatch');
  assert.strictEqual(G.editOutcome(true, null, false), 'unverified');
});

// ---------------------------------------------------------------- engine (vm sandbox with DOM stubs) --------------------------------
function el(o) { return Object.assign({ getBoundingClientRect: () => ({ width: 10, height: 10 }), getAttribute: () => null, classList: { contains: () => false }, tagName: 'DIV', innerText: '', textContent: '' }, o || {}); }
function loadEngine(dom) {
  const sandbox = { console, setTimeout, clearTimeout, Math, Date, JSON, URL, Promise };
  sandbox.self = sandbox; sandbox.window = sandbox;
  sandbox.document = Object.assign({ querySelector: () => null, querySelectorAll: () => [], title: '', body: { innerText: '', textContent: '' } }, dom.document || {});
  sandbox.location = Object.assign({ href: 'https://post.craigslist.org/k/abc', hostname: 'post.craigslist.org', pathname: '/k/abc', search: '' }, dom.location || {});
  sandbox.getComputedStyle = () => ({ visibility: 'visible', display: 'block' });
  sandbox.requestAnimationFrame = (f) => setTimeout(f, 0);
  sandbox.PointerEvent = sandbox.MouseEvent = sandbox.Event = function (type, init) { this.type = type; Object.assign(this, init || {}); };
  vm.createContext(sandbox);
  for (const f of ['fas-edit-core.js', 'fas-cl-guard.js', 'fas-edit-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox);
  const fn = sandbox.FAS_EDIT_ENGINE._test.clStep; fn._sig = sandbox.FAS_EDIT_ENGINE._test.clPageSig;
  return fn;
}
const ITEM = { id: 'it1', title: 'Cecil Fielder 1990 Fleer Detroit Tigers baseball card', priceDrift: true, price: 4 };
const ctx = (scratch, item) => ({ platform: 'CRAIGSLIST', item: item || ITEM, scratch: scratch, stepNo: 3 });

test('engine: the confirmation page ends the edit flow - it goes to the dashboard to verify and does not press Continue again', async () => {
  const clicks = [];
  const step = loadEngine({ document: { title: 'posting confirmation', body: { innerText: 'Thanks for posting! Manage your post', textContent: '' } } });
  const r = await step(ctx({ phase: 'edit', postingId: '123456789', priceSet: true, hops: 5, rowTitle: ITEM.title }));
  assert.strictEqual(r.state, 'goto');
  assert.match(r.url, /accounts\.craigslist\.org\/login\/home/);
  assert.strictEqual(r.scratch.phase, 'verify');
  assert.strictEqual(r.scratch.viaConfirmation, true);
  assert.deepStrictEqual(clicks, []);
});
test('engine: confirmation page reached without the price ever being set is NOT reported as success and never ends in price_field_not_found', async () => {
  const step = loadEngine({ document: { title: 'posting confirmation', body: { innerText: 'Thanks for posting! Manage your post', textContent: '' } } });
  const r = await step(ctx({ phase: 'edit', postingId: '123456789', priceSet: false, hops: 3 }));
  assert.strictEqual(r.state, 'goto');
  assert.strictEqual(r.scratch.phase, 'verify');
});

function dashDom(titleRaw, postingId) {
  const row = {
    querySelector: (sel) => sel.indexOf('td.status') === 0 ? el({ classList: { contains: (c) => c === 'active' }, getAttribute: (n) => n === 'data-postingid' ? postingId : null }) : (sel === 'td.title a' ? el({ textContent: titleRaw }) : null),
    querySelectorAll: () => []
  };
  const table = { querySelectorAll: () => [row] };
  return { document: { querySelector: (sel) => sel === 'table.accthp_postings' ? table : null, body: { innerText: 'your postings', textContent: '' } }, location: { href: 'https://accounts.craigslist.org/login/home', hostname: 'accounts.craigslist.org', pathname: '/login/home', search: '' } };
}
test('engine verify: dashboard price equals target -> done (verified), even when this run never typed the price', async () => {
  const step = loadEngine(dashDom('Cecil Fielder 1990 Fleer Detroit Tigers baseball card - $4', '123456789'));
  const r = await step(ctx({ phase: 'verify', postingId: '123456789', priceSet: false, viaConfirmation: true }));
  assert.strictEqual(r.state, 'done');
  assert.strictEqual(r.details.verified, true);
  assert.strictEqual(r.details.readBack.price, 4);
  assert.strictEqual(r.details.priceSetByThisRun, false);
});
test('engine verify: confirmation without price and the live price is still old -> honest distinct failure after the retries', async () => {
  const step = loadEngine(dashDom('Cecil Fielder 1990 Fleer Detroit Tigers baseball card - $9', '123456789'));
  const r = await step(ctx({ phase: 'verify', postingId: '123456789', priceSet: false, viaConfirmation: true, verifyTries: 2 }));
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'edit_confirmed_without_price');
  assert.ok(r.reason.indexOf('$9') !== -1);
});
test('engine verify: price was typed but live price differs -> verify_mismatch (unchanged behaviour)', async () => {
  const step = loadEngine(dashDom('Cecil Fielder 1990 Fleer Detroit Tigers baseball card - $9', '123456789'));
  const r = await step(ctx({ phase: 'verify', postingId: '123456789', priceSet: true, verifyTries: 2 }));
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'verify_mismatch');
});
test('engine verify: first mismatch retries by reloading the dashboard before failing', async () => {
  const step = loadEngine(dashDom('Cecil Fielder 1990 Fleer Detroit Tigers baseball card - $9', '123456789'));
  const r = await step(ctx({ phase: 'verify', postingId: '123456789', priceSet: false, viaConfirmation: true, verifyTries: 0 }));
  assert.strictEqual(r.state, 'goto');
});

test('engine identity: an edit page for a DIFFERENT posting aborts with posting_identity_mismatch and clicks nothing', async () => {
  const step = loadEngine({ document: { title: 'edit', body: { innerText: 'edit posting title price continue', textContent: '' },
    querySelector: (sel) => sel.indexOf('#PostingTitle') !== -1 ? el({ value: 'Coca Cola Skating Girl metal sign', tagName: 'INPUT' }) : null } });
  const r = await step(ctx({ phase: 'edit', postingId: '123456789', priceSet: false, hops: 0, rowTitle: ITEM.title }));
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'posting_identity_mismatch');
});
test('engine identity: an unreadable title is not a MISMATCH (since 1.0.23 it fails closed as posting_identity_unverified before any click, see fas-cl-pause.test.js)', async () => {
  const step = loadEngine({ document: { title: 'edit', body: { innerText: 'edit posting', textContent: '' } } });
  const r = await step(ctx({ phase: 'edit', postingId: '123456789', priceSet: false, hops: 0, rowTitle: ITEM.title }));
  assert.notStrictEqual(r.code, 'posting_identity_mismatch');
});

test('engine: price_field_not_found only fires on the real edit form (Title box present) with no price box; other pages end as edit_flow_stuck', async () => {
  const formDom = { document: { title: 'edit', body: { innerText: 'posting title description', textContent: '' },
    querySelector: (sel) => sel.indexOf('#PostingTitle') !== -1 ? el({ value: ITEM.title, tagName: 'INPUT' }) : null } };
  const step = loadEngine(formDom);
  const r1 = await step(ctx({ phase: 'edit', postingId: '1', priceSet: false, hops: 2, noPriceTries: 1, rowTitle: ITEM.title }));
  assert.strictEqual(r1.state, 'fail');
  assert.strictEqual(r1.code, 'price_field_not_found');
  const r0 = await step(ctx({ phase: 'edit', postingId: '1', priceSet: false, hops: 2, noPriceTries: 0, rowTitle: ITEM.title }));
  assert.strictEqual(r0.state, 'continue', 'first look waits and retries');
  // not a form (e.g. a page with no Title box): never price_field_not_found, even at hop 4+
  const other = loadEngine({ document: { title: 'something', body: { innerText: 'loading', textContent: '' } } });
  const r2 = await other(ctx({ phase: 'edit', postingId: '1', priceSet: false, hops: 6, rowTitle: ITEM.title }));
  assert.strictEqual(r2.state, 'continue');
  const r3 = await other(ctx({ phase: 'edit', postingId: '1', priceSet: false, hops: 12, rowTitle: ITEM.title }));
  assert.strictEqual(r3.state, 'fail');
  assert.strictEqual(r3.code, 'edit_flow_stuck');
});
test('engine: stuck after the price was typed checks the live dashboard once before failing', async () => {
  const other = loadEngine({ document: { title: 'something', body: { innerText: 'loading', textContent: '' } } });
  const r = await other(ctx({ phase: 'edit', postingId: '1', priceSet: true, hops: 12 }));
  assert.strictEqual(r.state, 'goto');
  assert.strictEqual(r.scratch.phase, 'verify');
  const r2 = await other(ctx({ phase: 'edit', postingId: '1', priceSet: true, hops: 12, stuckChecked: true }));
  assert.strictEqual(r2.code, 'edit_flow_stuck');
});

// ---------------------------------------------------------------- 1.0.22: preview page, page-signature fail-fast, dashboard mid-flow -----
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
function btn(label, o) {
  o = o || {};
  return el({ tagName: o.tag || 'BUTTON', innerText: label, textContent: label, value: o.tag === 'INPUT' ? label : undefined, _cls: o.cls || '', dispatchEvent: () => true, scrollIntoView: () => {}, focus: () => {},
    getBoundingClientRect: () => (o.hidden ? { width: 0, height: 0 } : { width: 10, height: 10 }), click: () => o.clicks.push(label) });
}
// The Superman production page: Craigslist's PREVIEW of an edit. A hidden button.continue is kept in the page (the old code picked it first).
// 1.0.23: the preview shows the posting title in a heading (production: headings ["Attention: posting will expire in 28 days", "<TITLE> ..."]); the edit flow
// now refuses to click anything on a preview whose title it cannot read, so the fixture carries it.
function previewDom(clicks, headTitle) {
  const heads = ['Attention: posting will expire in 28 days', headTitle || ITEM.title].map((t) => el({ tagName: 'H2', innerText: t, textContent: t }));
  const bs = [btn('publish', { clicks }), btn('edit post', { clicks }), btn('edit location', { clicks }), btn('edit images', { clicks }), btn('cancel edit', { clicks }), btn('continue', { clicks, cls: 'continue', hidden: true })];
  return { document: { title: 'kalamazoo | preview', body: { innerText: 'Attention: posting will expire in 28 days press "publish" to apply edits', textContent: '' },
    querySelectorAll: (sel) => /^h1/.test(sel) ? heads : /button\.continue/.test(sel) ? bs.filter((b) => b._cls === 'continue') : bs.filter(() => /button|submit|role/.test(sel)) },
    location: { href: 'https://post.craigslist.org/k/rgCu1K7yX8RmqkJ3jkCFkm', hostname: 'post.craigslist.org', pathname: '/k/rgCu1K7yX8RmqkJ3jkCFkm', search: '' } };
}
const merge = (sc, r) => Object.assign({}, sc, r.scratch);

test('engine preview: price already typed -> the visible "publish" button is clicked (not the hidden button.continue), then it waits for the confirmation page', async () => {
  const clicks = [];
  const step = loadEngine(previewDom(clicks));
  const r = await step(ctx({ phase: 'edit', postingId: '1', priceSet: true, hops: 3, rowTitle: ITEM.title }));
  await sleepMs(350);
  assert.strictEqual(r.state, 'continue');
  assert.deepStrictEqual(clicks, ['publish']);
  assert.strictEqual(r.scratch.published, true);
});
test('engine preview: price NOT yet typed -> "edit post" is clicked, never publish', async () => {
  const clicks = [];
  const step = loadEngine(previewDom(clicks));
  const r = await step(ctx({ phase: 'edit', postingId: '1', priceSet: false, hops: 0, rowTitle: ITEM.title }));
  await sleepMs(350);
  assert.strictEqual(r.state, 'continue');
  assert.deepStrictEqual(clicks, ['edit post']);
});
test('engine loop guard: the same page signature again waits (no second click), retries once, and the 4th sighting fails fast with the signature', async () => {
  const clicks = [];
  const step = loadEngine(previewDom(clicks));
  let sc = { phase: 'edit', postingId: '1', priceSet: true, hops: 3, rowTitle: ITEM.title };
  const r1 = await step(ctx(sc)); sc = merge(sc, r1); await sleepMs(350);
  assert.strictEqual(r1.scratch.sigRep, 1);
  assert.strictEqual(r1.scratch.hops, 4, 'a new page is one transition');
  const r2 = await step(ctx(sc)); sc = merge(sc, r2); await sleepMs(350);
  assert.strictEqual(r2.state, 'continue');
  assert.strictEqual(r2.scratch.hops, 4, 'polling the same page is NOT a transition');
  assert.deepStrictEqual(clicks, ['publish'], 'no second click while the first may still be navigating');
  const r3 = await step(ctx(sc)); sc = merge(sc, r3); await sleepMs(350);
  assert.strictEqual(r3.state, 'continue');
  assert.deepStrictEqual(clicks, ['publish', 'publish'], 'one retry of the click');
  const r4 = await step(ctx(sc));
  assert.strictEqual(r4.state, 'fail');
  assert.strictEqual(r4.code, 'edit_page_not_advancing');
  assert.ok(r4.details.signature.indexOf('/k/#') !== -1 && r4.details.signature.indexOf('preview') !== -1 && r4.details.signature.indexOf('publish') !== -1, r4.details.signature);
  assert.strictEqual(r4.details.repeats, 3);
  assert.strictEqual(r4.scratch.hops, 4, 'never ran up to the old 12-page cap');
  await sleepMs(350);
  assert.strictEqual(clicks.length, 2, 'the failing step clicks nothing');
});
test('engine dashboard mid-flow: back on /login/home before any price was typed -> immediate edit_lost_to_dashboard with a signature, nothing clicked', async () => {
  const clicks = [];
  const row = { querySelector: () => null, querySelectorAll: () => [] };
  const dom = { document: { title: 'craigslist account', body: { innerText: 'your postings', textContent: '' }, querySelector: () => null,
    querySelectorAll: (sel) => /button|submit/.test(sel) ? [btn('continue', { clicks, cls: 'continue' }), btn('edit', { clicks })] : [] },
    location: { href: 'https://accounts.craigslist.org/login/home', hostname: 'accounts.craigslist.org', pathname: '/login/home', search: '' } };
  const step = loadEngine(dom);
  const r = await step(ctx({ phase: 'edit', postingId: '1', priceSet: false, hops: 2, rowTitle: ITEM.title }));
  await sleepMs(350);
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'edit_lost_to_dashboard');
  assert.ok(r.details.signature.indexOf('accounts.craigslist.org|/login/home') === 0);
  assert.ok(r.diag && r.diag.note === 'fail:edit_lost_to_dashboard', 'snapshot attached');
  assert.deepStrictEqual(clicks, []);
  // right after the Edit click (hops 0) one grace step is allowed for a slow navigation, the next sighting fails
  const g1 = await step(ctx({ phase: 'edit', postingId: '1', priceSet: false, hops: 0 }));
  assert.strictEqual(g1.state, 'continue');
  const g2 = await step(ctx({ phase: 'edit', postingId: '1', priceSet: false, hops: 0, dashGrace: true }));
  assert.strictEqual(g2.code, 'edit_lost_to_dashboard');
  // price typed + dashboard = the normal verification path, unchanged
  const v = await step(ctx({ phase: 'edit', postingId: '1', priceSet: true, hops: 5 }));
  assert.strictEqual(v.state === 'goto' || v.state === 'fail', true);
  assert.notStrictEqual(v.code, 'edit_lost_to_dashboard');
});
test('buildDiag keeps the 1.0.22 codes and the page signature', () => {
  for (const code of ['edit_lost_to_dashboard', 'edit_page_not_advancing']) {
    const d = C.buildDiag({ t: 1, platform: 'CRAIGSLIST', itemId: 'i1', title: 'x', outcome: 'fail', code, step: 'edit', reason: 'x', trail: ['edit:fail'], snapshots: [], details: { signature: 'post.craigslist.org|/k/#|preview|--|publish' } }, { version: '1.0.22' });
    assert.strictEqual(d.code, code);
    assert.strictEqual(d.details.signature, 'post.craigslist.org|/k/#|preview|--|publish');
  }
});

// ---------------------------------------------------------------- diagnostics --------------------------------------------------------
test('buildDiag keeps the new Craigslist codes and their details', () => {
  for (const code of ['edit_confirmed_without_price', 'posting_identity_mismatch', 'edit_flow_stuck', 'price_field_not_found']) {
    const d = C.buildDiag({ t: 1, platform: 'CRAIGSLIST', itemId: 'cmo3etb6i003hjqsue02qim86', title: 'Cecil Fielder card', outcome: 'fail', code: code, step: 'edit', reason: 'x',
      trail: ['edit:continue', 'edit:fail'], snapshots: [{ note: 'fail:' + code, url: 'https://post.craigslist.org/k/abc', buttons: [{ text: 'Manage your post' }], inputs: [], textSample: 'Thanks for posting!' }],
      details: { pageTitle: 'Coca Cola sign', expected: 'Cecil Fielder card', liveShown: 9 } }, { version: '1.0.19' });
    assert.strictEqual(d.code, code);
    assert.strictEqual(d.platform, 'CRAIGSLIST');
    assert.strictEqual(d.v, '1.0.19');
    assert.strictEqual(d.snapshots[0].buttons[0], 'Manage your post');
    assert.strictEqual(d.details.liveShown, 9);
  }
});

// ---------------------------------------------------------------- wiring -------------------------------------------------------------
test('wiring: manifest 1.0.18, guard loaded by background, the edit injection and the post content script', () => {
  const root = path.join(__dirname, '..');
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.strictEqual(man.version, '1.0.64');
  const post = man.content_scripts.find((c) => c.matches.indexOf('https://post.craigslist.org/*') !== -1);
  assert.ok(post.js.indexOf('fas-cl-guard.js') !== -1 && post.js.indexOf('fas-cl-guard.js') < post.js.indexOf('fas-craigslist.js'));
  const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  assert.ok(/importScripts\([^)]*'fas-cl-guard\.js'/.test(bg));
  assert.ok(/files: \['fas-trace\.js', 'fas-edit-core\.js', 'fas-cl-guard\.js'/.test(bg));
  for (const f of ['background.js', 'fas-edit-engine.js', 'fas-cl-guard.js', 'fas-craigslist.js', 'tests/fas-cl-flow.test.js']) assert.ok(!fs.readFileSync(path.join(root, f)).includes(0), f + ' has NUL bytes');
});
