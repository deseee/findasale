import { markdownRestorePrice, recordItemPriceHistory } from '../utils/itemPriceHistory';

describe('markdownRestorePrice', () => {
  const marked = { markdownApplied: true, status: 'AVAILABLE', price: 0.99, priceBeforeMarkdown: 1.25 };
  it('returns the pre-markdown price for a live marked-down item', () => {
    expect(markdownRestorePrice(marked, false)).toBe(1.25);
  });
  it('returns null when the same save sets a manual price', () => {
    expect(markdownRestorePrice(marked, true)).toBeNull();
  });
  it('returns null for an item that is not marked down, not live, or has no usable anchor', () => {
    expect(markdownRestorePrice({ ...marked, markdownApplied: false }, false)).toBeNull();
    expect(markdownRestorePrice({ ...marked, status: 'SOLD' }, false)).toBeNull();
    expect(markdownRestorePrice({ ...marked, status: 'RESERVED' }, false)).toBeNull();
    expect(markdownRestorePrice({ ...marked, priceBeforeMarkdown: null }, false)).toBeNull();
    expect(markdownRestorePrice({ ...marked, priceBeforeMarkdown: 0 }, false)).toBeNull();
    expect(markdownRestorePrice({ ...marked, priceBeforeMarkdown: 0.99 }, false)).toBeNull();
  });
});

describe('recordItemPriceHistory', () => {
  it('writes one row per priced entry and skips entries without a number', async () => {
    const create = jest.fn(async () => ({}));
    await recordItemPriceHistory({ itemPriceHistory: { create } }, [
      { itemId: 'a', price: 2, changedBy: 'organizer', note: 'x' },
      { itemId: 'b', price: null, changedBy: 'organizer' },
      { itemId: 'c', price: 3, changedBy: 'reverseAuction' },
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(2, { data: { itemId: 'c', price: 3, changedBy: 'reverseAuction', note: null } });
  });
  it('never throws when the write fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(recordItemPriceHistory({ itemPriceHistory: { create: jest.fn(async () => { throw new Error('x'); }) } }, { itemId: 'a', price: 1, changedBy: 'organizer' })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
