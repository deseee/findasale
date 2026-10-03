/**
 * organizerEdit helpers (Item.lastEditedAt stamping). NOT EXECUTED when written (jest cannot run on the
 * authoring device); CI is the first real run. Pure functions, no mocks needed.
 */
import {
  ORGANIZER_VISIBLE_ITEM_FIELDS,
  hasUserVisibleChange,
  organizerEditStamp,
  organizerEditStampAlways,
} from '../organizerEdit';

const NOW = new Date('2026-10-04T12:00:00.000Z');

// Minimal stand-in for a Prisma Decimal: has toNumber() and toString().
const dec = (n: number) => ({ toNumber: () => n, toString: () => String(n) });
// A Decimal-like that only exposes toString().
const decStringOnly = (s: string) => ({ toString: () => s });

const existingRow = () => ({
  id: 'item_1',
  title: 'Brass lamp',
  description: 'Works well',
  price: 10,
  category: 'Home & Garden',
  photoUrls: ['a.jpg', 'b.jpg'],
  tags: ['brass', 'lamp'],
  packageLengthIn: dec(12.5),
  auctionEndTime: new Date('2026-11-01T00:00:00.000Z'),
  brand: null as string | null,
  ebayListingId: 'EB1',
  priceUpdatedAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
});

describe('ORGANIZER_VISIBLE_ITEM_FIELDS', () => {
  it('lists user-visible fields and excludes system-managed ones', () => {
    const list = ORGANIZER_VISIBLE_ITEM_FIELDS as readonly string[];
    expect(list).toContain('title');
    expect(list).toContain('price');
    expect(list).toContain('photoUrls');
    for (const system of ['updatedAt', 'priceUpdatedAt', 'ebayListingId', 'ebayOfferId', 'ebaySyncState', 'embedding', 'aiConfidence', 'originalPrice', 'priceBeforeMarkdown', 'rarity']) {
      expect(list).not.toContain(system);
    }
  });
});

describe('organizerEditStamp', () => {
  it('returns {} for a same-value resave', () => {
    const row = existingRow();
    const patch = { title: 'Brass lamp', price: 10, photoUrls: ['a.jpg', 'b.jpg'], tags: ['brass', 'lamp'], brand: null };
    expect(organizerEditStamp(row, patch, NOW)).toEqual({});
  });

  it('treats price "10.00" and 10 as unchanged', () => {
    expect(organizerEditStamp(existingRow(), { price: '10.00' }, NOW)).toEqual({});
    expect(organizerEditStamp({ price: '10.00' }, { price: 10 }, NOW)).toEqual({});
  });

  it('treats equal Decimal-like objects as unchanged', () => {
    expect(organizerEditStamp(existingRow(), { packageLengthIn: dec(12.5) }, NOW)).toEqual({});
    expect(organizerEditStamp(existingRow(), { packageLengthIn: 12.5 }, NOW)).toEqual({});
    expect(organizerEditStamp(existingRow(), { packageLengthIn: '12.50' }, NOW)).toEqual({});
    expect(organizerEditStamp({ price: decStringOnly('10.00') }, { price: 10 }, NOW)).toEqual({});
  });

  it('stamps when a Decimal-like value changes', () => {
    expect(organizerEditStamp(existingRow(), { packageLengthIn: dec(14) }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('stamps when price changes', () => {
    expect(organizerEditStamp(existingRow(), { price: 12.5 }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('stamps when title changes', () => {
    expect(organizerEditStamp(existingRow(), { title: 'Brass desk lamp' }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('counts a photoUrls reorder as a change', () => {
    expect(organizerEditStamp(existingRow(), { photoUrls: ['b.jpg', 'a.jpg'] }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('counts a photoUrls add or remove as a change', () => {
    expect(organizerEditStamp(existingRow(), { photoUrls: ['a.jpg'] }, NOW)).toEqual({ lastEditedAt: NOW });
    expect(organizerEditStamp(existingRow(), { photoUrls: ['a.jpg', 'b.jpg', 'c.jpg'] }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('ignores patch fields that are undefined', () => {
    expect(organizerEditStamp(existingRow(), { title: undefined, price: undefined, photoUrls: undefined }, NOW)).toEqual({});
  });

  it('never stamps for non-listed system fields alone', () => {
    const patch = {
      ebayListingId: 'EB2',
      updatedAt: new Date('2026-10-04T00:00:00.000Z'),
      priceUpdatedAt: new Date('2026-10-04T00:00:00.000Z'),
      ebaySyncState: 'PENDING',
      aiConfidence: 0.9,
    };
    expect(hasUserVisibleChange(existingRow(), patch)).toBe(false);
    expect(organizerEditStamp(existingRow(), patch, NOW)).toEqual({});
  });

  it('still stamps when a listed field changes alongside system fields', () => {
    expect(organizerEditStamp(existingRow(), { price: 11, priceUpdatedAt: new Date(), ebaySyncState: 'PENDING' }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('compares equal Dates as unchanged and different Dates as changed', () => {
    expect(organizerEditStamp(existingRow(), { auctionEndTime: new Date('2026-11-01T00:00:00.000Z') }, NOW)).toEqual({});
    expect(organizerEditStamp(existingRow(), { auctionEndTime: '2026-11-01T00:00:00.000Z' }, NOW)).toEqual({});
    expect(organizerEditStamp(existingRow(), { auctionEndTime: new Date('2026-11-02T00:00:00.000Z') }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('stamps when a null field gets a value, and when a value is cleared to null', () => {
    expect(organizerEditStamp(existingRow(), { brand: 'Acme' }, NOW)).toEqual({ lastEditedAt: NOW });
    expect(organizerEditStamp(existingRow(), { description: null }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('treats null against null (and blank against null) as unchanged', () => {
    expect(organizerEditStamp(existingRow(), { brand: null }, NOW)).toEqual({});
    expect(organizerEditStamp(existingRow(), { brand: '' }, NOW)).toEqual({});
  });

  it('does not conflate text fields that only look numeric', () => {
    expect(organizerEditStamp({ upc: '010' }, { upc: '10' }, NOW)).toEqual({ lastEditedAt: NOW });
  });

  it('handles a missing existing row or patch without throwing', () => {
    expect(organizerEditStamp(null, { title: 'x' }, NOW)).toEqual({ lastEditedAt: NOW });
    expect(organizerEditStamp(existingRow(), null, NOW)).toEqual({});
    expect(organizerEditStamp(existingRow(), {}, NOW)).toEqual({});
  });

  it('defaults now to the current time', () => {
    const before = Date.now();
    const out = organizerEditStamp(existingRow(), { title: 'New' });
    const after = Date.now();
    expect(out.lastEditedAt).toBeInstanceOf(Date);
    expect(out.lastEditedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(out.lastEditedAt!.getTime()).toBeLessThanOrEqual(after);
  });
});

describe('organizerEditStampAlways', () => {
  it('returns the given now', () => {
    expect(organizerEditStampAlways(NOW)).toEqual({ lastEditedAt: NOW });
    expect(organizerEditStampAlways(NOW).lastEditedAt).toBe(NOW);
  });

  it('defaults to a current Date', () => {
    expect(organizerEditStampAlways().lastEditedAt).toBeInstanceOf(Date);
  });
});
