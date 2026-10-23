/**
 * Discogs and Reverb pushes list only PUBLISHED items (2026-10-23, verify to publish). The route also requires a
 * verified email (requirePublishVerified, pinned in publishGateRoutes.test.ts); this covers the per-item check in
 * the controllers: a Draft / Pending Review item is refused with 409 ITEM_NOT_PUBLISHED and the connector is never
 * called. Prisma and the connectors are stubbed; no network, no real database.
 */
var mockPrisma: any;
var mockUpsertDiscogs: jest.Mock;
var mockCreateReverb: jest.Mock;
jest.mock('../lib/prisma', () => {
  mockPrisma = { organizer: { findUnique: jest.fn() }, item: { findFirst: jest.fn() } };
  return { prisma: mockPrisma };
});
jest.mock('../services/bulkLot/bulkLotExportFilter', () => ({ marketplaceLotRefusal: jest.fn(async () => null) }));
jest.mock('../services/marketplace/discogsListingConnector', () => {
  mockUpsertDiscogs = jest.fn(async () => ({ action: 'created', listingId: 'd1', listing: null }));
  class DiscogsApiError extends Error {}
  class DiscogsNotEligibleError extends Error {}
  class DiscogsHttpError extends Error {}
  return {
    connectDiscogsAccount: jest.fn(), disconnectDiscogsAccount: jest.fn(), checkDiscogsConnection: jest.fn(),
    upsertDiscogsListingForItem: (...a: unknown[]) => mockUpsertDiscogs(...a),
    deleteDiscogsListing: jest.fn(), checkDiscogsEligibility: jest.fn(),
    DiscogsApiError, DiscogsNotEligibleError, DiscogsHttpError,
  };
});
jest.mock('../services/marketplace/reverbConnector', () => {
  mockCreateReverb = jest.fn();
  class ReverbApiError extends Error {}
  return {
    connectReverbAccount: jest.fn(), disconnectReverbAccount: jest.fn(), checkReverbConnection: jest.fn(),
    createReverbListing: (...a: unknown[]) => mockCreateReverb(...a),
    endOrDeleteReverbListing: jest.fn(),
    ReverbApiError,
  };
});
jest.mock('../services/itemKitListing', () => ({ withKitListingText: jest.fn(async (_id: string, d: string) => d) }));

import { pushItemToDiscogs } from '../controllers/discogsMarketplaceController';
import { pushItemToReverb } from '../controllers/reverbMarketplaceController';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
}
const req = () => ({ user: { id: 'u1', emailVerified: true }, params: { id: 'i1' }, body: {} }) as any;
const row = (draftStatus: string) => ({
  id: 'i1', organizerId: 'org1', saleId: 's1', draftStatus, title: 'Fender Stratocaster', category: 'Musical Instruments & Gear',
  price: 500, photoUrls: ['a.jpg'], description: 'Guitar', discogsListingId: null, reverbListingId: null,
});

beforeEach(() => {
  mockPrisma.organizer.findUnique.mockReset().mockResolvedValue({ id: 'org1' });
  mockPrisma.item.findFirst.mockReset();
  mockUpsertDiscogs.mockClear();
  mockCreateReverb.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe.each([
  ['Discogs', pushItemToDiscogs, () => mockUpsertDiscogs],
  ['Reverb', pushItemToReverb, () => mockCreateReverb],
])('%s push', (name, handler, connector) => {
  it.each(['DRAFT', 'PENDING_REVIEW'])('a %s item is refused with 409 ITEM_NOT_PUBLISHED, nothing sent', async (status) => {
    mockPrisma.item.findFirst.mockResolvedValue(row(status));
    const res = mockRes();
    await (handler as any)(req(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ code: 'ITEM_NOT_PUBLISHED', message: `Publish this item on FindA.Sale before listing it on ${name}.` });
    expect(connector()).not.toHaveBeenCalled();
  });

  it('a PUBLISHED item gets past the check (reaches the connector)', async () => {
    mockPrisma.item.findFirst.mockResolvedValue(row('PUBLISHED'));
    const res = mockRes();
    await (handler as any)(req(), res);
    expect(res.body?.code).not.toBe('ITEM_NOT_PUBLISHED');
    expect(connector()).toHaveBeenCalled();
  });

  it('another organizer\'s item is still a 404 (ownership check runs first)', async () => {
    mockPrisma.item.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await (handler as any)(req(), res);
    expect(res.statusCode).toBe(404);
  });
});
