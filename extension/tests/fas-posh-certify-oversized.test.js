// 1.0.71 (2026-10-27, Patrick): FindA.Sale never clicks inside Poshmark's flag dialog. The 1.0.69/1.0.70 auto-certify
// ("Not oversized, certify and post") is gone, and so is the 1.0.59 retry ladder (shorter description, first photo only).
// On the FIRST flag the full form and Poshmark's box ("Delete Listing" / "Publish Listing") are left for the organizer.
// If they click Publish Listing, the closet check records the item as listed with its Poshmark id, in the same page or
// after Poshmark navigates away (sessionStorage hold marker). File name kept from 1.0.69 so the suite list stays stable.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const bg = rd('background.js');
const posh = rd('fas-poshmark.js');

function extract(src, name) {
  let i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let depth = 0;
  const j = src.indexOf('{', src.indexOf(')', i));
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}

const ITEM = { id: 'cmuobqqyg00g1qcr4e3qyxnk3', title: 'Mugig guitar cable', description: 'A'.repeat(181), photoUrls: ['a', 'b', 'c'] };

// A fake Poshmark oversized dialog whose two buttons record any click.
function fakeDialog() {
  const clicks = [];
  const mk = (label) => ({ textContent: label, offsetParent: {}, disabled: false, click() { clicks.push(label); }, dispatchEvent() { clicks.push(label); return true; } });
  return { clicks, buttons: [mk('Delete Listing'), mk('Publish Listing')] };
}

function holdHarness({ formGoneAfter, closetLive, pressSkipAfter }) {
  const dlg = fakeDialog();
  const els = {};
  const realClicks = [];
  let sleeps = 0;
  const env = {
    overlay: () => { els['fas-posh-skip'] = { onclick: null }; els['fas-posh-close'] = { onclick: null }; },
    button: (id, label) => '<button id="' + id + '">' + label + '</button>',
    escapeHtml: (s) => String(s),
    document: { getElementById: (id) => els[id] || null, querySelectorAll: () => dlg.buttons },
    tInfo: () => {}, tWarn: () => {},
    sleep: async () => { sleeps++; if (pressSkipAfter && sleeps === pressSkipAfter && els['fas-posh-skip'].onclick) els['fas-posh-skip'].onclick(); },
    looksLikeSellForm: () => !(formGoneAfter && sleeps >= formGoneAfter),
    POSH_LABEL_COSTS_TEXT: 'label costs',
    fasPoshClosetDupCheck: async () => ({ state: closetLive ? 'dup' : 'clear' }),
    realClick: (b) => { realClicks.push(b && b.textContent); if (b && b.click) b.click(); },
    bar: null,
  };
  const names = Object.keys(env);
  const fn = new Function(...names, 'return (' + extract(posh, 'holdForPoshmarkFlagDecision') + ');')(...names.map((k) => env[k]));
  return { fn, dlg, realClicks };
}

test('the auto-certify path is gone from the extension', () => {
  for (const s of ['poshShouldAutoCertify', 'findPoshmarkCertifyButton', 'poshIsCertifyButtonText', 'poshCertifyOversizedListing', 'poshReadCertifyStore', 'certifyOversizedIds', 'POSH_CERTIFY_STORE_KEY', 'certified_oversized']) {
    assert.ok(!posh.includes(s), 'fas-poshmark.js still has ' + s);
    assert.ok(!bg.includes(s), 'background.js still has ' + s);
  }
  assert.ok(!bg.includes('fasPoshCertifyStore'));
  // The only remaining mention of the old store is its one-time cleanup.
  assert.deepStrictEqual(bg.match(/fasPoshCertifyOk/g), ['fasPoshCertifyOk']);
  assert.ok(/chrome\.storage\.local\.remove\('fasPoshCertifyOk'\)/.test(bg));
});

test('the 1.0.59 retry ladder is gone: the form keeps the full description and every photo', () => {
  for (const s of ['POSH_FLAG_RETRY_KEY', 'poshFlagRetryState', 'poshShortDescription', "'flag_retry'", 'flag_retry_photos', 'flag_retry_variant', 'flag_retry_failed', 'nextStage', 'Published after retrying']) {
    assert.ok(!posh.includes(s), 'still has ' + s);
  }
  assert.ok(/const photosOk = await injectPhotos\(item\.photoUrls\);/.test(posh));
  assert.ok(/let poshDescription = String\(item\.description == null \? '' : item\.description\)\.trim\(\);\n    if \(!poshDescription\)/.test(posh));
});

test('the flag branch holds on the FIRST flag: no navigation, no click, marker written, then the hold', () => {
  const i = posh.indexOf("writePoshFlagHoldState(item.id, flagKind);");
  assert.ok(i > 0);
  const start = posh.lastIndexOf('if (flagText) {', i);
  const end = posh.indexOf('holdForPoshmarkFlagDecision(item, flagKind, index, total)', i);
  assert.ok(start > 0 && end > i);
  const seg = posh.slice(start, end);
  assert.ok(!/navigateToPoshmarkCreateListing|realClick|\.click\(/.test(seg));
  assert.ok(/flagOnly: true/.test(seg));
});

test('no code path clicks a Publish Listing / Certify / Delete Listing control inside a dialog', () => {
  assert.ok(!/Certify Listing['"]?\)?\s*\.click|realClick\([^)]*[Cc]ertify/.test(posh));
  for (const name of ['holdForPoshmarkFlagDecision', 'poshResolveFlagHoldAfterReload']) {
    const body = extract(posh, name);
    assert.ok(!/realClick|\.click\(|dispatchEvent/.test(body), name + ' must not click anything');
  }
  // Text matchers for those buttons would only exist to click them.
  assert.ok(!/=== 'publish listing'|\/\^certify/.test(posh));
});

test('hold: organizer presses Skip -> skip; the dialog buttons are never clicked', async () => {
  const h = holdHarness({ pressSkipAfter: 3 });
  assert.strictEqual(await h.fn(ITEM, 'oversized', 0, 3), 'skip');
  assert.deepStrictEqual(h.dlg.clicks, []);
  assert.deepStrictEqual(h.realClicks, []);
});

test('hold: organizer clicks Publish Listing themselves (form goes, item live) -> published; extension clicked nothing', async () => {
  const h = holdHarness({ formGoneAfter: 2, closetLive: true });
  assert.strictEqual(await h.fn(ITEM, 'oversized', 0, 1), 'published');
  assert.deepStrictEqual(h.dlg.clicks, []);
  assert.deepStrictEqual(h.realClicks, []);
});

test('hold: organizer clicks Delete Listing (form goes, nothing live) -> skip; extension clicked nothing', async () => {
  const h = holdHarness({ formGoneAfter: 2, closetLive: false });
  assert.strictEqual(await h.fn(ITEM, 'prohibited', 1, 3), 'skip');
  assert.deepStrictEqual(h.dlg.clicks, []);
});

test('a hold that resolves as published goes on to the normal record path (POSTED with the Poshmark id)', () => {
  const i = posh.indexOf("tOk('You clicked Publish Listing on Poshmark and it went live');");
  assert.ok(i > 0);
  const rest = posh.slice(i);
  const rec = rest.indexOf('const postedRef = await fasPoshCaptureFromCloset(item, await fasListingRef(\'POSHMARK\', 3000));');
  const mark = rest.indexOf('await fasPoshMarkListed(item.id, postedRef);');
  assert.ok(rec > 0 && mark > rec);
  // The published branch only sets the flag; the following "if (!published)" is skipped and the record path runs.
  const branch = rest.slice(0, rest.indexOf("} else if (decision === 'skip')"));
  assert.ok(!/\breturn;/.test(branch));
});

test('oversized hold copy (1.0.72): under 10 lb + Priority Mail box confirm, label costs, second confirm box, Skip; prohibited copy kept', () => {
  const body = extract(posh, 'holdForPoshmarkFlagDecision');
  assert.ok(!/out of date/.test(body), 'never tells people to ignore Poshmark\'s 10 lb confirmation');
  assert.ok(/Poshmark\\'s listing screen asks you to confirm the item is under 10 lb and fits a Priority Mail box\./.test(body));
  assert.ok(/Over 5 lb, the label upgrade costs come out of your earnings \(\$5 for 5-10 lb\)\./.test(body));
  assert.ok(/labels up to 15 lb \(\$10 for 10-15 lb\), but its listing screen still says 10 lb, so only confirm if the item really is under 10 lb\./.test(body));
  assert.ok(/click <b>Publish Listing<\/b> in Poshmark\\'s box\. Poshmark then asks you to confirm in a second box; click <b>Publish<\/b> there\. That is your own statement to Poshmark, so FindA\.Sale never clicks it for you\. Otherwise click Skip\./.test(body));
  assert.ok(/click <b>Publish Listing<\/b> \(or <b>Certify Listing<\/b>\) in Poshmark\\'s box/.test(body), 'prohibited wording kept');
  assert.ok(!/Not oversized, certify and post/.test(posh));
  assert.ok(!/If the item weighs under 10 lb/.test(posh));
  assert.ok(!/10 lb max, but that is out of date/.test(posh));
});

// ---- the after-navigation resolver
function resolveHarness({ live, pathname }) {
  const calls = { marked: [], advanced: [], nav: 0, cleared: 0 };
  const env = {
    sleep: async () => {},
    tStep: () => {}, tOk: () => {}, tInfo: () => {}, tWarn: () => {}, tEnd: () => {},
    overlay: () => {}, overlayWarn: () => {}, button: () => '', escapeHtml: (s) => String(s), closeBtnHandler: () => {}, humanPause: async () => {},
    document: { getElementById: () => null },
    fasPoshClosetDupCheck: async () => (live ? { state: 'dup', live: [{ id: 'p1' }], truncated: false } : { state: 'clear' }),
    self: { FAS_LISTING_REF: { pickPostedListing: () => ({ ref: { remoteListingId: '6a1b2c3d4e5f60718293a4b5', remoteListingUrl: 'https://poshmark.com/listing/x-6a1b2c3d4e5f60718293a4b5' } }) } },
    fasListingRef: async () => ({}),
    fasPoshMarkListed: async (id, ref) => { calls.marked.push({ id, ref }); },
    fasPoshAdvance: async (id, skipped) => { calls.advanced.push({ id, skipped: skipped || null }); },
    clearPoshFlagHoldState: () => { calls.cleared++; }, clearPoshPublishAttemptState: () => {}, clearPoshNavRetryState: () => {},
    navigateToPoshmarkCreateListing: async () => { calls.nav++; },
    location: { pathname },
    poshLabelInfoFor: () => ({ surchargeUsd: 10, fullLabelCost: false, weightLb: 11.1, source: 'organizer' }),
    poshLabelRunNote: () => 'Poshmark will deduct $10.00 from your earnings for the heavier label (11.1 lb).',
    chrome: { runtime: { sendMessage: async (m) => { calls.notes = (calls.notes || []).concat([m]); } } },
  };
  const names = Object.keys(env);
  const fn = new Function(...names, 'return (' + extract(posh, 'poshResolveFlagHoldAfterReload') + ');')(...names.map((k) => env[k]));
  return { fn, calls };
}

test('after Poshmark navigates away: live in the closet -> recorded as listed with its remote id, queue advances', async () => {
  const h = resolveHarness({ live: true, pathname: '/listing/x-6a1b2c3d4e5f60718293a4b5' });
  assert.strictEqual(await h.fn({ item: ITEM, index: 0, total: 2, autoPublish: true }, { id: ITEM.id, kind: 'oversized' }), true);
  assert.deepStrictEqual(h.calls.marked, [{ id: ITEM.id, ref: { remoteListingId: '6a1b2c3d4e5f60718293a4b5', remoteListingUrl: 'https://poshmark.com/listing/x-6a1b2c3d4e5f60718293a4b5' } }]);
  assert.deepStrictEqual(h.calls.advanced, [{ id: ITEM.id, skipped: null }]);
  assert.strictEqual(h.calls.nav, 1);
  assert.deepStrictEqual(h.calls.notes, [{ type: 'recordPoshmarkRunNote', title: ITEM.title, note: 'Poshmark will deduct $10.00 from your earnings for the heavier label (11.1 lb).' }]);
});

test('after Poshmark navigates away: not live -> skipped (never re-filled), not marked listed', async () => {
  const h = resolveHarness({ live: false, pathname: '/closet/someone' });
  assert.strictEqual(await h.fn({ item: ITEM, index: 0, total: 1, autoPublish: true }, { id: ITEM.id, kind: 'oversized' }), true);
  assert.deepStrictEqual(h.calls.marked, []);
  assert.deepStrictEqual(h.calls.advanced, [{ id: ITEM.id, skipped: 'flag_oversized' }]);
});

test('a fresh create-listing form with nothing live (reload or "Try again") fills normally', async () => {
  const h = resolveHarness({ live: false, pathname: '/create-listing' });
  assert.strictEqual(await h.fn({ item: ITEM, index: 0, total: 1, autoPublish: true }, { id: ITEM.id, kind: 'oversized' }), false);
  assert.deepStrictEqual(h.calls.advanced, []);
  assert.strictEqual(h.calls.cleared, 1);
});

test('start() settles a held item before anything else, and the hold marker is short-lived and per item', () => {
  const st = extract(posh, 'start');
  const a = st.indexOf('const flagHold = readPoshFlagHoldState(queued.item.id);');
  assert.ok(a > 0 && a < st.indexOf("const gk = 'fasPoshAutoNav'"));
  const holdFor = new Function('const POSH_FLAG_HOLD_TTL_MS = 30 * 60 * 1000;\n' + extract(posh, 'poshFlagHoldFor') + '\nreturn poshFlagHoldFor;')();
  const now = 1_800_000_000_000;
  assert.ok(holdFor(JSON.stringify({ id: ITEM.id, kind: 'oversized', at: now - 60000 }), ITEM.id, now));
  assert.strictEqual(holdFor(JSON.stringify({ id: 'other', at: now }), ITEM.id, now), null);
  assert.strictEqual(holdFor(JSON.stringify({ id: ITEM.id, at: now - 31 * 60000 }), ITEM.id, now), null);
  assert.strictEqual(holdFor('not json', ITEM.id, now), null);
  assert.strictEqual(holdFor(null, ITEM.id, now), null);
});

test('popup: an eligible item can carry a non-blocking note (Poshmark label cost) shown as a badge with the amount, never a block', () => {
  const popup = rd('popup.js');
  const fn = extract(popup, 'eligibleNote');
  assert.ok(/e\.eligible !== false && typeof e\.note === 'string'/.test(fn));
  assert.ok(/\(!ineligible && eligibleNote\(it\) \? '<span class="badge" title="' \+ esc\(eligibleNote\(it\)\) \+ '">' \+ \(currentChannel\(\) === 'poshmark' && poshLabelAmountText\(it\) \? 'LABEL ' \+ esc\(poshLabelAmountText\(it\)\) : 'NOTE'\) \+ '<\/span>' : ''\)/.test(popup));
});
