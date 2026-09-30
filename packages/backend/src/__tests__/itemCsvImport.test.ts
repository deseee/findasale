/**
 * Shared CSV item-import row validation (bulk-import + legacy import-items).
 * Pure functions; no Prisma. (Written 2026-09-29 without being executed: jest cannot run on the authoring machine.)
 */
import {
  buildImportItem,
  parseImportMoney,
  detectImportColumnMapping,
  splitPhotoUrlCell,
  isSafeImportPhotoUrl,
  importPhotoCapForTier,
  IMPORT_MAX_ROWS,
  ImportRowContext,
} from '../services/itemCsvImport';
import { isSafePublicUrlSyntax } from '../utils/safeFetchPublicUrl';

const NOW = new Date('2026-09-29T12:00:00Z');
const ctx = (over: Partial<ImportRowContext> = {}): ImportRowContext => ({
  saleId: 'sale1',
  organizerId: 'org1',
  maxPhotos: 5,
  requirePrice: true,
  now: NOW,
  ...over,
});

describe('detectImportColumnMapping', () => {
  it('maps legacy camelCase headers and friendly aliases case-insensitively, BOM-safe', () => {
    const m = detectImportColumnMapping(['﻿Title', 'Price', 'photoUrls', 'auctionStartPrice', 'bidIncrement', 'auctionEndTime', 'reverseAuction', 'reverseDailyDrop', 'reverseFloorPrice', 'reverseStartDate', 'status']);
    expect(m.title).toBe('﻿Title');
    expect(m.price).toBe('Price');
    expect(m.photoUrls).toBe('photoUrls');
    expect(m.auctionStartPrice).toBe('auctionStartPrice');
    expect(m.bidIncrement).toBe('bidIncrement');
    expect(m.auctionEndTime).toBe('auctionEndTime');
    expect(m.reverseAuction).toBe('reverseAuction');
    expect(m.reverseDailyDrop).toBe('reverseDailyDrop');
    expect(m.reverseFloorPrice).toBe('reverseFloorPrice');
    expect(m.reverseStartDate).toBe('reverseStartDate');
    expect(m.status).toBe('status');
  });
});

describe('buildImportItem: safety defaults', () => {
  it('imports as a DRAFT with status AVAILABLE and sets the pricing anchor', () => {
    const r = buildImportItem({ title: ' Brass lamp ', price: '$25.99' }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      title: 'Brass lamp', price: 25.99, originalPrice: 25.99, status: 'AVAILABLE', draftStatus: 'DRAFT',
      listingType: 'FIXED', saleId: 'sale1', organizerId: 'org1', embedding: [], photoUrls: [],
    });
  });

  it('never lets status create SOLD / AUCTION_ENDED items and warns instead of failing the row', () => {
    for (const status of ['SOLD', 'AUCTION_ENDED', 'RESERVED', 'sold']) {
      const r = buildImportItem({ title: 'x', price: '1', status }, ctx());
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.data.status).toBe('AVAILABLE');
      expect(r.data.draftStatus).toBe('DRAFT');
      expect(r.warnings.join(' ')).toMatch(/status/);
    }
    const okStatus = buildImportItem({ title: 'x', price: '1', status: 'DRAFT' }, ctx());
    expect(okStatus.ok && okStatus.warnings.length).toBe(0);
  });

  it('requires a title and, on bulk-import, a price', () => {
    expect(buildImportItem({ title: '  ', price: '1' }, ctx())).toEqual({ ok: false, error: expect.stringMatching(/title/) });
    expect(buildImportItem({ title: 'x' }, ctx())).toEqual({ ok: false, error: expect.stringMatching(/price is required/) });
    expect(buildImportItem({ title: 'x' }, ctx({ requirePrice: false })).ok).toBe(true);
    expect(buildImportItem({ title: 'x', price: 'abc' }, ctx())).toEqual({ ok: false, error: expect.stringMatching(/not a valid number/) });
  });

  it('limits text lengths', () => {
    expect(buildImportItem({ title: 'a'.repeat(201), price: '1' }, ctx()).ok).toBe(false);
    expect(buildImportItem({ title: 'x', price: '1', description: 'a'.repeat(2001) }, ctx()).ok).toBe(false);
    expect(buildImportItem({ title: 'x', price: '1', category: 'a'.repeat(51) }, ctx()).ok).toBe(false);
  });

  it('keeps valid conditions and blanks (with a warning) invalid ones', () => {
    const ok = buildImportItem({ title: 'x', price: '1', condition: 'used' }, ctx());
    expect(ok.ok && ok.data.condition).toBe('USED');
    const bad = buildImportItem({ title: 'x', price: '1', condition: 'mint' }, ctx());
    expect(bad.ok && bad.data.condition).toBeNull();
    expect(bad.ok && bad.warnings.length).toBe(1);
  });

  it('exposes the 200-row cap constant', () => {
    expect(IMPORT_MAX_ROWS).toBe(200);
  });
});

describe('photo URLs: https-only strings', () => {
  it('splits on whitespace, pipes and url-starting commas but keeps commas inside Cloudinary transforms', () => {
    const cell = 'https://res.cloudinary.com/d/image/upload/w_200,h_200/a.jpg, https://cdn.example.com/b.jpg|https://cdn.example.com/c.jpg\nhttps://cdn.example.com/d.jpg';
    expect(splitPhotoUrlCell(cell)).toEqual([
      'https://res.cloudinary.com/d/image/upload/w_200,h_200/a.jpg',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
      'https://cdn.example.com/d.jpg',
    ]);
  });

  it('rejects http, credentials, odd ports, IP literals, localhost and internal names', () => {
    expect(isSafeImportPhotoUrl('https://cdn.example.com/a.jpg')).toBe(true);
    for (const u of [
      'http://cdn.example.com/a.jpg',
      'https://user:pw@cdn.example.com/a.jpg',
      'https://cdn.example.com:8443/a.jpg',
      'https://127.0.0.1/a.jpg',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/a.jpg',
      'https://localhost/a.jpg',
      'https://intranet/a.jpg',
      'https://db.internal/a.jpg',
      'https://printer.local/a.jpg',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'https://2130706433/a.jpg',
    ]) {
      expect(isSafeImportPhotoUrl(u)).toBe(false);
    }
  });

  it('keeps safe URLs, skips unsafe ones with a warning, dedupes, and caps by tier', () => {
    const urls = ['https://a.example.com/1.jpg', 'http://a.example.com/2.jpg', 'https://a.example.com/1.jpg', 'https://a.example.com/3.jpg', 'https://a.example.com/4.jpg'].join(' ');
    const r = buildImportItem({ title: 'x', price: '1', photoUrls: urls }, ctx({ maxPhotos: 2 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.photoUrls).toEqual(['https://a.example.com/1.jpg', 'https://a.example.com/3.jpg']);
    expect(r.warnings.some((w) => /skipped/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /first 2 photo URLs/.test(w))).toBe(true);
  });

  it('maps tier to a photo cap never above 10', () => {
    expect(importPhotoCapForTier('SIMPLE')).toBe(5);
    expect(importPhotoCapForTier('PRO')).toBe(10);
    expect(importPhotoCapForTier('TEAMS')).toBe(10);
    expect(importPhotoCapForTier(null)).toBe(10);
  });
});

describe('auction rows', () => {
  const future = '2026-10-15T18:00:00Z';
  it('builds an AUCTION item with a default bid increment of 1', () => {
    const r = buildImportItem({ title: 'x', auctionStartPrice: '10', auctionEndTime: future }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ listingType: 'AUCTION', auctionStartPrice: 10, bidIncrement: 1, price: null, reverseAuction: false });
    expect(r.data.auctionEndTime?.toISOString()).toBe('2026-10-15T18:00:00.000Z');
  });
  it('honours a valid bid increment, warns on an invalid one', () => {
    const good = buildImportItem({ title: 'x', auctionStartPrice: '10', auctionEndTime: future, bidIncrement: '2.50' }, ctx());
    expect(good.ok && good.data.bidIncrement).toBe(2.5);
    const bad = buildImportItem({ title: 'x', auctionStartPrice: '10', auctionEndTime: future, bidIncrement: '0' }, ctx());
    expect(bad.ok && bad.data.bidIncrement).toBe(1);
    expect(bad.ok && bad.warnings.length).toBe(1);
  });
  it('rejects missing/invalid/past end times and missing start price', () => {
    expect(buildImportItem({ title: 'x', auctionStartPrice: '10' }, ctx()).ok).toBe(false);
    expect(buildImportItem({ title: 'x', auctionStartPrice: '10', auctionEndTime: 'soon' }, ctx()).ok).toBe(false);
    expect(buildImportItem({ title: 'x', auctionStartPrice: '10', auctionEndTime: '2026-01-01T00:00:00Z' }, ctx()).ok).toBe(false);
    expect(buildImportItem({ title: 'x', auctionEndTime: future }, ctx()).ok).toBe(false);
  });
  it('does not require price on an auction row even when requirePrice is on', () => {
    expect(buildImportItem({ title: 'x', auctionStartPrice: '5', auctionEndTime: future }, ctx({ requirePrice: true })).ok).toBe(true);
  });
});

describe('reverse-auction rows', () => {
  it('converts dollars to cents and sets both listingType and the deprecated flag', () => {
    const r = buildImportItem({ title: 'x', price: '100', reverseAuction: 'true', reverseDailyDrop: '5', reverseFloorPrice: '40.50', reverseStartDate: '2026-10-01' }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ listingType: 'REVERSE_AUCTION', reverseAuction: true, reverseDailyDrop: 500, reverseFloorPrice: 4050, price: 100 });
    expect(r.data.reverseStartDate).toBeInstanceOf(Date);
  });
  it('validates the reverse-auction set', () => {
    expect(buildImportItem({ title: 'x', reverseAuction: '1', reverseDailyDrop: '5', reverseFloorPrice: '1' }, ctx()).ok).toBe(false); // no price
    expect(buildImportItem({ title: 'x', price: '100', reverseAuction: '1', reverseFloorPrice: '1' }, ctx()).ok).toBe(false); // no drop
    expect(buildImportItem({ title: 'x', price: '100', reverseAuction: '1', reverseDailyDrop: '5' }, ctx()).ok).toBe(false); // no floor
    expect(buildImportItem({ title: 'x', price: '100', reverseAuction: '1', reverseDailyDrop: '5', reverseFloorPrice: '100' }, ctx()).ok).toBe(false); // floor >= price
    expect(buildImportItem({ title: 'x', price: '100', reverseAuction: '1', reverseDailyDrop: '5', reverseFloorPrice: '1', reverseStartDate: 'nope' }, ctx()).ok).toBe(false);
  });
  it('rejects a row that is both an auction and a reverse auction', () => {
    const r = buildImportItem({ title: 'x', price: '100', auctionStartPrice: '5', auctionEndTime: '2026-10-15T18:00:00Z', reverseAuction: 'true', reverseDailyDrop: '5', reverseFloorPrice: '1' }, ctx());
    expect(r.ok).toBe(false);
  });
  it('warns when auction columns are filled on a plain fixed-price row', () => {
    const r = buildImportItem({ title: 'x', price: '10', bidIncrement: '2' }, ctx());
    expect(r.ok && r.warnings.length).toBe(1);
    expect(r.ok && r.data.listingType).toBe('FIXED');
  });
});

describe('parseImportMoney (strict)', () => {
  it('accepts plain amounts, a leading $, US thousands commas and a trailing USD', () => {
    for (const [raw, n] of [['25', 25], ['25.5', 25.5], ['25.99', 25.99], ['$25.99', 25.99], ['$1,250.00', 1250], ['1,250', 1250], ['1,234,567.89', 1234567.89], ['.50', 0.5], ['25.99 USD', 25.99], ['25.99USD', 25.99], ['$ 3.00', 3], ['0', 0]] as Array<[string, number]>) {
      expect(parseImportMoney(raw)).toBe(n);
    }
  });

  it('empty input is null (not an error)', () => {
    expect(parseImportMoney('')).toBeNull();
    expect(parseImportMoney('   ')).toBeNull();
  });

  it('rejects exponent, negative, garbage, extra decimals, European separators and misplaced commas', () => {
    for (const bad of ['1e3', '1E3', '1e400', '-5', '(5)', '+5', 'abc', '12abc', 'a12', '1.999', '1.234,56', '1 234', '1,2,3', '12,34', '$', '..5', '5..5', '1.2.3', '0x10', 'Infinity', 'NaN', '$-5', '5-', '99999999999']) {
      expect(parseImportMoney(bad)).toBeNaN();
    }
  });

  it('the old lenient parse turned "1e3" into 13 and "1.234,56" into 1.234; those rows are now reported', () => {
    const r1 = buildImportItem({ title: 'x', price: '1e3' }, ctx());
    expect(r1).toEqual({ ok: false, error: expect.stringMatching(/not a valid number/) });
    const r2 = buildImportItem({ title: 'x', price: '1.234,56' }, ctx());
    expect(r2.ok).toBe(false);
    const r3 = buildImportItem({ title: 'x', price: '-5' }, ctx());
    expect(r3.ok).toBe(false);
  });

  it('applies to auction and reverse-auction money fields too', () => {
    expect(buildImportItem({ title: 'x', auctionStartPrice: '1e2', auctionEndTime: '2026-10-15T18:00:00Z' }, ctx()).ok).toBe(false);
    expect(buildImportItem({ title: 'x', price: '100', reverseAuction: 'true', reverseDailyDrop: '5', reverseFloorPrice: '-1' }, ctx()).ok).toBe(false);
    const inc = buildImportItem({ title: 'x', auctionStartPrice: '10', auctionEndTime: '2026-10-15T18:00:00Z', bidIncrement: '1e1' }, ctx());
    expect(inc.ok).toBe(true);
    if (inc.ok) {
      expect(inc.data.bidIncrement).toBe(1);
      expect(inc.warnings.join(' ')).toMatch(/bidIncrement/);
    }
  });
});

describe('isSafeImportPhotoUrl shares the public-host guard', () => {
  it('rejects the IP spellings and internal names the shared guard refuses', () => {
    for (const u of ['https://0x7f.0.0.1/a.jpg', 'https://017700000001/a.jpg', 'https://[::ffff:127.0.0.1]/a.jpg', 'https://127.1/a.jpg', 'https://foo.localhost/a.jpg', 'https://nas.lan/a.jpg', 'https://x.home.arpa/a.jpg']) {
      expect(isSafeImportPhotoUrl(u)).toBe(false);
    }
  });
  it('agrees with isSafePublicUrlSyntax for host rules and still caps the length', () => {
    for (const u of ['https://cdn.example.com/a.jpg', 'https://a.b.example.co.uk/x', 'https://10.0.0.1/a.jpg', 'http://cdn.example.com/a.jpg', 'https://cdn.example.com:444/a.jpg']) {
      expect(isSafeImportPhotoUrl(u)).toBe(isSafePublicUrlSyntax(u));
    }
    expect(isSafeImportPhotoUrl('https://cdn.example.com/' + 'a'.repeat(3000))).toBe(false);
    expect(isSafeImportPhotoUrl('')).toBe(false);
  });
});
