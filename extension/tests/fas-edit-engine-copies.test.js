// 1.0.83 (2026-10-29 incident reproduction). A Poshmark price edit for one item ("Camel Cigarettes Metal Advertising Sign ...",
// $100 -> $19) went down the old multi-copy path: the closet search showed 9 listings carrying that title, the backend's title-group
// accounting only knew ids saved on SAME-titled items, so the 8 listings saved on other, differently titled items (LPs, John Guest
// fittings, Ike dollars) looked like "unclaimed copies" and every one of them was price-edited; a remembered copy list then replayed
// it on every later edit. These tests rebuild that closet and prove nothing but the item's own listing can ever be saved.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const CAMEL = 'Camel Cigarettes Metal Advertising Sign 2006 R.J. Reynolds PTD in USA 665834';
const OWN = '6ad0bbb2d73373a5e06b95db';                     // the Camel item's own listing (saved on the item)
const OTHERS = {                                             // listing id -> the FindA.Sale item it really belongs to (saved there)
  '6a95c34fa2c5402c6d82024a': 'Jefferson Starship Red Octopus Vinyl LP Record, 1975',
  '6a980b9b181de113124c79a2': 'J. Geils Band Live Full House Vinyl LP, 1972',
  '6a980c89a25540c72cad843a': 'Crosby, Stills & Nash Vinyl Record, Atlantic Records, 1970s',
  '6ad016e06b7a0e70f678a8cc': 'John Guest PP0308WP Push-fit Union 90 Elbow, 1/4" OD Push To Connect',
  '6ad0171e7e9749f22a291a51': 'John Guest PP0312WP Push-fit Union 90 Elbow, 3/8" OD Push To Connect',
  '6ad0663e6bb7d67dd5340c4e': '1974 D Eisenhower Dollar BU Ike US Mint Coin',
  '6ad06655a6935819ccf3c7eb': '1971 D Eisenhower Dollar Circulated US Mint Coin Ike !',
  '6a95c2e19f3194299ff1ed07': 'Rickie Lee Jones, Self-Titled Debut Vinyl LP Record, 1979',
};
const OTHER_IDS = Object.keys(OTHERS);
const ALL9 = [OWN].concat(OTHER_IDS);

// ---- a fake Poshmark page --------------------------------------------------------------------------------------------------
function makePage(opts) {
  const o = opts || {};
  const calls = [];                          // every fetch: { url, method, body }
  const posts = {};                          // live listings: id -> post
  ALL9.forEach((id) => { posts[id] = { id: id, title: o.liveTitle ? o.liveTitle(id) : CAMEL, description: 'desc ' + id, brand: 'b', condition: 'used', pictures: [{ id: 'p' + id }], original_price_amount: { val: '30' }, price_amount: { val: '100', currency_code: 'USD', currency_symbol: '$' }, inventory: { size_quantities: [{ size_id: 'OS', quantity_available: 1 }] }, catalog: { department: 'x' } }; });
  const grid = { innerText: '' };
  const anchors = (o.closetIds || []).map((id) => {
    const a = { tagName: 'A', className: 'tile', href: 'https://poshmark.com/listing/Camel-Sign-' + id, getAttribute: (k) => (k === 'href' ? '/listing/Camel-Sign-' + id : null), innerText: CAMEL + '\n$21', textContent: CAMEL, parentElement: grid };
    const t = { innerText: CAMEL, textContent: CAMEL, closest: () => a };
    a.querySelectorAll = (sel) => (sel === '.tile-grid-redesign__title' ? [t] : []);
    a._title = t;
    return a;
  });
  grid.innerText = anchors.map((a) => a.innerText).join('\n');
  const updateBtn = { tagName: 'BUTTON', clicked: 0, click() { this.clicked++; }, getAttribute: () => null };
  const sb = { console, setTimeout, clearTimeout, Math, Date, JSON, Promise, Object, Array, String, Number, RegExp, Error };
  sb.self = sb; sb.window = sb;
  sb.window.scrollTo = () => {};
  sb.location = { href: o.href, pathname: new URL(o.href).pathname, origin: 'https://poshmark.com' };
  sb.document = {
    title: 'Poshmark', body: { innerText: '', scrollHeight: 1000 },
    querySelector: (sel) => {
      if (sel === 'meta#csrftoken') return { getAttribute: () => 'tok' };
      if (sel === '[data-et-name="update"]') return o.form ? updateBtn : null;
      if (sel === 'input[data-vv-name="title"]') return o.form ? { value: o.formTitle || '' } : null;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === 'a[href*="/listing/"]') return anchors;
      if (sel === '.tile-grid-redesign__title') return anchors.map((a) => a._title);
      if (/^a\[href\*="6[0-9a-f]{23}"\]$/.test(sel)) return anchors.filter((a) => sel.indexOf(a.href.slice(-24)) !== -1);
      return [];
    },
  };
  sb.fetch = async (url, init) => {
    const method = (init && init.method) || 'GET';
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method: method, body: body });
    const m = /\/vm-rest\/posts\/([0-9a-f]{24})/.exec(String(url));
    if (!m) return { status: 200, ok: true, text: async () => '<html></html>' };
    if (o.getFails) return { status: 500, ok: false, text: async () => 'oops' };
    if (method === 'POST') { posts[m[1]] = Object.assign({}, posts[m[1]], body.post); return { status: 200, ok: true, text: async () => '{}' }; }
    return { status: 200, ok: true, text: async () => JSON.stringify({ data: posts[m[1]] }) };
  };
  vm.createContext(sb);
  vm.runInContext(rd('fas-edit-core.js'), sb);
  vm.runInContext(rd('fas-quantity.js'), sb);
  vm.runInContext(rd('fas-edit-engine.js'), sb);
  return { E: sb.FAS_EDIT_ENGINE, calls, posts, updateBtn };
}
function item(extra) { return Object.assign({ id: 'camel', title: CAMEL, price: 18.99, priceDrift: true, quantity: null, quantityDrift: false, remoteListingId: '', titleGroup: null }, extra || {}); }
const writes = (calls) => calls.filter((c) => c.method !== 'GET');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('incident closet: 9 cards with the Camel title, 8 saved on OTHER items -> nothing is edited (duplicate_copies_detected)', async () => {
  const P = makePage({ href: 'https://poshmark.com/closet/artifactm?query=Camel', closetIds: ALL9 });
  // exactly what the backend sent on 2026-10-29: the Camel item is the only unresolved item of its title and no same-titled sibling holds an id
  const r = await P.E.step({ platform: 'POSHMARK', item: item({ titleGroup: { unresolved: 1, claimedIds: [] } }), scratch: {}, stepNo: 1 });
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'duplicate_copies_detected');
  assert.strictEqual(r.url, undefined, 'no navigation to any listing');
  assert.ok(!r.scratch.copies, 'no copy list is started');
  assert.strictEqual(P.calls.length, 0, 'no request at all');
  assert.ok(Object.values(P.posts).every((p) => p.price_amount.val === '100'), 'no listing price changed');
});

test('even when only one same-titled card is unclaimed, the closet path edits nothing (it cannot be proven to be this item)', async () => {
  const P = makePage({ href: 'https://poshmark.com/closet/artifactm?query=Camel', closetIds: ALL9 });
  const r = await P.E.step({ platform: 'POSHMARK', item: item({ titleGroup: { unresolved: 1, claimedIds: OTHER_IDS } }), scratch: {}, stepNo: 1 });
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'ambiguous_title');
  assert.strictEqual(r.details.needsInfo, 'single_unclaimed_unproven');
  assert.strictEqual(P.calls.length, 0);
});

test('the 2026-10-29 replay: item has its saved id and a remembered 9-id copy list -> only the saved listing is opened and saved', async () => {
  const ctx = (href, scratch) => ({ platform: 'POSHMARK', item: item({ remoteListingId: OWN }), scratch: scratch, stepNo: 0, idCache: { 'POSHMARK:camel': OWN }, copyIds: { 'POSHMARK:camel': ALL9 } });
  const P1 = makePage({ href: 'https://poshmark.com/closet/artifactm' });
  const g = await P1.E.step(ctx('', {}));
  assert.strictEqual(g.state, 'goto');
  assert.strictEqual(g.url, 'https://poshmark.com/edit-listing/' + OWN);
  assert.ok(!g.scratch.copies);
  const P2 = makePage({ href: 'https://poshmark.com/edit-listing/' + OWN });
  const r = await P2.E.step(Object.assign(ctx('', g.scratch), { stepNo: 1 }));
  assert.strictEqual(r.state, 'done', JSON.stringify(r).slice(0, 300));
  const urls = P2.calls.filter((c) => /vm-rest/.test(c.url)).map((c) => c.url);
  assert.ok(urls.length >= 3 && urls.every((u) => u.indexOf(OWN) !== -1), 'every API call targets the item\'s own listing');
  assert.strictEqual(writes(P2.calls).length, 1);
  assert.strictEqual(P2.posts[OWN].price_amount.val, '19');
  OTHER_IDS.forEach((id) => assert.strictEqual(P2.posts[id].price_amount.val, '100', id + ' untouched'));
});

test('a stale multi-copy scratch from an older run is refused before any request', async () => {
  const P = makePage({ href: 'https://poshmark.com/edit-listing/' + OTHER_IDS[0] });
  const S = { copies: ALL9.slice(), copyIdx: 1, remoteId: OTHER_IDS[0], copyWait: true, phase: 'api' };
  const r = await P.E.step({ platform: 'POSHMARK', item: item({ remoteListingId: OWN }), scratch: S, stepNo: 3 });
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'duplicate_copies_detected');
  assert.strictEqual(P.calls.length, 0);
});

test('an item with a saved id never edits a different id, even when the run points there', async () => {
  const P = makePage({ href: 'https://poshmark.com/edit-listing/' + OTHER_IDS[0] });
  const r = await P.E.step({ platform: 'POSHMARK', item: item({ remoteListingId: OWN }), scratch: { remoteId: OTHER_IDS[0], phase: 'api' }, stepNo: 2 });
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'remote_id_mismatch');
  assert.strictEqual(P.calls.length, 0);
});

test('the open edit page must be the target listing (the form fallback edits whatever form is on screen)', async () => {
  const P = makePage({ href: 'https://poshmark.com/edit-listing/' + OTHER_IDS[1] });
  const r = await P.E.step({ platform: 'POSHMARK', item: item({ remoteListingId: OWN }), scratch: { remoteId: OWN, phase: 'api' }, stepNo: 2 });
  assert.strictEqual(r.state, 'goto');
  assert.strictEqual(r.url, 'https://poshmark.com/edit-listing/' + OWN);
  const r2 = await P.E.step({ platform: 'POSHMARK', item: item({ remoteListingId: OWN }), scratch: Object.assign({}, r.scratch), stepNo: 3 });
  assert.strictEqual(r2.code, 'edit_page_mismatch');
  assert.strictEqual(writes(P.calls).length, 0);
});

test('API path: a discovered (unsaved) listing whose live title is another item\'s is refused with listing_title_mismatch', async () => {
  const J = OTHER_IDS[0];
  const P = makePage({ href: 'https://poshmark.com/edit-listing/' + J, liveTitle: (id) => (OTHERS[id] || CAMEL) });
  const r = await P.E.step({ platform: 'POSHMARK', item: item(), scratch: { remoteId: J, phase: 'api', discovered: true }, stepNo: 2 });
  assert.strictEqual(r.state, 'fail');
  assert.strictEqual(r.code, 'listing_title_mismatch');
  assert.strictEqual(r.scratch.remoteId, null, 'the refused id is never cached');
  assert.strictEqual(writes(P.calls).length, 0);
});

test('form fallback: when the API read fails, the form title is checked and Update is never clicked on another item\'s listing', async () => {
  const J = OTHER_IDS[0];
  const P = makePage({ href: 'https://poshmark.com/edit-listing/' + J, getFails: true, form: true, formTitle: OTHERS[J] });
  const r = await P.E.step({ platform: 'POSHMARK', item: item(), scratch: { remoteId: J, phase: 'api', discovered: true }, stepNo: 2 });
  assert.strictEqual(r.code, 'listing_title_mismatch');
  await sleep(200);
  assert.strictEqual(P.updateBtn.clicked, 0);
  assert.strictEqual(writes(P.calls).length, 0);
});

test('the item\'s own saved listing may be repaired even when its live title is wrong, and the title is never written', async () => {
  // e.g. the Jefferson Starship item: saved id J, its live listing now carries the Camel title
  const J = OTHER_IDS[0];
  const P = makePage({ href: 'https://poshmark.com/edit-listing/' + J });
  const jItem = { id: 'jeff', title: OTHERS[J], price: 6.49, priceDrift: true, quantity: null, quantityDrift: false, remoteListingId: J, titleGroup: null };
  const r = await P.E.step({ platform: 'POSHMARK', item: jItem, scratch: { remoteId: J, phase: 'api' }, stepNo: 1 });
  assert.strictEqual(r.state, 'done', JSON.stringify(r).slice(0, 300));
  const post = writes(P.calls)[0];
  assert.ok(post && post.url.indexOf(J) !== -1);
  assert.strictEqual(post.body.post.title, CAMEL, 'title sent back exactly as read: a price edit never writes a new title');
  assert.strictEqual(post.body.post.description, 'desc ' + J);
  assert.strictEqual(post.body.post.price_amount.val, '6');
});

test('poshEditTargetCheck: saved id wins; otherwise the live title must equal the item title (Cart form, 80-char trim)', () => {
  const C = require('../fas-edit-core.js');
  assert.deepStrictEqual(C.poshEditTargetCheck({ title: 'X', remoteListingId: OWN }, OWN, 'anything'), { ok: true, own: true });
  assert.strictEqual(C.poshEditTargetCheck({ title: CAMEL, remoteListingId: OWN }, OTHER_IDS[0], CAMEL).code, 'remote_id_mismatch');
  assert.strictEqual(C.poshEditTargetCheck({ title: CAMEL }, OTHER_IDS[0], OTHERS[OTHER_IDS[0]]).code, 'listing_title_mismatch');
  assert.strictEqual(C.poshEditTargetCheck({ title: CAMEL }, OTHER_IDS[0], '').code, 'listing_title_mismatch');
  assert.strictEqual(C.poshEditTargetCheck({ title: CAMEL }, OWN, CAMEL).ok, true);
  const longT = 'Neo Geo MVS Arcade Cartridge, Metal Slug 3, SNK 2000, Tested Working Original Label Great Condition Rare';
  assert.strictEqual(C.poshEditTargetCheck({ title: longT }, OWN, C.poshmarkTitle(C.poshmarkCartTitle(longT))).ok, true);
  assert.deepStrictEqual(C.poshmarkUpdateTouched({ title: 'a', description: 'd', price_amount: { val: '1' } }, { title: 'a', description: 'd', price_amount: { val: '2' } }), []);
  assert.deepStrictEqual(C.poshmarkUpdateTouched({ title: 'a' }, { title: 'b' }), ['title']);
});

test('remembered copy lists are purged on load and never read; the post flow never fills an edit-listing page', () => {
  const bg = rd('background.js');
  assert.ok(/async function fasPurgeRememberedCopies\(\)/.test(bg) && /\nfasPurgeRememberedCopies\(\);/.test(bg));
  assert.ok(/delete s\.copyIds;/.test(bg));
  assert.ok(!/copyIds: s\.copyIds/.test(bg) && !/state\.copyIds/.test(bg));
  const eng = rd('fas-edit-engine.js');
  assert.ok(!/function poshCopyPre|function poshCopyWrap|C\.copyStart\(/.test(eng));
  const posh = rd('fas-poshmark.js');
  const i = posh.indexOf('async function start()');
  assert.ok(/if \(\/\^\\\/edit-listing\\\/\/\.test\(location\.pathname\)\) return;/.test(posh.slice(i, i + 600)));
});
