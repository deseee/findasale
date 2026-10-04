/**
 * Opening an item (GET /api/discogs/items/:id/match -> resolveDiscogsMatch) persists the derived
 * Discogs match cache. Item.updatedAt is Prisma @updatedAt, so those cache writes used to bump it
 * even though the organizer changed nothing. Both cache writes (the matcher result write and the
 * live-listing sync write) must now pass the row's CURRENT updatedAt back explicitly, which Prisma
 * honors, and must still write exactly the same match columns as before.
 * No DB and no network: prisma and global fetch are jest mocks.
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    item: { findUnique: jest.fn(), update: jest.fn() },
    marketplaceAccount: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acct1', accessToken: 'enc' }),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));
jest.mock('../utils/tokenCrypto', () => ({
  encryptToken: (s: string) => s,
  decryptToken: () => 'token',
}));

import { prisma } from '../lib/prisma';
import { resolveDiscogsMatch } from '../services/marketplace/discogsListingConnector';

const findUnique = (prisma as any).item.findUnique as jest.Mock;
const update = (prisma as any).item.update as jest.Mock;

const ORIGINAL_UPDATED_AT = new Date('2026-09-01T12:34:56.789Z');

function makeItem(over: Record<string, unknown> = {}) {
  return {
    id: 'item1',
    organizerId: 'org1',
    title: 'Maggie Bell - Queen of the Night LP Vinyl Record',
    description: null,
    upc: null,
    ean: null,
    recordIdentity: null,
    discogsReleaseId: null,
    discogsMatchStatus: null,
    discogsCandidates: null,
    discogsMatchedAt: null,
    discogsMatchInputHash: null,
    discogsListingId: null,
    discogsListingReleaseId: null,
    updatedAt: ORIGINAL_UPDATED_AT,
    lastEditedAt: null,
    sale: { organizerId: 'org1' },
    ...over,
  };
}

function mockResponse(status: number, body: unknown) {
  return {
    status,
    headers: { get: () => null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as any;
}

describe('Discogs match cache writes do not bump Item.updatedAt', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('matcher result write passes the existing updatedAt and writes the same match columns', async () => {
    const item = makeItem();
    findUnique.mockResolvedValue(item);
    update.mockImplementation(async ({ data }: any) => ({ ...item, ...data }));
    fetchMock.mockResolvedValue(mockResponse(200, { results: [] }));

    await resolveDiscogsMatch('org1', 'item1');

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'item1' });
    expect(arg.data.updatedAt).toBe(ORIGINAL_UPDATED_AT);
    expect(Object.keys(arg.data).sort()).toEqual(
      [
        'discogsCandidates',
        'discogsMatchInputHash',
        'discogsMatchStatus',
        'discogsMatchedAt',
        'discogsReleaseId',
        'recordIdentity',
        'updatedAt',
      ].sort()
    );
    expect(arg.data.discogsMatchedAt).toBeInstanceOf(Date);
    expect(typeof arg.data.discogsMatchInputHash).toBe('string');
  });

  it('locked (confirmed) forced refresh keeps the locked column set and the existing updatedAt', async () => {
    const item = makeItem({ discogsMatchStatus: 'confirmed', discogsReleaseId: 123456 });
    findUnique.mockResolvedValue(item);
    update.mockImplementation(async ({ data }: any) => ({ ...item, ...data }));
    fetchMock.mockResolvedValue(mockResponse(200, { results: [] }));

    await resolveDiscogsMatch('org1', 'item1', { force: true });

    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data;
    expect(data.updatedAt).toBe(ORIGINAL_UPDATED_AT);
    expect(Object.keys(data).sort()).toEqual(
      ['discogsCandidates', 'discogsMatchInputHash', 'discogsMatchedAt', 'recordIdentity', 'updatedAt'].sort()
    );
    expect(data).not.toHaveProperty('discogsReleaseId');
    expect(data).not.toHaveProperty('discogsMatchStatus');
  });

  it('live-listing sync write passes the existing updatedAt and writes only the listing columns', async () => {
    // confirmed item => no matcher write afterwards, so the sync write is the only update.
    const item = makeItem({
      discogsMatchStatus: 'confirmed',
      discogsReleaseId: 7004009,
      discogsListingId: '4360014384',
      discogsListingReleaseId: null,
    });
    findUnique.mockResolvedValue(item);
    update.mockImplementation(async ({ data }: any) => ({ ...item, ...data }));
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        id: 4360014384,
        status: 'For Sale',
        release: { id: 7004009, description: 'Maggie Bell - Queen Of The Night', format: 'Vinyl, LP' },
      })
    );

    await resolveDiscogsMatch('org1', 'item1');

    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data;
    expect(data.updatedAt).toBe(ORIGINAL_UPDATED_AT);
    expect(data.discogsListingReleaseId).toBe(7004009);
    expect(data.discogsCandidates).toMatchObject({ listingSyncedFor: '4360014384' });
    expect(Object.keys(data).sort()).toEqual(['discogsCandidates', 'discogsListingReleaseId', 'updatedAt']);
  });

  it('when both writes happen in one open, both carry the original updatedAt', async () => {
    const item = makeItem({ discogsListingId: '4360014384', discogsListingReleaseId: null });
    findUnique.mockResolvedValue(item);
    update.mockImplementation(async ({ data }: any) => ({ ...item, ...data }));
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/marketplace/listings/')
        ? mockResponse(200, {
            id: 4360014384,
            status: 'For Sale',
            release: { id: 7004009, description: 'Maggie Bell - Queen Of The Night', format: 'Vinyl, LP' },
          })
        : mockResponse(200, { results: [] })
    );

    await resolveDiscogsMatch('org1', 'item1');

    expect(update).toHaveBeenCalledTimes(2);
    for (const call of update.mock.calls) {
      expect(call[0].data.updatedAt).toBe(ORIGINAL_UPDATED_AT);
    }
    expect(update.mock.calls[0][0].data).toHaveProperty('discogsListingReleaseId', 7004009);
    expect(update.mock.calls[1][0].data).toHaveProperty('discogsMatchStatus');
  });
});
