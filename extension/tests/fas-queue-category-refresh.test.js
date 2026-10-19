const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// A queued item keeps what FindA.Sale computed when it was queued. freshenQueueItem re-reads the item before every run so a category rule,
// weight, kit list or quantity fixed afterwards reaches the run, while title and price stay as queued.
const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
function load(fresh, kit) {
  const fields = src.slice(src.indexOf('const FAS_FRESHEN_FIELDS'), src.indexOf('async function freshenQueueItem'));
  const fn = src.slice(src.indexOf('async function freshenQueueItem'), src.indexOf('async function apiFetch'));
  const apiFetch = async () => ({ ok: true, data: { items: fresh ? [fresh] : [] } });
  const self = { FAS_KIT: kit };
  return new Function('apiFetch', 'self', fields + fn + '; return freshenQueueItem;')(apiFetch, self);
}
const kit = { queueFields: (it) => ({ description: it.description + (it.kit ? '\n\nIncludes: x' : ''), quantity: it.qty, isKit: !!it.kit, kitComponents: [] }) };

test('overlays every marketplace category mapping, package fields, quantity and the kit description', async () => {
  const f = load({ id: 'a', title: 'NEW TITLE', price: 999, description: 'd', qty: 3, kit: true, mercariCategoryId: 2824, mercariCategoryPath: 'p', mercariCategorySource: 'RULE',
    poshmarkCategoryId: 'x', vintedCategoryId: 1, grailedCategoryId: 2, craigslistCategoryId: 'pta', packageWeightOz: 12 }, kit);
  const out = await f({ id: 'a', title: 'old', price: 10, mercariCategoryId: null, quantity: 1, description: 'old d' });
  assert.strictEqual(out.mercariCategoryId, 2824);
  assert.strictEqual(out.poshmarkCategoryId, 'x');
  assert.strictEqual(out.vintedCategoryId, 1);
  assert.strictEqual(out.grailedCategoryId, 2);
  assert.strictEqual(out.craigslistCategoryId, 'pta');
  assert.strictEqual(out.packageWeightOz, 12);
  assert.strictEqual(out.quantity, 3);
  assert.ok(out.description.includes('Includes:'));
});

test('title and price stay as queued', async () => {
  const f = load({ id: 'a', title: 'NEW', price: 999, description: 'd', qty: 1 }, kit);
  const out = await f({ id: 'a', title: 'old', price: 10 });
  assert.strictEqual(out.title, 'old');
  assert.strictEqual(out.price, 10);
});

test('a missing item or a failed read returns the stored item untouched', async () => {
  const stored = { id: 'a', title: 't', price: 5 };
  assert.deepStrictEqual(await load(null, kit)(stored), stored);
  assert.strictEqual(await load(null, kit)(null), null);
});

test('every channel that hands a queued item to a tab freshens it', () => {
  for (const q of ['fasQueue[fasIndex]', 'fasCraigslistQueue[', 'fasPoshmarkQueue[', 'fasMercariQueue[', 'fasVintedQueue[', 'fasGrailedQueue[', 'fasGumtreeAuQueue[']) {
    assert.ok(src.includes('freshenQueueItem(' + q), q + ' is not freshened');
  }
});
