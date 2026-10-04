/**
 * soldFanOutService.ts -- every FindA.Sale-side SOLD fan-out also withdraws the Reverb listing
 * (2026-09-23), beside eBay, Shopify, Discogs and the Facebook nudge. ADR-135 (2026-10-03): and the Etsy listing.
 */

jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn(async () => 'skipped') }));
jest.mock('../facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn(async () => undefined) }));

import { fanOutItemSoldWithdrawals } from '../soldFanOutService';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { withdrawDiscogsListingIfExists } from '../marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../marketplace/reverbConnector';
import { withdrawEtsyListingIfExists } from '../marketplace/etsyConnector';
import { notifyFacebookExportedItemSold } from '../facebookNudgeService';
import { markShopifyItemSold } from '../shopifyService';

beforeEach(() => jest.clearAllMocks());

it('withdraws from Reverb alongside eBay and Discogs', () => {
  fanOutItemSoldWithdrawals('item_1', 'square');
  expect(endEbayListingIfExists).toHaveBeenCalledWith('item_1');
  expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith('item_1');
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_1');
});

it('a rejected Reverb withdraw never throws into the caller', async () => {
  (withdrawReverbListingIfExists as jest.Mock).mockRejectedValueOnce(new Error('boom'));
  expect(() => fanOutItemSoldWithdrawals('item_2', 'auction')).not.toThrow();
  await new Promise((r) => setImmediate(r));
});

it('withdraws the Etsy listing with the item id, alongside every other channel', () => {
  fanOutItemSoldWithdrawals('item_3', 'stripe');
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledTimes(1);
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('item_3');
  expect(endEbayListingIfExists).toHaveBeenCalledWith('item_3');
  expect(markShopifyItemSold).toHaveBeenCalledWith('item_3');
  expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith('item_3');
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_3');
  expect(notifyFacebookExportedItemSold).toHaveBeenCalledWith('item_3');
});

it('a rejected Etsy withdraw is only warned about: it never throws and never stops the other channels', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (withdrawEtsyListingIfExists as jest.Mock).mockRejectedValueOnce(new Error('etsy down'));
  expect(() => fanOutItemSoldWithdrawals('item_4', 'cash')).not.toThrow();
  await new Promise((r) => setImmediate(r));
  expect(warn).toHaveBeenCalledWith('[Etsy] withdraw-on-SOLD (cash) failed for item item_4:', 'etsy down');
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_4');
  expect(notifyFacebookExportedItemSold).toHaveBeenCalledWith('item_4');
  warn.mockRestore();
});

it('a rejected eBay withdraw does not stop the Etsy withdraw either', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (endEbayListingIfExists as jest.Mock).mockRejectedValueOnce(new Error('ebay down'));
  fanOutItemSoldWithdrawals('item_5', 'pos');
  await new Promise((r) => setImmediate(r));
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('item_5');
  warn.mockRestore();
});
