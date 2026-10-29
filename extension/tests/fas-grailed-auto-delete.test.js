// 2026-10-29: Grailed live-listing delete is automated (fas-grailed.js grDeleteOnListingPage + runGrailedRemovalQueue). Same standard
// as Poshmark/Mercari/Vinted id-first removal: the stored listing id (or exactly one full-title card) picks the listing, the listing
// page must show that listing and Grailed's JSON must say it is the signed-in seller's and live, exactly one Delete control and one
// confirm control are clicked, and REMOVED is reported only once Grailed's JSON says the listing is gone. Ambiguity never clicks.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const gr = fs.readFileSync(path.join(__dirname, '..', 'fas-grailed.js'), 'utf8');

function extract(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let depth = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
function constLine(name) {
  const m = new RegExp('^  const ' + name + ' = .*$', 'm').exec(gr);
  assert.ok(m, name);
  return m[0].trim();
}
const ASYNC = new Set(['grPoll', 'grWaitListingGone', 'grLookupListingById', 'grGoToListingForDelete', 'grDeleteOnListingPage', 'grRemoveByListingId', 'runGrailedRemovalQueue']);
const NAMES = ['grRemNorm', 'grReadMark', 'grWriteMark', 'grMarkFor', 'grListingPageId', 'grPageShowsListing', 'grTitleMatchesItem', 'grIsVisible',
  'grInDialog', 'grPageHeadingTexts', 'grFindDeleteButton', 'grOpenDialogs', 'grFindConfirmButton', 'grPoll', 'grWaitListingGone', 'grRemovalListingId',
  'grClassifyListingLookup', 'grLookupListingById', 'grGoToListingForDelete', 'grDeleteOnListingPage', 'grReportDeleteResult', 'grRemoveByListingId',
  'findGrailedListingMatchByTitle', 'grRemFindListingTitleEl', 'runGrailedRemovalQueue'];
const CONSTS = ['GRAILED_REMOVAL_CONTINUE_URL', 'GR_DEL_NAV_KEY', 'GR_DEL_CLICKED_KEY', 'GR_DEL_MARK_TTL_MS', 'GR_DEL_CONFIRM_TEXTS'].map(constLine).join('\n');
const body = CONSTS + '\n' + NAMES.map((n) => (ASYNC.has(n) ? 'async ' : '') + extract(gr, n)).join('\n');

const ID = '105000124';
const ME = 19099637;
const GR_TITLE = 'REBECCA STONE Graphic T-Shirt, Black Cotton wash Patterned';

// ---- a tiny fake page --------------------------------------------------------------------------------------------------------
function el(text, o) {
  o = o || {};
  const e = {
    textContent: text, className: o.className || '', disabled: !!o.disabled, offsetParent: o.hidden ? null : {},
    dialog: o.dialog || null, attrs: o.attrs || {}, clicks: 0, trusted: 0, onClick: o.onClick || null, onTrusted: o.onTrusted || null,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    closest(sel) { return /dialog|aria-modal/.test(sel) ? this.dialog : (/ListingForSaleCard/.test(sel) ? (o.card || null) : null); },
  };
  return e;
}
function page(opts) {
  opts = opts || {};
  const state = {
    gone: false, seller: opts.seller == null ? ME : opts.seller, sold: false, signedIn: opts.signedIn !== false, apiTitle: opts.apiTitle || GR_TITLE,
    headings: [], buttons: [], dialogs: [], anchors: [], sent: [], warns: [], overlays: [], clock: 1000000, store: {},
    loc: { href: 'https://www.grailed.com/listings/' + ID, pathname: opts.pathname || ('/listings/' + ID) },
  };
  state.addDialog = (buttons) => {
    const d = { offsetParent: {}, querySelectorAll: () => buttons };
    buttons.forEach((b) => { b.dialog = d; });
    state.dialogs.push(d);
    state.buttons.push(...buttons);
    return d;
  };
  const qa = (sel) => {
    if (sel === 'h1, h2, [class*="title" i]') return state.headings;
    if (sel === 'button, [role="button"]') return state.buttons;
    if (sel === '[role="dialog"], [role="alertdialog"], [aria-modal="true"]') return state.dialogs;
    if (sel === 'a[href*="/listings/"]') return state.anchors;
    if (sel === '[class*="title" i]') return [];
    throw new Error('unexpected selector ' + sel);
  };
  const deps = {
    qa,
    document: { querySelector: (s) => (s === 'h1' ? state.headings[0] || null : null) },
    location: state.loc,
    sessionStorage: { getItem: (k) => (k in state.store ? state.store[k] : null), setItem: (k, v) => { state.store[k] = String(v); }, removeItem: (k) => { delete state.store[k]; } },
    Date: { now: () => state.clock },
    sleep: async (ms) => { state.clock += ms; },
    humanPause: async (a) => { state.clock += a; },
    fetch: async (url) => {
      if (url === '/api/users/me') return state.signedIn ? { ok: true, status: 200, json: async () => ({ data: { id: ME } }) } : { ok: false, status: 401, json: async () => ({}) };
      if (state.gone) return { ok: false, status: 404, json: async () => ({ error: { error_id: 'not_found' } }) };
      return { ok: true, status: 200, json: async () => ({ data: { id: Number(ID), title: state.apiTitle, seller: { id: state.seller }, sold: state.sold, deleted: false, hidden: false } }) };
    },
    syntheticClick: (e) => { e.clicks++; if (e.onClick) e.onClick(); },
    trustedClick: async (e) => { e.trusted++; if (e.onTrusted) e.onTrusted(); return true; },
    chrome: { runtime: { sendMessage: (m) => { state.sent.push(m); } } },
    overlay: (h) => { state.overlays.push(h); }, overlayWarn: (t) => { state.warns.push(t); }, button: () => '', escapeHtml: (s) => String(s),
    console: { log: () => {}, warn: () => {} },
    window: {},
  };
  const keys = Object.keys(deps);
  state.fns = new Function('deps', 'const { ' + keys.join(', ') + ' } = deps;\n' + body + '\nreturn { ' + NAMES.join(', ') + ' };')(deps);
  return state;
}
// The owner's listing page: title heading + sidebar Delete that opens a confirm dialog whose "Delete" really deletes.
function ownerPage(opts) {
  opts = opts || {};
  const p = page(opts);
  p.headings.push(el(opts.heading || GR_TITLE));
  const confirm = el('Delete', { onClick: () => { if (!opts.confirmIgnored) p.gone = true; } });
  p.confirm = confirm;
  const openDialog = () => { if (!p.dialogs.length) p.addDialog([el('Cancel'), confirm]); };
  p.del = el('Delete', { className: 'ListingActions_action__x1', onClick: () => { if (!opts.deleteIgnored) openDialog(); }, onTrusted: openDialog });
  p.buttons.push(el('Edit', { className: 'ListingActions_action__x1' }), p.del);
  return p;
}
const item = (over) => Object.assign({ id: 'cmg1', title: 'Graphic T-Shirt, Rebecca Stone, Black Cotton', reason: 'POLICY_INELIGIBLE', listingRefs: { GRAILED: ID } }, over || {});
const types = (p) => p.sent.map((m) => [m.type, m.reason || null]);

test('verified page + one Delete + one confirm -> deleted, reported REMOVED only after Grailed says the listing is gone', async () => {
  const p = ownerPage();
  assert.strictEqual(await p.fns.grDeleteOnListingPage(item(), ID, 'id'), 'deleted');
  assert.deepStrictEqual([p.del.clicks, p.confirm.clicks, p.buttons[2].clicks], [1, 1, 0]); // Cancel never clicked
  p.fns.grReportDeleteResult(item(), ID, 'deleted');
  assert.deepStrictEqual(types(p), [['crossPlatformRemovalDeleted', null]]);
  assert.ok(/confirmed gone/.test(p.sent[0].note));
  assert.deepStrictEqual(Object.keys(p.store), [], 'marks cleared');
});

test('confirm accepted but the listing is still live -> delete_unverified (one trusted retry), never REMOVED', async () => {
  const p = ownerPage({ confirmIgnored: true });
  assert.strictEqual(await p.fns.grDeleteOnListingPage(item(), ID, 'id'), 'delete_unverified');
  assert.deepStrictEqual([p.confirm.clicks, p.confirm.trusted], [1, 1]);
  p.fns.grReportDeleteResult(item(), ID, 'delete_unverified');
  assert.deepStrictEqual(types(p), [['crossPlatformRemovalAttemptFailed', 'grailed_delete_unverified']]);
});

test('nothing is clicked unless Grailed says it is the signed-in seller\'s live listing', async () => {
  const other = ownerPage({ seller: 1234 });
  assert.strictEqual(await other.fns.grDeleteOnListingPage(item(), ID, 'id'), 'not_own_listing');
  const out = ownerPage({ signedIn: false });
  assert.strictEqual(await out.fns.grDeleteOnListingPage(item(), ID, 'id'), 'owner_unverified');
  const sold = ownerPage();
  sold.sold = true;
  assert.strictEqual(await sold.fns.grDeleteOnListingPage(item(), ID, 'id'), 'sold_on_grailed');
  for (const p of [other, out, sold]) assert.strictEqual(p.del.clicks + p.del.trusted, 0);
  other.fns.grReportDeleteResult(item(), ID, 'not_own_listing');
  assert.deepStrictEqual(types(other), [['crossPlatformRemovalSkipped', 'listing_not_owned']]);
});

test('the page must be that listing and show its title; a title-matched id must carry the FindA.Sale title', async () => {
  const wrongPage = ownerPage({ pathname: '/listings/999' });
  assert.strictEqual(await wrongPage.fns.grDeleteOnListingPage(item(), ID, 'id'), 'wrong_listing_page');
  const editPage = ownerPage({ pathname: '/listings/' + ID + '/edit' });
  assert.strictEqual(await editPage.fns.grDeleteOnListingPage(item(), ID, 'id'), 'wrong_listing_page');
  const otherHeading = ownerPage({ heading: 'Some other jacket' });
  assert.strictEqual(await otherHeading.fns.grDeleteOnListingPage(item(), ID, 'id'), 'listing_not_shown_on_page');
  const titleSrc = ownerPage(); // Grailed's title does not contain "Graphic T-Shirt, Rebecca Stone, Black Cotton"
  assert.strictEqual(await titleSrc.fns.grDeleteOnListingPage(item(), ID, 'title'), 'title_mismatch');
  for (const p of [wrongPage, editPage, otherHeading, titleSrc]) assert.strictEqual(p.del.clicks + p.del.trusted, 0);
  titleSrc.fns.grReportDeleteResult(item(), ID, 'title_mismatch');
  assert.deepStrictEqual(types(titleSrc), [['crossPlatformRemovalSkipped', 'no_confident_listing_match']]);
  // A retitled listing reached by its STORED id needs no title match (the id is FindA.Sale's own record).
  const byId = ownerPage();
  assert.strictEqual(await byId.fns.grDeleteOnListingPage(item(), ID, 'id'), 'deleted');
  // Title-matched and Grailed's title carries the full FindA.Sale title -> deleted.
  const titled = ownerPage({ apiTitle: 'Graphic T-Shirt, Rebecca Stone, Black Cotton XL', heading: 'Graphic T-Shirt, Rebecca Stone, Black Cotton XL' });
  assert.strictEqual(await titled.fns.grDeleteOnListingPage(item({ listingRefs: {} }), ID, 'title'), 'deleted');
});

test('ambiguous controls are never clicked: two plain Delete buttons, or a dialog with two confirm candidates', async () => {
  const two = page();
  two.headings.push(el(GR_TITLE));
  const a = el('Delete'); const b = el('Delete');
  two.buttons.push(a, b);
  assert.strictEqual(await two.fns.grDeleteOnListingPage(item(), ID, 'id'), 'no_delete_button');
  assert.strictEqual(a.clicks + b.clicks, 0);
  // The ListingActions control wins over an unrelated Delete elsewhere on the page.
  const pref = ownerPage();
  pref.buttons.push(el('Delete', { className: 'Comment_delete' }));
  assert.strictEqual(pref.fns.grFindDeleteButton(), pref.del);
  // Dialog with two "Delete" buttons: no confirm click, no trusted retry behind an open dialog.
  const amb = ownerPage();
  amb.del.onClick = () => { amb.addDialog([el('Delete'), el('Delete'), el('Cancel')]); };
  assert.strictEqual(await amb.fns.grDeleteOnListingPage(item(), ID, 'id'), 'no_confirm_dialog');
  assert.strictEqual(amb.dialogs[0].querySelectorAll().reduce((n, x) => n + x.clicks, 0), 0);
  assert.strictEqual(amb.del.trusted, 0);
  // A disabled or hidden Delete is not a control.
  const dis = page();
  dis.headings.push(el(GR_TITLE));
  dis.buttons.push(el('Delete', { disabled: true }), el('Delete', { hidden: true }));
  assert.strictEqual(dis.fns.grFindDeleteButton(), null);
});

test('a Delete that deletes without a confirm step, and a synthetic click Grailed ignores (one trusted retry)', async () => {
  const direct = ownerPage();
  direct.del.onClick = () => { direct.gone = true; };
  assert.strictEqual(await direct.fns.grDeleteOnListingPage(item(), ID, 'id'), 'deleted');
  const ignored = ownerPage({ deleteIgnored: true });
  assert.strictEqual(await ignored.fns.grDeleteOnListingPage(item(), ID, 'id'), 'deleted');
  assert.deepStrictEqual([ignored.del.clicks, ignored.del.trusted, ignored.confirm.clicks], [1, 1, 1]);
  const dead = ownerPage({ deleteIgnored: true });
  dead.del.onTrusted = null;
  assert.strictEqual(await dead.fns.grDeleteOnListingPage(item(), ID, 'id'), 'no_confirm_dialog');
});

test('queue: a stored-id live listing is opened, then deleted on arrival; the page reload after a click is settled by id only', async () => {
  // 1) On the manage page: id-first sends the tab to the listing page.
  const manage = ownerPage({ pathname: '/sell/for-sale' });
  await manage.fns.runGrailedRemovalQueue(item(), 0, 1);
  assert.strictEqual(manage.loc.href, 'https://www.grailed.com/listings/' + ID);
  assert.deepStrictEqual(manage.sent, []);
  // 2) Arrival on /listings/<id> with that mark: deleted and reported.
  const arrive = ownerPage();
  arrive.store = Object.assign(arrive.store, manage.store);
  await arrive.fns.runGrailedRemovalQueue(item(), 0, 1);
  assert.deepStrictEqual(types(arrive), [['crossPlatformRemovalDeleted', null]]);
  assert.deepStrictEqual(Object.keys(arrive.store), []);
  // 3) Sent to the listing page but landed elsewhere: retriable, no loop, no click.
  const lost = ownerPage({ pathname: '/sell/for-sale' });
  lost.store.fasGrDeleteNav = JSON.stringify({ id: ID, itemId: 'cmg1', source: 'id', at: lost.clock });
  await lost.fns.runGrailedRemovalQueue(item(), 0, 1);
  assert.deepStrictEqual(types(lost), [['crossPlatformRemovalAttemptFailed', 'grailed_listing_page_not_reached']]);
  assert.strictEqual(lost.loc.href, 'https://www.grailed.com/listings/' + ID, 'did not navigate again');
  // 4) Reload after the Delete click: gone -> REMOVED; still live -> attempt failure. Never clicks again.
  for (const [gone, want] of [[true, ['crossPlatformRemovalDeleted', null]], [false, ['crossPlatformRemovalAttemptFailed', 'grailed_delete_unverified']]]) {
    const re = ownerPage();
    re.gone = gone;
    re.store.fasGrDeleteClicked = JSON.stringify({ id: ID, itemId: 'cmg1', at: re.clock });
    await re.fns.runGrailedRemovalQueue(item(), 0, 1);
    assert.deepStrictEqual(types(re), [want]);
    assert.strictEqual(re.del.clicks + re.del.trusted, 0);
  }
  // 5) A stale mark (over 10 minutes) or another item's mark is ignored.
  const stale = ownerPage({ pathname: '/sell/for-sale' });
  assert.strictEqual(stale.fns.grMarkFor({ id: ID, itemId: 'cmg1', at: stale.clock - 11 * 60 * 1000 }, item(), stale.clock), null);
  assert.strictEqual(stale.fns.grMarkFor({ id: ID, itemId: 'other', at: stale.clock }, item(), stale.clock), null);
  assert.strictEqual(stale.fns.grMarkFor({ id: 'x1', itemId: 'cmg1', at: stale.clock }, item(), stale.clock), null);
});

test('queue: no stored id -> exactly one full-title card opens that listing (source title); a verify run never deletes', async () => {
  const p = ownerPage({ pathname: '/sell/for-sale' });
  const card = { textContent: 'Requires Action11 days agoRebecca StoneGraphic T-Shirt, Rebecca Stone, Black Cotton$103' };
  p.anchors.push(Object.assign(el(''), { href: 'https://www.grailed.com/listings/' + ID, attrs: { href: '/listings/' + ID }, closest: () => card }));
  p.headings.length = 0;
  await p.fns.runGrailedRemovalQueue(item({ listingRefs: {} }), 0, 1);
  assert.strictEqual(p.loc.href, 'https://www.grailed.com/listings/' + ID);
  assert.strictEqual(JSON.parse(p.store.fasGrDeleteNav).source, 'title');
  const v = ownerPage();
  v.store.fasGrDeleteNav = JSON.stringify({ id: ID, itemId: 'cmg1', source: 'id', at: v.clock });
  await v.fns.runGrailedRemovalQueue(item({ reason: 'RESYNC_VERIFY' }), 0, 1);
  assert.strictEqual(v.del.clicks + v.del.trusted, 0);
  assert.deepStrictEqual(v.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'verify_still_live', true]]);
});

test('pure helpers', () => {
  const p = page();
  assert.strictEqual(p.fns.grListingPageId('/listings/105000124'), ID);
  assert.strictEqual(p.fns.grListingPageId('/listings/105000124-rebecca-stone-tee'), ID);
  assert.strictEqual(p.fns.grListingPageId('/listings/105000124/edit'), null);
  assert.strictEqual(p.fns.grListingPageId('/sell/for-sale'), null);
  assert.strictEqual(p.fns.grPageShowsListing(['Rebecca Stone', GR_TITLE + ' Size L'], GR_TITLE), true);
  assert.strictEqual(p.fns.grPageShowsListing(['Rebecca'], GR_TITLE), false);
  assert.strictEqual(p.fns.grPageShowsListing([GR_TITLE], ''), false);
  assert.strictEqual(p.fns.grTitleMatchesItem(GR_TITLE, 'graphic t-shirt, rebecca stone'), false);
  assert.strictEqual(p.fns.grTitleMatchesItem('Vintage Tee, Black Cotton XL', 'tee, black cotton'), true);
});
