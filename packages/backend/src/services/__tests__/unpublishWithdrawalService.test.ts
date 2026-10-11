/**
 * unpublishWithdrawalService (2026-10-11): Published -> Draft / Pending Review takes every live listing down.
 * API channels (eBay / Discogs / Reverb / Etsy) are mocked connectors; extension channels are only COUNTED here
 * (the extension removal itself is derived by extensionController.getPendingRemovals, nothing is written).
 */
const mockPrisma: any = {
  marketplaceListingJob: { findMany: jest.fn(async () => []), create: jest.fn(), createMany: jest.fn() },
  pendingListingRemoval: { create: jest.fn(), createMany: jest.fn() },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => null) }));
jest.mock('../marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => 'skipped') }));
jest.mock('../marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn(async () => 'skipped') }));

import { withdrawLiveListingsOnUnpublish, countLiveExtensionListings } from '../unpublishWithdrawalService';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { withdrawDiscogsListingIfExists } from '../marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../marketplace/reverbConnector';
import { withdrawEtsyListingIfExists } from '../marketplace/etsyConnector';

const d = (n: number) => new Date(2026, 9, n);

beforeEach(() => {
  jest.clearAllMocks();
  (endEbayListingIfExists as jest.Mock).mockResolvedValue(null);
  (withdrawDiscogsListingIfExists as jest.Mock).mockResolvedValue(undefined);
  (withdrawReverbListingIfExists as jest.Mock).mockResolvedValue('skipped');
  (withdrawEtsyListingIfExists as jest.Mock).mockResolvedValue('skipped');
  mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('asks all four API channels for every item with the self-guarding withdraw calls', async () => {
  const r = await withdrawLiveListingsOnUnpublish(['a', 'b']);
  expect(endEbayListingIfExists).toHaveBeenCalledWith('a', 'delete');
  expect(endEbayListingIfExists).toHaveBeenCalledWith('b', 'delete');
  for (const id of ['a', 'b']) {
    expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith(id);
    expect(withdrawReverbListingIfExists).toHaveBeenCalledWith(id);
    expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith(id);
  }
  expect(r).toEqual({ withdrawn: 0, warnings: [], extensionRemovalsQueued: 0 });
});

it('counts confirmed withdrawals and maps failures, throws and rejections to per-channel warnings', async () => {
  (endEbayListingIfExists as jest.Mock).mockResolvedValue(true);
  (withdrawDiscogsListingIfExists as jest.Mock).mockRejectedValue(new Error('discogs down'));
  (withdrawReverbListingIfExists as jest.Mock).mockResolvedValue('failed');
  (withdrawEtsyListingIfExists as jest.Mock).mockResolvedValue('gone');
  const r = await withdrawLiveListingsOnUnpublish(['a']);
  expect(r.withdrawn).toBe(2);
  expect(r.warnings.map((w) => w.channel).sort()).toEqual(['Discogs', 'Reverb']);
});

it('counts live extension listings as the latest non-SKIPPED job per item+platform being POST/POSTED, and writes nothing', async () => {
  mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([
    { itemId: 'a', platform: 'VINTED', action: 'POST', status: 'POSTED', createdAt: d(1) },
    { itemId: 'a', platform: 'FACEBOOK', action: 'POST', status: 'POSTED', createdAt: d(1) },
    { itemId: 'a', platform: 'FACEBOOK', action: 'REMOVE', status: 'REMOVED', createdAt: d(2) },
    { itemId: 'b', platform: 'FACEBOOK', action: 'POST', status: 'POSTED', createdAt: d(1) },
    { itemId: 'b', platform: 'FACEBOOK', action: 'REMOVE', status: 'REMOVED', createdAt: d(2) },
    { itemId: 'b', platform: 'FACEBOOK', action: 'POST', status: 'POSTED', createdAt: d(3) }, // relisted after the removal: live again
    { itemId: 'b', platform: 'POSHMARK', action: 'POST', status: 'POSTED', createdAt: d(1) },
    { itemId: 'b', platform: 'POSHMARK', action: 'REMOVE', status: 'SKIPPED', createdAt: d(4) }, // failed attempt: still live
  ]);
  expect(await countLiveExtensionListings(['a', 'b'])).toBe(4 - 1); // a:VINTED, b:FACEBOOK, b:POSHMARK
  const r = await withdrawLiveListingsOnUnpublish(['a', 'b']);
  expect(r.extensionRemovalsQueued).toBe(3);
  // idempotent by construction: a second unpublish writes no rows either
  await withdrawLiveListingsOnUnpublish(['a', 'b']);
  expect(mockPrisma.marketplaceListingJob.create).not.toHaveBeenCalled();
  expect(mockPrisma.marketplaceListingJob.createMany).not.toHaveBeenCalled();
  expect(mockPrisma.pendingListingRemoval.create).not.toHaveBeenCalled();
  expect(mockPrisma.pendingListingRemoval.createMany).not.toHaveBeenCalled();
});

it('a failing job lookup never fails the withdrawal (count 0)', async () => {
  mockPrisma.marketplaceListingJob.findMany.mockRejectedValue(new Error('db down'));
  const r = await withdrawLiveListingsOnUnpublish(['a']);
  expect(r.extensionRemovalsQueued).toBe(0);
});
