/**
 * ADR-132 section 6.3 fix: updateDiscogsListingPrice must POST back every field it read from
 * GET /marketplace/listings/{id} (comments, sleeve_condition, allow_offers, location, weight,
 * format_quantity, external_id), not just price. Network is a jest mock of global fetch;
 * no Discogs call is made.
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
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

import { updateDiscogsListingPrice } from '../services/marketplace/discogsListingConnector';

const listing = {
  id: 4360014384,
  status: 'For Sale',
  price: { value: 24.99, currency: 'USD' },
  condition: 'Very Good Plus (VG+)',
  sleeve_condition: 'Very Good (VG)',
  comments: 'Gatefold, light ring wear.',
  allow_offers: true,
  location: 'Bin 4',
  weight: 230,
  format_quantity: 2,
  external_id: 'cmtvurv9g02ha13wpio3cc9rk',
  release: { id: 7004009, description: 'Maggie Bell - Hazell', format: 'Vinyl, 7", Single' },
};

function mockResponse(status: number, body: any) {
  return {
    status,
    headers: { get: () => null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as any;
}

describe('updateDiscogsListingPrice echoes all existing listing fields (ADR-132 6.3)', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('POSTs price plus every field from the GET', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, listing)).mockResolvedValueOnce(mockResponse(204, ''));
    const res = await updateDiscogsListingPrice('org1', '4360014384', 19.99);
    expect(res).toMatchObject({ ok: true, listingReleaseId: 7004009, listingStatus: 'For Sale' });
    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      release_id: 7004009,
      condition: 'Very Good Plus (VG+)',
      status: 'For Sale',
      price: 19.99,
      sleeve_condition: 'Very Good (VG)',
      comments: 'Gatefold, light ring wear.',
      allow_offers: true,
      location: 'Bin 4',
      weight: 230,
      format_quantity: 2,
      external_id: 'cmtvurv9g02ha13wpio3cc9rk',
    });
  });

  it('keeps allow_offers=false instead of dropping it', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { ...listing, allow_offers: false })).mockResolvedValueOnce(mockResponse(204, ''));
    await updateDiscogsListingPrice('org1', '4360014384', 19.99);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).allow_offers).toBe(false);
  });

  it('does not POST when the listing uses a different release than expected', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, listing));
    const res = await updateDiscogsListingPrice('org1', '4360014384', 19.99, { expectedReleaseId: 7004001 });
    expect(res).toMatchObject({ ok: false, reason: 'release-mismatch', listingReleaseId: 7004009 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('promotes only a Draft, only on explicit publish', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { ...listing, status: 'Draft' })).mockResolvedValueOnce(mockResponse(204, ''));
    await updateDiscogsListingPrice('org1', '4360014384', 19.99, { publish: true });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).status).toBe('For Sale');
  });
});
