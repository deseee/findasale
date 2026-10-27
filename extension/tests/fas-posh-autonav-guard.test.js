// 1.0.68 (2026-10-26 live run): a pending auto-queue item was handed to /feed and failed with form_not_found; that failure then
// counted toward the 3-tries guard, and a guard skip stalled the run. Also: the certify hold timeout skips cleanly.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const posh = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');

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
const nav = new Function('POSH_NAV_BOUNCE_WINDOW_MS', extract(posh, 'poshShouldAutoNavToCreate') + '\nreturn poshShouldAutoNavToCreate;')(20000);
const NOW = 1e12;

test('manifest is 1.0.69', () => {
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).version, '1.0.69');
});

test('a pending item on /feed or a closet page navigates to create-listing once', () => {
  assert.strictEqual(nav('/feed', null, 'a', NOW, null), true);
  assert.strictEqual(nav('/closet/someone', null, 'a', NOW, null), true);
  assert.strictEqual(nav('/listing/abc', null, 'a', NOW, null), true);
});
test('no navigation on create-listing, edit, login or verification pages', () => {
  assert.strictEqual(nav('/create-listing', null, 'a', NOW, null), false);
  assert.strictEqual(nav('/create-listing/step2', null, 'a', NOW, null), false);
  assert.strictEqual(nav('/edit-listing/123', null, 'a', NOW, null), false);
  assert.strictEqual(nav('/login', null, 'a', NOW, null), false);
});
test('only once per item (3 minutes); a new item or an old guard may navigate; an in-flight bounce retry is left alone', () => {
  assert.strictEqual(nav('/feed', { id: 'a', at: NOW - 1000 }, 'a', NOW, null), false);
  assert.strictEqual(nav('/feed', { id: 'a', at: NOW - 1000 }, 'b', NOW, null), true);
  assert.strictEqual(nav('/feed', { id: 'a', at: NOW - 4 * 60e3 }, 'a', NOW, null), true);
  assert.strictEqual(nav('/feed', null, 'a', NOW, { ts: NOW - 2000, attempt: 0 }), false);
});
test('start() runs the navigation before the item is handed to run(), and it does not touch the fill-start counter', () => {
  const s = posh.slice(posh.indexOf('async function start()'));
  const navAt = s.indexOf('poshShouldAutoNavToCreate(location.pathname');
  assert.ok(navAt > 0 && navAt < s.indexOf('await run(queued.item'));
  const block = s.slice(navAt, navAt + 900);
  assert.ok(!/fasPoshFillStarts/.test(block));
  assert.ok(/location\.href = POST_URL_HINT/.test(block));
});

test('the 3-tries counter is pushed only after the form is ready, not before waitForFormReady', () => {
  const r = posh.slice(posh.indexOf('async function run(item'), posh.indexOf('async function start()'));
  const pushes = r.split('starts.push(').length - 1 + r.split('st.push(').length - 1;
  assert.strictEqual(pushes, 1);
  assert.ok(r.indexOf('st.push(') > r.indexOf('tOk(\'Listing form is ready\')'));
  assert.ok(r.indexOf('st.push(') < r.indexOf('await fillListing(item)'));
  assert.ok(!/starts\.push\(/.test(r));
});
test('a guard skip advances the queue with a reason and moves on instead of stalling', () => {
  const r = posh.slice(posh.indexOf("code: 'poshmark_fill_loop'"), posh.indexOf("tStep('Opening the listing form'"));
  assert.ok(/fasPoshAdvance\(item\.id, 'fill_loop'\)/.test(r));
  assert.ok(/navigateToPoshmarkCreateListing\(\)/.test(r));
  assert.ok(!/markListed|fasPoshMarkListed/.test(r));
});

test('certify hold: names the waiting item, and a 10 minute timeout always skips (advances) rather than stalling', () => {
  const h = extract(posh, 'holdForPoshmarkFlagDecision');
  assert.ok(/flag_hold_waiting/.test(h) && /flag_hold_timeout/.test(h));
  assert.ok(/return decision \|\| 'skip';/.test(h));
  assert.ok(!/click\(\)/.test(h)); // never clicks Certify
  const i = posh.indexOf("decision === 'skip'");
  const seg = posh.slice(i, i + 900);
  assert.ok(/fasPoshAdvance\(item\.id/.test(seg) && /navigateToPoshmarkCreateListing\(\)/.test(seg));
});
