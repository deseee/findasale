/**
 * soldEmailSourceGuard -- a sold e-mail replayed after marker loss / bootstrap, or an OLD e-mail about a listing that was
 * relisted since, must not consume a unit (Dime Tube incident, 2026-10-12).
 */
const mockTx: any = { $queryRaw: jest.fn(), marketplaceListingJob: { findFirst: jest.fn(), create: jest.fn(async () => ({})) } };
const mockJob = { findFirst: jest.fn(), create: jest.fn() };
jest.mock('../../lib/prisma', () => ({
  prisma: { item: { update: jest.fn(async () => ({})), findUnique: jest.fn() }, marketplaceListingJob: mockJob, $transaction: jest.fn(async (cb: any) => cb(mockTx)) },
}));
jest.mock('../itemStockService', () => ({ sellItemUnits: jest.fn() }));
jest.mock('../marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn(async () => undefined) }));
jest.mock('../itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn(async () => ({})), ItemAlreadyCommittedError };
});
jest.mock('../saleReopenGuard', () => ({ isReportOfCancelledReopenedSale: jest.fn(async () => false) }));
jest.mock('../bulkLot/bulkLotInvariants', () => ({ lotChannelRefusal: jest.fn(async () => null) }));
jest.mock('../bulkLot/bulkLotConfig', () => ({ isBulkLotsEnabled: () => false }));
jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn(async () => 'skipped') }));

import { commitFacebookNativeSale } from '../facebookNativeSaleService';
import { commitItemSale } from '../itemSaleGuard';
import { prisma } from '../../lib/prisma';
import { sellItemUnits } from '../itemStockService';
import { closePlatformListingRecord } from '../platformSoldDetectionService';
import { runWithSoldEmailSource, soldRowMessage, soldEmailSourceHash, soldEmailStaleReason, soldEmailAlreadyApplied } from '../soldEmailSourceGuard';

const KEY = 'sold-email:Vinted:<abc@mail.example>';
const SENT = new Date('2026-10-11T21:52:00Z');
const opts = { soldOnPlatform: { platform: 'VINTED' as const, remoteListingId: '' } };
const livePost = (createdAt: string) => ({ action: 'POST', status: 'POSTED', createdAt: new Date(createdAt) });

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.$queryRaw.mockReset();
  mockTx.marketplaceListingJob.findFirst.mockReset();
  mockJob.findFirst.mockReset();
  mockJob.create.mockReset();
});

describe('no e-mail context (wardrobe / extension / manual callers)', () => {
  it('guards are inert and never touch the DB', async () => {
    expect(await soldEmailStaleReason('i', 'VINTED')).toBeNull();
    expect(await soldEmailAlreadyApplied('i', 'VINTED')).toBe(false);
    expect(soldRowMessage('sold_on_vinted')).toBe('sold_on_vinted');
    expect(mockJob.findFirst).not.toHaveBeenCalled();
  });
});

describe('predates-live-listing guard', () => {
  it('OLD e-mail vs a listing re-posted AFTER it: single-unit commit is a no-op (item not sold)', async () => {
    mockJob.findFirst.mockResolvedValueOnce(livePost('2026-10-11T23:10:00Z'));
    const r = await runWithSoldEmailSource({ key: KEY, sentAt: SENT }, () => commitFacebookNativeSale('i1', 'VINTED', opts));
    expect(r).toEqual({ ok: true, alreadyCommitted: true });
    expect(commitItemSale).not.toHaveBeenCalled();
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('Dime Tube replay: multi-unit item with a manually re-posted live row -> no unit consumed, no REMOVE row written', async () => {
    mockJob.findFirst.mockResolvedValueOnce(livePost('2026-10-11T23:10:00Z'));
    const r = await runWithSoldEmailSource({ key: KEY, sentAt: SENT }, () => commitFacebookNativeSale('bcw', 'VINTED', opts));
    expect(r.alreadyCommitted).toBe(true);
    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    expect(mockTx.marketplaceListingJob.create).not.toHaveBeenCalled();
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('a genuine sale: listing created BEFORE the e-mail proceeds and the REMOVE row carries the e-mail source tag', async () => {
    mockJob.findFirst.mockResolvedValueOnce(livePost('2026-10-10T10:00:00Z')).mockResolvedValueOnce(null);
    mockTx.$queryRaw.mockResolvedValueOnce([{ status: 'AVAILABLE', stockTotal: 3 }]);
    mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce({ action: 'POST', status: 'POSTED', remoteListingId: null, createdAt: new Date('2026-10-10T10:00:00Z') });
    (sellItemUnits as jest.Mock).mockResolvedValueOnce({ fullySoldOut: false, remainingStock: 2 });
    const r = await runWithSoldEmailSource({ key: KEY, sentAt: SENT }, () => commitFacebookNativeSale('bcw', 'VINTED', opts));
    expect(r).toEqual({ ok: true, alreadyCommitted: false, partial: true, remainingStock: 2 });
    expect(mockTx.marketplaceListingJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lastErrorMessage: `sold_on_vinted|src:${soldEmailSourceHash(KEY)}` }),
    });
  });

  it('unknown e-mail date skips only the date guard (sale still goes through the normal rules)', async () => {
    mockJob.findFirst.mockResolvedValueOnce(null); // source-key lookup only
    mockTx.$queryRaw.mockResolvedValueOnce([{ status: 'AVAILABLE', stockTotal: 1 }]); // single-unit -> legacy whole-item path
    const r = await runWithSoldEmailSource({ key: KEY, sentAt: null }, () => commitFacebookNativeSale('one', 'VINTED', opts));
    expect(r.alreadyCommitted).toBe(false);
    expect(commitItemSale).toHaveBeenCalled();
  });

  it('closePlatformListingRecord does not close (write a REMOVE row for) a listing newer than the e-mail', async () => {
    (prisma as any).item.findUnique.mockResolvedValueOnce({ stockTotal: 1 });
    mockJob.findFirst.mockResolvedValueOnce(livePost('2026-10-11T23:10:00Z')); // stale-reason lookup
    const closed = await runWithSoldEmailSource({ key: KEY, sentAt: SENT }, () => closePlatformListingRecord('one', 'VINTED'));
    expect(closed).toBe(false);
    expect(mockJob.create).not.toHaveBeenCalled();
  });

  it('closePlatformListingRecord still closes a listing older than the e-mail (normal first sale)', async () => {
    (prisma as any).item.findUnique.mockResolvedValueOnce({ stockTotal: 1 });
    mockJob.findFirst
      .mockResolvedValueOnce(livePost('2026-10-10T10:00:00Z')) // stale-reason lookup: older -> fine
      .mockResolvedValueOnce({ action: 'POST', status: 'POSTED' }); // latest-row lookup
    mockJob.create.mockResolvedValueOnce({});
    const closed = await runWithSoldEmailSource({ key: KEY, sentAt: SENT }, () => closePlatformListingRecord('one', 'VINTED'));
    expect(closed).toBe(true);
  });
});

describe('source-key guard', () => {
  it('the same e-mail already recorded on a REMOVE row is a no-op even when a fresh live row exists', async () => {
    mockJob.findFirst
      .mockResolvedValueOnce(livePost('2026-10-09T00:00:00Z')) // date guard passes (listing older than e-mail)
      .mockResolvedValueOnce({ id: 'row_from_first_application' }); // source-key hit
    const r = await runWithSoldEmailSource({ key: KEY, sentAt: SENT }, () => commitFacebookNativeSale('bcw', 'VINTED', opts));
    expect(r).toEqual({ ok: true, alreadyCommitted: true });
    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    expect(mockJob.findFirst.mock.calls[1][0].where).toEqual(expect.objectContaining({
      itemId: 'bcw', platform: 'VINTED', action: 'REMOVE', status: 'REMOVED',
      lastErrorMessage: { endsWith: `|src:${soldEmailSourceHash(KEY)}` },
    }));
  });

  it('a different e-mail (different Message-ID) is not blocked by another e-mail\'s tag', () => {
    expect(soldEmailSourceHash(KEY)).not.toBe(soldEmailSourceHash('sold-email:Vinted:<other@mail.example>'));
  });

  it('a DB error in the guard propagates (no marker is written upstream, so the next poll retries)', async () => {
    mockJob.findFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(runWithSoldEmailSource({ key: KEY, sentAt: SENT }, () => commitFacebookNativeSale('bcw', 'VINTED', opts))).rejects.toThrow('db down');
  });
});

describe('guard is scoped to the e-mail context only', () => {
  it('outside runWithSoldEmailSource the same stale situation is NOT blocked (extension wardrobe path unchanged)', async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([{ status: 'AVAILABLE', stockTotal: 1 }]);
    const r = await commitFacebookNativeSale('one', 'VINTED', opts);
    expect(r.alreadyCommitted).toBe(false);
    expect(mockJob.findFirst).not.toHaveBeenCalled();
  });
});
