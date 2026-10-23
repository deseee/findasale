/**
 * Publishing a sale together with its ready items (2026-10-23, activation-funnel-2026-10-23.md finding 1)
 * and the verify-to-publish gate (Patrick, 2026-10-23):
 *  - PATCH /sales/:id/status PUBLISHED publishes the sale's READY unpublished items in the same transaction, by default,
 *  - publishReadyItems: false publishes the sale only,
 *  - if any item fails its publish check inside the transaction nothing is published (409 SALE_ITEMS_CHANGED) and no
 *    item side effects run,
 *  - an unverified organizer cannot publish or reopen a sale (403 EMAIL_NOT_VERIFIED) but can still close one,
 *  - readiness rules: title, price above zero, a photo, not hidden.
 */
var mockPrisma: any;
const mockPublishItemForUser: jest.Mock = jest.fn();
jest.mock('../lib/prisma', () => {
  mockPrisma = {
    user: { findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    sale: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    item: { count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  return { prisma: mockPrisma };
});
// Loaded lazily (saleController imports it dynamically), so the factory only reads the mock at call time.
jest.mock('../controllers/itemController', () => ({
  publishItemForUser: (...args: any[]) => mockPublishItemForUser(...args),
}));
jest.mock('@sentry/node', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }));
jest.mock('../services/revalidationService', () => ({
  triggerSaleAndCityRevalidation: jest.fn(() => Promise.resolve()),
  debouncedTriggerSaleAndCityRevalidation: jest.fn(),
  citySlugFromCityState: jest.fn(() => null),
}));
jest.mock('../services/commandCenterService', () => ({ invalidateCommandCenterCache: jest.fn(() => Promise.resolve()) }));

import { updateSaleStatus, getSalePublishReadinessHandler, redateSale } from '../controllers/saleController';
import { itemNotReadyReasons, splitReadiness } from '../services/salePublishReadinessService';
import { canPublish } from '../lib/publishGate';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  res.setHeader = jest.fn();
  return res;
}

const verifiedUser = { id: 'owner_user', role: 'ORGANIZER', roles: ['ORGANIZER'], emailVerified: true };
const req = (body: any, user: any = verifiedUser) => ({ params: { id: 's1' }, body, user }) as any;

const READY = { id: 'i1', title: 'Lamp', price: 12, photoUrls: ['a.jpg'], isActive: true };
const READY2 = { id: 'i2', title: 'Chair', price: 30, photoUrls: ['b.jpg'], isActive: true };
const NO_PRICE = { id: 'i3', title: 'Rug', price: null, photoUrls: ['c.jpg'], isActive: true };

let txCalls = 0;
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation((...a: any[]) => { if (process.env.DBG) process.stdout.write(String(a[0]) + ' ' + String(a[1] && a[1].stack) + '\n'); });
  txCalls = 0;
  // ENDED -> PUBLISHED (reopen) runs the same ready-items path without the first-publish fan-out
  // (notifications, sockets, XP), which this unit test does not stand up. Same approach as saleLocationPrivacyGates.test.ts.
  mockPrisma.sale.findUnique.mockReset().mockResolvedValue({ id: 's1', organizerId: 'org_1', status: 'ENDED', publishedAt: new Date('2026-09-01T00:00:00Z') });
  mockPrisma.organizer.findUnique.mockReset().mockResolvedValue({ id: 'org_1', userId: 'owner_user', subscriptionTier: 'SIMPLE' });
  mockPrisma.sale.count.mockReset().mockResolvedValue(0);
  mockPrisma.item.count.mockReset().mockResolvedValue(3);
  mockPrisma.item.findMany.mockReset().mockResolvedValue([READY, READY2, NO_PRICE]);
  mockPrisma.sale.update.mockReset().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 's1', organizerId: 'org_1', status: data.status, title: 'Boutique', city: 'GR', state: 'MI', lat: 1, lng: 1 })
  );
  // Interactive transaction: run the callback with the same mock client; a throw rolls back (nothing is committed).
  mockPrisma.$transaction.mockReset().mockImplementation(async (fn: any) => {
    txCalls++;
    return fn(mockPrisma);
  });
  mockPublishItemForUser.mockReset().mockImplementation(async () => ({ ok: true, item: {}, runSideEffects: jest.fn() }));
});

describe('sale publish with ready items', () => {
  it('publishes the ready items with the sale in one transaction, by default, and skips the not-ready one', async () => {
    const res = makeRes();
    await updateSaleStatus(req({ status: 'PUBLISHED' }), res);
    expect(res.statusCode).toBe(200);
    expect(txCalls).toBe(1);
    expect(mockPublishItemForUser.mock.calls.map((c) => c[1])).toEqual(['i1', 'i2']);
    // Run on the transaction client with side effects deferred until after the commit.
    expect(mockPublishItemForUser.mock.calls[0][3]).toMatchObject({ tx: mockPrisma, deferSideEffects: true, verifiedByCaller: true });
    expect(mockPublishItemForUser.mock.calls[0][0]).toEqual({ id: 'owner_user', organizerId: 'org_1' });
    expect(res.body).toMatchObject({ status: 'PUBLISHED', itemsPublished: 2, itemsNotReady: 1 });
  });

  it('runs each item side effect once, after the commit', async () => {
    const effects = [jest.fn(), jest.fn()];
    let n = 0;
    mockPublishItemForUser.mockImplementation(async () => ({ ok: true, item: {}, runSideEffects: effects[n++] }));
    await updateSaleStatus(req({ status: 'PUBLISHED' }), makeRes());
    expect(effects[0]).toHaveBeenCalledTimes(1);
    expect(effects[1]).toHaveBeenCalledTimes(1);
  });

  it('publishReadyItems: false publishes the sale only', async () => {
    const res = makeRes();
    await updateSaleStatus(req({ status: 'PUBLISHED', publishReadyItems: false }), res);
    expect(res.statusCode).toBe(200);
    expect(mockPublishItemForUser).not.toHaveBeenCalled();
    expect(txCalls).toBe(0);
    expect(res.body.itemsPublished).toBe(0);
  });

  it('rolls everything back (409 SALE_ITEMS_CHANGED, no side effects) when an item fails inside the transaction', async () => {
    const effect = jest.fn();
    mockPublishItemForUser
      .mockResolvedValueOnce({ ok: true, item: {}, runSideEffects: effect })
      .mockResolvedValueOnce({ ok: false, status: 400, message: 'Item is already published.' });
    const res = makeRes();
    await updateSaleStatus(req({ status: 'PUBLISHED' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SALE_ITEMS_CHANGED');
    expect(effect).not.toHaveBeenCalled();
  });

  it('a sale with no unpublished items publishes without a transaction', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    const res = makeRes();
    await updateSaleStatus(req({ status: 'PUBLISHED' }), res);
    expect(res.statusCode).toBe(200);
    expect(txCalls).toBe(0);
    expect(mockPrisma.sale.update).toHaveBeenCalledTimes(1);
  });

  it('still enforces the concurrent-sales tier limit before touching items', async () => {
    mockPrisma.sale.count.mockResolvedValue(1);
    const res = makeRes();
    await updateSaleStatus(req({ status: 'PUBLISHED' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('TIER_LIMIT_EXCEEDED');
    expect(mockPublishItemForUser).not.toHaveBeenCalled();
  });
});

describe('verify to publish', () => {
  const unverified = { ...verifiedUser, emailVerified: false };

  it('an unverified organizer cannot publish (403 EMAIL_NOT_VERIFIED), nothing is read or written', async () => {
    const res = makeRes();
    await updateSaleStatus(req({ status: 'PUBLISHED', allowEmpty: true }, unverified), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(mockPrisma.sale.update).not.toHaveBeenCalled();
    expect(mockPublishItemForUser).not.toHaveBeenCalled();
  });

  it('an unverified organizer cannot reopen an ended sale either', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_1', status: 'ENDED', publishedAt: new Date() });
    const res = makeRes();
    await updateSaleStatus(req({ status: 'PUBLISHED' }, unverified), res);
    expect(res.statusCode).toBe(403);
  });

  it('an unverified organizer can still close a sale early', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_1', status: 'PUBLISHED', publishedAt: new Date() });
    const res = makeRes();
    await updateSaleStatus(req({ status: 'ENDED' }, unverified), res);
    expect(res.statusCode).toBe(200);
  });

  it('2026-10-23: a soft-deleted sale is a 404 for publish and close, nothing written', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_1', status: 'ENDED', deletedAt: new Date() });
    for (const status of ['PUBLISHED', 'ENDED']) {
      const res = makeRes();
      await updateSaleStatus(req({ status }), res);
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ message: 'Sale not found' });
    }
    expect(mockPrisma.sale.update).not.toHaveBeenCalled();
    expect(txCalls).toBe(0);
  });

  it('a missing emailVerified flag is treated as unverified', async () => {
    const res = makeRes();
    await updateSaleStatus(req({ status: 'PUBLISHED' }, { id: 'owner_user', role: 'ORGANIZER', roles: ['ORGANIZER'] }), res);
    expect(res.statusCode).toBe(403);
  });

  it('canPublish: verified users and admins only', () => {
    expect(canPublish({ emailVerified: true })).toBe(true);
    expect(canPublish({ emailVerified: false })).toBe(false);
    expect(canPublish({ emailVerified: false, role: 'ADMIN' })).toBe(true);
    expect(canPublish({ emailVerified: false, roles: ['USER', 'ADMIN'] })).toBe(true);
    expect(canPublish(null)).toBe(false);
  });
});

describe('readiness', () => {
  it('itemNotReadyReasons', () => {
    expect(itemNotReadyReasons(READY)).toEqual([]);
    expect(itemNotReadyReasons({ id: 'x', title: '  ', price: 0, photoUrls: [], isActive: false })).toEqual([
      'NO_TITLE',
      'NO_PRICE',
      'NO_PHOTO',
      'HIDDEN',
    ]);
    expect(itemNotReadyReasons({ ...READY, price: -1 })).toEqual(['NO_PRICE']);
  });

  it('splitReadiness labels not-ready items in plain words', () => {
    const r = splitReadiness([READY, NO_PRICE]);
    expect(r.readyItems).toEqual([{ id: 'i1', title: 'Lamp' }]);
    expect(r.notReadyItems).toEqual([{ id: 'i3', title: 'Rug', reasons: ['NO_PRICE'], reasonLabels: ['Needs a price'] }]);
  });

  it('GET publish-readiness is owner-only', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_other', deletedAt: null });
    const res = makeRes();
    await getSalePublishReadinessHandler(req({}), res);
    expect(res.statusCode).toBe(403);
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_1', deletedAt: null });
    const ok = makeRes();
    await getSalePublishReadinessHandler(req({}), ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.body.readyItems).toHaveLength(2);
    expect(ok.body.notReadyItems).toHaveLength(1);
  });
});

describe('POST /sales/:id/redate', () => {
  const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
  beforeEach(() => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_1', status: 'DRAFT', deletedAt: null });
  });

  it('changes only the two dates', async () => {
    const res = makeRes();
    await redateSale(req({ startDate: future(2), endDate: future(3), title: 'hijack', saleType: 'ESTATE' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.sale.update.mock.calls[0][0].data).toEqual({
      startDate: expect.any(Date),
      endDate: expect.any(Date),
    });
  });

  it('rejects past dates, end before start, and other owners', async () => {
    const r1 = makeRes();
    await redateSale(req({ startDate: future(-5), endDate: future(-4) }), r1);
    expect(r1.statusCode).toBe(400);
    const r2 = makeRes();
    await redateSale(req({ startDate: future(3), endDate: future(2) }), r2);
    expect(r2.statusCode).toBe(400);
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_other', status: 'DRAFT', deletedAt: null });
    const r3 = makeRes();
    await redateSale(req({ startDate: future(2), endDate: future(3) }), r3);
    expect(r3.statusCode).toBe(403);
    expect(mockPrisma.sale.update).not.toHaveBeenCalled();
  });
});
