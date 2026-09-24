/**
 * soldFanOutService.ts -- every FindA.Sale-side SOLD fan-out also withdraws the Reverb listing
 * (2026-09-23), beside eBay, Shopify, Discogs and the Facebook nudge.
 */

jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn(async () => undefined) }));

import { fanOutItemSoldWithdrawals } from '../soldFanOutService';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { withdrawDiscogsListingIfExists } from '../marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../marketplace/reverbConnector';

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
