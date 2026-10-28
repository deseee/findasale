/**
 * 2026-10-27: services that decide "live listing" now use services/liveListingState.ts, so a Poshmark Multi Item listing that sold
 * some units there still counts: the unpublish count and the item-delete snapshot (PendingListingRemoval), which is what lets the
 * extension pull the listing after the Item row is gone. Mocked Prisma and connectors, synthetic data, no network.
 */
const mockJobFindMany = jest.fn();
const mockPendingCreateMany = jest.fn();
const mockItemFindUnique = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    marketplaceListingJob: { findMany: (...a: unknown[]) => mockJobFindMany(...a) },
    pendingListingRemoval: { createMany: (...a: unknown[]) => mockPendingCreateMany(...a) },
    item: { findUnique: (...a: unknown[]) => mockItemFindUnique(...a) },
  },
}));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn().mockResolvedValue(false) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn().mockResolvedValue('skipped') }));

import { countLiveExtensionListings } from '../services/unpublishWithdrawalService';
import { prepareItemForDeletion } from '../services/itemDeletionService';

const T = (m: number) => new Date(Date.UTC(2026, 9, 20, 0, m));
const rows = [
  { itemId: 'i1', platform: 'POSHMARK', action: 'POST', status: 'POSTED', createdAt: T(1), syncedQuantity: 3, remoteListingId: '6a982ae87789ea7d11785248', lastErrorMessage: null },
  { itemId: 'i1', platform: 'POSHMARK', action: 'REMOVE', status: 'REMOVED', createdAt: T(2), syncedQuantity: null, remoteListingId: null, lastErrorMessage: 'sold_on_poshmark' },
  { itemId: 'i1', platform: 'MERCARI', action: 'POST', status: 'POSTED', createdAt: T(1), syncedQuantity: 1, remoteListingId: 'm123', lastErrorMessage: null },
  { itemId: 'i1', platform: 'MERCARI', action: 'REMOVE', status: 'SKIPPED', createdAt: T(3), syncedQuantity: null, remoteListingId: null, lastErrorMessage: 'no_confident_title_match' },
  { itemId: 'i1', platform: 'VINTED', action: 'POST', status: 'POSTED', createdAt: T(1), syncedQuantity: 1, remoteListingId: '77', lastErrorMessage: null },
  { itemId: 'i1', platform: 'VINTED', action: 'REMOVE', status: 'REMOVED', createdAt: T(2), syncedQuantity: null, remoteListingId: null, lastErrorMessage: 'sold_on_vinted' },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockJobFindMany.mockResolvedValue(rows);
  mockPendingCreateMany.mockResolvedValue({ count: 0 });
  mockItemFindUnique.mockResolvedValue({ title: 'Tube', ebayListingId: null, ebayOfferId: null, status: 'AVAILABLE' });
});
afterEach(() => jest.restoreAllMocks());

it('countLiveExtensionListings counts the Multi Item Poshmark listing and the skipped-but-live Mercari one, not sold Vinted', async () => {
  expect(await countLiveExtensionListings(['i1'])).toBe(2);
});

it('deleting the item snapshots the still-live Poshmark (with its id) and Mercari listings for removal', async () => {
  await prepareItemForDeletion('i1', { organizerId: 'org1' });
  expect(mockPendingCreateMany).toHaveBeenCalledTimes(1);
  const data = mockPendingCreateMany.mock.calls[0][0].data;
  expect(data.map((d: any) => d.platform).sort()).toEqual(['MERCARI', 'POSHMARK']);
  expect(data.find((d: any) => d.platform === 'POSHMARK')).toMatchObject({ organizerId: 'org1', itemTitle: 'Tube', remoteListingId: '6a982ae87789ea7d11785248' });
});
