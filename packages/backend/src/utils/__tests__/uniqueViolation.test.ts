/**
 * utils/uniqueViolation (2026-11-05, schema review #2/#9). The P2002 meta shapes below are the ones Prisma 5.22 returns
 * against Postgres for the raw partial unique indexes (captured on a scratch database built from all migrations):
 *   { modelName: 'Purchase', target: ['squarePaymentId', 'itemId'] }
 */
import { createOrFindExisting, isPurchaseKeyViolation, isUniqueViolation } from '../uniqueViolation';

const p2002 = (meta?: Record<string, unknown>) => Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta });

describe('isUniqueViolation', () => {
  it('matches any P2002 without columns, and only P2002', () => {
    expect(isUniqueViolation(p2002())).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('x'), { code: 'P2003' }))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
  it('with columns, requires one of them in meta.target (array or index-name string)', () => {
    expect(isUniqueViolation(p2002({ target: ['ebayListingId'] }), ['ebayListingId', 'ebayOfferId'])).toBe(true);
    expect(isUniqueViolation(p2002({ target: 'Item_ebayOfferId_unique' }), ['ebayOfferId'])).toBe(true);
    expect(isUniqueViolation(p2002({ target: ['sku'] }), ['ebayListingId'])).toBe(false);
    expect(isUniqueViolation(p2002(), ['ebayListingId'])).toBe(false);
  });
});

describe('isPurchaseKeyViolation', () => {
  it('is true for the Purchase idempotency indexes', () => {
    expect(isPurchaseKeyViolation(p2002({ modelName: 'Purchase', target: ['squarePaymentId', 'itemId'] }))).toBe(true);
    expect(isPurchaseKeyViolation(p2002({ target: ['clientTransactionId', 'itemId'] }))).toBe(true);
  });
  it('is false for a unique violation on another table in the same transaction, or a bare P2002', () => {
    expect(isPurchaseKeyViolation(p2002({ modelName: 'Item', target: ['ebayListingId'] }))).toBe(false);
    expect(isPurchaseKeyViolation(p2002({ modelName: 'BulkLotHold', target: ['purchaseId'] }))).toBe(false);
    expect(isPurchaseKeyViolation(p2002())).toBe(false);
  });
});

describe('createOrFindExisting', () => {
  it('returns the created row', async () => {
    await expect(createOrFindExisting(async () => ({ id: 'new' }), async () => null)).resolves.toEqual({ row: { id: 'new' }, created: true });
  });
  it('on P2002 returns the row that won, created=false', async () => {
    const r = await createOrFindExisting(async () => { throw p2002({ modelName: 'Purchase' }); }, async () => ({ id: 'winner' }));
    expect(r).toEqual({ row: { id: 'winner' }, created: false });
  });
  it('re-throws when the winner cannot be found, or for any other error', async () => {
    await expect(createOrFindExisting(async () => { throw p2002(); }, async () => null)).rejects.toMatchObject({ code: 'P2002' });
    const findExisting = jest.fn();
    await expect(createOrFindExisting(async () => { throw new Error('boom'); }, findExisting)).rejects.toThrow('boom');
    expect(findExisting).not.toHaveBeenCalled();
  });
});
