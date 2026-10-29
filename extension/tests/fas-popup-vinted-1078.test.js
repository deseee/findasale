// 1.0.78 (owner report 2026-10-27 with a screenshot of the Vinted tab: "says draft waiting on vinted and can't click
// through it and it looks like shit now with all these different things.. the UI is so cluttered now").
// - A Vinted draft never blocks selection (no "Draft waiting on Vinted" mark, no disabled checkbox).
// - An item already live on Vinted stays selectable; ticking it shows one short line under the title.
// - The stacked hidden-item notices are one compact line, details behind "why?".
// - Popup copy has no em dashes.
// row() and hiddenSummary() are run from popup.js against small stubs (no browser needed).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const D = require('../fas-vinted-drafts.js');
const popup = rd('popup.js');

function topFn(src, name) {
  let i = src.indexOf('\nasync function ' + name + '(');
  if (i < 0) i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' not found');
  const oneLine = src.indexOf('\n', i + 1);
  const line = src.slice(i + 1, oneLine);
  if (/\}\s*$/.test(line) && line.split('{').length === line.split('}').length) return line;
  const end = src.indexOf('\n}\n', i + 1);
  return src.slice(i + 1, end + 2);
}

// A fake row element: enough DOM for row() (innerHTML, querySelector for the checkbox / note / Already posted? link).
function fakeEl() {
  const el = { html: '', onclick: null };
  const cb = { checked: false, onclick: null };
  const note = { hidden: true };
  Object.defineProperty(el, 'innerHTML', { set(v) { el.html = v; }, get() { return el.html; } });
  el.querySelector = (sel) => {
    if (sel === '.cb') return /<input type="checkbox" class="cb"/.test(el.html) ? cb : null;
    if (sel === '.postAgainNote') return /class="postAgainNote"/.test(el.html) ? note : null;
    if (sel === '.markPostedBtn') return /class="markPostedBtn"/.test(el.html) ? {} : null;
    return null;
  };
  el.cb = cb; el.note = note;
  return el;
}

function loadRow(opts) {
  const selected = new Set(opts.selected || []);
  const body = [
    'const VINTED_POST_AGAIN_NOTE = ' + JSON.stringify('Already on Vinted. Posting again makes a second listing.') + ';',
    topFn(popup, 'esc'), topFn(popup, 'channelName'), topFn(popup, 'vintedPresenceOf'), topFn(popup, 'vintedLiveOnVinted'),
    topFn(popup, 'row'),
    'return row;',
  ].join('\n');
  const CHANNEL_NAMES = { vinted: 'Vinted', facebook: 'Facebook', poshmark: 'Poshmark' };
  const env = {
    document: { createElement: () => fakeEl() },
    self: { FAS_VINTED_DRAFTS: D, FAS_KIT: { isKit: (it) => !!it.isKit, kitComponents: (it) => it.kitComponents || [], itemQuantity: (it) => it.quantity || 1 } },
    currentChannel: () => opts.channel || 'vinted',
    CHANNEL_NAMES,
    VINTED_PRESENT: opts.present || {},
    isPickupOnlyBlockedOnCurrentChannel: () => false,
    currentListedFlag: (it) => it.marketplaceListedVinted === true,
    isIneligibleOnCurrentChannel: () => false,
    ineligibleReason: () => '',
    eligibleNote: () => null,
    poshLabelAmountText: () => null,
    selected,
    sync: (id, on) => { on ? selected.add(id) : selected.delete(id); },
    markAlreadyPosted: () => {},
  };
  const row = new Function(...Object.keys(env), body)(...Object.values(env));
  return { row, selected };
}

const KIT = { id: 'kit1', title: 'Coin Tube Kit - 10 Penny, 10 Nickel, 10 Dime and 10 Quarter BCW Round Coin Tubes', price: 4.99, condition: 'New', quantity: 77, isKit: true, kitComponents: [{ title: 'BCW Penny Tube', quantity: 10 }] };

test('a draft no longer blocks selection: a 1.0.77 draft guard result or a recorded draft gives an enabled checkbox and no draft mark', () => {
  const { row, selected } = loadRow({ present: { kit1: { kind: 'draft', at: Date.now() } } });
  const d = row(KIT);
  assert.ok(!/ disabled/.test(d.html), 'checkbox is enabled');
  assert.ok(!/Draft waiting|draft/i.test(d.html.replace(/class="[^"]*"/g, '')), 'no draft mark');
  d.onclick({ target: {} });
  assert.ok(selected.has('kit1'), 'clicking the row selects it');
  // and the fill-time guard ignores drafts too
  const it = { itemId: 'kit1', title: KIT.title };
  assert.strictEqual(D.findAlreadyPresent([{ id: 9, title: KIT.title, is_draft: true }], it, [{ itemId: 'kit1', draftId: '9' }], {}), null);
});

test('a live item is selectable; ticking it shows the one-line post-again note, unticking hides it', () => {
  const { row, selected } = loadRow({ present: { kit1: { kind: 'live', remoteId: '7001', at: Date.now() } } });
  const d = row(KIT);
  assert.ok(!/ disabled/.test(d.html), 'checkbox is enabled');
  assert.ok(/<span class="badge badge-live"[^>]*>On Vinted<\/span>/.test(d.html), 'small live badge');
  assert.ok(d.note.hidden, 'note hidden until ticked');
  d.onclick({ target: {} });
  assert.ok(selected.has('kit1'));
  assert.strictEqual(d.note.hidden, false);
  assert.ok(/>Already on Vinted\. Posting again makes a second listing\.</.test(d.html));
  d.cb.checked = false; d.cb.onclick({ stopPropagation() {} });
  assert.ok(!selected.has('kit1'));
  assert.strictEqual(d.note.hidden, true);
});

test('row layout: the title has its own line; meta, badges and "Already posted?" share the line below it', () => {
  const { row } = loadRow({ present: { kit1: { kind: 'live', remoteId: '7001', at: Date.now() } } });
  const h = row(KIT).html;
  const t = h.indexOf('<div class="t"'), sub = h.indexOf('<div class="sub">'), kit = h.indexOf('>KIT<'), link = h.indexOf('class="markPostedBtn"'), meta = h.indexOf('<div class="meta">');
  assert.ok(meta >= 0 && meta < t && t < sub && sub < kit && kit < link, 'title first, then the meta line with badges and the link');
  assert.ok(/<span class="facts">\$4\.99 · New · qty 77<\/span>/.test(h));
  assert.ok(h.indexOf('class="cb"') > h.lastIndexOf('</div>'), 'checkbox stays at the row end, outside the text column');
  const css = rd('popup.css');
  assert.ok(/\.item \.sub \{ display: flex; flex-wrap: wrap;/.test(css));
  assert.ok(/\.item \.markPostedBtn \{[^}]*border: none;/.test(css), '"Already posted?" is a text link, not a bordered button');
  assert.ok(/\.item \.t \{ display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/.test(css), 'title: one full-width line, full title on hover');
  assert.ok(/<div class="t" title="Coin Tube Kit/.test(h));
  assert.ok(/<span class="kitline" title="[^"]*">Includes: 10 x BCW Penny Tube<\/span><\/div>/.test(h), 'kit list ends the meta line');
});

test('height budget: footer links share one row, "Post to" is inline, XP and Hunt Pass share one line; nothing removed', () => {
  const html = rd('popup.html'), css = rd('popup.css');
  const links = html.slice(html.indexOf('<div class="footerLinks">'), html.indexOf('</footer>'));
  ['clPostNote', 'gtPostNote', 'poshPostNote', 'mercPostNote', 'vintedPostNote', 'grailedPostNote', 'fbPublishNote', 'footerSettings', 'clLoginNote', 'gtLoginNote', 'autoRenew', 'hideFromFriends', 'pauseList', 'autoRemoveMode', 'resyncListingsBtn']
    .forEach((id) => assert.ok(links.indexOf(id) !== -1, id + ' kept in the footer'));
  assert.ok(/\.footerLinks \{ display: flex; flex-wrap: wrap;/.test(css));
  assert.ok(/\.footerLinks > details\[open\] \{ flex-basis: 100%; order: 2; \}/.test(css), 'an opened link takes the full width');
  assert.ok(/\.channelRow \{ display: flex; align-items: center;/.test(css));
  assert.ok(/\.guildBar \{ flex-direction: row;/.test(css));
  assert.ok(/id="guildHuntPass"/.test(html) && /id="paceHint"/.test(html) && /id="autoPublishRow"/.test(html));
  assert.ok(/body > \*:not\(\.list\) \{ flex-shrink: 0; \}/.test(css) && /\.list \{ overflow-y: auto; flex: 1 1 auto;/.test(css), 'the list is the only region that flexes');
});

test('the single notice line renders the counts; details sit behind "why?"', () => {
  const fn = new Function(topFn(popup, 'hiddenSummary') + '\nreturn hiddenSummary;')();
  const s = fn({ ineligible: 10, pickup: 17, live: 3, channel: 'Vinted' });
  assert.strictEqual(s.line, '27 hidden: 10 not eligible, 17 pickup only. 3 already on Vinted.');
  assert.strictEqual(s.why.length, 3);
  assert.ok(/Select all leaves them out\. Tick one yourself to post it again; that makes a second listing\./.test(s.why[2]));
  assert.strictEqual(fn({ ineligible: 0, pickup: 1, live: 0, channel: 'Vinted' }).line, '1 hidden: 1 pickup only.');
  assert.strictEqual(fn({ ineligible: 0, pickup: 0, live: 1, channel: 'Vinted' }).line, '1 already on Vinted.');
  assert.strictEqual(fn({ ineligible: 0, pickup: 0, live: 0, channel: 'Vinted' }), null);
  const html = rd('popup.html');
  assert.ok(/<details id="hiddenSummary" class="note hiddenSummary" hidden><summary><span id="hiddenSummaryLine"><\/span> <span class="why">why\?<\/span><\/summary>/.test(html));
  assert.ok(/renderHiddenSummary\(\{\n    ineligible:/.test(popup));
});

test('popup copy: no em dashes, no "AI", and no draft concept', () => {
  const html = rd('popup.html');
  assert.ok(!/—|&mdash;|&#8212;|\\u2014/.test(html), 'popup.html has an em dash');
  // popup.js user-facing strings: strip comments, then look for an em dash in what is left.
  const code = popup.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '')).join('\n');
  assert.ok(!/—|&mdash;|\\u2014/.test(code), 'popup.js copy has an em dash');
  const text = html.replace(/<[^>]+>/g, ' ');
  assert.ok(!/\bAI\b/.test(text) && !/'[^'\n]*\bAI\b[^'\n]*'/.test(code));
  assert.ok(!/waiting there as a draft|Draft waiting/.test(html + code));
});
