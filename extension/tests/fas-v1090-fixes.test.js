// 1.0.90 (2026-11-04): fixes from the verified extension review (claude_docs/scratch_tmp/ext/verified.md). One block per fix, each
// with the normal path next to the refused one. DOM and chrome.* are STUBBED; nothing here ran against a live marketplace.
// Run: node --test extension/tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { atLeast } = require('./_version');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const BG = read('background.js');
const POPUP = read('popup.js');
const FB = read('fas-content.js');
const SEL = read('fas-selectors.js');
const REM = read('fas-remove.js');
const VINT = read('fas-vinted.js');
const CL = read('fas-craigslist.js');
const CLR = read('fas-craigslist-removal-frame.js');
const MERC = read('fas-mercari.js');
const GR = read('fas-grailed.js');
const POSH = read('fas-poshmark.js');
const MSG = read('fas-messages.js');
const ENG = read('fas-edit-engine.js');

// Source of `function name(...) {...}` (optionally async) or `const NAME = [...]|{...}|new Map()`.
function extract(src, name) {
  let i = src.indexOf('function ' + name + '(');
  let isConst = false;
  if (i < 0) { i = src.indexOf('const ' + name + ' = '); isConst = true; }
  assert.ok(i >= 0, 'not found: ' + name);
  if (isConst && /^const \w+ = new Map\(\);/.test(src.slice(i))) return src.slice(i, src.indexOf(';', i) + 1);
  if (isConst) {
    const line = src.slice(i, src.indexOf('\n', i));
    if (!/[[{]\s*$/.test(line.replace(/\/\/.*$/, '')) && /;/.test(line)) return line.slice(0, line.indexOf(';') + 1);
  }
  const open = isConst ? Math.min(...['[', '{'].map((c) => { const k = src.indexOf(c, i); return k < 0 ? Infinity : k; })) : src.indexOf('{', src.indexOf(')', i));
  const close = src[open] === '[' ? ']' : '}';
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === src[open]) depth++;
    else if (src[k] === close) { depth--; if (depth === 0) return (src.slice(Math.max(0, i - 6), i) === 'async ' ? 'async ' : '') + src.slice(i, k + 1) + (isConst ? ';' : ''); }
  }
  throw new Error('unterminated ' + name);
}
function build(src, names, deps, ret) {
  const body = names.map((n) => extract(src, n)).join('\n');
  const keys = Object.keys(deps || {});
  return new Function(...keys, body + '\nreturn { ' + ret.join(', ') + ' };')(...keys.map((k) => deps[k]));
}
const fnBody = (src, name) => extract(src, name);

test('manifest is at least 1.0.90', () => {
  assert.ok(atLeast(JSON.parse(read('manifest.json')).version, '1.0.90'));
});

// ---------------------------------------------------------------------------- 4. queues tied to their tab
function ownerHarness(initial, liveTabs) {
  const store = Object.assign({}, initial);
  const chrome = { storage: { local: {
    get: async (keys) => { const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) o[k] = store[k]; }); return o; },
    set: async (obj) => { Object.assign(store, obj); },
  } } };
  const tabsGet = async (id) => (liveTabs && liveTabs[id]) || null;
  const f = build(BG, ['FAS_QUEUE_TAB_HOSTS', 'fasResolveQueueTabOwner', 'fasRecordQueueTab'], { chrome, tabsGet }, ['fasResolveQueueTabOwner', 'fasRecordQueueTab']);
  return { f, store };
}
test('queue tab owner: the recorded tab is served; a second tab is refused while the owner is open', async () => {
  const h = ownerHarness({ fasQueueTabId: 10, fasQueueTabIdAdopted: false }, { 10: { id: 10, url: 'https://www.facebook.com/marketplace/create/item' } });
  assert.deepStrictEqual(await h.f.fasResolveQueueTabOwner('fasQueueTabId', { id: 10 }), { own: true, adopted: false });
  assert.deepStrictEqual(await h.f.fasResolveQueueTabOwner('fasQueueTabId', { id: 11 }), { own: false, adopted: false });
  assert.strictEqual(h.store.fasQueueTabId, 10, 'never re-pointed while the owner is live');
});
test('queue tab owner: a tab opened by hand adopts an orphaned queue but is marked adopted (no auto-publish)', async () => {
  const gone = ownerHarness({ fasGrailedQueueTabId: 10 }, {});
  assert.deepStrictEqual(await gone.f.fasResolveQueueTabOwner('fasGrailedQueueTabId', { id: 12 }), { own: true, adopted: true });
  assert.strictEqual(gone.store.fasGrailedQueueTabId, 12);
  const none = ownerHarness({ fasQueueTabId: null }, {});
  assert.deepStrictEqual(await none.f.fasResolveQueueTabOwner('fasQueueTabId', { id: 5 }), { own: true, adopted: true });
  await none.f.fasRecordQueueTab('fasQueueTabId', { id: 7 });
  assert.deepStrictEqual(await none.f.fasResolveQueueTabOwner('fasQueueTabId', { id: 7 }), { own: true, adopted: false }, 'a tab the worker opened may auto-publish');
  assert.deepStrictEqual(await none.f.fasResolveQueueTabOwner('fasQueueTabId', null), { own: false, adopted: false });
});
test('Facebook queue: served and advanced only for its tab, advance is an itemId compare-and-swap, adopted tabs never auto-publish', () => {
  const get = BG.slice(BG.indexOf("msg.type === 'getQueueItem'"), BG.indexOf("msg.type === 'fbPublishAttempt'"));
  assert.ok(/fasResolveQueueTabOwner\('fasQueueTabId', sender && sender\.tab\)/.test(get));
  assert.ok(/autoPublish: fasAutoPublish && !fbOwner\.adopted && !fbPending/.test(get));
  const adv = BG.slice(BG.indexOf("msg.type === 'advanceQueue'"), BG.indexOf("msg.type === 'setCraigslistQueue'"));
  assert.ok(/msg\.itemId != null && \(!fbAdvCur \|\| fbAdvCur\.id !== msg\.itemId\)/.test(adv));
  assert.ok(/!fbAdvOwner\.own/.test(adv));
  assert.ok(/type: 'advanceQueue', itemId: itemId \|\| null/.test(FB), 'the content script sends the item it is advancing past');
  assert.ok(!/advanceAuto\(\);/.test(FB), 'every advance names its item');
  const setQ = BG.slice(BG.indexOf("msg.type === 'setQueue'"), BG.indexOf("msg.type === 'getQueueItem'"));
  assert.ok(/msg\.openTab === true/.test(setQ) && /fasRecordQueueTab\('fasQueueTabId', fbQueueTab\)/.test(setQ));
});
test('Grailed queue: tab-scoped, stale queues ignored, reopen only from the queue tab (a double click opens one tab, not two)', () => {
  const get = BG.slice(BG.indexOf("msg.type === 'getGrailedQueueItem'"), BG.indexOf("msg.type === 'reopenGrailedTab'"));
  assert.ok(/fasResolveQueueTabOwner\('fasGrailedQueueTabId', sender && sender\.tab\)/.test(get));
  assert.ok(/Date\.now\(\) - grTouched > FAS_AUTOLIST_ABANDON_MS/.test(get));
  assert.ok(/autoPublish: fasGrailedAutoPublish && !grOwner\.adopted/.test(get));
  const re = BG.slice(BG.indexOf("msg.type === 'reopenGrailedTab'"), BG.indexOf("msg.type === 'advanceGrailedQueue'"));
  const refuse = re.indexOf("error: 'not_queue_tab'"), create = re.indexOf('chrome.tabs.create');
  assert.ok(refuse > 0 && create > refuse, 'refusal is checked before any tab is created');
  const nextH = GR.slice(GR.indexOf("let grNextHandled = false;"), GR.indexOf("closeBtnHandler();", GR.indexOf("let grNextHandled = false;")));
  assert.ok(/if \(grNextHandled\) return;\s*grNextHandled = true;\s*next\.disabled = true;/.test(nextH));
});
test('popup: List is single-flight, selections are per channel and pruned to what is on screen; Vinted repost kept', () => {
  assert.ok(/if \(queueStarting\) return;\s*queueStarting = true;/.test(POPUP));
  assert.ok(/btn\.disabled = queueStarting \|\|/.test(POPUP));
  assert.ok(/function onChannelChange\(\) \{\s*const ch = currentChannel\(\);[\s\S]{0,200}selected\.clear\(\);/.test(POPUP));
  assert.ok(/if \(!renderedIds\.has\(id\)\) selected\.delete\(id\)/.test(POPUP));
  assert.ok(/selected\.has\(it\.id\) && renderedIds\.has\(it\.id\)/.test(POPUP));
  assert.ok(/vintedPostAgain: ch === 'vinted' && vintedLiveOnVinted\(it\)/.test(POPUP), 'deliberate Vinted repost of a ticked live item is unchanged');
  assert.ok(/send\(\{ type: 'setQueue', queue, autoPublish, openTab: true \}\)/.test(POPUP));
  assert.ok(!/chrome\.tabs\.create\(\{ url: CFG\.FB_CREATE_URL \}\)/.test(POPUP), 'the popup no longer opens an unrecorded Facebook tab');
});

// ---------------------------------------------------------------------------- 5. Facebook publish-attempt marker
test('Facebook publish-attempt marker: fresh marker for the current item holds it; other items and old markers do not', () => {
  const f = build(BG, ['FAS_FB_PUBLISH_ATTEMPT_MS', 'fasFbAttemptFor'], {}, ['fasFbAttemptFor']);
  const now = 1e12;
  assert.strictEqual(f.fasFbAttemptFor({ itemId: 'a', at: now - 60000 }, 'a', now), true);
  assert.strictEqual(f.fasFbAttemptFor({ itemId: 'a', at: now - 60000 }, 'b', now), false, 'normal path: another item publishes normally');
  assert.strictEqual(f.fasFbAttemptFor({ itemId: 'a', at: now - 7 * 3600000 }, 'a', now), false);
  assert.strictEqual(f.fasFbAttemptFor(null, 'a', now), false);
});
test('Facebook: the marker is written before Publish is clicked, a held item is settled by the organizer, not re-published', () => {
  const fill = FB.slice(FB.indexOf('async function fillItem('), FB.indexOf('async function runQueue('));
  const mark = fill.indexOf("type: 'fbPublishAttempt'"), click = fill.indexOf("await clickButton('Publish', 'Audience')");
  assert.ok(mark > 0 && click > mark);
  assert.ok(/if \(q\.publishAttempt\) \{ showUnconfirmedPublish\(/.test(FB));
  assert.ok(/function showUnconfirmedPublish\(/.test(FB) && /marketplace\/you\/selling/.test(fnBody(FB, 'showUnconfirmedPublish')));
  assert.ok(/fasFbClearAttempt\(msg\.itemId\)/.test(BG), 'a recorded listing clears the marker');
  assert.ok(/onLoginWall\(\) \|\| !\/\^\\\/marketplace\\\/\/\.test\(location\.pathname/.test(FB), 'a login/checkpoint redirect is not a publish');
  assert.ok(/\/\^\\\/marketplace\\\/item\\\/\\d\+\/\.test\(location\.pathname \|\| ''\) \? location\.href : null/.test(FB));
});

// ---------------------------------------------------------------------------- 3. Facebook exact title match
function el(text, opts) {
  const o = opts || {};
  return {
    innerText: text, textContent: text.replace(/\n/g, ' '),
    querySelectorAll: (sel) => (sel.indexOf('/marketplace/item/') !== -1 ? (o.links || []).map((h) => ({ getAttribute: () => h, href: h }))
      : (sel.indexOf('role="button"') !== -1 ? (o.buttons || []) : [])),
  };
}
const selFns = build(SEL, ['norm', 'fbSavedListingId', 'cardListingIds', 'cardTitleLines', 'cardMatchesItem', 'fbCardIsPending', 'fbCardShowsSoldStatus'], {},
  ['cardMatchesItem', 'fbSavedListingId', 'fbCardIsPending', 'fbCardShowsSoldStatus']);
test('Facebook card match: a title line must equal the item title; "Lamp" is not "Brass Lamp Shade"', () => {
  const card = el('Brass Lamp Shade\n$25\nListed 3 days ago\nMark as sold');
  assert.strictEqual(selFns.cardMatchesItem(card, 'Lamp'), false);
  assert.strictEqual(selFns.cardMatchesItem(card, 'Brass Lamp Shade'), true, 'normal path: the exact title matches');
  assert.strictEqual(selFns.cardMatchesItem(card, 'brass  lamp shade'), true, 'normalized');
});
test('Facebook card match: a saved listing id decides when the card shows its own id', () => {
  const card = el('Brass Lamp Shade\n$25', { links: ['/marketplace/item/1234567890/'] });
  assert.strictEqual(selFns.cardMatchesItem(card, 'Brass Lamp Shade', 'https://www.facebook.com/marketplace/item/999999999/'), false);
  assert.strictEqual(selFns.cardMatchesItem(card, 'Renamed on Facebook', '1234567890'), true);
  assert.strictEqual(selFns.fbSavedListingId('https://www.facebook.com/marketplace/item/1234567890/?ref=x'), '1234567890');
});
test('Facebook sold scan: Pending is never sold; "Mark as available" needs a Sold status', () => {
  assert.strictEqual(selFns.fbCardIsPending('brass lamp $25 pending mark as available'), true);
  assert.strictEqual(selFns.fbCardIsPending('brass lamp $25 sold mark as available'), false);
  assert.strictEqual(selFns.fbCardShowsSoldStatus('brass lamp $25 mark as available'), false);
  assert.strictEqual(selFns.fbCardShowsSoldStatus('brass lamp $25 sold · mark as available'), true);
  assert.ok(/!fbCardIsPending\(cardText\) && \(v\.strong \|\| fbCardShowsSoldStatus\(cardText\)\)/.test(SEL));
});
test('Facebook removal: two live cards are ambiguous (never "already removed"); the sold scan skips an item that is live again', () => {
  const ro = REM.slice(REM.indexOf('async function removeOne('), REM.indexOf('const fbWhy ='));
  const amb = ro.indexOf('activeCards.length > 1'), sold = ro.indexOf('SEL.alreadySoldCardByTitle(');
  assert.ok(amb > 0 && sold > amb, 'ambiguity is decided before the already-sold shortcut');
  const SELstub = { norm: (s) => String(s || '').trim().toLowerCase(), fbSavedListingId: () => '', cardMatchesItem: (c, t) => c.title === t, listingCardsByTitle: (t) => (t === 'Relisted Mug' ? [{}] : []) };
  const f = build(REM, ['fbItemSavedId', 'matchSoldCardForTitle'], { SEL: SELstub }, ['matchSoldCardForTitle']);
  const cards = [{ cardEl: { title: 'Relisted Mug' }, cardText: 'x' }, { cardEl: { title: 'Brass Lamp' }, cardText: 'y' }];
  assert.strictEqual(f.matchSoldCardForTitle({ id: '1', title: 'Relisted Mug' }, cards), null, 'its live relist means the old sold card is not a new sale');
  assert.strictEqual(f.matchSoldCardForTitle({ id: '2', title: 'Brass Lamp' }, cards), cards[1], 'normal path: an exact sold card reports');
  assert.strictEqual(f.matchSoldCardForTitle({ id: '3', title: 'Lamp' }, cards), null);
});

// ---------------------------------------------------------------------------- 2. Vinted mark-as-sold only for real sales
test('Vinted: "Mark as sold" only for SOLD_ELSEWHERE, confirmed by Vinted\'s own details, and never reported back as a sale', () => {
  const fn = VINT.slice(VINT.indexOf('async function deleteVintedListingOnDetailPage'));
  assert.ok(/const FAS_VINTED_PREFER_MARK_SOLD = vintRemovalKey === 'SOLD_ELSEWHERE';/.test(fn));
  assert.ok(/body && body\.is_closed === true/.test(fn), 'closed per /api/v2/items/<id>/details, not just a missing button');
  assert.ok(/await vintSoldRememberSelfClosed\(closedId\);/.test(fn));
  const RR = require('../fas-removal-reason.js');
  const keyOf = (RR && RR.keyOf) || (globalThis.FAS_REMOVAL_REASON && globalThis.FAS_REMOVAL_REASON.keyOf);
  assert.strictEqual(keyOf({ reason: 'UNPUBLISHED' }) === 'SOLD_ELSEWHERE', false);
  assert.strictEqual(keyOf({ reason: 'POLICY_INELIGIBLE' }) === 'SOLD_ELSEWHERE', false);
  assert.strictEqual(keyOf({}), 'SOLD_ELSEWHERE', 'normal path: an item that sold elsewhere still prefers mark-as-sold');
});
test('Vinted: self-closed ids are stored with the reported ids so the wardrobe sold-check skips them', async () => {
  const store = {};
  const f = build(VINT, ['VINT_SOLD_REPORTED_KEY', 'VINT_SOLD_REPORTED_CAP', 'vintSoldRememberSelfClosed'], {
    vintRemStorageGet: async (k) => store[k], vintRemStorageSet: async (k, v) => { store[k] = v; },
  }, ['vintSoldRememberSelfClosed']);
  await f.vintSoldRememberSelfClosed('10324289174');
  await f.vintSoldRememberSelfClosed('not-an-id');
  assert.deepStrictEqual(store.fasVintedSoldReportedIds, ['10324289174']);
  assert.ok(/const fresh = read\.sold\.filter\(\(s\) => !reported\.has\(s\.vintedId\)\);/.test(VINT));
});
test('Vinted: no page-to-extension debug bridge in the shipped build; the worker refuses the old queue message', () => {
  assert.ok(!/__fasDebugBridge|debugReadStorage|debugReloadExtension|fas-vinted-debug-bridge-/.test(VINT));
  assert.ok(!/chrome\.runtime\.reload\(\)/.test(VINT));
  assert.ok(!/FAS_DEBUG_TOKEN/.test(BG));
  const h = BG.slice(BG.indexOf("msg.type === 'debugSetVintedQueueForThisTab'"), BG.indexOf("msg.type === 'getVintedQueueItem'"));
  assert.ok(/error: 'debug_bridge_removed'/.test(h) && !/chrome\.storage\.local\.set/.test(h));
});
test('Vinted: item-page id capture needs a single wardrobe listing with this title; pickers stay inside their own panel', () => {
  const cap = fnBody(VINT, 'vintCapOnItemPage');
  assert.ok(/ids\.size !== 1 \|\| !ids\.has\(String\(here\)\)/.test(cap));
  const fsl = fnBody(VINT, 'fillSelectLike');
  assert.ok(/const panel = findOpenPanel\(fieldId, true\);\s*if \(!panel\) return false;/.test(fsl));
  assert.ok(!/optionElByText\(value\)/.test(fsl));
  const pc = VINT.slice(VINT.indexOf('const catPanel ='), VINT.indexOf("// Brand: three entry paths"));
  assert.ok(/catPanel\.querySelectorAll/.test(pc) && !/optionElByText\(categoryText\)/.test(pc));
});

// ---------------------------------------------------------------------------- 7. whole-word exclude words
function gate(src, names, fn) { return build(src, names, {}, [fn])[fn]; }
const KW = ['FAS_KW_PREFIXES', 'FAS_KW_SUFFIXES', 'fasKwCache', 'fasKwEscape', 'fasKwNorm', 'fasKwBuild', 'fasKeywordMatch'];
test('Craigslist gate: an exclude word only counts as a whole word', () => {
  const r = gate(CL, ['CL_PROHIBITED_NAME_KEYWORDS', 'CL_PROHIBITED_EXCLUDE_KEYWORDS'].concat(KW, ['craigslistRestrictionReason']), 'craigslistRestrictionReason');
  assert.ok(r('', 'Gunmetalish toy gun'), '"gunmetal" inside a longer word no longer vetoes the gun rule');
  assert.strictEqual(r('Golf', 'Callaway irons, Gunmetal finish'), null, 'normal path: the real word still excludes');
  assert.strictEqual(r('Home', 'Brass table lamp'), null);
  assert.ok(r('', 'Hunting rifle ammo box'));
});
test('Mercari gate: "ring" inside "spring"/"string" no longer lets a knife through', () => {
  const r = gate(MERC, ['MERCARI_PROHIBITED_NAME_KEYWORDS', 'MERCARI_PROHIBITED_EXCLUDE_KEYWORDS', 'MERCARI_PRECIOUS_METAL_KEYWORDS', 'MERCARI_PRECIOUS_METAL_EXCLUDE'].concat(KW, ['mercariRestrictionReason']), 'mercariRestrictionReason');
  assert.ok(r('', 'Spring assisted knife'));
  assert.ok(r('', 'Boxing knife with string wrap'));
  assert.strictEqual(r('Home', 'Kitchen knife set'), null, 'normal path: a whole exclude word still applies');
  assert.strictEqual(r('Jewelry', 'Silver ring size 7'), null);
  for (const s of [CL, MERC, read('fas-content.js'), read('fas-gumtree-au.js')]) assert.ok(!/EXCLUDE[A-Z_]*\.some\(\(kw\) => haystack\.indexOf\(kw\)/.test(s));
});

// ---------------------------------------------------------------------------- 8/9. Craigslist removal matching and duplicate cleanup
const crTitleMatches = build(CLR, ['crTitleMatches'], {}, ['crTitleMatches']).crTitleMatches;
test('Craigslist removal: "Lot 1" never stands for "Lot 12"; only the exact 70-character cut of a longer title counts', () => {
  const lot12 = 'vintage hardware assortment drawer pulls and knobs mixed lot 12';
  const lot1 = 'vintage hardware assortment drawer pulls and knobs mixed lot 1';
  assert.strictEqual(crTitleMatches({ title: lot1, rawTitle: lot1 }, lot12), false);
  const long = 'jefferson airplane thirty seconds over winterland vinyl lp record, 1970s';
  assert.strictEqual(crTitleMatches({ title: long.slice(0, 70), rawTitle: long.slice(0, 70) }, long), true, 'normal path: the real cut');
  assert.strictEqual(crTitleMatches({ title: long.slice(0, 66), rawTitle: long.slice(0, 66) }, long), false, 'a shorter prefix is not the cut');
  assert.strictEqual(crTitleMatches({ title: long.slice(0, 70), rawTitle: long.slice(0, 70) }, long, { exactOnly: true }), false);
  assert.strictEqual(crTitleMatches({ title: long, rawTitle: long }, long, { exactOnly: true }), true);
});
test('Craigslist removal: saved id or duplicate cleanup turns the cut rule off; every duplicate is deleted and reported Deleted', () => {
  const run = CLR.slice(CLR.indexOf('async function runCraigslistRemovalQueue('), CLR.indexOf('async function maybeRunCraigslistRemoval('));
  assert.ok(/const savedId = savedRef && done\.indexOf\(savedRef\) === -1 \? savedRef : '';/.test(run), 'a saved id this run deleted is spent');
  assert.ok((run.match(/return runCraigslistRemovalQueue\(item, done\)/g) || []).length === 2, 'both verified-delete paths carry the deleted ids');
  const zero = run.indexOf('if (!ids.length && done.length) {'), skip = run.indexOf("const reason = ids.length ? 'ambiguous_duplicate_title' : 'listing_not_found';");
  assert.ok(zero > 0 && skip > zero && /report\('crossPlatformRemovalDeleted', item\)/.test(run.slice(zero, skip)));
  assert.ok(/crTitleMatches\(r, wanted, \{ exactOnly: true \}\)/.test(fnBody(CLR, 'crRemMoreDuplicates')));
  assert.ok(/doneIds: done/.test(run), 'the deleted ids survive a page change');
});

// ---------------------------------------------------------------------------- 10/12. Grailed
test('Grailed auto-publish: one click, then a wait for the submission; a retry only when nothing happened at all', () => {
  const fn = fnBody(GR, 'doGrailedAutoPublish');
  assert.ok(/for \(let attempt = 1; attempt <= 2; attempt\+\+\)/.test(fn));
  assert.ok(/if \(grPublishSubmitting\(publishBtn\)\) submitting = true;/.test(fn));
  assert.ok(/if \(submitting\) \{[\s\S]{0,200}publishRegistered = true;\s*break;/.test(fn), 'a started submission is never clicked again');
  assert.ok(!/await sleep\(900\);\s*if \(looksLikePhoneVerification\(\) \|\| !looksLikeListingForm\(\)\)/.test(fn));
  const conf = fnBody(GR, 'waitForGrailedPublishConfirmation');
  assert.ok(/grOnListingPage\(\)/.test(conf) && !/if \(!looksLikeListingForm\(\)\) return true;/.test(conf), 'the form vanishing alone is not a publish');
});
test('Grailed removal: exact title, the card must end at the price, a bare 404 is not "removed"', () => {
  const f = build(GR, ['grRemNorm', 'grTitleMatchesItem', 'grClassifyListingLookup'], {}, ['grTitleMatchesItem', 'grClassifyListingLookup']);
  assert.strictEqual(f.grTitleMatchesItem('Vintage Black T-Shirt XL', 'Black T-Shirt'), false);
  assert.strictEqual(f.grTitleMatchesItem('Black  T-Shirt', 'black t-shirt'), true);
  assert.strictEqual(f.grClassifyListingLookup(404, null, 5).kind, 'unknown');
  assert.strictEqual(f.grClassifyListingLookup(404, { error: { error_id: 'not_found' } }, 5).kind, 'removed', 'normal path: Grailed\'s own not_found');
  const qaList = [];
  const card = (id, text) => ({ getAttribute: () => '/listings/' + id, href: 'https://www.grailed.com/listings/' + id, textContent: '', closest: () => ({ textContent: text }) });
  const find = build(GR, ['grRemNorm', 'findGrailedListingMatchByTitle'], { qa: () => qaList }, ['findGrailedListingMatchByTitle']).findGrailedListingMatchByTitle;
  qaList.push(card('101', 'Active3 days agoNikemVintage Black T-Shirt XL$40Edit Listing'));
  assert.strictEqual(find('Black T-Shirt'), null);
  qaList.push(card('102', 'Active1 day agoNikemBlack T-Shirt$25Edit Listing'));
  assert.strictEqual(find('Black T-Shirt').id, '102', 'normal path: the card whose title ends at the price');
  assert.ok(/dupCheckFailed = true;/.test(GR) && /queued\.autoPublish !== false && !dupCheckFailed/.test(GR), 'a failed duplicate check never auto-publishes');
  assert.ok(/name\^="shipping\."\]\[name\$="\.enabled"\]/.test(GR) && /grIsDomesticToggle/.test(fnBody(GR, 'findRegionToggle')));
});

// ---------------------------------------------------------------------------- 11/22. Poshmark
test('Poshmark after reload: published only with closet evidence; otherwise the manual (ambiguous) path', () => {
  const st = POSH.slice(POSH.indexOf('let closetConfirmed = false;'), POSH.indexOf("code: 'publish_click_ambiguous'"));
  assert.ok(/else if \(!formBack\) \{[\s\S]{0,300}outcomeState = 'ready';/.test(st));
  const tb = st.slice(st.indexOf("if (outcomeState === 'timeout' && closetConfirmed) {"));
  assert.ok(tb.length > 0 && /fasPoshMarkListed\(/.test(tb));
  assert.ok(st.indexOf('fasPoshMarkListed(') > st.indexOf("if (outcomeState === 'timeout' && closetConfirmed) {"), 'no mark before the closet check');
});
test('Poshmark: a pickup-only skip advances and moves on like the prohibited skip; fragile chain clicks are capped; delete target is per item', () => {
  const pick = POSH.slice(POSH.indexOf('if (queued.item.localPickupOnly === true) {'), POSH.indexOf('const poshRestrictionReason = poshmarkRestrictionReason('));
  assert.ok(/await fasPoshAdvance\(queued\.item\.id, 'pickup_only'\);/.test(pick) && /await navigateToPoshmarkCreateListing\(\);/.test(pick));
  const frag = fnBody(POSH, 'dismissPoshmarkFragileModalIfPresent');
  assert.ok(/st\.innerDone \|\| st\.count >= POSH_FRAGILE_MAX_CLICKS/.test(frag) && /st\.clicked\.has\(btn\)/.test(frag));
  assert.ok(/targetItem === String\(item\.id\)/.test(POSH));
  assert.strictEqual((POSH.match(/sessionStorage\.setItem\('fasPoshDeleteTargetItem', String\(item\.id\)\)/g) || []).length, 3);
});

// ---------------------------------------------------------------------------- 13/14. renew + Craigslist resume
test('Facebook auto-renew: a price change is never a second listing and never forces auto-publish', () => {
  const fn = BG.slice(BG.indexOf('async function autoRenewDueItems('), BG.indexOf('async function autoRenewDueItems(') + 12000);
  assert.ok(!/fbQueue\.push\(buildRenewalQueueItem\(full, organizerEmail\)\)/.test(fn));
  assert.ok(/fbPriceChanged\.push\(full\.id\)/.test(fn) && /await checkPendingUpdates\(\)/.test(fn));
  assert.ok(!/fasAutoPublish: true/.test(fn));
});
test('Craigslist queue resume survives an idle worker: chrome.alarms, persisted, resumed on startup; no long in-memory sleep', () => {
  const net = BG.slice(BG.indexOf("if (platform === 'CRAIGSLIST' && didAdvanceHere"), BG.indexOf('async function fasClScheduleResume('));
  assert.ok(/await fasClScheduleResume\(tabId, /.test(net));
  assert.ok(!/await craigslistDelayWithOverlay\(/.test(net));
  assert.ok(/chrome\.alarms\.create\(FAS_CL_RESUME_ALARM, \{ when: resumeAt \}\)/.test(BG));
  assert.ok(/if \(alarm\.name === FAS_CL_RESUME_ALARM\) \{\s*await fasClResumeDue\(false\);/.test(BG));
  assert.ok(/chrome\.runtime\.onStartup\.addListener\(\(\) => \{ fasClResumeDue\(false\)/.test(BG));
  assert.ok(/!!\(st\.fasCraigslistResume && st\.fasCraigslistResume\.tabId != null\)/.test(BG), 'a pending resume still holds the Craigslist lock');
});
test('Craigslist publish: only a real confirmation counts (not "not a draft", not a phone wall, not generic phrases)', () => {
  const w = fnBody(CL, 'waitForCraigslistPublish');
  assert.ok(/if \(!stillDraft && isCraigslistPostedConfirmation\(\)\) \{ resolve\(true\); return; \}/.test(w));
  const c = fnBody(CL, 'isCraigslistPostedConfirmation');
  assert.ok(/if \(isCraigslistPhoneVerificationStep\(\)\) return false;/.test(c));
  assert.ok(!/'post another'|'edit your post'|'view posting'/.test(c) && /'thanks for posting'/.test(c));
});

// ---------------------------------------------------------------------------- 20. messages
test('Messages: nothing is answered once "You" replied last; handled messages are persisted; fuzzy matches never send', () => {
  const f = build(MSG, ['findLatestIncomingMessage'], {}, ['findLatestIncomingMessage']).findLatestIncomingMessage;
  const thread = (labels) => ({ querySelectorAll: () => labels.map((l) => ({ getAttribute: () => l })) });
  assert.strictEqual(f(thread(['Enter, Message sent 2:01 PM by Ann: Is this available?', 'Enter, Message sent 2:03 PM by You: Yes, it is!'])), null);
  const r = f(thread(['Enter, Message sent 2:03 PM by You: Yes', 'Enter, Message sent 2:05 PM by Ann: Would you take $20?']));
  assert.strictEqual(r.text, 'Would you take $20?', 'normal path: the buyer wrote last');
  assert.strictEqual(r.time, '2:05 PM');
  const scan = MSG.slice(MSG.indexOf('async function scan('));
  assert.ok(/if \(alreadyHandled\) \{/.test(scan));
  assert.ok(/res\.data\.autosend === true && !fuzzyMatch/.test(scan));
  assert.ok(scan.indexOf('await rememberHandled(handledKey);') < scan.indexOf('await attemptRealSend('));
});

// ---------------------------------------------------------------------------- 21. Mercari brand, other partials
test('Mercari brand: a requested brand that is not offered is left for the organizer, never "No brand"', () => {
  const fn = fnBody(MERC, 'fillMercariBrandFromSuggestedChip');
  const ret = fn.indexOf('return false;', fn.indexOf('if (value) {')), nb = fn.indexOf('const noBrandChip');
  assert.ok(ret > 0 && ret < nb);
  assert.ok(/const onListingsPage = \/\^\\\/mypage\\\/listings\\\/active\\\/\?\$\/\.test\(location\.pathname\);/.test(MERC), 'id capture only on the own listings page');
});
test('edit target: a saved id with an unreadable page id fails closed; a matching id still passes', () => {
  const C = require('../fas-edit-core.js');
  const it = { title: 'Brass Lamp', remoteListingId: 'https://www.facebook.com/marketplace/item/123456789/' };
  assert.strictEqual(C.editTargetCheck('FACEBOOK', it, '', 'Brass Lamp').code, 'remote_id_unknown');
  assert.strictEqual(C.editTargetCheck('FACEBOOK', it, '123456789', 'Brass Lamp').ok, true);
  assert.strictEqual(C.editTargetCheck('FACEBOOK', { title: 'Brass Lamp' }, '', 'Brass Lamp').ok, true, 'no saved id: the title decides as before');
});
test('Craigslist price edit: the dashboard cut must be the exact 70-character cut; a saved id turns the cut off', () => {
  assert.ok(/return !!\(c && w && w\.length > 70 && c === w\.slice\(0, 70\)\.trim\(\)\);/.test(ENG));
  assert.ok(/var clExactOnly = !!it\.remoteListingId;/.test(ENG));
});
test('worker partials: renew report only from the Renew All tab, failed /removed reports retried, the reliability net skips a just-reported item, FB pacing hold restamps', () => {
  const ra = BG.slice(BG.indexOf("msg.type === 'craigslistRenewAllFinished'"), BG.indexOf("msg.type === 'platformRestricted'"));
  assert.ok(ra.indexOf("error: 'not_renew_all_tab'") < ra.indexOf('reportItemListedOnce('));
  const del = BG.slice(BG.indexOf("msg.type === 'crossPlatformRemovalDeleted'"), BG.indexOf("msg.type === 'crossPlatformRemovalSkipped'"));
  assert.ok(/else await queuePendingRemovedReport\(msg\.itemId, msg\.platform\);/.test(del));
  assert.ok(/const prevAt = recentReports\[platform \+ ':' \+ prevQueued\.id\];/.test(BG));
  assert.ok(/fasQueueSetAt: Date\.now\(\) \+ Math\.max\(0, fbHourlyWaitMs\) \+ FACEBOOK_QUEUE_ADVANCE_DELAY_MS\.MAX/.test(BG));
});

test('changed files: no NUL bytes, and no em dash in any string added in 1.0.90', () => {
  const files = ['background.js', 'popup.js', 'fas-content.js', 'fas-selectors.js', 'fas-remove.js', 'fas-vinted.js', 'fas-craigslist.js',
    'fas-craigslist-removal-frame.js', 'fas-mercari.js', 'fas-gumtree-au.js', 'fas-grailed.js', 'fas-poshmark.js', 'fas-messages.js',
    'fas-edit-core.js', 'fas-edit-engine.js', 'manifest.json'];
  for (const f of files) {
    const s = read(f);
    assert.ok(s.indexOf('\u0000') === -1, f + ' has a NUL byte');
    s.split('\n').filter((l) => /1\.0\.90/.test(l)).forEach((l) => assert.ok(l.indexOf('—') === -1, f + ': ' + l.slice(0, 80)));
  }
  for (const fn of ['showUnconfirmedPublish']) assert.ok(fnBody(FB, fn).indexOf('—') === -1);
});
