/**
 * facebookNativeSaleService.ts -- skipWithdraw option (2026-09-23): the Discogs order poll must
 * not DELETE the Discogs listing that just sold, while still withdrawing eBay and Shopify.
 */

const mockTx: any = { $queryRaw: jest.fn(), marketplaceListingJob: { findFirst: jest.fn(), create: jest.fn(async () => ({})) } };
jest.mock('../../lib/prisma', () => ({
  prisma: { item: { update: jest.fn(async () => ({})) }, $transaction: jest.fn(async (cb: any) => cb(mockTx)) },
}));
jest.mock('../itemStockService', () => ({ sellItemUnits: jest.fn() }));
jest.mock('../marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn(async () => undefined) }));
jest.mock('../itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn(async () => ({})), ItemAlreadyCommittedError };
});
jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn(async () => 'skipped') }));

import { commitFacebookNativeSale } from '../facebookNativeSaleService';
import { prisma } from '../../lib/prisma';
import { commitItemSale, ItemAlreadyCommittedError } from '../itemSaleGuard';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { markShopifyItemSold } from '../shopifyService';
import { withdrawDiscogsListingIfExists } from '../marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../marketplace/reverbConnector';
import { withdrawEtsyListingIfExists } from '../marketplace/etsyConnector';
import { sellItemUnits } from '../itemStockService';
import { syncMarketplaceStock } from '../marketplaceStockSyncService';

beforeEach(() => { jest.clearAllMocks(); mockTx.$queryRaw.mockReset(); mockTx.marketplaceListingJob.findFirst.mockReset(); });

it('withdraws from eBay, Shopify, Discogs, Reverb and Etsy and tags lastSoldVia by default', async () => {
  const r = await commitFacebookNativeSale('item_1', 'MERCARI');
  expect(r).toEqual({ ok: true, alreadyCommitted: false });
  expect(commitItemSale).toHaveBeenCalledWith('item_1', 'SOLD', ['AVAILABLE']);
  expect((prisma as any).item.update).toHaveBeenCalledWith({ where: { id: 'item_1' }, data: { lastSoldVia: 'MERCARI' } });
  expect(endEbayListingIfExists).toHaveBeenCalledWith('item_1');
  expect(markShopifyItemSold).toHaveBeenCalledWith('item_1');
  expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith('item_1');
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_1');
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('item_1');
});

it("skipWithdraw ['DISCOGS'] leaves the Discogs listing alone", async () => {
  await commitFacebookNativeSale('item_2', 'DISCOGS', { skipWithdraw: ['DISCOGS'] });
  expect(endEbayListingIfExists).toHaveBeenCalledWith('item_2');
  expect(markShopifyItemSold).toHaveBeenCalledWith('item_2');
  expect(withdrawDiscogsListingIfExists).not.toHaveBeenCalled();
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_2');
});

it("skipWithdraw ['REVERB'] leaves the Reverb listing alone but pulls the rest", async () => {
  await commitFacebookNativeSale('item_4', 'REVERB', { skipWithdraw: ['REVERB'] });
  expect(endEbayListingIfExists).toHaveBeenCalledWith('item_4');
  expect(markShopifyItemSold).toHaveBeenCalledWith('item_4');
  expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith('item_4');
  expect(withdrawReverbListingIfExists).not.toHaveBeenCalled();
});

it("skipWithdraw ['ETSY'] leaves the Etsy listing alone but pulls the rest", async () => {
  await commitFacebookNativeSale('item_5', 'ETSY', { skipWithdraw: ['ETSY'] });
  expect(endEbayListingIfExists).toHaveBeenCalledWith('item_5');
  expect(markShopifyItemSold).toHaveBeenCalledWith('item_5');
  expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith('item_5');
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_5');
  expect(withdrawEtsyListingIfExists).not.toHaveBeenCalled();
});

it("the Discogs and Reverb polls (skipWithdraw ['DISCOGS'] / ['REVERB']) still withdraw Etsy", async () => {
  await commitFacebookNativeSale('item_6', 'DISCOGS', { skipWithdraw: ['DISCOGS'] });
  await commitFacebookNativeSale('item_7', 'REVERB', { skipWithdraw: ['REVERB'] });
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('item_6');
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('item_7');
});

it('a rejected Etsy withdraw is only warned about and never fails the sale commit', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (withdrawEtsyListingIfExists as jest.Mock).mockRejectedValueOnce(new Error('etsy down'));
  const r = await commitFacebookNativeSale('item_8', 'MERCARI');
  await new Promise((resolve) => setImmediate(resolve));
  expect(r).toEqual({ ok: true, alreadyCommitted: false });
  expect(warn).toHaveBeenCalledWith('[Etsy] withdraw-on-SOLD (MERCARI) failed for item item_8:', 'etsy down');
  warn.mockRestore();
});

it('an already-SOLD item is an idempotent no-op with no fan-out', async () => {
  (commitItemSale as jest.Mock).mockRejectedValueOnce(new (ItemAlreadyCommittedError as any)('x'));
  const r = await commitFacebookNativeSale('item_3', 'EBAY');
  expect(r).toEqual({ ok: true, alreadyCommitted: true });
  expect(endEbayListingIfExists).not.toHaveBeenCalled();
  expect(withdrawReverbListingIfExists).not.toHaveBeenCalled();
  expect(withdrawEtsyListingIfExists).not.toHaveBeenCalled();
});


describe('soldOnPlatform unit sale (multi-quantity items)', () => {
  const live = (remoteListingId: string | null = null) =>
    mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce({ action: 'POST', status: 'POSTED', remoteListingId });
  const multi = (status = 'AVAILABLE', stockTotal: number | null = 3) =>
    mockTx.$queryRaw.mockResolvedValueOnce([{ status, stockTotal }]);
  const opts = (id?: string) => ({ soldOnPlatform: { platform: 'VINTED' as const, remoteListingId: id } });

  it('partial sale: takes one unit, closes only that platform row, keeps item AVAILABLE, syncs eBay, no cascade', async () => {
    multi(); live('111');
    (sellItemUnits as jest.Mock).mockResolvedValueOnce({ fullySoldOut: false, remainingStock: 2 });
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts('111'));
    expect(r).toEqual({ ok: true, alreadyCommitted: false, partial: true, remainingStock: 2 });
    expect(mockTx.marketplaceListingJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemId: 'bcw', platform: 'VINTED', action: 'REMOVE', status: 'REMOVED' }),
    }));
    expect(sellItemUnits).toHaveBeenCalledWith('bcw', 1, mockTx);
    expect(syncMarketplaceStock).toHaveBeenCalledWith('bcw', { fullySoldOut: false, remainingStock: 2 });
    expect(commitItemSale).not.toHaveBeenCalled();
    expect((prisma as any).item.update).not.toHaveBeenCalled();
    expect(endEbayListingIfExists).not.toHaveBeenCalled();
    expect(markShopifyItemSold).not.toHaveBeenCalled();
    expect(withdrawEtsyListingIfExists).not.toHaveBeenCalled();
  });

  it('last unit: runs the full sold cascade', async () => {
    multi(); live();
    (sellItemUnits as jest.Mock).mockResolvedValueOnce({ fullySoldOut: true, remainingStock: 0 });
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts());
    expect(r).toEqual({ ok: true, alreadyCommitted: false });
    expect((prisma as any).item.update).toHaveBeenCalledWith({ where: { id: 'bcw' }, data: { lastSoldVia: 'VINTED' } });
    expect(endEbayListingIfExists).toHaveBeenCalledWith('bcw');
    expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('bcw');
    expect(syncMarketplaceStock).not.toHaveBeenCalled();
  });

  it('no live row for the platform (sale already counted): no-op, stock untouched', async () => {
    multi(); mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce({ action: 'REMOVE', status: 'REMOVED', remoteListingId: null });
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts('111'));
    expect(r).toEqual({ ok: true, alreadyCommitted: true });
    expect(sellItemUnits).not.toHaveBeenCalled();
    expect(mockTx.marketplaceListingJob.create).not.toHaveBeenCalled();
  });

  it('report for an OLDER listing id than the relisted live row: no-op (no double count)', async () => {
    multi(); live('222');
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts('111'));
    expect(r.alreadyCommitted).toBe(true);
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('live row has no id but the reported id belongs to an older POST row: no-op', async () => {
    multi(); live(null);
    mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce({ id: 'old_post' });
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts('111'));
    expect(r.alreadyCommitted).toBe(true);
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('single-unit item ignores soldOnPlatform and takes the legacy whole-item SOLD path', async () => {
    multi('AVAILABLE', 1);
    const r = await commitFacebookNativeSale('one', 'VINTED', opts('1'));
    expect(r).toEqual({ ok: true, alreadyCommitted: false });
    expect(commitItemSale).toHaveBeenCalledWith('one', 'SOLD', ['AVAILABLE']);
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('an already-SOLD multi-unit item is a no-op', async () => {
    multi('SOLD');
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts());
    expect(r.alreadyCommitted).toBe(true);
    expect(sellItemUnits).not.toHaveBeenCalled();
  });
});
