/**
 * facebookNativeSaleService.ts -- skipWithdraw option (2026-09-23): the Discogs order poll must
 * not DELETE the Discogs listing that just sold, while still withdrawing eBay and Shopify.
 */

jest.mock('../../lib/prisma', () => ({ prisma: { item: { update: jest.fn(async () => ({})) } } }));
jest.mock('../itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn(async () => ({})), ItemAlreadyCommittedError };
});
jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));

import { commitFacebookNativeSale } from '../facebookNativeSaleService';
import { prisma } from '../../lib/prisma';
import { commitItemSale, ItemAlreadyCommittedError } from '../itemSaleGuard';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { markShopifyItemSold } from '../shopifyService';
import { withdrawDiscogsListingIfExists } from '../marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../marketplace/reverbConnector';

beforeEach(() => jest.clearAllMocks());

it('withdraws from eBay, Shopify, Discogs and Reverb and tags lastSoldVia by default', async () => {
  const r = await commitFacebookNativeSale('item_1', 'MERCARI');
  expect(r).toEqual({ ok: true, alreadyCommitted: false });
  expect(commitItemSale).toHaveBeenCalledWith('item_1', 'SOLD', ['AVAILABLE']);
  expect((prisma as any).item.update).toHaveBeenCalledWith({ where: { id: 'item_1' }, data: { lastSoldVia: 'MERCARI' } });
  expect(endEbayListingIfExists).toHaveBeenCalledWith('item_1');
  expect(markShopifyItemSold).toHaveBeenCalledWith('item_1');
  expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith('item_1');
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_1');
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

it('an already-SOLD item is an idempotent no-op with no fan-out', async () => {
  (commitItemSale as jest.Mock).mockRejectedValueOnce(new (ItemAlreadyCommittedError as any)('x'));
  const r = await commitFacebookNativeSale('item_3', 'EBAY');
  expect(r).toEqual({ ok: true, alreadyCommitted: true });
  expect(endEbayListingIfExists).not.toHaveBeenCalled();
  expect(withdrawReverbListingIfExists).not.toHaveBeenCalled();
});
