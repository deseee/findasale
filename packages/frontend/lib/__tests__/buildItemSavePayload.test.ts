/**
 * Golden tests for buildItemSavePayload (item editor unification, U5).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 *
 * The extraction must produce a payload identical to the old closure in edit-item/[id].tsx for the same
 * inputs. `legacyBuildSavePayload` below is a copy of that closure (comments removed, closed-over state
 * turned into parameters) so the new function is compared against the real original over a grid of
 * inputs, in addition to the explicit literal expectations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildItemSavePayload,
  type ItemFormData,
  type ItemSaveState,
  type ItemSaveTouched,
} from '../buildItemSavePayload';

// ---------------------------------------------------------------------------------------------
// Snapshot of the old closure
// ---------------------------------------------------------------------------------------------
function legacyBuildSavePayload(
  formData: ItemFormData,
  quantityText: string,
  stockTotalText: string,
  weightTouched: boolean,
  shippingTouched: boolean,
  consignorTouched: boolean,
) {
  const parseCount = (text: string): number => Math.max(1, parseInt(text, 10) || 1);
  const toIntOrNull = (v: string) => {
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const price = parseFloat(String(formData.price)) || 0;
  const acceptPct = typeof formData.bestOfferAcceptPct === 'number' ? formData.bestOfferAcceptPct : null;
  const declinePct = typeof formData.bestOfferDeclinePct === 'number' ? formData.bestOfferDeclinePct : null;
  const payload = {
    ...formData,
    quantity: parseCount(quantityText),
    stockTotal: parseCount(stockTotalText),
    packageWeightOz: weightTouched ? toIntOrNull(formData.packageWeightOz) : undefined,
    ...(weightTouched && toIntOrNull(formData.packageWeightOz) !== null
      ? { packageConfirmedByOrganizer: true, packageEstimateSource: 'ORGANIZER' }
      : {}),
    packageLengthIn: weightTouched ? toIntOrNull(formData.packageLengthIn) : undefined,
    packageWidthIn: weightTouched ? toIntOrNull(formData.packageWidthIn) : undefined,
    packageHeightIn: weightTouched ? toIntOrNull(formData.packageHeightIn) : undefined,
    allowBestOffer: formData.allowBestOffer,
    bestOfferAutoAcceptAmt: formData.allowBestOffer && acceptPct !== null && price > 0
      ? parseFloat((price * (1 - acceptPct / 100)).toFixed(2))
      : null,
    bestOfferMinimumAmt: formData.allowBestOffer && declinePct !== null && price > 0
      ? parseFloat((price * (1 - declinePct / 100)).toFixed(2))
      : null,
    excludeFromMarkdown: formData.excludeFromMarkdown,
    ebayShippingOverride: formData.ebayShippingOverride || null,
    ebayFulfillmentPolicyOverrideId: formData.ebayFulfillmentPolicyOverrideId || null,
    shippingAvailable: shippingTouched ? formData.shippingAvailable : undefined,
    shippingPrice: shippingTouched
      ? (formData.shippingPrice ? parseFloat(formData.shippingPrice) : null)
      : undefined,
    crosslisterFreeShipping: formData.crosslisterFreeShipping,
    auctionEndTime: formData.auctionEndTime ? new Date(formData.auctionEndTime).toISOString() : null,
    bestOfferAcceptPct: undefined,
    bestOfferDeclinePct: undefined,
    consignorId: consignorTouched ? (formData.consignorId || null) : undefined,
  };
  return payload;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function baseForm(over: Partial<ItemFormData> = {}): ItemFormData {
  return {
    title: 'Oak side table',
    description: 'Solid oak, minor wear',
    price: '45',
    quantity: 1,
    stockTotal: 1,
    category: 'Furniture',
    ebayCategoryId: '',
    ebayCategoryName: '',
    condition: 'USED',
    conditionGrade: 'B',
    tags: ['oak', 'vintage'],
    status: 'AVAILABLE',
    listingType: 'FIXED',
    auctionEndTime: '',
    qrEmbedEnabled: true,
    isLegendary: false,
    tagColor: '',
    locationId: null,
    costBasis: '',
    roomTag: '',
    packageWeightOz: '',
    packageLengthIn: '',
    packageWidthIn: '',
    packageHeightIn: '',
    packageType: '',
    shippingAvailable: false,
    shippingPrice: '',
    crosslisterFreeShipping: false,
    brand: '',
    size: '',
    color: '',
    material: '',
    upc: '',
    mpn: '',
    isbn: '',
    fccId: '',
    allowBestOffer: false,
    excludeFromMarkdown: false,
    bestOfferAcceptPct: '',
    bestOfferDeclinePct: '',
    ebayShippingOverride: null,
    consignorId: '',
    ebayFulfillmentPolicyOverrideId: null,
    ...over,
  };
}

const NONE: ItemSaveTouched = { weightTouched: false, shippingTouched: false, consignorTouched: false };
const ALL: ItemSaveTouched = { weightTouched: true, shippingTouched: true, consignorTouched: true };

function stateOf(formData: ItemFormData, quantityText = '1', stockTotalText = '1'): ItemSaveState {
  return { formData, quantityText, stockTotalText };
}

/** What actually goes over the wire (undefined keys dropped). */
function wire(payload: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload));
}

function legacyOf(s: ItemSaveState, t: ItemSaveTouched) {
  return legacyBuildSavePayload(s.formData, s.quantityText, s.stockTotalText, t.weightTouched, t.shippingTouched, t.consignorTouched);
}

// ---------------------------------------------------------------------------------------------
// Touched gates
// ---------------------------------------------------------------------------------------------
test('weight untouched omits every package size key and the confirmation keys', () => {
  const s = stateOf(baseForm({ packageWeightOz: '16', packageLengthIn: '10', packageWidthIn: '8', packageHeightIn: '4' }));
  const body = wire(buildItemSavePayload(s, NONE));
  for (const k of ['packageWeightOz', 'packageLengthIn', 'packageWidthIn', 'packageHeightIn', 'packageConfirmedByOrganizer', 'packageEstimateSource']) {
    assert.equal(k in body, false, `${k} must be omitted`);
  }
  // packageType is not gated and passes through from the form state.
  assert.equal('packageType' in body, true);
});

test('weight touched sends integers and confirms the weight', () => {
  const s = stateOf(baseForm({ packageWeightOz: '16', packageLengthIn: '10', packageWidthIn: ' 8 ', packageHeightIn: '4.9' }));
  const body = wire(buildItemSavePayload(s, { ...NONE, weightTouched: true }));
  assert.equal(body.packageWeightOz, 16);
  assert.equal(body.packageLengthIn, 10);
  assert.equal(body.packageWidthIn, 8);
  assert.equal(body.packageHeightIn, 4);
  assert.equal(body.packageConfirmedByOrganizer, true);
  assert.equal(body.packageEstimateSource, 'ORGANIZER');
});

test('weight touched with a blank, zero or junk weight sends null and does not confirm', () => {
  for (const w of ['', '0', '-3', 'abc']) {
    const body = wire(buildItemSavePayload(stateOf(baseForm({ packageWeightOz: w, packageLengthIn: '5' })), { ...NONE, weightTouched: true }));
    assert.equal(body.packageWeightOz, null, `weight ${JSON.stringify(w)}`);
    assert.equal('packageConfirmedByOrganizer' in body, false);
    assert.equal('packageEstimateSource' in body, false);
    assert.equal(body.packageLengthIn, 5);
    assert.equal(body.packageWidthIn, null);
  }
});

test('shipping untouched omits shippingAvailable and shippingPrice', () => {
  const s = stateOf(baseForm({ shippingAvailable: true, shippingPrice: '12.50' }));
  const body = wire(buildItemSavePayload(s, NONE));
  assert.equal('shippingAvailable' in body, false);
  assert.equal('shippingPrice' in body, false);
});

test('shipping touched sends the checkbox and a parsed price, or null when blank', () => {
  const on = wire(buildItemSavePayload(stateOf(baseForm({ shippingAvailable: true, shippingPrice: '12.50' })), { ...NONE, shippingTouched: true }));
  assert.equal(on.shippingAvailable, true);
  assert.equal(on.shippingPrice, 12.5);

  const off = wire(buildItemSavePayload(stateOf(baseForm({ shippingAvailable: false, shippingPrice: '' })), { ...NONE, shippingTouched: true }));
  assert.equal(off.shippingAvailable, false);
  assert.equal(off.shippingPrice, null);
});

test('crosslisterFreeShipping is always sent, touched or not', () => {
  assert.equal(wire(buildItemSavePayload(stateOf(baseForm({ crosslisterFreeShipping: true })), NONE)).crosslisterFreeShipping, true);
  assert.equal(wire(buildItemSavePayload(stateOf(baseForm({ crosslisterFreeShipping: false })), NONE)).crosslisterFreeShipping, false);
});

test('consignor untouched omits consignorId even when one is set', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm({ consignorId: 'c_1' })), NONE));
  assert.equal('consignorId' in body, false);
});

test('consignor touched sends the id, and null when cleared', () => {
  const set = wire(buildItemSavePayload(stateOf(baseForm({ consignorId: 'c_1' })), { ...NONE, consignorTouched: true }));
  assert.equal(set.consignorId, 'c_1');
  const cleared = wire(buildItemSavePayload(stateOf(baseForm({ consignorId: '' })), { ...NONE, consignorTouched: true }));
  assert.equal(cleared.consignorId, null);
});

// ---------------------------------------------------------------------------------------------
// Blank versus null, numbers and strings
// ---------------------------------------------------------------------------------------------
test('blank eBay overrides become explicit null', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm({ ebayShippingOverride: '', ebayFulfillmentPolicyOverrideId: '' as unknown as null })), NONE));
  assert.equal(body.ebayShippingOverride, null);
  assert.equal(body.ebayFulfillmentPolicyOverrideId, null);
  const kept = wire(buildItemSavePayload(stateOf(baseForm({ ebayShippingOverride: 'FREE', ebayFulfillmentPolicyOverrideId: 'pol_9' })), NONE));
  assert.equal(kept.ebayShippingOverride, 'FREE');
  assert.equal(kept.ebayFulfillmentPolicyOverrideId, 'pol_9');
});

test('price is passed through exactly as the state string, not converted', () => {
  for (const p of ['45', '45.00', '', ' 12.5 ']) {
    const body = wire(buildItemSavePayload(stateOf(baseForm({ price: p })), NONE));
    assert.equal(body.price, p);
  }
});

test('quantity and stockTotal are clamped from the raw text, minimum 1', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm({ quantity: 9, stockTotal: 9 }), '4', ' 12 '), NONE));
  assert.equal(body.quantity, 4);
  assert.equal(body.stockTotal, 12);
  for (const t of ['', '0', '-2', 'x']) {
    const b = wire(buildItemSavePayload(stateOf(baseForm(), t, t), NONE));
    assert.equal(b.quantity, 1, `text ${JSON.stringify(t)}`);
    assert.equal(b.stockTotal, 1);
  }
});

test('tags and other plain fields are spread through unchanged', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm({ tags: ['a', 'b', 'c'], brand: 'Acme', isbn: '9780306406157', roomTag: 'Den', locationId: 'loc_1' })), NONE));
  assert.deepEqual(body.tags, ['a', 'b', 'c']);
  assert.equal(body.brand, 'Acme');
  assert.equal(body.isbn, '9780306406157');
  assert.equal(body.roomTag, 'Den');
  assert.equal(body.locationId, 'loc_1');
  assert.equal(body.excludeFromMarkdown, false);
});

test('an extra key on the form state is still sent (spread semantics)', () => {
  const form = { ...baseForm(), futureField: 'x' } as ItemFormData;
  assert.equal(wire(buildItemSavePayload(stateOf(form), NONE)).futureField, 'x');
});

// ---------------------------------------------------------------------------------------------
// Best offer
// ---------------------------------------------------------------------------------------------
test('best offer off sends null amounts and strips the percent keys', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm({ allowBestOffer: false, bestOfferAcceptPct: 10, bestOfferDeclinePct: 30 })), NONE));
  assert.equal(body.allowBestOffer, false);
  assert.equal(body.bestOfferAutoAcceptAmt, null);
  assert.equal(body.bestOfferMinimumAmt, null);
  assert.equal('bestOfferAcceptPct' in body, false);
  assert.equal('bestOfferDeclinePct' in body, false);
});

test('best offer on converts percents to dollar amounts from the price', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm({ price: '100', allowBestOffer: true, bestOfferAcceptPct: 10, bestOfferDeclinePct: 30 })), NONE));
  assert.equal(body.allowBestOffer, true);
  assert.equal(body.bestOfferAutoAcceptAmt, 90);
  assert.equal(body.bestOfferMinimumAmt, 70);
});

test('best offer on rounds to cents', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm({ price: '19.99', allowBestOffer: true, bestOfferAcceptPct: 15, bestOfferDeclinePct: 33 })), NONE));
  assert.equal(body.bestOfferAutoAcceptAmt, 16.99);
  assert.equal(body.bestOfferMinimumAmt, 13.39);
});

test('best offer on with a blank percent or a missing price sends null for that amount', () => {
  const blank = wire(buildItemSavePayload(stateOf(baseForm({ price: '100', allowBestOffer: true, bestOfferAcceptPct: '', bestOfferDeclinePct: 30 })), NONE));
  assert.equal(blank.bestOfferAutoAcceptAmt, null);
  assert.equal(blank.bestOfferMinimumAmt, 70);
  for (const p of ['', '0', 'abc']) {
    const noPrice = wire(buildItemSavePayload(stateOf(baseForm({ price: p, allowBestOffer: true, bestOfferAcceptPct: 10, bestOfferDeclinePct: 30 })), NONE));
    assert.equal(noPrice.bestOfferAutoAcceptAmt, null, `price ${JSON.stringify(p)}`);
    assert.equal(noPrice.bestOfferMinimumAmt, null);
  }
});

test('a zero percent is a real percent: the amount equals the price', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm({ price: '50', allowBestOffer: true, bestOfferAcceptPct: 0, bestOfferDeclinePct: 0 })), NONE));
  assert.equal(body.bestOfferAutoAcceptAmt, 50);
  assert.equal(body.bestOfferMinimumAmt, 50);
});

// ---------------------------------------------------------------------------------------------
// Auction end time
// ---------------------------------------------------------------------------------------------
test('auctionEndTime is converted to a UTC ISO string, or null when blank', () => {
  assert.equal(wire(buildItemSavePayload(stateOf(baseForm({ auctionEndTime: '2026-10-05T14:30:00Z' })), NONE)).auctionEndTime, '2026-10-05T14:30:00.000Z');
  const naive = '2026-10-05T14:30';
  assert.equal(wire(buildItemSavePayload(stateOf(baseForm({ auctionEndTime: naive })), NONE)).auctionEndTime, new Date(naive).toISOString());
  assert.equal(wire(buildItemSavePayload(stateOf(baseForm({ auctionEndTime: '' })), NONE)).auctionEndTime, null);
});

// ---------------------------------------------------------------------------------------------
// skipMarketplaceSync
// ---------------------------------------------------------------------------------------------
test('skipMarketplaceSync is absent by default and when false or not strictly true', () => {
  const s = stateOf(baseForm());
  assert.equal('skipMarketplaceSync' in buildItemSavePayload(s, NONE), false);
  assert.equal('skipMarketplaceSync' in buildItemSavePayload(s, NONE, {}), false);
  assert.equal('skipMarketplaceSync' in buildItemSavePayload(s, NONE, { skipMarketplaceSync: false }), false);
  assert.equal('skipMarketplaceSync' in buildItemSavePayload(s, NONE, { skipMarketplaceSync: undefined }), false);
  assert.equal('skipMarketplaceSync' in buildItemSavePayload(s, NONE, { skipMarketplaceSync: 'yes' as unknown as boolean }), false);
});

test('skipMarketplaceSync true adds exactly that one key and changes nothing else', () => {
  const s = stateOf(baseForm({ price: '100', allowBestOffer: true, bestOfferAcceptPct: 10 }));
  const without = wire(buildItemSavePayload(s, ALL));
  const withFlag = wire(buildItemSavePayload(s, ALL, { skipMarketplaceSync: true }));
  assert.equal(withFlag.skipMarketplaceSync, true);
  const { skipMarketplaceSync, ...rest } = withFlag;
  assert.equal(skipMarketplaceSync, true);
  assert.deepEqual(rest, without);
  assert.equal(Object.keys(withFlag).pop(), 'skipMarketplaceSync');
});

test('the builder does not mutate its inputs', () => {
  const form = baseForm({ allowBestOffer: true, bestOfferAcceptPct: 10, price: '100', tags: ['x'] });
  const before = JSON.stringify(form);
  buildItemSavePayload(stateOf(form), ALL, { skipMarketplaceSync: true });
  assert.equal(JSON.stringify(form), before);
});

// ---------------------------------------------------------------------------------------------
// Full literal golden: every gate on, everything populated
// ---------------------------------------------------------------------------------------------
test('golden: fully populated form with every gate touched', () => {
  const form = baseForm({
    price: '100',
    quantity: 3,
    stockTotal: 3,
    packageWeightOz: '16',
    packageLengthIn: '10',
    packageWidthIn: '8',
    packageHeightIn: '4',
    packageType: 'BOX',
    shippingAvailable: true,
    shippingPrice: '9.5',
    crosslisterFreeShipping: true,
    allowBestOffer: true,
    bestOfferAcceptPct: 10,
    bestOfferDeclinePct: 30,
    excludeFromMarkdown: true,
    ebayShippingOverride: 'FREE',
    ebayFulfillmentPolicyOverrideId: 'pol_1',
    auctionEndTime: '2026-10-05T14:30:00Z',
    consignorId: 'c_7',
  });
  const body = wire(buildItemSavePayload(stateOf(form, '3', '3'), ALL));
  assert.deepEqual(body, {
    title: 'Oak side table',
    description: 'Solid oak, minor wear',
    price: '100',
    quantity: 3,
    stockTotal: 3,
    category: 'Furniture',
    ebayCategoryId: '',
    ebayCategoryName: '',
    condition: 'USED',
    conditionGrade: 'B',
    tags: ['oak', 'vintage'],
    status: 'AVAILABLE',
    listingType: 'FIXED',
    auctionEndTime: '2026-10-05T14:30:00.000Z',
    qrEmbedEnabled: true,
    isLegendary: false,
    tagColor: '',
    locationId: null,
    costBasis: '',
    roomTag: '',
    packageWeightOz: 16,
    packageLengthIn: 10,
    packageWidthIn: 8,
    packageHeightIn: 4,
    packageType: 'BOX',
    shippingAvailable: true,
    shippingPrice: 9.5,
    crosslisterFreeShipping: true,
    brand: '',
    size: '',
    color: '',
    material: '',
    upc: '',
    mpn: '',
    isbn: '',
    fccId: '',
    allowBestOffer: true,
    excludeFromMarkdown: true,
    ebayShippingOverride: 'FREE',
    consignorId: 'c_7',
    ebayFulfillmentPolicyOverrideId: 'pol_1',
    packageConfirmedByOrganizer: true,
    packageEstimateSource: 'ORGANIZER',
    bestOfferAutoAcceptAmt: 90,
    bestOfferMinimumAmt: 70,
  });
});

test('golden: default form with nothing touched sends this exact set of keys', () => {
  const body = wire(buildItemSavePayload(stateOf(baseForm()), NONE));
  assert.deepEqual(Object.keys(body), [
    'title', 'description', 'price', 'quantity', 'stockTotal', 'category', 'ebayCategoryId', 'ebayCategoryName',
    'condition', 'conditionGrade', 'tags', 'status', 'listingType', 'auctionEndTime', 'qrEmbedEnabled', 'isLegendary',
    'tagColor', 'locationId', 'costBasis', 'roomTag', 'packageType', 'crosslisterFreeShipping', 'brand', 'size',
    'color', 'material', 'upc', 'mpn', 'isbn', 'fccId', 'allowBestOffer', 'excludeFromMarkdown', 'ebayShippingOverride',
    'ebayFulfillmentPolicyOverrideId', 'bestOfferAutoAcceptAmt', 'bestOfferMinimumAmt',
  ]);
  assert.equal(body.auctionEndTime, null);
  assert.equal(body.bestOfferAutoAcceptAmt, null);
  assert.equal(body.bestOfferMinimumAmt, null);
});

// ---------------------------------------------------------------------------------------------
// Parity with the old closure over a grid of inputs
// ---------------------------------------------------------------------------------------------
test('parity: byte-identical JSON and identical object shape versus the old closure', () => {
  const touchedGrid: ItemSaveTouched[] = [];
  for (const w of [false, true]) for (const sh of [false, true]) for (const c of [false, true]) {
    touchedGrid.push({ weightTouched: w, shippingTouched: sh, consignorTouched: c });
  }

  const formGrid: ItemFormData[] = [
    baseForm(),
    baseForm({ price: '100', allowBestOffer: true, bestOfferAcceptPct: 10, bestOfferDeclinePct: 30 }),
    baseForm({ price: '19.99', allowBestOffer: true, bestOfferAcceptPct: 15, bestOfferDeclinePct: '' }),
    baseForm({ price: '', allowBestOffer: true, bestOfferAcceptPct: 10, bestOfferDeclinePct: 10 }),
    baseForm({ packageWeightOz: '16', packageLengthIn: '10', packageWidthIn: '8', packageHeightIn: '4', packageType: 'BOX' }),
    baseForm({ packageWeightOz: '0', packageLengthIn: '', packageWidthIn: 'x', packageHeightIn: ' 3 ' }),
    baseForm({ shippingAvailable: true, shippingPrice: '12.50' }),
    baseForm({ shippingAvailable: false, shippingPrice: '' }),
    baseForm({ consignorId: 'c_1' }),
    baseForm({ consignorId: '' }),
    baseForm({ ebayShippingOverride: 'FREE', ebayFulfillmentPolicyOverrideId: 'pol_2', crosslisterFreeShipping: true }),
    baseForm({ ebayShippingOverride: '', ebayFulfillmentPolicyOverrideId: null }),
    baseForm({ auctionEndTime: '2026-10-05T14:30:00Z', listingType: 'AUCTION' }),
    baseForm({ auctionEndTime: '2026-10-05T14:30', listingType: 'AUCTION' }),
    baseForm({ tags: [], locationId: 'loc_3', costBasis: '12', roomTag: 'Den', excludeFromMarkdown: true }),
    baseForm({ condition: '', conditionGrade: '', category: '', brand: 'Acme', size: 'M', color: 'Blue', material: 'Oak', upc: '012345678905', mpn: 'M-1', isbn: '9780306406157', fccId: 'A3LSMG991U' }),
    { ...baseForm(), futureField: 'x' } as ItemFormData,
  ];

  const textGrid: Array<[string, string]> = [['1', '1'], ['4', ' 12 '], ['', '0'], ['x', '-2'], ['007', '3.9']];

  let cases = 0;
  for (const form of formGrid) {
    for (const t of touchedGrid) {
      for (const [q, st] of textGrid) {
        const s = stateOf(form, q, st);
        const legacy = legacyOf(s, t);
        const next = buildItemSavePayload(s, t);
        assert.equal(JSON.stringify(next), JSON.stringify(legacy));
        assert.deepStrictEqual(next, legacy);
        assert.deepEqual(Object.keys(next), Object.keys(legacy));
        cases += 1;
      }
    }
  }
  assert.equal(cases, formGrid.length * 8 * textGrid.length);
});
