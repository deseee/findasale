/**
 * itemDeletionService.prepareItemForDeletion -- Etsy wiring (ADR-135 D6.1 / B6). The delete path withdraws the
 * item's Etsy listing alongside eBay, Discogs and Reverb. The Etsy call self-guards (returns 'skipped' when there is
 * no EtsyListing row or the connector is off), so the default is "withdraw" for every item. There is no
 * skipWithdraw option on this function (that option exists on commitFacebookNativeSale, see
 * facebookNativeSaleService.test.ts); the delete path always asks every channel.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn(async () => []) },
  pendingListingRemoval: { createMany: jest.fn(async () => ({})) },
  itemDeletionLog: { create: jest.fn(async () => ({})) },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => true) }));
jest.mock('../marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn(async () => 'withdrawn') }));

import { prepareItemForDeletion } from '../itemDeletionService';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { withdrawDiscogsListingIfExists } from '../marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../marketplace/reverbConnector';
import { withdrawEtsyListingIfExists } from '../marketplace/etsyConnector';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.item.findUnique.mockResolvedValue({ title: 'Lightning Bolt', ebayListingId: 'L1', ebayOfferId: 'O1', status: 'AVAILABLE' });
  mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
});

it('withdraws Etsy by default, with the item id, alongside eBay, Discogs and Reverb', async () => {
  const snap = await prepareItemForDeletion('item_1', { organizerId: 'org_1' });
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledTimes(1);
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('item_1');
  expect(endEbayListingIfExists).toHaveBeenCalledWith('item_1', 'delete');
  expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith('item_1');
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_1');
  // the snapshot shape and the eBay outcome are unchanged by the extra promise
  expect(snap).toEqual({
    itemId: 'item_1',
    organizerId: 'org_1',
    title: 'Lightning Bolt',
    ebayListingId: 'L1',
    ebayOfferId: 'O1',
    status: 'AVAILABLE',
    withdrawSucceeded: true,
  });
});

it('runs the Etsy withdraw while the Item row still exists (before the caller deletes it)', async () => {
  const order: string[] = [];
  mockPrisma.item.findUnique.mockImplementationOnce(async () => {
    order.push('snapshot-read');
    return { title: 't', ebayListingId: null, ebayOfferId: null, status: 'AVAILABLE' };
  });
  (withdrawEtsyListingIfExists as jest.Mock).mockImplementationOnce(async () => {
    order.push('etsy-withdraw');
    return 'skipped';
  });
  await prepareItemForDeletion('item_2', { organizerId: null });
  expect(order).toEqual(['snapshot-read', 'etsy-withdraw']);
});

it('a rejected Etsy withdraw is only warned about: it never throws and the other channels still ran', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (withdrawEtsyListingIfExists as jest.Mock).mockRejectedValueOnce(new Error('etsy down'));
  const snap = await prepareItemForDeletion('item_3', { organizerId: 'org_1' });
  expect(snap.withdrawSucceeded).toBe(true);
  expect(warn).toHaveBeenCalledWith('[Etsy] withdraw-on-delete failed for item item_3:', 'etsy down');
  expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('item_3');
  warn.mockRestore();
});

it('a rejected eBay withdraw still lets the Etsy withdraw run, and withdrawSucceeded is false', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (endEbayListingIfExists as jest.Mock).mockRejectedValueOnce(new Error('ebay down'));
  const snap = await prepareItemForDeletion('item_4', { organizerId: 'org_1' });
  expect(snap.withdrawSucceeded).toBe(false);
  expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('item_4');
  warn.mockRestore();
});

describe('a hung Etsy call cannot hold the delete past the shared 20 s withdraw timeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves after the timeout with the eBay outcome intact', async () => {
    (withdrawEtsyListingIfExists as jest.Mock).mockImplementationOnce(() => new Promise(() => undefined));
    let done = false;
    const p = prepareItemForDeletion('item_5', { organizerId: 'org_1' }).then((s) => { done = true; return s; });
    // let the snapshot read and the Promise.all set up their timers
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(done).toBe(false);
    jest.advanceTimersByTime(20000);
    const snap = await p;
    expect(done).toBe(true);
    expect(snap.withdrawSucceeded).toBe(true);
  });
});
