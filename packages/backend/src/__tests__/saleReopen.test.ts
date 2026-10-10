/**
 * Reopen a cancelled marketplace sale (2026-10-10): POST /api/items/:id/reopen-sale.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * Covers: refusals (STRIPE, POS, paid purchase, multi-quantity, bulk lot, unknown tag), organizer-attested channels
 * with and without confirm, eBay and off-platform delegation, ownership denial, and the re-sell guard (marker row +
 * ledger rows untouched) so a sold signal cannot immediately re-sell the reopened item.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), updateMany: jest.fn() },
  purchase: { findFirst: jest.fn() },
  ebaySoldEvent: { count: jest.fn(), deleteMany: jest.fn() },
  marketplaceListingJob: { create: jest.fn(), findFirst: jest.fn() },
  organizer: { findUnique: jest.fn(), findFirst: jest.fn() },
  $transaction: jest.fn(),
};
const mockLotRefusal = jest.fn();
const mockNotify = jest.fn();
const mockEbayReopen = jest.fn();
const mockOffPlatformUndo = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../lib/notificationService', () => ({ createNotification: (...a: unknown[]) => mockNotify(...a) }));
jest.mock('../services/bulkLot/bulkLotInvariants', () => ({ lotChannelRefusal: (...a: unknown[]) => mockLotRefusal(...a) }));
jest.mock('../controllers/itemController', () => ({
  reopenEbayCancelledSale: (...a: unknown[]) => mockEbayReopen(...a),
  undoItemSoldOffPlatform: (...a: unknown[]) => mockOffPlatformUndo(...a),
}));

import { reopenAttestedSale, classifySoldChannel } from '../services/saleReopenService';
import { isReportOfCancelledReopenedSale, REOPEN_MARKER } from '../services/saleReopenGuard';
import { reopenItemSale } from '../controllers/saleReopenController';

const OPTS = { organizerId: 'org1', actorUserId: 'user1', confirm: true };

function soldItem(over: Record<string, unknown> = {}): any {
  return { id: 'item1', title: 'Sweet Maya, Vinyl LP, 1977', status: 'SOLD', lastSoldVia: 'FB_NATIVE', saleId: 'sale1', stockTotal: 1, ...over };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockLotRefusal.mockResolvedValue(null);
  mockPrisma.item.findUnique.mockResolvedValue(soldItem());
  mockPrisma.purchase.findFirst.mockResolvedValue(null);
  mockPrisma.ebaySoldEvent.count.mockResolvedValue(0);
  mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.marketplaceListingJob.create.mockResolvedValue({});
  mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'user1' });
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
});

describe('classifySoldChannel', () => {
  it('maps the known tags', () => {
    expect(classifySoldChannel('EBAY').kind).toBe('EBAY');
    expect(classifySoldChannel('OFF_PLATFORM_MANUAL').kind).toBe('OFF_PLATFORM');
    expect(classifySoldChannel('STRIPE').kind).toBe('RAILS');
    expect(classifySoldChannel('POS').kind).toBe('RAILS');
    expect(classifySoldChannel('FB_NATIVE')).toEqual({ kind: 'ATTESTED', label: 'Facebook Marketplace' });
    expect(classifySoldChannel(null).kind).toBe('UNTAGGED');
    expect(classifySoldChannel('SOMETHING_NEW').kind).toBe('UNKNOWN');
  });
});

describe('reopenAttestedSale: refusals (nothing is written)', () => {
  const expectNoWrites = () => {
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.marketplaceListingJob.create).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  };

  it.each(['STRIPE', 'POS'])('refuses an item sold via %s', async (via) => {
    mockPrisma.item.findUnique.mockResolvedValue(soldItem({ lastSoldVia: via }));
    const r: any = await reopenAttestedSale('item1', OPTS);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.code).toBe('PAID_ON_PLATFORM');
    expect(r.message).toMatch(/refund/i);
    expectNoWrites();
  });

  it('refuses a PAID non-test purchase even when the channel looks like a marketplace', async () => {
    mockPrisma.purchase.findFirst.mockResolvedValue({ id: 'p1' });
    const r: any = await reopenAttestedSale('item1', OPTS);
    expect(r).toMatchObject({ ok: false, status: 409, code: 'PAID_PURCHASE' });
    expect(mockPrisma.purchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { itemId: 'item1', status: 'PAID', isTestTransaction: false } })
    );
    expectNoWrites();
  });

  it('refuses a multi-quantity item', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(soldItem({ stockTotal: 3 }));
    const r: any = await reopenAttestedSale('item1', OPTS);
    expect(r).toMatchObject({ ok: false, status: 409, code: 'MULTI_QUANTITY' });
    expectNoWrites();
  });

  it('refuses a bulk lot, and fails closed when the lot check fails', async () => {
    mockLotRefusal.mockResolvedValueOnce({ status: 409, code: 'BULK_LOT_CHANNEL', message: 'lot' });
    expect(await reopenAttestedSale('item1', OPTS)).toMatchObject({ ok: false, status: 409, code: 'BULK_LOT' });
    mockLotRefusal.mockResolvedValueOnce({ status: 503, code: 'BULK_CHECK_FAILED', message: 'try later' });
    expect(await reopenAttestedSale('item1', OPTS)).toMatchObject({ ok: false, status: 503, code: 'BULK_CHECK_FAILED' });
    expectNoWrites();
  });

  it('refuses an unrecognized channel tag', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(soldItem({ lastSoldVia: 'SOMETHING_NEW' }));
    expect(await reopenAttestedSale('item1', OPTS)).toMatchObject({ ok: false, status: 409, code: 'UNKNOWN_CHANNEL' });
    expectNoWrites();
  });

  it('refuses an untagged sale that has eBay ledger rows', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(soldItem({ lastSoldVia: null }));
    mockPrisma.ebaySoldEvent.count.mockResolvedValue(1);
    expect(await reopenAttestedSale('item1', OPTS)).toMatchObject({ ok: false, status: 409, code: 'EBAY_LEDGER' });
    expectNoWrites();
  });

  it('refuses an item that is not SOLD', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(soldItem({ status: 'AVAILABLE' }));
    expect(await reopenAttestedSale('item1', OPTS)).toMatchObject({ ok: false, status: 409, code: 'NOT_SOLD' });
    expectNoWrites();
  });
});

describe('reopenAttestedSale: FB_NATIVE', () => {
  it('without confirm: 409 asking for confirmation, names the marketplace, writes nothing', async () => {
    const r: any = await reopenAttestedSale('item1', { ...OPTS, confirm: false });
    expect(r).toMatchObject({ ok: false, status: 409, code: 'CONFIRMATION_REQUIRED', requiresConfirmation: true, marketplace: 'Facebook Marketplace' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('with confirm: writes the re-sell marker, then flips to AVAILABLE and clears the sold tag', async () => {
    const order: string[] = [];
    mockPrisma.marketplaceListingJob.create.mockImplementation(async () => { order.push('marker'); return {}; });
    mockPrisma.item.updateMany.mockImplementation(async () => { order.push('flip'); return { count: 1 }; });
    const r: any = await reopenAttestedSale('item1', OPTS);
    expect(r).toEqual({ ok: true, itemId: 'item1', marketplace: 'Facebook Marketplace' });
    expect(order).toEqual(['marker', 'flip']);
    expect(mockPrisma.marketplaceListingJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemId: 'item1', action: 'REMOVE', status: 'REMOVED', platform: 'FACEBOOK', lastErrorMessage: REOPEN_MARKER }),
    });
    const arg = mockPrisma.item.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'item1', status: 'SOLD', lastSoldVia: 'FB_NATIVE' });
    expect(arg.data).toMatchObject({ status: 'AVAILABLE', stockSold: 0, lastSoldVia: null });
    expect(arg.data.price).toBeUndefined(); // never touches a price
  });

  it('never fires a sold notification (informational SALE_UPDATE only)', async () => {
    await reopenAttestedSale('item1', OPTS);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0]).toMatchObject({ userId: 'user1', type: 'SALE_UPDATE' });
    expect(JSON.stringify(mockNotify.mock.calls[0][0])).not.toMatch(/sold!|you sold/i);
  });

  it('does not touch the eBay or Etsy ledger rows', async () => {
    await reopenAttestedSale('item1', OPTS);
    expect(mockPrisma.ebaySoldEvent.deleteMany).not.toHaveBeenCalled();
  });

  it('a lost race (item changed) reports RACE', async () => {
    mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });
    expect(await reopenAttestedSale('item1', OPTS)).toMatchObject({ ok: false, status: 409, code: 'RACE' });
  });
});

describe('reopenAttestedSale: other attested channels', () => {
  it('ETSY has no job-row marker (its EtsySoldEvent ledger is the guard) and still flips', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(soldItem({ lastSoldVia: 'ETSY' }));
    const r: any = await reopenAttestedSale('item1', OPTS);
    expect(r).toMatchObject({ ok: true, marketplace: 'Etsy' });
    expect(mockPrisma.marketplaceListingJob.create).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany.mock.calls[0][0].where.lastSoldVia).toBe('ETSY');
  });

  it('VINTED writes a VINTED marker', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(soldItem({ lastSoldVia: 'VINTED' }));
    await reopenAttestedSale('item1', OPTS);
    expect(mockPrisma.marketplaceListingJob.create.mock.calls[0][0].data.platform).toBe('VINTED');
  });

  it('an untagged sale with no ledger rows is attested too (lastSoldVia matched as null)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(soldItem({ lastSoldVia: null }));
    const r: any = await reopenAttestedSale('item1', OPTS);
    expect(r.ok).toBe(true);
    expect(mockPrisma.item.updateMany.mock.calls[0][0].where.lastSoldVia).toBeNull();
  });
});

describe('isReportOfCancelledReopenedSale (re-sell guard)', () => {
  const marker = { createdAt: new Date('2026-10-10T12:00:00Z') };

  it('is false for a channel with no job platform, without a lookup', async () => {
    expect(await isReportOfCancelledReopenedSale('item1', 'REVERB')).toBe(false);
    expect(mockPrisma.marketplaceListingJob.findFirst).not.toHaveBeenCalled();
  });

  it('is false when the item was never reopened (no marker)', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValueOnce(null);
    expect(await isReportOfCancelledReopenedSale('item1', 'VINTED', '123')).toBe(false);
  });

  it('blocks a report naming a listing id that predates the marker', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValueOnce(marker).mockResolvedValueOnce({ id: 'oldPost' });
    expect(await isReportOfCancelledReopenedSale('item1', 'VINTED', '123')).toBe(true);
  });

  it('lets a report for a brand-new listing id through', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValueOnce(marker).mockResolvedValueOnce(null);
    expect(await isReportOfCancelledReopenedSale('item1', 'VINTED', '999')).toBe(false);
  });

  it('blocks an id-less report (Facebook scan, title email) until the item is listed again', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValueOnce(marker).mockResolvedValueOnce(null);
    expect(await isReportOfCancelledReopenedSale('item1', 'FB_NATIVE')).toBe(true);
    mockPrisma.marketplaceListingJob.findFirst.mockResolvedValueOnce(marker).mockResolvedValueOnce({ id: 'newPost' });
    expect(await isReportOfCancelledReopenedSale('item1', 'FB_NATIVE')).toBe(false);
  });

  it('fails open when the lookup throws', async () => {
    mockPrisma.marketplaceListingJob.findFirst.mockRejectedValue(new Error('db down'));
    expect(await isReportOfCancelledReopenedSale('item1', 'MERCARI', 'm1')).toBe(false);
  });
});

describe('reopenItemSale controller', () => {
  function req(over: Record<string, unknown> = {}): any {
    return { user: { id: 'user1', roles: ['ORGANIZER'], role: 'ORGANIZER' }, params: { id: 'item1' }, body: { confirm: true }, ...over };
  }
  const ownedSale = (over: Record<string, unknown> = {}) => ({
    id: 'item1', status: 'SOLD', lastSoldVia: 'FB_NATIVE', saleId: 'sale1', organizerId: 'org1',
    sale: { organizer: { id: 'org1', userId: 'user1', subscriptionTier: 'PRO', lat: null, lng: null } },
    ...over,
  });

  beforeEach(() => {
    mockPrisma.item.findUnique.mockImplementation(async (args: any) =>
      args?.select?.title ? soldItem() : ownedSale()
    );
  });

  it('401 without a user, 403 without the organizer role', async () => {
    const r1 = makeRes();
    await reopenItemSale(req({ user: undefined }), r1);
    expect(r1.statusCode).toBe(401);
    const r2 = makeRes();
    await reopenItemSale(req({ user: { id: 'u', roles: ['SHOPPER'], role: 'USER' } }), r2);
    expect(r2.statusCode).toBe(403);
  });

  it('denies another organizer on a sale item', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ownedSale({ sale: { organizer: { id: 'orgX', userId: 'someoneElse', subscriptionTier: 'PRO', lat: null, lng: null } } }));
    const res = makeRes();
    await reopenItemSale(req(), res);
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('denies another organizer on a saleless inventory item', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ownedSale({ saleId: null, sale: null, organizerId: 'org1' }));
    mockPrisma.organizer.findFirst.mockResolvedValue(null); // no organizer row matches (item organizerId, caller userId)
    const res = makeRes();
    await reopenItemSale(req(), res);
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('404 for a missing item', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await reopenItemSale(req(), res);
    expect(res.statusCode).toBe(404);
  });

  it('EBAY delegates to the verified eBay reopen and does not run the attested path', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ownedSale({ lastSoldVia: 'EBAY' }));
    const res = makeRes();
    const request = req();
    await reopenItemSale(request, res);
    expect(mockEbayReopen).toHaveBeenCalledWith(request, res);
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('OFF_PLATFORM_MANUAL delegates to the existing undo', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ownedSale({ lastSoldVia: 'OFF_PLATFORM_MANUAL' }));
    const res = makeRes();
    const request = req();
    await reopenItemSale(request, res);
    expect(mockOffPlatformUndo).toHaveBeenCalledWith(request, res);
  });

  it('FB_NATIVE without confirm: 409 with requiresConfirmation and the marketplace', async () => {
    mockPrisma.item.findUnique.mockImplementation(async (args: any) => (args?.select?.title ? soldItem() : ownedSale()));
    const res = makeRes();
    await reopenItemSale(req({ body: {} }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ requiresConfirmation: true, marketplace: 'Facebook Marketplace', code: 'CONFIRMATION_REQUIRED' });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('FB_NATIVE with confirm: 200 and the item is reopened', async () => {
    const res = makeRes();
    await reopenItemSale(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, itemId: 'item1', marketplace: 'Facebook Marketplace' });
    expect(mockPrisma.item.updateMany).toHaveBeenCalledTimes(1);
  });

  it('STRIPE: 409 with the refund reason, nothing written', async () => {
    mockPrisma.item.findUnique.mockImplementation(async (args: any) =>
      args?.select?.title ? soldItem({ lastSoldVia: 'STRIPE' }) : ownedSale({ lastSoldVia: 'STRIPE' })
    );
    const res = makeRes();
    await reopenItemSale(req(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PAID_ON_PLATFORM');
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });
});
