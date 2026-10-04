/**
 * Golden tests for the item form's save payload (Edit page and sheet).
 * Run: npm test   (node:test through tsx)
 *
 * `legacyBuildSavePayload` is a copy of the closure that lived in edit-item/[id].tsx at commit 60f2228 (before the form
 * moved into components/itemForm/ItemFormBody.tsx), with closed-over state turned into parameters. The new path
 * (buildEditSavePayload, which wraps buildItemSavePayload) must serialize to the SAME BYTES for the same inputs, over a
 * grid of form states and touched flags. Condition and grade are the one deliberate addition: while untouched they carry
 * the stored values, which for canonical stored values is exactly what the old page sent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditSavePayload } from '../itemFormSave';
import type { ItemFormData, ItemSaveTouched } from '../buildItemSavePayload';

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

const forms: ItemFormData[] = [
  baseForm(),
  baseForm({ condition: '', conditionGrade: '' }),
  baseForm({ condition: 'NEW', conditionGrade: '' }),
  baseForm({ condition: 'PARTS_OR_REPAIR', conditionGrade: 'D', price: '0' }),
  baseForm({
    title: 'Guitar',
    price: '250.50',
    packageWeightOz: '320',
    packageLengthIn: '40',
    packageWidthIn: '16',
    packageHeightIn: '5',
    packageType: 'MAILING_BOX',
    shippingAvailable: true,
    shippingPrice: '19.95',
    allowBestOffer: true,
    bestOfferAcceptPct: 10,
    bestOfferDeclinePct: 30,
    ebayShippingOverride: 'LOCAL_PICKUP_ONLY',
    ebayFulfillmentPolicyOverrideId: 'pol_1',
    consignorId: 'con_9',
    listingType: 'AUCTION',
    auctionEndTime: '2026-11-01T20:00',
    excludeFromMarkdown: true,
    crosslisterFreeShipping: true,
    tags: [],
    locationId: 'loc_2',
    costBasis: '12.00',
    roomTag: 'Garage',
    brand: 'Fender',
    size: 'M',
    color: 'Red',
    material: 'Maple',
    upc: '123',
    mpn: 'abc',
    isbn: '978',
  }),
  baseForm({ price: '', packageWeightOz: 'abc', shippingPrice: '', allowBestOffer: true, bestOfferAcceptPct: 5 }),
];

const touchedGrid: ItemSaveTouched[] = [];
for (const weightTouched of [false, true]) {
  for (const shippingTouched of [false, true]) {
    for (const consignorTouched of [false, true]) {
      touchedGrid.push({ weightTouched, shippingTouched, consignorTouched });
    }
  }
}
const textGrid: Array<[string, string]> = [['1', '1'], ['', ''], ['7', '12'], ['0', '-3'], ['2.9', 'x']];

test('golden: serialized payload is byte-identical to the old page closure when condition and grade are touched', () => {
  for (const form of forms) {
    for (const touched of touchedGrid) {
      for (const [q, s] of textGrid) {
        const oldJson = JSON.stringify(
          legacyBuildSavePayload(form, q, s, touched.weightTouched, touched.shippingTouched, touched.consignorTouched),
        );
        const newJson = JSON.stringify(
          buildEditSavePayload({
            formData: form,
            quantityText: q,
            stockTotalText: s,
            touched,
            conditionTouched: true,
            loadedCondition: 'ignored',
            loadedGrade: 'ignored',
          }),
        );
        assert.equal(newJson, oldJson);
      }
    }
  }
});

test('golden: untouched condition with canonical stored values is byte-identical to the old closure', () => {
  for (const form of forms) {
    for (const touched of touchedGrid) {
      const oldJson = JSON.stringify(
        legacyBuildSavePayload(form, '1', '1', touched.weightTouched, touched.shippingTouched, touched.consignorTouched),
      );
      const newJson = JSON.stringify(
        buildEditSavePayload({
          formData: form,
          quantityText: '1',
          stockTotalText: '1',
          touched,
          conditionTouched: false,
          loadedCondition: form.condition || null,
          loadedGrade: form.conditionGrade || null,
        }),
      );
      assert.equal(newJson, oldJson);
    }
  }
});

test('untouched condition sends the stored legacy value, not the normalized display value', () => {
  const form = baseForm({ condition: 'USED', conditionGrade: 'A' }); // LIKE_NEW shown as Used + A
  const payload = buildEditSavePayload({
    formData: form,
    quantityText: '1',
    stockTotalText: '1',
    touched: { weightTouched: false, shippingTouched: false, consignorTouched: false },
    conditionTouched: false,
    loadedCondition: 'LIKE_NEW',
    loadedGrade: null,
  });
  assert.equal(payload.condition, 'LIKE_NEW');
  assert.equal(payload.conditionGrade, '');
});

test('touched condition sends the form values', () => {
  const form = baseForm({ condition: 'USED', conditionGrade: 'A' });
  const payload = buildEditSavePayload({
    formData: form,
    quantityText: '1',
    stockTotalText: '1',
    touched: { weightTouched: false, shippingTouched: false, consignorTouched: false },
    conditionTouched: true,
    loadedCondition: 'LIKE_NEW',
    loadedGrade: null,
  });
  assert.equal(payload.condition, 'USED');
  assert.equal(payload.conditionGrade, 'A');
});

test('skipMarketplaceSync is added only when strictly true, as the last key', () => {
  const input = {
    formData: baseForm(),
    quantityText: '1',
    stockTotalText: '1',
    touched: { weightTouched: false, shippingTouched: false, consignorTouched: false },
    conditionTouched: true,
    loadedCondition: 'USED',
    loadedGrade: 'B',
  };
  const without = JSON.stringify(buildEditSavePayload(input));
  assert.equal(JSON.stringify(buildEditSavePayload({ ...input, skipMarketplaceSync: false })), without);
  assert.equal(without.includes('skipMarketplaceSync'), false);
  for (const bad of ['true', 1, {}, [], null]) {
    const p = buildEditSavePayload({ ...input, skipMarketplaceSync: bad as unknown as boolean });
    assert.equal('skipMarketplaceSync' in p, false);
  }
  const withSkip = buildEditSavePayload({ ...input, skipMarketplaceSync: true });
  assert.equal(withSkip.skipMarketplaceSync, true);
  const keys = Object.keys(withSkip);
  assert.equal(keys[keys.length - 1], 'skipMarketplaceSync');
});
