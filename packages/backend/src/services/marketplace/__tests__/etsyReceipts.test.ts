/**
 * ADR-135 batch E-B4 acceptance 2 (receipt extraction persists no buyer fields) and the path rules of
 * acceptance 1 (resource_url is only ever parsed into ids). Everything is injected: a fake authedRequest,
 * no Etsy call, no database.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('../../../lib/prisma', () => ({ prisma: {} }));

import {
  ETSY_RECEIPT_PAGE_LIMIT,
  extractEtsyTransactions,
  fetchEtsyReceipt,
  fetchEtsyReceiptsPage,
  parseEtsyReceiptResource,
  toEtsyIdString,
} from '../etsyReceipts';

const PAID_SECONDS = 1_790_000_000; // 2026-09
const BUYER_NAME = 'Pat Q. Buyer';
const BUYER_EMAIL = 'buyer-secret@example.com';
const BUYER_STREET = '12 Hidden Lane';

function receipt(over: Record<string, any> = {}) {
  return {
    receipt_id: 3001,
    is_paid: true,
    status: 'paid',
    name: BUYER_NAME,
    buyer_email: BUYER_EMAIL,
    first_line: BUYER_STREET,
    city: 'Paw Paw',
    zip: '49079',
    message_from_buyer: 'please wrap it',
    grandtotal: { amount: 2500, divisor: 100, currency_code: 'USD' },
    created_timestamp: PAID_SECONDS - 100,
    updated_timestamp: PAID_SECONDS + 5,
    transactions: [
      {
        transaction_id: 7001,
        listing_id: 9001,
        quantity: 2,
        receipt_id: 3001,
        paid_timestamp: PAID_SECONDS,
        title: 'Brass candlestick',
        buyer_user_id: 424242,
        price: { amount: 1250, divisor: 100, currency_code: 'USD' },
      },
    ],
    ...over,
  };
}

describe('toEtsyIdString', () => {
  it.each([
    [12345, '12345'],
    ['12345', '12345'],
    [0, null],
    [-4, null],
    ['0123', null],
    ['12a', null],
    [1.5, null],
    [Number.MAX_SAFE_INTEGER + 10, null],
    [null, null],
    [undefined, null],
    [{}, null],
  ])('%p -> %p', (input, expected) => {
    expect(toEtsyIdString(input)).toBe(expected);
  });
});

describe('parseEtsyReceiptResource (resource_url is parsed, never fetched)', () => {
  it('reads a bare path and an absolute URL, ignoring the host', () => {
    expect(parseEtsyReceiptResource('/v3/application/shops/555/receipts/3001', 555)).toEqual({ shopId: '555', receiptId: '3001' });
    expect(parseEtsyReceiptResource('/v3/application/shops/555/receipts/3001', '555')).toEqual({ shopId: '555', receiptId: '3001' });
    expect(parseEtsyReceiptResource('https://anything.example/v3/application/shops/555/receipts/3001', 555)).toEqual({
      shopId: '555',
      receiptId: '3001',
    });
  });

  it.each([
    ['a different shop than the payload', '/v3/application/shops/556/receipts/3001'],
    ['a different resource', '/v3/application/shops/555/listings/3001'],
    ['extra path segments', '/v3/application/shops/555/receipts/3001/transactions'],
    ['a trailing slash', '/v3/application/shops/555/receipts/3001/'],
    ['non-numeric ids', '/v3/application/shops/555/receipts/abc'],
    ['a leading zero id', '/v3/application/shops/555/receipts/0301'],
    ['path traversal', '/v3/application/shops/555/receipts/3001/../../x'],
    ['an internal address with another path', 'http://169.254.169.254/latest/meta-data'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an empty string', ''],
    ['a very long string', `/v3/application/shops/555/receipts/${'1'.repeat(600)}`],
  ])('rejects %s', (_label, url) => {
    expect(parseEtsyReceiptResource(url, 555)).toBeNull();
  });

  it('rejects a missing or invalid payload shop id and a non-string url', () => {
    expect(parseEtsyReceiptResource('/v3/application/shops/555/receipts/3001', undefined)).toBeNull();
    expect(parseEtsyReceiptResource('/v3/application/shops/555/receipts/3001', 'x')).toBeNull();
    expect(parseEtsyReceiptResource(12345 as any, 555)).toBeNull();
    expect(parseEtsyReceiptResource(null, 555)).toBeNull();
  });

  it('ignores a query string on a bare path (the path rule still applies)', () => {
    expect(parseEtsyReceiptResource('/v3/application/shops/555/receipts/3001?legacy=true', 555)).toEqual({ shopId: '555', receiptId: '3001' });
  });
});

describe('extractEtsyTransactions (acceptance 2: only the five fields survive)', () => {
  it('returns exactly transactionId, listingId, quantity, receiptId and paidAt', () => {
    const out = extractEtsyTransactions(receipt());
    expect(out).toEqual([
      { transactionId: '7001', listingId: '9001', quantity: 2, receiptId: '3001', paidAt: new Date(PAID_SECONDS * 1000) },
    ]);
    expect(Object.keys(out[0]).sort()).toEqual(['listingId', 'paidAt', 'quantity', 'receiptId', 'transactionId']);
  });

  it('carries no buyer field anywhere in the serialized output', () => {
    const text = JSON.stringify(extractEtsyTransactions(receipt()));
    for (const secret of [BUYER_NAME, BUYER_EMAIL, BUYER_STREET, 'Paw Paw', '49079', 'please wrap it', '424242', 'Brass candlestick', 'grandtotal']) {
      expect(text).not.toContain(secret);
    }
  });

  it('uses the receipt id when a transaction omits its own', () => {
    const r = receipt();
    delete (r.transactions[0] as any).receipt_id;
    expect(extractEtsyTransactions(r)[0].receiptId).toBe('3001');
  });

  it('skips unpaid receipts, bad ids, bad quantities and duplicates', () => {
    expect(extractEtsyTransactions(receipt({ is_paid: false }))).toEqual([]);
    const tx = (over: Record<string, any>) => ({ transaction_id: 7002, listing_id: 9002, quantity: 1, paid_timestamp: PAID_SECONDS, ...over });
    const r = receipt({
      transactions: [
        tx({ transaction_id: 'x' }),
        tx({ listing_id: 0 }),
        tx({ quantity: 0 }),
        tx({ quantity: 1.5 }),
        tx({ quantity: 100000 }),
        tx({ transaction_id: 7010 }),
        tx({ transaction_id: 7010 }),
        null,
        'garbage',
      ],
    });
    expect(extractEtsyTransactions(r).map((t) => t.transactionId)).toEqual(['7010']);
  });

  it('needs a paid time: paid_timestamp, or created time only when the receipt says is_paid true', () => {
    const noPaid = receipt();
    delete (noPaid.transactions[0] as any).paid_timestamp;
    expect(extractEtsyTransactions({ ...noPaid, is_paid: undefined })).toEqual([]);
    const flagged = receipt({ is_paid: true });
    delete (flagged.transactions[0] as any).paid_timestamp;
    (flagged.transactions[0] as any).created_timestamp = PAID_SECONDS - 50;
    expect(extractEtsyTransactions(flagged)[0].paidAt).toEqual(new Date((PAID_SECONDS - 50) * 1000));
    const unflagged = receipt();
    delete (unflagged as any).is_paid;
    delete (unflagged.transactions[0] as any).paid_timestamp;
    expect(extractEtsyTransactions(unflagged)).toEqual([]);
  });

  it('rejects an absurd timestamp and handles non-objects', () => {
    const r = receipt();
    (r.transactions[0] as any).paid_timestamp = 5;
    (r as any).is_paid = undefined;
    expect(extractEtsyTransactions(r)).toEqual([]);
    expect(extractEtsyTransactions(null)).toEqual([]);
    expect(extractEtsyTransactions('x')).toEqual([]);
    expect(extractEtsyTransactions({ transactions: 'no' })).toEqual([]);
  });
});

describe('fetchEtsyReceipt', () => {
  it('builds the path from numeric ids only, URGENT, and returns the extracted fields', async () => {
    const authedRequest = jest.fn(async () => ({ ok: true, status: 200, data: receipt(), headers: {}, rawText: '' }));
    const out = await fetchEtsyReceipt({ organizerId: 'org_1', shopId: '555', receiptId: '3001' }, { authedRequest } as any);
    expect(out).toEqual({ ok: true, transactions: expect.any(Array) });
    expect(authedRequest).toHaveBeenCalledTimes(1);
    expect(authedRequest).toHaveBeenCalledWith('org_1', {
      method: 'GET',
      path: '/v3/application/shops/555/receipts/3001',
      priority: 'URGENT',
      endpoint: 'GET getShopReceipt',
    });
  });

  it('refuses non-numeric ids without calling Etsy', async () => {
    const authedRequest = jest.fn();
    expect(await fetchEtsyReceipt({ organizerId: 'o', shopId: '555/../x', receiptId: '1' }, { authedRequest } as any)).toEqual({ ok: false, status: 400 });
    expect(await fetchEtsyReceipt({ organizerId: 'o', shopId: '555', receiptId: 'http://evil' }, { authedRequest } as any)).toEqual({ ok: false, status: 400 });
    expect(authedRequest).not.toHaveBeenCalled();
  });

  it('reduces an HTTP failure to its status code', async () => {
    const authedRequest = jest.fn(async () => ({ ok: false, status: 403, data: { error: 'buyer@example.com' }, headers: {}, rawText: 'buyer@example.com' }));
    expect(await fetchEtsyReceipt({ organizerId: 'o', shopId: '555', receiptId: '3001' }, { authedRequest } as any)).toEqual({ ok: false, status: 403 });
  });
});

describe('fetchEtsyReceiptsPage', () => {
  it('asks for paid, not-canceled receipts changed since the cursor, oldest change first, BACKGROUND', async () => {
    const authedRequest = jest.fn(async () => ({ ok: true, status: 200, data: { count: 0, results: [] }, headers: {}, rawText: '' }));
    await fetchEtsyReceiptsPage(
      { organizerId: 'org_1', shopId: '555', minLastModified: new Date((PAID_SECONDS + 0.9) * 1000), offset: 100 },
      { authedRequest } as any
    );
    expect(authedRequest).toHaveBeenCalledWith('org_1', {
      method: 'GET',
      path: '/v3/application/shops/555/receipts',
      priority: 'BACKGROUND',
      endpoint: 'GET getShopReceipts',
      query: {
        was_paid: true,
        was_canceled: false,
        min_last_modified: PAID_SECONDS,
        sort_on: 'updated',
        sort_order: 'asc',
        limit: ETSY_RECEIPT_PAGE_LIMIT,
        offset: 100,
      },
    });
  });

  it('never asks below the spec minimum timestamp or above the spec page limit', async () => {
    const authedRequest = jest.fn(async () => ({ ok: true, status: 200, data: { results: [] }, headers: {}, rawText: '' }));
    await fetchEtsyReceiptsPage({ organizerId: 'o', shopId: '555', minLastModified: new Date(0), offset: -5, limit: 500 }, { authedRequest } as any);
    const q = (authedRequest.mock.calls[0] as any)[1].query;
    expect(q.min_last_modified).toBe(946684800);
    expect(q.limit).toBe(100);
    expect(q.offset).toBe(0);
  });

  it('returns transactions, receipt count, newest updated time and whether the page was ascending', async () => {
    const data = {
      count: 2,
      results: [
        receipt({ receipt_id: 1, updated_timestamp: PAID_SECONDS + 10, transactions: [{ transaction_id: 11, listing_id: 9001, quantity: 1, paid_timestamp: PAID_SECONDS }] }),
        receipt({ receipt_id: 2, updated_timestamp: PAID_SECONDS + 20, transactions: [{ transaction_id: 12, listing_id: 9002, quantity: 3, paid_timestamp: PAID_SECONDS + 1 }] }),
      ],
    };
    const authedRequest = jest.fn(async () => ({ ok: true, status: 200, data, headers: {}, rawText: '' }));
    const out: any = await fetchEtsyReceiptsPage({ organizerId: 'o', shopId: '555', minLastModified: new Date(PAID_SECONDS * 1000), offset: 0 }, { authedRequest } as any);
    expect(out.ok).toBe(true);
    expect(out.receiptCount).toBe(2);
    expect(out.ascending).toBe(true);
    expect(out.maxUpdatedAt).toEqual(new Date((PAID_SECONDS + 20) * 1000));
    expect(out.transactions.map((t: any) => [t.transactionId, t.quantity])).toEqual([['11', 1], ['12', 3]]);
    expect(JSON.stringify(out)).not.toContain(BUYER_EMAIL);
  });

  it('flags a page that is not in ascending order', async () => {
    const data = { results: [receipt({ updated_timestamp: PAID_SECONDS + 20 }), receipt({ updated_timestamp: PAID_SECONDS + 10 })] };
    const authedRequest = jest.fn(async () => ({ ok: true, status: 200, data, headers: {}, rawText: '' }));
    const out: any = await fetchEtsyReceiptsPage({ organizerId: 'o', shopId: '555', minLastModified: new Date(PAID_SECONDS * 1000), offset: 0 }, { authedRequest } as any);
    expect(out.ascending).toBe(false);
    expect(out.maxUpdatedAt).toEqual(new Date((PAID_SECONDS + 20) * 1000));
  });

  it('handles an empty, malformed or failing response', async () => {
    const mk = (res: any) => ({ authedRequest: jest.fn(async () => res) } as any);
    const args = { organizerId: 'o', shopId: '555', minLastModified: new Date(PAID_SECONDS * 1000), offset: 0 };
    expect(await fetchEtsyReceiptsPage(args, mk({ ok: true, status: 200, data: null }))).toMatchObject({ ok: true, receiptCount: 0, transactions: [], maxUpdatedAt: null, ascending: true });
    expect(await fetchEtsyReceiptsPage(args, mk({ ok: true, status: 200, data: { results: 'no' } }))).toMatchObject({ ok: true, receiptCount: 0 });
    expect(await fetchEtsyReceiptsPage(args, mk({ ok: false, status: 500, data: null }))).toEqual({ ok: false, status: 500 });
    expect(await fetchEtsyReceiptsPage({ ...args, shopId: 'x' }, mk({}))).toEqual({ ok: false, status: 400 });
  });
});
