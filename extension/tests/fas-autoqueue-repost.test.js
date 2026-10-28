// 1.0.73 (2026-10-27, Patrick: "can the auto queue auto repost items with multiple qty but only to the sites like vinted and the
// others where they don't have a qty available?"). The server decides (packages/backend/src/services/singleUnitRepost.ts) and
// marks such queue entries repostAfterSale; the extension stores them like any entry, logs them, and never makes copies.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const bg = rd('background.js');

test('the auto queue logs entries the server marked repostAfterSale and counts them in the poll outcome', () => {
  assert.ok(/q\.repostAfterSale === true/.test(bg));
  assert.ok(/'autoqueue_repost_after_sale'/.test(bg));
  assert.ok(/'_reposts_' \+ reposts\.length/.test(bg));
});

test('queue entries are stored with every server field kept (repostAfterSale and stockRemaining survive the kit normalization)', () => {
  assert.ok(/items\.map\(\(q\) => Object\.assign\(\{\}, q, self\.FAS_KIT\.queueFields\(q\)\)\)/.test(bg));
  const ctx = { self: {} };
  vm.createContext(ctx);
  vm.runInContext(rd('config.js'), ctx);
  assert.ok(ctx.self.FAS_KIT, 'config.js defines FAS_KIT');
  const q = { id: 'i1', title: 'Mannequin clamp stand', description: 'd', stockRemaining: 4, repostAfterSale: true };
  const stored = Object.assign({}, q, ctx.self.FAS_KIT.queueFields(q));
  assert.strictEqual(stored.repostAfterSale, true);
  assert.strictEqual(stored.quantity, 4);
});

test('Vinted still has no auto queue (drafts only, no repost automation on Vinted)', () => {
  const m = bg.match(/const FAS_AUTOLIST_QUEUE_CFG = \{([\s\S]*?)\n\};/);
  assert.ok(m);
  assert.ok(!/VINTED\s*:/.test(m[1]));
  assert.ok(!/repost/i.test(rd('fas-vinted.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')));
});

test('the duplicate-listing guard still runs before a Mercari or Grailed fill (one live listing at a time)', () => {
  for (const f of ['fas-mercari.js', 'fas-grailed.js']) assert.ok(/type: 'checkItemListedStatus'/.test(rd(f)), f);
});

test('manifest is 1.0.80', () => {
  assert.strictEqual(JSON.parse(rd('manifest.json')).version, '1.0.80');
});

test('Mercari cap (1.0.73): the limit report carries the number for the server, and the poll logs the server note', () => {
  const m = rd('fas-mercari.js');
  assert.ok(/code: 'mercari_listing_limit'[^\n]*ctx: \{ cap: Number\(capM\[1\]\) \}/.test(m));
  assert.ok(/resp\.data\.notes && resp\.data\.notes\.MERCARI/.test(bg));
  assert.ok(/'mercari_listing_cap'/.test(bg));
});
