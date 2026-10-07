/**
 * ADR-136 Addendum C (roadmap #659): eBay bundles of a bulk lot, the pure part. Bundle price math and rounding, the
 * quantity floor, settings validation, the overlay the eBay push reads, the sync decision table, and the copy rules.
 * No database, no network, no clock.
 */
import {
  ADJUSTMENT_BPS_MAX,
  ADJUSTMENT_BPS_MIN,
  BULK_EBAY_CATEGORY,
  BULK_EBAY_MESSAGES,
  BUNDLE_MAX_PRICE_CENTS,
  BUNDLE_SIZE_MAX,
  BUNDLE_SIZE_MIN,
  BUNDLE_SIZE_PRESETS,
  BundleRow,
  EBAY_TITLE_MAX,
  MIN_BUNDLE_WEIGHT_OZ,
  bpsToPercent,
  buildBundleOverlay,
  bundleConditionNote,
  bundleDescription,
  bundleQuantity,
  bundleTags,
  bundleTitle,
  cardsForBundles,
  computeBundlePriceCents,
  describeBundleListing,
  describeBundleSale,
  isBulkEbayError,
  parseBundleSettings,
  percentToBps,
  planBundleSync,
  suggestBundlePackage,
  validateBundlePackage,
} from '../services/bulkLot/bulkLotEbayBundle';
import { isBulkEbayEnabled, isBulkEbayFlagOn } from '../services/bulkLot/bulkLotEbayConfig';
import { priceCentsForCards } from '../services/bulkLot/bulkLotPricing';

const ok = (r: { ok: boolean; cents?: number }) => {
  if (!r.ok) throw new Error('expected ok');
  return r.cents as number;
};

describe('computeBundlePriceCents', () => {
  it('at 0 basis points equals the register line price for the same number of cards, across a grid', () => {
    for (const size of [100, 250, 500, 999, 1000, 1500, 2500, 5000]) {
      for (const p of [1, 7, 333, 799, 800, 801, 1250, 4999, 12345, 999_999, 10_000_000]) {
        const bundle = computeBundlePriceCents(size, p, 0);
        const register = priceCentsForCards(size, p);
        if (register.ok && register.cents <= BUNDLE_MAX_PRICE_CENTS) {
          expect(bundle).toEqual({ ok: true, cents: register.cents });
        }
      }
    }
  });

  it('prices a 1,000 card bundle at the per-1,000 price and a 500 card bundle at half, rounded half up', () => {
    expect(ok(computeBundlePriceCents(1000, 800))).toBe(800); // $8.00 per 1,000
    expect(ok(computeBundlePriceCents(500, 800))).toBe(400);
    expect(ok(computeBundlePriceCents(500, 801))).toBe(401); // 400.5 rounds up
    // 100 cards at one tenth of a cent per thousand is a tenth of a cent: below one cent, so it is refused
    expect(computeBundlePriceCents(100, 1)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
  });

  it('applies a premium or discount with ONE rounding from the exact value', () => {
    // 1,000 cards at $8.00 = 800 cents. +10% = 880. -25% = 600. +0.5% = 804.
    expect(ok(computeBundlePriceCents(1000, 800, percentToBps(10)))).toBe(880);
    expect(ok(computeBundlePriceCents(1000, 800, percentToBps(-25)))).toBe(600);
    expect(ok(computeBundlePriceCents(1000, 800, percentToBps(0.5)))).toBe(804);
    // 500 cards at 801 per thousand with +3%: exact 412.515 rounds to 413
    expect(ok(computeBundlePriceCents(500, 801, percentToBps(3)))).toBe(413);
    // Two roundings would disagree here: 100 cards at 1,005 per thousand is 100.5 exact (register price 101). With -10% the exact
    // value is 90.45 and rounds to 90, while rounding the register price first would give 90.9 and round to 91.
    expect(ok(computeBundlePriceCents(100, 1005, percentToBps(-10)))).toBe(90);
  });

  it('refuses a bad size, a missing or zero price, a bad adjustment and a price that rounds below one cent', () => {
    expect(computeBundlePriceCents(99, 800)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
    expect(computeBundlePriceCents(5001, 800)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
    expect(computeBundlePriceCents(1000.5, 800)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
    expect(computeBundlePriceCents(1000, null)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
    expect(computeBundlePriceCents(1000, undefined)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
    expect(computeBundlePriceCents(1000, 0)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
    expect(computeBundlePriceCents(1000, 800, ADJUSTMENT_BPS_MIN - 1)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
    expect(computeBundlePriceCents(1000, 800, ADJUSTMENT_BPS_MAX + 1)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
    expect(computeBundlePriceCents(1000, 800, 0.5 as number)).toEqual({ ok: false, code: 'BUNDLE_PRICE_INVALID' });
  });

  it('refuses a bundle priced above the conservative limit instead of sending it', () => {
    const r = computeBundlePriceCents(5000, 10_000_000, ADJUSTMENT_BPS_MAX);
    expect(r).toEqual({ ok: false, code: 'BUNDLE_PRICE_TOO_HIGH' });
    expect(BUNDLE_MAX_PRICE_CENTS).toBe(9_999_999);
  });

  it('stays a safe integer at the largest allowed inputs', () => {
    const r = computeBundlePriceCents(BUNDLE_SIZE_MAX, 10_000_000, ADJUSTMENT_BPS_MAX);
    expect(r.ok === false && r.code === 'BUNDLE_PRICE_TOO_HIGH').toBe(true);
    expect(Number.isSafeInteger(BUNDLE_SIZE_MAX * 10_000_000 * (10000 + ADJUSTMENT_BPS_MAX) + 5_000_000)).toBe(true);
  });
});

describe('percent and basis point helpers', () => {
  it('round trips and rounds once', () => {
    expect(percentToBps(10)).toBe(1000);
    expect(percentToBps(-5.25)).toBe(-525);
    expect(bpsToPercent(-525)).toBe(-5.25);
    expect(percentToBps(0.004)).toBe(0);
  });
});

describe('bundle quantity is the floor of cards left over bundle size', () => {
  it.each([
    [2500, 1000, 2],
    [2999, 1000, 2],
    [3000, 1000, 3],
    [999, 1000, 0],
    [1000, 1000, 1],
    [0, 1000, 0],
    [-5, 1000, 0],
    [1_000_000, 500, 2000],
    [499, 500, 0],
  ])('%p cards, bundle of %p -> %p bundles', (remaining, size, want) => {
    expect(bundleQuantity(remaining, size)).toBe(want);
  });

  it('refuses non-whole figures', () => {
    expect(bundleQuantity(10.5, 5)).toBe(0);
    expect(bundleQuantity(1000, 0)).toBe(0);
    expect(bundleQuantity(1000, 0.5)).toBe(0);
  });

  it('a sale of N bundles takes N x bundleSize cards', () => {
    expect(cardsForBundles(3, 1000)).toBe(3000);
    expect(cardsForBundles(1, 500)).toBe(500);
    expect(cardsForBundles(0, 500)).toBeNull();
    expect(cardsForBundles(2.5, 500)).toBeNull();
    expect(cardsForBundles(2, 0)).toBeNull();
    expect(cardsForBundles(Number.MAX_SAFE_INTEGER, 1000)).toBeNull();
  });
});

describe('parseBundleSettings', () => {
  it('accepts the documented shape and cleans text', () => {
    const out = parseBundleSettings({ enabled: true, bundleSize: 1000, adjustmentPercent: -5, ebayTitle: '  My <b>lot</b>\n of cards ', language: ' English ', weightOz: 150, lengthIn: 16, widthIn: 4, heightIn: 5, dimsConfirmed: true });
    expect(out.bundleSize).toBe(1000);
    expect(out.ebayTitle).toBe('My b lot /b of cards');
    expect(out.language).toBe('English');
  });

  it.each([
    [{ bundleSize: 50 }, 'at least'],
    [{ bundleSize: 6000 }, 'at most'],
    [{ bundleSize: 100.5 }, 'whole number'],
    [{}, 'bundle size'],
    [{ bundleSize: 1000, adjustmentPercent: -60 }, '50%'],
    [{ bundleSize: 1000, adjustmentPercent: 150 }, '100%'],
    [{ bundleSize: 1000, weightOz: 2 }, 'at least'],
    [{ bundleSize: 1000, heightIn: 0 }, 'at least'],
    [{ bundleSize: 1000, ebayTitle: 'x'.repeat(81) }, '80 characters'],
    [{ bundleSize: 1000, condition: 'LIKE_NEW' }, ''],
    [{ bundleSize: 1000, itemId: 'other' }, ''],
    [{ bundleSize: 1000, price: 5 }, ''],
  ])('rejects %j', (raw, fragment) => {
    let caught: unknown;
    try {
      parseBundleSettings(raw);
    } catch (e) {
      caught = e;
    }
    expect(isBulkEbayError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe('BUNDLE_VALIDATION');
    expect((caught as { status: number }).status).toBe(400);
    if (fragment) expect((caught as Error).message).toContain(fragment);
  });
});

describe('package suggestion and validation', () => {
  it('suggests weights that grow with the bundle, never below the minimum, and always above the 3 oz Standard Envelope ceiling', () => {
    let last = 0;
    for (const size of BUNDLE_SIZE_PRESETS) {
      const pkg = suggestBundlePackage(size);
      expect(pkg.weightOz).toBeGreaterThan(last);
      expect(pkg.weightOz).toBeGreaterThanOrEqual(MIN_BUNDLE_WEIGHT_OZ);
      expect(pkg.weightOz).toBeGreaterThan(3);
      expect(validateBundlePackage(pkg)).toBeNull();
      last = pkg.weightOz;
    }
  });

  it('matches hand figures for 1,000 cards (cards + one box + packing)', () => {
    // 1000 x 0.064 = 64 oz, + 4.64 box + 8 packing = 76.64 -> 76.7
    const p = suggestBundlePackage(1000);
    expect(p.weightOz).toBe(76.7);
    expect(p.lengthIn).toBe(16.5);
    expect(p.heightIn).toBe(5.5);
  });

  it('adds a box per 1,100 cards', () => {
    expect(suggestBundlePackage(1100).widthIn).toBe(suggestBundlePackage(500).widthIn);
    expect(suggestBundlePackage(2500).widthIn).toBeGreaterThan(suggestBundlePackage(1000).widthIn);
  });

  it('refuses missing, tiny and enormous figures with plain text', () => {
    expect(validateBundlePackage({})).toContain('weight');
    expect(validateBundlePackage({ weightOz: 3, lengthIn: 5, widthIn: 5, heightIn: 5 })).toContain('at least');
    expect(validateBundlePackage({ weightOz: 3000, lengthIn: 5, widthIn: 5, heightIn: 5 })).toContain('at most');
    expect(validateBundlePackage({ weightOz: 50, lengthIn: 5, widthIn: 5 })).toContain('height');
    expect(validateBundlePackage({ weightOz: 50, lengthIn: 5, widthIn: 5, heightIn: 99 })).toContain('between');
  });
});

const ROW: BundleRow = {
  enabled: true,
  bundleSize: 1000,
  adjustmentBps: 0,
  ebayTitle: null,
  condition: 'USED',
  language: 'English',
  weightOz: 80,
  lengthIn: 16,
  widthIn: 4,
  heightIn: 5,
  dimsConfirmed: true,
};

describe('buildBundleOverlay', () => {
  const base = { stockTotal: 5200, stockSold: 200, pricePerThousandCents: 800, lot: { game: 'MTG', lotKind: 'BULK_COMMON_UNCOMMON' }, bundle: ROW };

  it('turns cards into bundles and the per-1,000 price into a bundle price (dollars for the pipeline)', () => {
    const r = buildBundleOverlay(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bundles).toBe(5); // 5,000 cards left / 1,000
    expect(r.priceCents).toBe(800);
    const o = r.overlay;
    expect(o.price).toBe(8);
    expect(o.stockTotal).toBe(5);
    expect(o.stockSold).toBe(0);
    expect(o.ebayCategoryId).toBe(BULK_EBAY_CATEGORY.id);
    expect(o.ebayShippingOverride).toBeNull();
    expect(o.neverStandardEnvelope).toBe(true);
    expect(o.allowBestOffer).toBe(false);
    expect(o.packageConfirmedByOrganizer).toBe(true);
    expect(o.packageWeightOz).toBe(80);
    expect([o.upc, o.ean, o.isbn, o.mpn, o.brand, o.ebayEpid]).toEqual([null, null, null, null, null, null]);
    expect(o.tags).toContain('Game:Magic: The Gathering');
    expect(o.tags).toContain('Language:English');
    // The exact list a USED 1,000 card bundle sends, in this order.
    expect(o.tags).toEqual(['Game:Magic: The Gathering', 'Language:English', 'Number of Cards:1000', 'Card Condition:Used']);
  });

  it('a USED bundle sends Number of Cards and Card Condition Used, a NEW bundle sends Number of Cards but no Card Condition', () => {
    const used = buildBundleOverlay({ ...base, bundle: { ...ROW, condition: 'USED' } });
    const fresh = buildBundleOverlay({ ...base, bundle: { ...ROW, condition: 'NEW' } });
    if (!used.ok || !fresh.ok) throw new Error('expected ok');
    expect(used.overlay.condition).toBe('USED');
    expect(used.overlay.tags).toEqual(['Game:Magic: The Gathering', 'Language:English', 'Number of Cards:1000', 'Card Condition:Used']);
    expect(fresh.overlay.condition).toBe('NEW');
    expect(fresh.overlay.tags).toEqual(['Game:Magic: The Gathering', 'Language:English', 'Number of Cards:1000']);
  });

  it('any condition other than NEW is listed as USED and so also sends Card Condition Used', () => {
    const r = buildBundleOverlay({ ...base, bundle: { ...ROW, condition: 'LIKE_NEW', bundleSize: 250 } });
    if (!r.ok) throw new Error('expected ok');
    expect(r.overlay.condition).toBe('USED');
    expect(r.overlay.tags).toEqual(['Game:Magic: The Gathering', 'Language:English', 'Number of Cards:250', 'Card Condition:Used']);
  });

  it('the cards left never reach eBay as the quantity or price: only bundles and the bundle price do', () => {
    const r = buildBundleOverlay({ ...base, stockTotal: 123_456, stockSold: 0, pricePerThousandCents: 1999 });
    if (!r.ok) throw new Error('expected ok');
    expect(r.overlay.stockTotal).toBe(123);
    expect(r.overlay.price).toBeLessThan(1999 / 100 * 1.01);
    expect(r.overlay.price).toBe(r.priceCents / 100);
  });

  it('refuses below one bundle with the cards left in the message', () => {
    const r = buildBundleOverlay({ ...base, stockTotal: 1000, stockSold: 1 });
    expect(r).toMatchObject({ ok: false, code: 'BUNDLE_BELOW_ONE' });
    if (!r.ok) expect(r.message).toContain('999 cards left');
  });

  it.each([
    ['not enabled', { bundle: { ...ROW, enabled: false } }, 'BUNDLE_NOT_ENABLED'],
    ['no settings row', { bundle: null }, 'BUNDLE_NOT_ENABLED'],
    ['no price', { pricePerThousandCents: null }, 'BUNDLE_PRICE_INVALID'],
    ['unconfirmed package', { bundle: { ...ROW, dimsConfirmed: false } }, 'BUNDLE_PACKAGE_UNCONFIRMED'],
    ['bad weight', { bundle: { ...ROW, weightOz: 2 } }, 'BUNDLE_PACKAGE_UNCONFIRMED'],
    ['too expensive', { pricePerThousandCents: 10_000_000, bundle: { ...ROW, bundleSize: 5000, adjustmentBps: ADJUSTMENT_BPS_MAX } , stockTotal: 20000, stockSold: 0 }, 'BUNDLE_PRICE_TOO_HIGH'],
  ])('refuses: %s', (_name, over, code) => {
    const r = buildBundleOverlay({ ...base, ...(over as object) } as Parameters<typeof buildBundleOverlay>[0]);
    expect(r).toMatchObject({ ok: false, code });
  });

  it('never uses a card count as a quantity when stock is null (single-unit default is not a lot)', () => {
    const r = buildBundleOverlay({ ...base, stockTotal: null, stockSold: null });
    expect(r).toMatchObject({ ok: false, code: 'BUNDLE_BELOW_ONE' });
  });

  it('a premium or discount flows into the overlay price', () => {
    const r = buildBundleOverlay({ ...base, bundle: { ...ROW, adjustmentBps: percentToBps(-10) } });
    if (!r.ok) throw new Error('expected ok');
    expect(r.priceCents).toBe(720);
    expect(r.overlay.price).toBe(7.2);
  });
});

describe('planBundleSync: the decision table', () => {
  const live = {
    enabled: true,
    bundleSize: 1000,
    adjustmentBps: 0,
    pricePerThousandCents: 800,
    stockTotal: 5000,
    stockSold: 0,
    itemSellable: true,
    hasListing: true,
    endedForStock: false,
    listedQty: 5,
    listedPriceCents: 800,
  };

  it('is idle when listing, quantity and price already match', () => {
    expect(planBundleSync(live)).toMatchObject({ action: 'NONE', reason: 'IN_SYNC', wantedQty: 5, wantedPriceCents: 800 });
  });

  it('revises the quantity after a counter sale (3,000 cards sold leaves 2 bundles)', () => {
    expect(planBundleSync({ ...live, stockSold: 3000 })).toMatchObject({ action: 'REVISE', reason: 'QUANTITY_CHANGED', wantedQty: 2, qtyChanged: true, priceChanged: false });
  });

  it('revises the price when the per-1,000 price changes', () => {
    expect(planBundleSync({ ...live, pricePerThousandCents: 900 })).toMatchObject({ action: 'REVISE', reason: 'PRICE_CHANGED', wantedPriceCents: 900, priceChanged: true, qtyChanged: false });
  });

  it('revises when only the premium changes', () => {
    expect(planBundleSync({ ...live, adjustmentBps: 500 })).toMatchObject({ action: 'REVISE', reason: 'PRICE_CHANGED', wantedPriceCents: 840 });
  });

  it('ends the listing when fewer than one bundle is left', () => {
    expect(planBundleSync({ ...live, stockSold: 4001 })).toMatchObject({ action: 'END', reason: 'BELOW_ONE_BUNDLE', wantedQty: 0 });
    expect(planBundleSync({ ...live, stockSold: 5000 })).toMatchObject({ action: 'END', reason: 'BELOW_ONE_BUNDLE' });
  });

  it('ends the listing when the item is no longer sellable (sold, hidden, deleted)', () => {
    expect(planBundleSync({ ...live, itemSellable: false })).toMatchObject({ action: 'END', reason: 'NOT_SELLABLE' });
  });

  it('ends the listing when the price became unusable', () => {
    expect(planBundleSync({ ...live, pricePerThousandCents: null })).toMatchObject({ action: 'END', reason: 'PRICE_INVALID' });
  });

  it('does nothing more once ended for stock and still below one bundle', () => {
    expect(planBundleSync({ ...live, stockSold: 4500, endedForStock: true, listedQty: 0 })).toMatchObject({ action: 'NONE', reason: 'ALREADY_ENDED' });
  });

  it('relists when stock returns after an end for stock', () => {
    expect(planBundleSync({ ...live, endedForStock: true, listedQty: 0, stockTotal: 2000, stockSold: 0 })).toMatchObject({ action: 'RELIST', reason: 'RESTOCKED', wantedQty: 2 });
  });

  it('relists even when the ended-listings sync cleared the offer id (hasListing true because ended by us)', () => {
    expect(planBundleSync({ ...live, hasListing: true, endedForStock: true, listedQty: 0 })).toMatchObject({ action: 'RELIST' });
  });

  it('never lists on its own: a lot with no offer and not ended by us stays unlisted', () => {
    expect(planBundleSync({ ...live, hasListing: false, listedQty: null, listedPriceCents: null })).toMatchObject({ action: 'NONE', reason: 'NOT_LISTED' });
  });

  it('turning bundles off ends a live listing, and does nothing once it is off', () => {
    expect(planBundleSync({ ...live, enabled: false })).toMatchObject({ action: 'END', reason: 'DISABLED' });
    expect(planBundleSync({ ...live, enabled: false, hasListing: false })).toMatchObject({ action: 'NONE', reason: 'NOT_LISTED' });
    expect(planBundleSync({ ...live, enabled: false, endedForStock: true })).toMatchObject({ action: 'NONE', reason: 'ALREADY_ENDED' });
  });

  it('does not revise an offer this app never recorded as live', () => {
    expect(planBundleSync({ ...live, listedQty: null, listedPriceCents: null })).toMatchObject({ action: 'NONE', reason: 'NOT_LISTED' });
  });
});

describe('flags', () => {
  it('both flags are off by default and the bundle flag does nothing without the lot flag', () => {
    expect(isBulkEbayFlagOn({})).toBe(false);
    expect(isBulkEbayEnabled({})).toBe(false);
    expect(isBulkEbayEnabled({ CARD_BULK_EBAY_ENABLED: 'true' })).toBe(false);
    expect(isBulkEbayEnabled({ CARD_BULK_LOTS_ENABLED: 'true' })).toBe(false);
    expect(isBulkEbayEnabled({ CARD_BULK_LOTS_ENABLED: 'true', CARD_BULK_EBAY_ENABLED: 'true' })).toBe(true);
    expect(isBulkEbayEnabled({ CARD_BULK_LOTS_ENABLED: '1', CARD_BULK_EBAY_ENABLED: 'on' })).toBe(true);
    expect(isBulkEbayEnabled({ CARD_BULK_LOTS_ENABLED: 'true', CARD_BULK_EBAY_ENABLED: 'false' })).toBe(false);
  });
});

describe('bundleTags', () => {
  it('stays backward compatible: with only game and language it sends just Game and Language', () => {
    expect(bundleTags({ game: 'MTG' })).toEqual(['Game:Magic: The Gathering', 'Language:English']);
    expect(bundleTags({ game: 'POKEMON', language: 'Japanese' })).toEqual(['Game:Pokémon TCG', 'Language:Japanese']);
    expect(bundleTags({ game: 'MTG', bundleSize: null, condition: null })).toEqual(['Game:Magic: The Gathering', 'Language:English']);
  });

  it('a USED bundle sends Game, Language, Number of Cards and Card Condition in a stable order', () => {
    expect(bundleTags({ game: 'MTG', language: 'English', bundleSize: 1000, condition: 'USED' })).toEqual([
      'Game:Magic: The Gathering',
      'Language:English',
      'Number of Cards:1000',
      'Card Condition:Used',
    ]);
  });

  it('a NEW bundle omits Card Condition but still sends Number of Cards', () => {
    expect(bundleTags({ game: 'MTG', language: 'English', bundleSize: 1000, condition: 'NEW' })).toEqual([
      'Game:Magic: The Gathering',
      'Language:English',
      'Number of Cards:1000',
    ]);
  });

  it('renders the bundle size as a plain integer string', () => {
    expect(bundleTags({ game: 'MTG', bundleSize: 100 })).toContain('Number of Cards:100');
    expect(bundleTags({ game: 'MTG', bundleSize: 5000 })).toContain('Number of Cards:5000');
    expect(bundleTags({ game: 'MTG', bundleSize: 2500 })).toContain('Number of Cards:2500');
    expect(bundleTags({ game: 'MTG', bundleSize: 1000.9 })).toContain('Number of Cards:1000');
  });

  it('leaves Number of Cards out for a missing or non-positive size', () => {
    for (const size of [0, -5, Number.NaN, Infinity, undefined, null]) {
      expect(bundleTags({ game: 'MTG', bundleSize: size as number | null | undefined }).some((t) => t.startsWith('Number of Cards:'))).toBe(false);
    }
  });

  it('every tag splits at its first colon into the aspect name and value the push code reads', () => {
    const parsed = bundleTags({ game: 'MTG', bundleSize: 5000, condition: 'USED' }).map((t) => [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)]);
    expect(Object.fromEntries(parsed)).toEqual({ Game: 'Magic: The Gathering', Language: 'English', 'Number of Cards': '5000', 'Card Condition': 'Used' });
  });
});

describe('listing text', () => {
  it('builds a title of at most 80 characters from the lot, and an organizer title wins', () => {
    expect(bundleTitle({ bundleSize: 1000, game: 'MTG', lotKind: 'BULK_COMMON_UNCOMMON' })).toBe('1000 Card Bulk Lot - Magic: The Gathering - Commons & Uncommons');
    expect(bundleTitle({ bundleSize: 5000, game: 'ONE_PIECE', lotKind: 'BULK_MIXED' }).length).toBeLessThanOrEqual(EBAY_TITLE_MAX);
    expect(bundleTitle({ bundleSize: 1000, game: 'MTG', ebayTitle: 'Custom 1000 card lot' })).toBe('Custom 1000 card lot');
    expect(bundleTitle({ bundleSize: 1000, game: 'MTG', ebayTitle: 'y'.repeat(200) }).length).toBe(EBAY_TITLE_MAX);
  });

  it('every organizer-facing string follows the copy rules: no em dash, no "AI", no "estate sale", no founder voice', () => {
    const texts: string[] = [
      ...Object.values(BULK_EBAY_MESSAGES),
      bundleDescription({ bundleSize: 1000, game: 'MTG', lotKind: 'BULK_MIXED', language: 'English' }),
      bundleDescription({ bundleSize: 500, game: 'POKEMON' }),
      bundleConditionNote(),
      bundleTitle({ bundleSize: 1000, game: 'MTG', lotKind: 'BULK_RARE' }),
      describeBundleSale(2, 1000),
      describeBundleSale(1, 500),
      describeBundleListing(1000, 5, 800),
      describeBundleListing(500, 1, null),
      ...bundleTags({ game: 'MTG' }),
      ...bundleTags({ game: 'MTG', bundleSize: 1000, condition: 'USED' }),
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/\bAI\b/);
      expect(t).not.toMatch(/estate sale/i);
      expect(t).not.toMatch(/\b(I|we|our|my) (built|made|wrote)\b/i);
    }
  });

  it('describes sales and listings in plain words', () => {
    expect(describeBundleSale(2, 1000)).toBe('2 bundles of 1,000 cards (2,000 cards) sold on eBay.');
    expect(describeBundleSale(1, 500)).toBe('1 bundle of 500 cards (500 cards) sold on eBay.');
    expect(describeBundleListing(1000, 5, 800)).toBe('5 bundles of 1,000 cards at $8.00 each');
  });

  it('bundle size limits are the documented ones', () => {
    expect(BUNDLE_SIZE_MIN).toBe(100);
    expect(BUNDLE_SIZE_MAX).toBe(5000);
    expect(BUNDLE_SIZE_PRESETS).toEqual([100, 250, 500, 1000, 2500, 5000]);
  });
});
