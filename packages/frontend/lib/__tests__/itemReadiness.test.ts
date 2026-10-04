/**
 * computeItemReadiness: review queue readiness using the organizer-typed price (item editor unification, U5).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeItemReadiness,
  type ReadinessEditState,
  type ReadinessItem,
} from '../itemReadiness';

// Snapshot of the old computeReadiness in pages/organizer/add-items/[saleId]/review.tsx (item and edit state
// simplified to the fields it reads).
function legacyComputeReadiness(item: ReadinessItem, editState: ReadinessEditState, ebayConnected: boolean): 'red' | 'yellow' | 'green' | 'blue' {
  const title = editState.title || item.title || '';
  const price = editState.price || item.price || 0;
  const hasPhoto = (item.photoUrls?.length ?? 0) > 0;
  const category = editState.category || item.category || '';
  const condition = editState.condition || item.condition || '';
  const description = editState.description || item.description || '';
  const hasWeight = !!(editState.packageWeightOz || item.packageWeightOz);

  if (!title.trim() || price <= 0 || !hasPhoto) return 'red';
  if (!category || !condition || !description.trim()) return 'yellow';
  if (hasWeight && ebayConnected) return 'blue';
  return 'green';
}

const fullItem = (over: Partial<ReadinessItem> = {}): ReadinessItem => ({
  title: 'Brass lamp',
  price: 30,
  photoUrls: ['https://example.com/a.jpg'],
  category: 'Home',
  condition: 'USED',
  description: 'Works well',
  packageWeightOz: null,
  ...over,
});

const emptyEdit = (over: Partial<ReadinessEditState> = {}): ReadinessEditState => ({ ...over });

test('typed price above zero with everything else present is green', () => {
  assert.equal(computeItemReadiness(fullItem({ price: null }), emptyEdit(), '25', false), 'green');
});

test('a typed price counts even when the item has no stored price', () => {
  assert.equal(computeItemReadiness(fullItem({ price: null }), emptyEdit({ price: 0 }), '12.50', false), 'green');
});

test('a blank typed price is red even when the item holds a stored price', () => {
  assert.equal(computeItemReadiness(fullItem({ price: 30 }), emptyEdit({ price: 30 }), '', false), 'red');
  assert.equal(computeItemReadiness(fullItem({ price: 30 }), emptyEdit(), '   ', false), 'red');
});

test('zero, negative and unparseable typed prices are red', () => {
  for (const t of ['0', '-5', 'abc', '$', 'NaN', 0, -1, NaN]) {
    assert.equal(computeItemReadiness(fullItem(), emptyEdit(), t, false), 'red', String(t));
  }
});

test('the typed price overrides editState.price and item.price in both directions', () => {
  // stored price says fine, typed says none
  assert.equal(computeItemReadiness(fullItem({ price: 99 }), emptyEdit({ price: 99 }), '0', false), 'red');
  // stored price says none, typed says fine
  assert.equal(computeItemReadiness(fullItem({ price: 0 }), emptyEdit({ price: 0 }), '10', false), 'green');
});

test('numbers are accepted as the typed price', () => {
  assert.equal(computeItemReadiness(fullItem({ price: null }), emptyEdit(), 5, false), 'green');
});

test('undefined or null typed price falls back to the old rule (editState.price || item.price)', () => {
  assert.equal(computeItemReadiness(fullItem({ price: 30 }), emptyEdit(), undefined, false), 'green');
  assert.equal(computeItemReadiness(fullItem({ price: null }), emptyEdit({ price: 12 }), null, false), 'green');
  assert.equal(computeItemReadiness(fullItem({ price: null }), emptyEdit(), undefined, false), 'red');
});

test('red when the title is missing or blank, or there is no photo', () => {
  assert.equal(computeItemReadiness(fullItem({ title: '' }), emptyEdit(), '10', false), 'red');
  assert.equal(computeItemReadiness(fullItem({ title: '   ' }), emptyEdit(), '10', false), 'red');
  assert.equal(computeItemReadiness(fullItem({ photoUrls: [] }), emptyEdit(), '10', false), 'red');
  assert.equal(computeItemReadiness(fullItem({ photoUrls: undefined }), emptyEdit(), '10', false), 'red');
  assert.equal(computeItemReadiness(fullItem({ photoUrls: null }), emptyEdit(), '10', false), 'red');
});

test('edit state values take precedence over item values for the text fields', () => {
  assert.equal(computeItemReadiness(fullItem({ title: 'Old' }), emptyEdit({ title: '' }), '10', false), 'green');
  assert.equal(computeItemReadiness(fullItem({ title: '' }), emptyEdit({ title: 'New' }), '10', false), 'green');
});

test('yellow when category, condition or description is missing', () => {
  assert.equal(computeItemReadiness(fullItem({ category: '' }), emptyEdit(), '10', false), 'yellow');
  assert.equal(computeItemReadiness(fullItem({ category: null }), emptyEdit(), '10', false), 'yellow');
  assert.equal(computeItemReadiness(fullItem({ condition: '' }), emptyEdit(), '10', false), 'yellow');
  assert.equal(computeItemReadiness(fullItem({ description: '   ' }), emptyEdit(), '10', false), 'yellow');
  assert.equal(computeItemReadiness(fullItem({ description: null }), emptyEdit(), '10', false), 'yellow');
});

test('red outranks yellow: a missing price wins over a missing category', () => {
  assert.equal(computeItemReadiness(fullItem({ category: '' }), emptyEdit(), '', false), 'red');
});

test('blue needs a package weight and a connected eBay account', () => {
  assert.equal(computeItemReadiness(fullItem({ packageWeightOz: 16 }), emptyEdit(), '10', true), 'blue');
  assert.equal(computeItemReadiness(fullItem({ packageWeightOz: 16 }), emptyEdit(), '10', false), 'green');
  assert.equal(computeItemReadiness(fullItem(), emptyEdit(), '10', true), 'green');
  assert.equal(computeItemReadiness(fullItem(), emptyEdit({ packageWeightOz: 8 }), '10', true), 'blue');
});

test('parity: with the typed price omitted the result equals the old computeReadiness over a grid', () => {
  const titles = ['', 'Lamp'];
  const prices: Array<number | null> = [null, 0, 25];
  const photos = [[], ['p.jpg']];
  const cats = ['', 'Home'];
  const conds = ['', 'USED'];
  const descs = ['', ' ', 'Nice'];
  const weights: Array<number | null> = [null, 16];
  const editPrices: Array<number | undefined> = [undefined, 0, 40];
  let cases = 0;
  for (const title of titles) for (const price of prices) for (const photoUrls of photos)
    for (const category of cats) for (const condition of conds) for (const description of descs)
      for (const packageWeightOz of weights) for (const ep of editPrices) for (const ebay of [false, true]) {
        const item: ReadinessItem = { title, price, photoUrls, category, condition, description, packageWeightOz };
        const edit: ReadinessEditState = ep === undefined ? {} : { price: ep };
        assert.equal(computeItemReadiness(item, edit, undefined, ebay), legacyComputeReadiness(item, edit, ebay));
        cases += 1;
      }
  assert.equal(cases, 2 * 3 * 2 * 2 * 2 * 3 * 2 * 3 * 2);
});

test('parity: when the typed price equals editState.price || item.price the result equals the old rule', () => {
  for (const [ep, ip] of [[undefined, 30], [12, null], [0, 0], [undefined, null]] as Array<[number | undefined, number | null]>) {
    const item = fullItem({ price: ip });
    const edit: ReadinessEditState = ep === undefined ? {} : { price: ep };
    const effective = edit.price || item.price || 0;
    for (const ebay of [false, true]) {
      assert.equal(computeItemReadiness(item, edit, String(effective), ebay), legacyComputeReadiness(item, edit, ebay));
    }
  }
});
