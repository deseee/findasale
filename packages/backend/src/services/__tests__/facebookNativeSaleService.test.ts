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
    expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'no_live_posted_row' });
    expect(sellItemUnits).not.toHaveBeenCalled();
    expect(mockTx.marketplaceListingJob.create).not.toHaveBeenCalled();
  });

  it('no live row but a sold_on_vinted REMOVE row already carries THIS listing id: no-op flagged alreadyCounted (retry of a committed sale)', async () => {
    multi(); mockTx.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ action: 'REMOVE', status: 'REMOVED', remoteListingId: '111' }) // latest = the sale's own REMOVE row
      .mockResolvedValueOnce({ id: 'sale_row' }); // the counted-listing lookup
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts('111'));
    expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'no_live_posted_row', alreadyCounted: true });
    expect(mockTx.marketplaceListingJob.findFirst.mock.calls[1][0].where).toEqual(
      expect.objectContaining({ action: 'REMOVE', status: 'REMOVED', remoteListingId: '111', lastErrorMessage: { startsWith: 'sold_on_' } }),
    );
    expect(sellItemUnits).not.toHaveBeenCalled();
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

  it('the REMOVE row a unit sale writes remembers WHICH listing sold (so a repeat report of it is recognised)', async () => {
    multi(); live('111');
    (sellItemUnits as jest.Mock).mockResolvedValueOnce({ fullySoldOut: false, remainingStock: 2 });
    await commitFacebookNativeSale('bcw', 'VINTED', opts('111'));
    expect(mockTx.marketplaceListingJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REMOVE', status: 'REMOVED', remoteListingId: '111', lastErrorMessage: 'sold_on_vinted' }),
    }));
  });

  // Dime Tube (2026-10-12): unit 1 sold by email (REMOVE sold_on_vinted written), the organizer relisted / marked the item
  // posted by hand (new live POST row, no Vinted id yet), then the wardrobe check re-reported the OLD sold listing. That stale
  // report used to consume the freshly relisted row, flipping the item back to "not listed" so it was offered for push again.
  it('stale wardrobe report of an old sold listing does NOT consume a relisted live row that has no id (relist-after-sale guard)', async () => {
    multi();
    mockTx.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ action: 'POST', status: 'POSTED', remoteListingId: null, createdAt: new Date('2026-10-11T22:30:00Z') }) // live row
      .mockResolvedValueOnce(null) // no row carries the reported id
      .mockResolvedValueOnce({ id: 'earlier_unit_sale' }); // a sold_on_vinted REMOVE row older than the live row
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts('555'));
    expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'relist_after_sale_guard' });
    expect(sellItemUnits).not.toHaveBeenCalled();
    expect(mockTx.marketplaceListingJob.create).not.toHaveBeenCalled();
    const guardWhere = mockTx.marketplaceListingJob.findFirst.mock.calls[2][0].where;
    expect(guardWhere).toEqual(expect.objectContaining({ action: 'REMOVE', status: 'REMOVED', lastErrorMessage: { startsWith: 'sold_on_' }, createdAt: { lt: new Date('2026-10-11T22:30:00Z') } }));
  });

  // Bundle order (2026-10-12): BCW multi-unit items sold before and relisted (live row without a recorded id). The ids come from
  // the order of a fresh sold notice, so the relist-after-sale guard (a wardrobe-staleness heuristic) must not block them.
  it('trustedOrder: a relisted id-less live row IS consumed even though an earlier unit sale exists (bundle order)', async () => {
    multi();
    mockTx.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ action: 'POST', status: 'POSTED', remoteListingId: null, createdAt: new Date('2026-10-11T22:30:00Z') })
      .mockResolvedValueOnce(null); // no row carries the reported id; the prior-sale lookup is never made
    (sellItemUnits as jest.Mock).mockResolvedValueOnce({ fullySoldOut: false, remainingStock: 40 });
    const r = await commitFacebookNativeSale('bcw', 'VINTED', { soldOnPlatform: { platform: 'VINTED', remoteListingId: '555', trustedOrder: true } });
    expect(r).toEqual({ ok: true, alreadyCommitted: false, partial: true, remainingStock: 40 });
    expect(mockTx.marketplaceListingJob.findFirst).toHaveBeenCalledTimes(2);
    expect(mockTx.marketplaceListingJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REMOVE', status: 'REMOVED', remoteListingId: '555' }),
    }));
  });

  describe('closed_by_email_sale (trustedOrder, latest row is the email path\'s sold_on_vinted REMOVE row)', () => {
    const trusted = (extra: Record<string, any> = {}) => ({ soldOnPlatform: { platform: 'VINTED' as const, remoteListingId: '10340561494', trustedOrder: true, ...extra } });
    const emailRow = (createdAt: Date, msg = 'sold_on_vinted') =>
      mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce({ action: 'REMOVE', status: 'REMOVED', remoteListingId: null, lastErrorMessage: msg, createdAt });

    it('row written after the order: no-op flagged alreadyCounted, no stock change, no row', async () => {
      multi(); emailRow(new Date('2026-10-12T10:51:00Z'));
      const r = await commitFacebookNativeSale('bcw', 'VINTED', trusted({ orderCreatedAt: new Date('2026-10-12T10:00:00Z') }));
      expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'closed_by_email_sale', alreadyCounted: true });
      expect(sellItemUnits).not.toHaveBeenCalled();
      expect(mockTx.marketplaceListingJob.create).not.toHaveBeenCalled();
    });

    it('row written BEFORE the order (an older sale): not counted for this order', async () => {
      multi(); emailRow(new Date('2026-10-11T10:51:00Z')); mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce(null);
      const r = await commitFacebookNativeSale('bcw', 'VINTED', trusted({ orderCreatedAt: new Date('2026-10-12T10:00:00Z') }));
      expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'no_live_posted_row' });
    });

    it('no order time: a row within 14 days counts, an older one does not', async () => {
      multi(); emailRow(new Date(Date.now() - 3 * 86400000));
      expect(await commitFacebookNativeSale('bcw', 'VINTED', trusted())).toEqual(expect.objectContaining({ alreadyCounted: true, noopReason: 'closed_by_email_sale' }));
      multi(); emailRow(new Date(Date.now() - 20 * 86400000)); mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce(null);
      expect(await commitFacebookNativeSale('bcw', 'VINTED', trusted())).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'no_live_posted_row' });
    });

    it('not trustedOrder (wardrobe report): rule does not apply', async () => {
      multi(); emailRow(new Date());
      const r = await commitFacebookNativeSale('bcw', 'VINTED', opts('10340561494'));
      expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'no_live_posted_row' });
    });

    it('a REMOVE row that is not a sold_on_vinted sale (plain withdrawal) is not counted', async () => {
      multi(); emailRow(new Date(), 'manual_remove'); mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce(null);
      const r = await commitFacebookNativeSale('bcw', 'VINTED', trusted());
      expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'no_live_posted_row' });
    });

    it('a relisted item (live POSTED row after the REMOVED row) still sells normally', async () => {
      multi();
      mockTx.marketplaceListingJob.findFirst
        .mockResolvedValueOnce({ action: 'POST', status: 'POSTED', remoteListingId: null, lastErrorMessage: null, createdAt: new Date('2026-10-12T12:00:00Z') })
        .mockResolvedValueOnce(null);
      (sellItemUnits as jest.Mock).mockResolvedValueOnce({ fullySoldOut: false, remainingStock: 5 });
      const r = await commitFacebookNativeSale('bcw', 'VINTED', trusted({ orderCreatedAt: new Date('2026-10-12T10:00:00Z') }));
      expect(r).toEqual({ ok: true, alreadyCommitted: false, partial: true, remainingStock: 5 });
      expect(sellItemUnits).toHaveBeenCalledTimes(1);
    });
  });

  it('trustedOrder keeps the other guards: id already on a REMOVE sold_on_ row (older) is a no-op flagged alreadyCounted', async () => {
    multi();
    mockTx.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ action: 'POST', status: 'POSTED', remoteListingId: null, createdAt: new Date('2026-10-11T22:30:00Z') })
      .mockResolvedValueOnce({ id: 'r', action: 'REMOVE', status: 'REMOVED', lastErrorMessage: 'sold_on_vinted' });
    const r = await commitFacebookNativeSale('bcw', 'VINTED', { soldOnPlatform: { platform: 'VINTED', remoteListingId: '555', trustedOrder: true } });
    expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'reported_id_on_older_row', alreadyCounted: true });
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('trustedOrder does not bypass a live row id that differs from the reported id', async () => {
    multi(); live('222');
    const r = await commitFacebookNativeSale('bcw', 'VINTED', { soldOnPlatform: { platform: 'VINTED', remoteListingId: '111', trustedOrder: true } });
    expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'reported_id_differs_from_live_row_id' });
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('with no earlier unit sale the same id-less live row IS consumed (normal first sale is unaffected)', async () => {
    multi();
    mockTx.marketplaceListingJob.findFirst
      .mockResolvedValueOnce({ action: 'POST', status: 'POSTED', remoteListingId: null, createdAt: new Date('2026-10-11T22:30:00Z') })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (sellItemUnits as jest.Mock).mockResolvedValueOnce({ fullySoldOut: false, remainingStock: 2 });
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts('555'));
    expect(r).toEqual({ ok: true, alreadyCommitted: false, partial: true, remainingStock: 2 });
  });

  it('an email sale (no reported id) still consumes the relisted live row', async () => {
    multi();
    mockTx.marketplaceListingJob.findFirst.mockResolvedValueOnce({ action: 'POST', status: 'POSTED', remoteListingId: null, createdAt: new Date('2026-10-11T22:30:00Z') });
    (sellItemUnits as jest.Mock).mockResolvedValueOnce({ fullySoldOut: false, remainingStock: 1 });
    const r = await commitFacebookNativeSale('bcw', 'VINTED', opts());
    expect(r.partial).toBe(true);
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
