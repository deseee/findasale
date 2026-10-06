/**
 * Bulk lot packs, pure math and copy (ADR-136 Addendum E, roadmap #659).
 *
 * WHAT THIS PROVES
 *   - the pack price is the register's price for packSize cards (one half-up rounding), with golden numbers for the common sizes
 *   - N packs cost exactly N times the pack price, and that can differ from the free quantity price by under a cent per pack (documented)
 *   - packs left = floor(cards left / pack size); the leftover is not a pack
 *   - the pack size and pack count parsers accept only whole numbers in range
 *   - the same golden numbers are asserted in the browser copy of the formula (packages/frontend/lib/__tests__/bulkLotPacks.test.ts)
 *   - every message and label a shopper or vendor can read has no em dash, no exclamation mark, and none of the banned words
 */
import {
  MAX_PACKS_PER_LINE,
  PACK_MAX_PRICE_CENTS,
  PACK_SIZE_MAX,
  PACK_SIZE_MIN,
  PACK_SIZE_PRESETS,
  buildPackView,
  cardsForPacks,
  describePackLine,
  leftoverCards,
  packLabel,
  packOfferLabel,
  packPriceCents,
  packsAvailable,
  parsePackCount,
  parsePackSize,
} from '../services/bulkLot/bulkLotPacks';
import { BULK_LOT_MESSAGES } from '../services/bulkLot/bulkLotService';
import { priceCentsForCards } from '../services/bulkLot/bulkLotPricing';

/** [pack size, price per 1,000 in cents, expected pack price in cents]. The browser test repeats this table. */
export const PACK_GOLDEN: ReadonlyArray<readonly [number, number, number]> = [
  [100, 800, 80],
  [250, 800, 200],
  [500, 800, 400],
  [1000, 800, 800],
  [2500, 800, 2000],
  [5000, 800, 4000],
  [333, 750, 250], // 249.75 rounds half up to 250
  [1000, 750, 750],
  [4999, 750, 3749], // 3749.25 rounds down
  [100, 99, 10], // 9.9 rounds to 10
  [250, 99, 25], // 24.75 rounds to 25
  [101, 333, 34], // 33.633 rounds to 34
  [100, 5, 1], // 0.5 rounds half up to 1
  [100, 4, 0], // 0.4 is under a cent: not priceable
];

describe('packPriceCents golden numbers', () => {
  it.each(PACK_GOLDEN.filter(([, , c]) => c > 0))('%i cards at %i cents per 1,000 is %i cents', (size, ppt, cents) => {
    expect(packPriceCents(size, ppt)).toEqual({ ok: true, cents });
  });

  it('a pack that rounds to under one cent is QUANTITY_TOO_SMALL', () => {
    expect(packPriceCents(100, 4)).toEqual({ ok: false, code: 'QUANTITY_TOO_SMALL' });
  });

  it('is exactly the register price for that many cards (one rounding, no second formula)', () => {
    for (const [size, ppt] of PACK_GOLDEN) {
      const reg = priceCentsForCards(size, ppt);
      const pack = packPriceCents(size, ppt);
      expect(pack.ok).toBe(reg.ok);
      if (reg.ok && pack.ok) expect(pack.cents).toBe(reg.cents);
    }
  });

  it('refuses a bad size, a missing price and a price above the ceiling', () => {
    expect(packPriceCents(99, 800)).toEqual({ ok: false, code: 'BULK_PACK_INVALID' });
    expect(packPriceCents(5001, 800)).toEqual({ ok: false, code: 'BULK_PACK_INVALID' });
    expect(packPriceCents(1000, null)).toEqual({ ok: false, code: 'BAD_PRICE' });
    expect(packPriceCents(1000, 0)).toEqual({ ok: false, code: 'BAD_PRICE' });
    // 5,000 cards at a price per 1,000 big enough to pass the register ceiling but pass the pack ceiling
    const big = Math.ceil(((PACK_MAX_PRICE_CENTS + 1) * 1000) / 5000);
    const r = packPriceCents(5000, big);
    expect(r.ok === false && (r.code === 'BULK_PACK_TOO_PRICEY' || r.code === 'BAD_PRICE')).toBe(true);
  });
});

describe('packs versus free quantity (documented difference)', () => {
  it('N packs cost N times the pack price; a free quantity of the same cards rounds once and can be a cent lower', () => {
    const one = packPriceCents(101, 333);
    expect(one).toEqual({ ok: true, cents: 34 });
    expect(3 * 34).toBe(102);
    const free = priceCentsForCards(303, 333);
    expect(free).toEqual({ ok: true, cents: 101 });
  });

  it('the difference is always under one cent per pack', () => {
    for (const [size, ppt] of PACK_GOLDEN) {
      const one = priceCentsForCards(size, ppt);
      if (!one.ok) continue;
      for (const n of [2, 3, 7, 50]) {
        const free = priceCentsForCards(size * n, ppt);
        if (!free.ok) continue;
        expect(Math.abs(n * one.cents - free.cents)).toBeLessThanOrEqual(n / 2 + 0.5);
      }
    }
  });
});

describe('packs left', () => {
  it('floors the cards left by the pack size', () => {
    expect(packsAvailable(4200, 1000)).toBe(4);
    expect(packsAvailable(999, 1000)).toBe(0);
    expect(packsAvailable(1000, 1000)).toBe(1);
    expect(packsAvailable(0, 1000)).toBe(0);
    expect(leftoverCards(4200, 1000)).toBe(200);
    expect(leftoverCards(999, 1000)).toBe(999);
    expect(leftoverCards(3000, 1000)).toBe(0);
  });

  it('no pack size means no packs', () => {
    expect(packsAvailable(5000, null)).toBe(0);
    expect(packsAvailable(5000, undefined)).toBe(0);
    expect(packsAvailable(5000, 0)).toBe(0);
  });

  it('cardsForPacks multiplies whole packs and refuses a bad count', () => {
    expect(cardsForPacks(3, 1000)).toBe(3000);
    expect(cardsForPacks('2', 250)).toBe(500);
    expect(cardsForPacks(0, 1000)).toBeNull();
    expect(cardsForPacks(MAX_PACKS_PER_LINE + 1, 1000)).toBeNull();
    expect(cardsForPacks(1.5, 1000)).toBeNull();
  });
});

describe('parsers', () => {
  it('parsePackSize accepts whole numbers from the minimum to the maximum', () => {
    expect(parsePackSize(1000)).toBe(1000);
    expect(parsePackSize('1,000')).toBe(1000);
    expect(parsePackSize(PACK_SIZE_MIN)).toBe(100);
    expect(parsePackSize(PACK_SIZE_MAX)).toBe(5000);
    for (const bad of [99, 5001, 0, -5, 250.5, NaN, Infinity, '', 'abc', '12e3', null, undefined, {}, [], true]) expect(parsePackSize(bad as any)).toBeNull();
  });

  it('parsePackCount accepts whole numbers from 1 to 50', () => {
    expect(parsePackCount(1)).toBe(1);
    expect(parsePackCount('50')).toBe(50);
    for (const bad of [0, 51, -1, 1.5, '', 'two', null, undefined, NaN, '1e1']) expect(parsePackCount(bad as any)).toBeNull();
  });

  it('every preset is a legal pack size', () => {
    for (const p of PACK_SIZE_PRESETS) expect(parsePackSize(p)).toBe(p);
  });
});

describe('buildPackView', () => {
  it('describes a pack lot with packs left', () => {
    const v = buildPackView({ packSize: 1000, pricePerThousandCents: 800, remaining: 4200, status: 'AVAILABLE' });
    expect(v).toMatchObject({
      packSize: 1000,
      packCents: 800,
      packLabel: '1,000-card pack',
      packPriceLabel: '$8.00 per pack',
      packsAvailable: 4,
      packsAvailableLabel: '4 packs available',
      leftoverCards: 200,
      packAvailable: true,
    });
  });

  it('says one pack, not one packs', () => {
    expect(buildPackView({ packSize: 1000, pricePerThousandCents: 800, remaining: 1000 }).packsAvailableLabel).toBe('1 pack available');
  });

  it('no whole pack left is not buyable', () => {
    const v = buildPackView({ packSize: 1000, pricePerThousandCents: 800, remaining: 700, status: 'AVAILABLE' });
    expect(v.packsAvailable).toBe(0);
    expect(v.packsAvailableLabel).toBe('No packs left');
    expect(v.packAvailable).toBe(false);
    expect(v.leftoverCards).toBe(700);
  });

  it('a lot that is not for sale is not buyable even with cards left', () => {
    expect(buildPackView({ packSize: 1000, pricePerThousandCents: 800, remaining: 5000, status: 'SOLD' }).packAvailable).toBe(false);
  });

  it('a lot without a pack size has an empty view', () => {
    expect(buildPackView({ packSize: null, pricePerThousandCents: 800, remaining: 5000 })).toMatchObject({ packSize: null, packCents: null, packAvailable: false, packsAvailable: 0, packLabel: null });
  });
});

describe('labels and copy', () => {
  it('formats the labels', () => {
    expect(packLabel(1000)).toBe('1,000-card pack');
    expect(packLabel(250)).toBe('250-card pack');
    expect(packOfferLabel(1000, 800)).toBe('1,000-card pack, $8.00');
    expect(describePackLine(1, 1000)).toBe('1 pack of 1,000 cards');
    expect(describePackLine(3, 250)).toBe('3 packs of 250 cards');
  });

  it('every message has no em dash, no exclamation mark and none of the banned words', () => {
    const texts = [
      ...Object.values(BULK_LOT_MESSAGES),
      packLabel(1000),
      packOfferLabel(1000, 800),
      describePackLine(2, 500),
      buildPackView({ packSize: 1000, pricePerThousandCents: 800, remaining: 5000 }).packsAvailableLabel as string,
      buildPackView({ packSize: 1000, pricePerThousandCents: 800, remaining: 0 }).packsAvailableLabel as string,
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/\bAI\b/);
      expect(text.toLowerCase()).not.toContain('estate sale');
    }
  });

  it('the new pack messages exist and are plain', () => {
    for (const code of ['BULK_PACK_INVALID', 'BULK_PACK_COUNT', 'BULK_PACK_ONLY', 'BULK_NOT_PACK', 'BULK_PACK_LOCKED', 'BULK_PACK_TOO_PRICEY', 'BULK_PACK_PICKUP_ONLY', 'BULK_PACK_NO_DISCOUNT', 'BULK_PACK_TOO_CHEAP', 'BULK_PACK_CART_UNSUPPORTED', 'BULK_PACK_RETRY_TOKEN', 'BULK_PACK_DUPLICATE_PAYMENT']) {
      expect(typeof (BULK_LOT_MESSAGES as Record<string, string>)[code]).toBe('string');
      expect((BULK_LOT_MESSAGES as Record<string, string>)[code].length).toBeGreaterThan(10);
    }
  });
});
